"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureRemoteUploadNetworkClient = void 0;
const dns = require("dns");
const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const path = require("path");
const url_1 = require("url");
const Code_1 = require("../model/Code");
const RemoteUpload_1 = require("../model/RemoteUpload");
class SecureRemoteUploadNetworkClient {
    async probe(url, options) {
        const opened = await this.open(url, "GET", { Range: "bytes=0-0" }, options, 0);
        const { response } = opened;
        try {
            const status = response.statusCode || 0;
            if (status != Code_1.CODE.OK && status != 206) {
                throw this.httpStatusError(status);
            }
            const contentRange = this.parseContentRange(response.headers["content-range"]);
            const contentLength = this.parseContentLength(response.headers["content-length"]);
            if (status == 206 && (!contentRange || contentRange.start != 0 || contentRange.end != 0)) {
                throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.rangeMismatch, Code_1.CODE.BAD_REQUEST);
            }
            const rangeSupported = status == 206 && !!contentRange && contentRange.start == 0 && contentRange.end == 0;
            const totalBytes = rangeSupported ? contentRange?.total || null : contentLength;
            if (totalBytes !== null && totalBytes > options.maxBytes) {
                throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.tooLarge, Code_1.CODE.BAD_REQUEST);
            }
            if (totalBytes === 0) {
                throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.emptyFile, Code_1.CODE.BAD_REQUEST);
            }
            return {
                finalUrl: opened.finalUrl,
                totalBytes,
                rangeSupported,
                etag: this.headerValue(response.headers.etag),
                lastModified: this.headerValue(response.headers["last-modified"]),
            };
        }
        finally {
            opened.dispose();
            response.destroy();
        }
    }
    async download(input) {
        const headers = {};
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
        }
        finally {
            opened.dispose();
            if (!response.complete) {
                response.destroy();
            }
        }
    }
    async open(urlValue, method, headers, options, redirects) {
        if (redirects > options.maxRedirects) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.redirectLimit, Code_1.CODE.BAD_REQUEST);
        }
        const target = this.parseUrl(urlValue);
        const requestStartedAt = Date.now();
        const resolved = await this.resolvePublicAddress(target.hostname, options.requestTimeoutMs);
        const transport = target.protocol == "https:" ? https : http;
        const requestHostname = target.hostname.replace(/^\[|\]$/g, "");
        return await new Promise((resolve, reject) => {
            let settled = false;
            const request = transport.request({
                protocol: target.protocol,
                hostname: requestHostname,
                port: target.port || undefined,
                path: `${target.pathname}${target.search}`,
                method,
                headers,
                lookup: this.createLookup(resolved),
            }, (response) => {
                const status = response.statusCode || 0;
                const location = this.headerValue(response.headers.location);
                if (status >= 300 && status < 400 && location) {
                    settled = true;
                    clearTimeout(timeout);
                    response.resume();
                    const nextUrl = new url_1.URL(location, target).toString();
                    void this.open(nextUrl, method, headers, options, redirects + 1).then(resolve, reject);
                    return;
                }
                settled = true;
                resolve({
                    response,
                    finalUrl: target.toString(),
                    dispose: () => clearTimeout(timeout),
                });
            });
            const remainingTimeout = Math.max(1, options.requestTimeoutMs - (Date.now() - requestStartedAt));
            const timeout = setTimeout(() => {
                const error = new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.timeout, Code_1.CODE.TIMEOUT, true);
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
    validateDownloadResponse(response, input) {
        const status = response.statusCode || 0;
        const contentLength = this.parseContentLength(response.headers["content-length"]);
        if (contentLength !== null && contentLength > input.maxBytes) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.tooLarge, Code_1.CODE.BAD_REQUEST);
        }
        if (input.rangeStart === undefined) {
            if (status != Code_1.CODE.OK) {
                throw this.httpStatusError(status);
            }
            return;
        }
        if (status == Code_1.CODE.OK) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.rangeMismatch, Code_1.CODE.BAD_REQUEST, true, true);
        }
        if (status != 206) {
            throw this.httpStatusError(status);
        }
        const range = this.parseContentRange(response.headers["content-range"]);
        if (!range || range.start != input.rangeStart || (input.rangeEnd !== undefined && range.end != input.rangeEnd)) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.rangeMismatch, Code_1.CODE.BAD_REQUEST, true, true);
        }
        if (input.expectedTotalBytes !== null && input.expectedTotalBytes !== undefined && range.total != input.expectedTotalBytes) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.rangeMismatch, Code_1.CODE.BAD_REQUEST, true, true);
        }
    }
    async writeResponse(response, input) {
        await fs.promises.mkdir(path.dirname(input.outputPath), { recursive: true });
        const writer = fs.createWriteStream(input.outputPath, { flags: input.append ? "a" : "w" });
        return await new Promise((resolve, reject) => {
            let received = 0;
            let finished = false;
            const fail = (error) => {
                if (finished) {
                    return;
                }
                finished = true;
                writer.destroy();
                response.destroy();
                reject(this.toNetworkError(error));
            };
            response.on("data", (data) => {
                received += data.length;
                if (received > input.maxBytes) {
                    fail(new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.tooLarge, Code_1.CODE.BAD_REQUEST));
                    return;
                }
                input.onProgress(received);
            });
            response.on("aborted", () => fail(new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.networkError, Code_1.CODE.BAD_REQUEST, true)));
            response.on("error", fail);
            writer.on("error", () => fail(new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.storageError, Code_1.CODE.FAIL)));
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
    parseUrl(urlValue) {
        let target;
        try {
            target = new url_1.URL(urlValue);
        }
        catch {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.invalidUrl, Code_1.CODE.BAD_REQUEST);
        }
        if (target.protocol != "http:" && target.protocol != "https:") {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.unsupportedUrl, Code_1.CODE.NOT_SUPPORT);
        }
        if (target.username || target.password) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.invalidUrl, Code_1.CODE.BAD_REQUEST);
        }
        const standardPort = target.protocol == "http:" ? "80" : "443";
        if (target.port && target.port != standardPort) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.unsupportedUrl, Code_1.CODE.NOT_SUPPORT);
        }
        return target;
    }
    async resolvePublicAddress(hostname, timeoutMs) {
        const normalizedHostname = hostname.replace(/^\[|\]$/g, "");
        const literalFamily = net.isIP(normalizedHostname);
        let addresses;
        try {
            addresses = literalFamily
                ? [{ address: normalizedHostname, family: literalFamily }]
                : await this.withTimeout(dns.promises.lookup(normalizedHostname, { all: true, verbatim: true }), timeoutMs);
        }
        catch (error) {
            if (error instanceof RemoteUpload_1.RemoteUploadError) {
                throw error;
            }
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.networkError, Code_1.CODE.BAD_REQUEST, true);
        }
        // Reject mixed public/private answers and pin the accepted address into lookup to prevent DNS rebinding.
        if (addresses.length == 0 || addresses.some((item) => !this.isPublicAddress(item.address))) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.privateAddress, Code_1.CODE.FORBID);
        }
        return addresses.map((item) => ({
            address: item.address,
            family: item.family,
        }));
    }
    createLookup(addresses) {
        return ((hostname, lookupOptions, callback) => {
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
                const error = new Error(`No public address matching family ${requestedFamily} for ${hostname}`);
                error.code = "EAI_ADDRFAMILY";
                error.hostname = hostname;
                callback(error, "", 0);
                return;
            }
            callback(null, selected.address, selected.family);
        });
    }
    lookupFamily(lookupOptions) {
        const family = typeof lookupOptions == "number" ? lookupOptions : lookupOptions.family;
        if (family === 4 || family === "IPv4") {
            return 4;
        }
        if (family === 6 || family === "IPv6") {
            return 6;
        }
        return 0;
    }
    async withTimeout(promise, timeoutMs) {
        return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.timeout, Code_1.CODE.TIMEOUT, true));
            }, timeoutMs);
            promise.then((value) => {
                clearTimeout(timeout);
                resolve(value);
            }, (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
    isPublicAddress(address) {
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
        if (this.hasPrefix(bytes, [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0], 96) ||
            this.hasPrefix(bytes, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01], 48)) {
            return this.isPublicIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
        }
        if (this.hasPrefix(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff], 96)) {
            return this.isPublicIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
        }
        if (this.hasPrefix(bytes, [0x01, 0x00, 0, 0, 0, 0, 0, 0], 64) ||
            this.hasPrefix(bytes, [0x20, 0x01, 0x00, 0x00], 32) ||
            this.hasPrefix(bytes, [0x20, 0x01, 0x00, 0x02, 0, 0], 48) ||
            this.hasPrefix(bytes, [0x20, 0x01, 0x00, 0x10], 28) ||
            this.hasPrefix(bytes, [0x20, 0x01, 0x00, 0x20], 28) ||
            this.hasPrefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)) {
            return false;
        }
        if (this.hasPrefix(bytes, [0x20, 0x02], 16)) {
            return this.isPublicIpv4(`${bytes[2]}.${bytes[3]}.${bytes[4]}.${bytes[5]}`);
        }
        return (bytes[0] & 0xe0) == 0x20;
    }
    isPublicIpv4(address) {
        const parts = address.split(".").map(Number);
        if (parts.length != 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
            return false;
        }
        const [a, b, c] = parts;
        return !(a == 0 ||
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
            a == 203 && b == 0 && c == 113);
    }
    ipv6Bytes(address) {
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
        const bytes = [];
        for (const group of groups) {
            const number = parseInt(group || "0", 16);
            if (!Number.isInteger(number) || number < 0 || number > 0xffff) {
                return null;
            }
            bytes.push(number >> 8, number & 0xff);
        }
        return bytes;
    }
    hasPrefix(bytes, prefix, bits) {
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
    parseContentRange(value) {
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
        if (!Number.isSafeInteger(parsed.start) ||
            !Number.isSafeInteger(parsed.end) ||
            !Number.isSafeInteger(parsed.total) ||
            parsed.start < 0 ||
            parsed.end < parsed.start ||
            parsed.total <= parsed.end) {
            return null;
        }
        return parsed;
    }
    parseContentLength(value) {
        const parsed = Number(this.headerValue(value));
        return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    }
    headerValue(value) {
        return Array.isArray(value) ? value[0] : value;
    }
    httpStatusError(status) {
        const retryable = status == 408 || status == 429 || status >= 500;
        return new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.httpError, Code_1.CODE.BAD_REQUEST, retryable);
    }
    toNetworkError(error) {
        if (error instanceof RemoteUpload_1.RemoteUploadError) {
            return error;
        }
        return new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.networkError, Code_1.CODE.BAD_REQUEST, true);
    }
}
exports.SecureRemoteUploadNetworkClient = SecureRemoteUploadNetworkClient;
