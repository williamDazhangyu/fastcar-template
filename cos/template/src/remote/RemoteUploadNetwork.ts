import * as dns from "dns";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as net from "net";
import * as path from "path";
import { URL } from "url";
import { CODE } from "@/model/Code";
import { RemoteUploadError, RemoteUploadErrorCode, RemoteUploadOptions } from "@/model/RemoteUpload";

export interface RemoteProbeResult {
	finalUrl: string;
	totalBytes: number | null;
	rangeSupported: boolean;
	etag?: string;
	lastModified?: string;
}

export interface RemoteDownloadInput {
	url: string;
	outputPath: string;
	append: boolean;
	rangeStart?: number;
	rangeEnd?: number;
	expectedTotalBytes?: number | null;
	ifRange?: string;
	maxBytes: number;
	options: RemoteUploadOptions;
	onProgress: (receivedBytes: number) => void;
}

export interface RemoteUploadNetworkClient {
	probe(url: string, options: RemoteUploadOptions): Promise<RemoteProbeResult>;
	download(input: RemoteDownloadInput): Promise<number>;
}

interface OpenedResponse {
	response: http.IncomingMessage;
	finalUrl: string;
	dispose: () => void;
}

interface PublicLookupAddress {
	address: string;
	family: 4 | 6;
}

type LookupCallback = (
	error: NodeJS.ErrnoException | null,
	address: string | PublicLookupAddress[],
	family?: number
) => void;

export class SecureRemoteUploadNetworkClient implements RemoteUploadNetworkClient {
	async probe(url: string, options: RemoteUploadOptions): Promise<RemoteProbeResult> {
		const opened = await this.open(url, "GET", { Range: "bytes=0-0" }, options, 0);
		const { response } = opened;
		try {
			const status = response.statusCode || 0;
			if (status != CODE.OK && status != 206) {
				throw this.httpStatusError(status);
			}

			const contentRange = this.parseContentRange(response.headers["content-range"]);
			const contentLength = this.parseContentLength(response.headers["content-length"]);
			if (status == 206 && (!contentRange || contentRange.start != 0 || contentRange.end != 0)) {
				throw new RemoteUploadError(RemoteUploadErrorCode.rangeMismatch, CODE.BAD_REQUEST);
			}
			const rangeSupported = status == 206 && !!contentRange && contentRange.start == 0 && contentRange.end == 0;
			const totalBytes = rangeSupported ? contentRange?.total || null : contentLength;
			if (totalBytes !== null && totalBytes > options.maxBytes) {
				throw new RemoteUploadError(RemoteUploadErrorCode.tooLarge, CODE.BAD_REQUEST);
			}
			if (totalBytes === 0) {
				throw new RemoteUploadError(RemoteUploadErrorCode.emptyFile, CODE.BAD_REQUEST);
			}

			return {
				finalUrl: opened.finalUrl,
				totalBytes,
				rangeSupported,
				etag: this.headerValue(response.headers.etag),
				lastModified: this.headerValue(response.headers["last-modified"]),
			};
		} finally {
			opened.dispose();
			response.destroy();
		}
	}

	async download(input: RemoteDownloadInput): Promise<number> {
		const headers: http.OutgoingHttpHeaders = {};
		if (input.rangeStart !== undefined) {
			headers.Range = `bytes=${input.rangeStart}-${input.rangeEnd === undefined ? "" : input.rangeEnd}`;
			if (input.ifRange) {
				headers["If-Range"] = input.ifRange;
			}
		}

		const opened = await this.open(input.url, "GET", headers, input.options, 0);
		const { response } = opened;
		try {
			this.validateDownloadResponse(response, input);
			return await this.writeResponse(response, input);
		} finally {
			opened.dispose();
			if (!response.complete) {
				response.destroy();
			}
		}
	}

	private async open(
		urlValue: string,
		method: string,
		headers: http.OutgoingHttpHeaders,
		options: RemoteUploadOptions,
		redirects: number
	): Promise<OpenedResponse> {
		if (redirects > options.maxRedirects) {
			throw new RemoteUploadError(RemoteUploadErrorCode.redirectLimit, CODE.BAD_REQUEST);
		}

		const target = this.parseUrl(urlValue);
		const requestStartedAt = Date.now();
		const resolved = await this.resolvePublicAddress(target.hostname, options.requestTimeoutMs);
		const transport = target.protocol == "https:" ? https : http;
		const requestHostname = target.hostname.replace(/^\[|\]$/g, "");

		return await new Promise<OpenedResponse>((resolve, reject) => {
			let settled = false;
			const request = transport.request(
				{
					protocol: target.protocol,
					hostname: requestHostname,
					port: target.port || undefined,
					path: `${target.pathname}${target.search}`,
					method,
					headers,
					lookup: this.createLookup(resolved),
				},
				(response) => {
					const status = response.statusCode || 0;
					const location = this.headerValue(response.headers.location);
					if (status >= 300 && status < 400 && location) {
						settled = true;
						clearTimeout(timeout);
						response.resume();
						const nextUrl = new URL(location, target).toString();
						void this.open(nextUrl, method, headers, options, redirects + 1).then(resolve, reject);
						return;
					}

					settled = true;
					resolve({
						response,
						finalUrl: target.toString(),
						dispose: () => clearTimeout(timeout),
					});
				}
			);

			const remainingTimeout = Math.max(1, options.requestTimeoutMs - (Date.now() - requestStartedAt));
			const timeout = setTimeout(() => {
				const error = new RemoteUploadError(RemoteUploadErrorCode.timeout, CODE.TIMEOUT, true);
				request.destroy(error);
			}, remainingTimeout);

			request.on("error", (error) => {
				clearTimeout(timeout);
				if (!settled) {
					reject(this.toNetworkError(error));
				}
			});
			request.end();
		});
	}

	private validateDownloadResponse(response: http.IncomingMessage, input: RemoteDownloadInput) {
		const status = response.statusCode || 0;
		const contentLength = this.parseContentLength(response.headers["content-length"]);
		if (contentLength !== null && contentLength > input.maxBytes) {
			throw new RemoteUploadError(RemoteUploadErrorCode.tooLarge, CODE.BAD_REQUEST);
		}
		if (input.rangeStart === undefined) {
			if (status != CODE.OK) {
				throw this.httpStatusError(status);
			}
			return;
		}

		if (status == CODE.OK) {
			throw new RemoteUploadError(RemoteUploadErrorCode.rangeMismatch, CODE.BAD_REQUEST, true, true);
		}
		if (status != 206) {
			throw this.httpStatusError(status);
		}

		const range = this.parseContentRange(response.headers["content-range"]);
		if (!range || range.start != input.rangeStart || (input.rangeEnd !== undefined && range.end != input.rangeEnd)) {
			throw new RemoteUploadError(RemoteUploadErrorCode.rangeMismatch, CODE.BAD_REQUEST, true, true);
		}
		if (input.expectedTotalBytes !== null && input.expectedTotalBytes !== undefined && range.total != input.expectedTotalBytes) {
			throw new RemoteUploadError(RemoteUploadErrorCode.rangeMismatch, CODE.BAD_REQUEST, true, true);
		}
	}

	private async writeResponse(response: http.IncomingMessage, input: RemoteDownloadInput): Promise<number> {
		await fs.promises.mkdir(path.dirname(input.outputPath), { recursive: true });
		const writer = fs.createWriteStream(input.outputPath, { flags: input.append ? "a" : "w" });

		return await new Promise<number>((resolve, reject) => {
			let received = 0;
			let finished = false;
			const fail = (error: unknown) => {
				if (finished) {
					return;
				}
				finished = true;
				writer.destroy();
				response.destroy();
				reject(this.toNetworkError(error));
			};

			response.on("data", (data: Buffer) => {
				received += data.length;
				if (received > input.maxBytes) {
					fail(new RemoteUploadError(RemoteUploadErrorCode.tooLarge, CODE.BAD_REQUEST));
					return;
				}
				input.onProgress(received);
			});
			response.on("aborted", () => fail(new RemoteUploadError(RemoteUploadErrorCode.networkError, CODE.BAD_REQUEST, true)));
			response.on("error", fail);
			writer.on("error", () => fail(new RemoteUploadError(RemoteUploadErrorCode.storageError, CODE.FAIL)));
			writer.on("finish", () => {
				if (finished) {
					return;
				}
				finished = true;
				resolve(received);
			});
			response.pipe(writer);
		});
	}

	private parseUrl(urlValue: string): URL {
		let target: URL;
		try {
			target = new URL(urlValue);
		} catch {
			throw new RemoteUploadError(RemoteUploadErrorCode.invalidUrl, CODE.BAD_REQUEST);
		}
		if (target.protocol != "http:" && target.protocol != "https:") {
			throw new RemoteUploadError(RemoteUploadErrorCode.unsupportedUrl, CODE.NOT_SUPPORT);
		}
		if (target.username || target.password) {
			throw new RemoteUploadError(RemoteUploadErrorCode.invalidUrl, CODE.BAD_REQUEST);
		}
		const standardPort = target.protocol == "http:" ? "80" : "443";
		if (target.port && target.port != standardPort) {
			throw new RemoteUploadError(RemoteUploadErrorCode.unsupportedUrl, CODE.NOT_SUPPORT);
		}
		return target;
	}

	private async resolvePublicAddress(hostname: string, timeoutMs: number): Promise<PublicLookupAddress[]> {
		const normalizedHostname = hostname.replace(/^\[|\]$/g, "");
		const literalFamily = net.isIP(normalizedHostname);
		let addresses: Array<{ address: string; family: number }>;
		try {
			addresses = literalFamily
				? [{ address: normalizedHostname, family: literalFamily }]
				: await this.withTimeout(dns.promises.lookup(normalizedHostname, { all: true, verbatim: true }), timeoutMs);
		} catch (error) {
			if (error instanceof RemoteUploadError) {
				throw error;
			}
			throw new RemoteUploadError(RemoteUploadErrorCode.networkError, CODE.BAD_REQUEST, true);
		}

		// Reject mixed public/private answers and pin the accepted address into lookup to prevent DNS rebinding.
		if (addresses.length == 0 || addresses.some((item) => !this.isPublicAddress(item.address))) {
			throw new RemoteUploadError(RemoteUploadErrorCode.privateAddress, CODE.FORBID);
		}
		return addresses.map((item) => ({
			address: item.address,
			family: item.family as 4 | 6,
		}));
	}

	private createLookup(addresses: PublicLookupAddress[]): typeof dns.lookup {
		return ((
			hostname: string,
			lookupOptions: dns.LookupOptions | number,
			callback: LookupCallback
		) => {
			const all = typeof lookupOptions == "object" && lookupOptions.all === true;
			if (all) {
				callback(null, addresses.map((item) => ({ ...item })));
				return;
			}

			const requestedFamily = this.lookupFamily(lookupOptions);
			const selected = requestedFamily === 0
				? addresses[0]
				: addresses.find((item) => item.family == requestedFamily);
			if (!selected) {
				const error = new Error(`No public address matching family ${requestedFamily} for ${hostname}`) as NodeJS.ErrnoException & {
					hostname?: string;
				};
				error.code = "EAI_ADDRFAMILY";
				error.hostname = hostname;
				callback(error, "", 0);
				return;
			}
			callback(null, selected.address, selected.family);
		}) as unknown as typeof dns.lookup;
	}

	private lookupFamily(lookupOptions: dns.LookupOptions | number): 0 | 4 | 6 {
		const family: number | string | undefined =
			typeof lookupOptions == "number" ? lookupOptions : lookupOptions.family;
		if (family === 4 || family === "IPv4") {
			return 4;
		}
		if (family === 6 || family === "IPv6") {
			return 6;
		}
		return 0;
	}

	private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
		return await new Promise<T>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new RemoteUploadError(RemoteUploadErrorCode.timeout, CODE.TIMEOUT, true));
			}, timeoutMs);
			promise.then(
				(value) => {
					clearTimeout(timeout);
					resolve(value);
				},
				(error) => {
					clearTimeout(timeout);
					reject(error);
				}
			);
		});
	}

	private isPublicAddress(address: string): boolean {
		const family = net.isIP(address);
		if (family == 4) {
			return this.isPublicIpv4(address);
		}
		if (family != 6) {
			return false;
		}

		const bytes = this.ipv6Bytes(address);
		if (!bytes) {
			return false;
		}
		if (bytes.every((value) => value == 0) || bytes.slice(0, 15).every((value) => value == 0) && bytes[15] == 1) {
			return false;
		}
		if ((bytes[0] & 0xfe) == 0xfc || bytes[0] == 0xff || bytes[0] == 0xfe && (bytes[1] & 0xc0) >= 0x80) {
			return false;
		}
		if (
			this.hasPrefix(bytes, [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0], 96) ||
			this.hasPrefix(bytes, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01], 48)
		) {
			return this.isPublicIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
		}
		if (this.hasPrefix(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff], 96)) {
			return this.isPublicIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
		}
		if (
			this.hasPrefix(bytes, [0x01, 0x00, 0, 0, 0, 0, 0, 0], 64) ||
			this.hasPrefix(bytes, [0x20, 0x01, 0x00, 0x00], 32) ||
			this.hasPrefix(bytes, [0x20, 0x01, 0x00, 0x02, 0, 0], 48) ||
			this.hasPrefix(bytes, [0x20, 0x01, 0x00, 0x10], 28) ||
			this.hasPrefix(bytes, [0x20, 0x01, 0x00, 0x20], 28) ||
			this.hasPrefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)
		) {
			return false;
		}
		if (this.hasPrefix(bytes, [0x20, 0x02], 16)) {
			return this.isPublicIpv4(`${bytes[2]}.${bytes[3]}.${bytes[4]}.${bytes[5]}`);
		}
		return (bytes[0] & 0xe0) == 0x20;
	}

	private isPublicIpv4(address: string): boolean {
		const parts = address.split(".").map(Number);
		if (parts.length != 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
			return false;
		}
		const [a, b, c] = parts;
		return !(
			a == 0 ||
			a == 10 ||
			a == 127 ||
			a >= 224 ||
			a == 100 && b >= 64 && b <= 127 ||
			a == 169 && b == 254 ||
			a == 172 && b >= 16 && b <= 31 ||
			a == 192 && b == 168 ||
			a == 192 && b == 0 && c == 0 ||
			a == 192 && b == 0 && c == 2 ||
			a == 192 && b == 88 && c == 99 ||
			a == 198 && (b == 18 || b == 19) ||
			a == 198 && b == 51 && c == 100 ||
			a == 203 && b == 0 && c == 113
		);
	}

	private ipv6Bytes(address: string): number[] | null {
		let value = address.split("%")[0].toLowerCase();
		const ipv4Match = value.match(/(\d+\.\d+\.\d+\.\d+)$/);
		if (ipv4Match) {
			const ipv4 = ipv4Match[1].split(".").map(Number);
			value = value.substring(0, value.length - ipv4Match[1].length) + `${(ipv4[0] << 8 | ipv4[1]).toString(16)}:${(ipv4[2] << 8 | ipv4[3]).toString(16)}`;
		}
		const halves = value.split("::");
		if (halves.length > 2) {
			return null;
		}
		const left = halves[0] ? halves[0].split(":") : [];
		const right = halves[1] ? halves[1].split(":") : [];
		const missing = 8 - left.length - right.length;
		if (missing < 0 || halves.length == 1 && missing != 0) {
			return null;
		}
		const groups = [...left, ...new Array(missing).fill("0"), ...right];
		if (groups.length != 8) {
			return null;
		}
		const bytes: number[] = [];
		for (const group of groups) {
			const number = parseInt(group || "0", 16);
			if (!Number.isInteger(number) || number < 0 || number > 0xffff) {
				return null;
			}
			bytes.push(number >> 8, number & 0xff);
		}
		return bytes;
	}

	private hasPrefix(bytes: number[], prefix: number[], bits: number): boolean {
		const completeBytes = Math.floor(bits / 8);
		for (let index = 0; index < completeBytes; index++) {
			if (bytes[index] != prefix[index]) {
				return false;
			}
		}
		const remainingBits = bits % 8;
		if (remainingBits > 0) {
			const mask = 0xff << (8 - remainingBits) & 0xff;
			return (bytes[completeBytes] & mask) == (prefix[completeBytes] & mask);
		}
		return true;
	}

	private parseContentRange(value: string | string[] | undefined): { start: number; end: number; total: number } | null {
		const text = this.headerValue(value);
		const match = text?.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
		if (!match) {
			return null;
		}
		const parsed = {
			start: Number(match[1]),
			end: Number(match[2]),
			total: Number(match[3]),
		};
		if (
			!Number.isSafeInteger(parsed.start) ||
			!Number.isSafeInteger(parsed.end) ||
			!Number.isSafeInteger(parsed.total) ||
			parsed.start < 0 ||
			parsed.end < parsed.start ||
			parsed.total <= parsed.end
		) {
			return null;
		}
		return parsed;
	}

	private parseContentLength(value: string | string[] | undefined): number | null {
		const parsed = Number(this.headerValue(value));
		return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
	}

	private headerValue(value: string | string[] | undefined): string | undefined {
		return Array.isArray(value) ? value[0] : value;
	}

	private httpStatusError(status: number): RemoteUploadError {
		const retryable = status == 408 || status == 429 || status >= 500;
		return new RemoteUploadError(RemoteUploadErrorCode.httpError, CODE.BAD_REQUEST, retryable);
	}

	private toNetworkError(error: unknown): RemoteUploadError {
		if (error instanceof RemoteUploadError) {
			return error;
		}
		return new RemoteUploadError(RemoteUploadErrorCode.networkError, CODE.BAD_REQUEST, true);
	}
}
