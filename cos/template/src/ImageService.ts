import { FastCarApplication } from "@fastcar/core";
import { Autowired, Service } from "@fastcar/core/annotation";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import * as fs from "fs";
import { promises as fsp } from "fs";
import * as path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import sharp = require("sharp");
import CosService from "./CosService";
import FILE_MAP from "./model/MimeMap";
import { createDirPath, normalizeCosFilename } from "./utils/util";

const PREVIEW_MAX_LONG_EDGE = 1280;
const PREVIEW_MAX_ORIGINAL_BYTES = 500 * 1024;
const LOCAL_IMAGE_MAX_BYTES = 100 * 1024 * 1024;
const PREVIEW_WEBP_QUALITY = 82;
const EXTERNAL_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const EXTERNAL_IMAGE_TIMEOUT_MS = 15000;
const SHARP_CACHE_MEMORY_MB = 64;
const IMAGE_MAX_DIMENSION = 8192;

sharp.cache({ files: 0, items: 32, memory: SHARP_CACHE_MEMORY_MB });

export interface GeneratePreviewInput {
	filename?: string;
	sourceUrl?: string;
	targetFilename: string;
	maxLongEdge?: number;
	maxOriginalBytes?: number;
	localImageMaxBytes?: number;
	externalImageMaxBytes?: number;
	externalImageTimeoutMs?: number;
	webpQuality?: number;
	maxDimension?: number;
}

export interface GeneratePreviewResult {
	sourceUrl: string;
	previewUrl: string;
	sourceFilename?: string;
	previewFilename: string;
	sourceWidth: number;
	sourceHeight: number;
	previewWidth: number;
	previewHeight: number;
	previewSizeBytes: number;
	previewMimeType: string;
}

export interface ResizeImageInput {
	filename?: string;
	sourceUrl?: string;
	targetFilename: string;
	width?: number;
	height?: number;
	localImageMaxBytes?: number;
	externalImageMaxBytes?: number;
	externalImageTimeoutMs?: number;
	webpQuality?: number;
	maxDimension?: number;
}

export interface ResizeImageResult {
	sourceUrl: string;
	resultUrl: string;
	sourceFilename?: string;
	targetFilename: string;
	sourceWidth: number;
	sourceHeight: number;
	resultWidth: number;
	resultHeight: number;
	resultSizeBytes: number;
	resultMimeType: string;
	upscaled: boolean;
}

interface ImageSource {
	input: string;
	mimeType: string;
	sizeBytes: number;
	sourceUrl: string;
	sourceFilename?: string;
	cleanupPath?: string;
}

interface ImageOptions {
	localImageMaxBytes: number;
	externalImageMaxBytes: number;
	externalImageTimeoutMs: number;
	webpQuality: number;
	maxDimension: number;
}

interface PreviewOptions extends ImageOptions {
	maxLongEdge: number;
	maxOriginalBytes: number;
}

interface ReservedTarget {
	targetPath: string;
	tempPath: string;
	lockPath: string;
}

interface ResizeOutputFormat {
	mimeType: string;
	encode: (image: sharp.Sharp, quality: number) => sharp.Sharp;
}

@Service
export default class ImageService {
	@Autowired
	private app!: FastCarApplication;

	@Autowired
	private cosService!: CosService;

	async generatePreview(input: GeneratePreviewInput, domain: string): Promise<GeneratePreviewResult> {
		const options = this.resolvePreviewOptions(input);
		const targetFilename = this.normalizeRequiredTarget(input.targetFilename);
		const source = await this.readInputSource(input, domain, options);
		try {
			if (source.sourceFilename && source.sourceFilename == targetFilename) {
				throw new Error("IMAGE_TARGET_EQUALS_SOURCE");
			}
			const metadata = await this.readImageMetadata(source.input);
			const sourceWidth = this.positiveInteger(metadata.width);
			const sourceHeight = this.positiveInteger(metadata.height);
			if (!sourceWidth || !sourceHeight) {
				throw new Error("PREVIEW_DIMENSIONS_MISSING");
			}
			const target = await this.reserveTargetPath(targetFilename);
			try {

				if (source.mimeType == "image/gif") {
					await fsp.copyFile(source.input, target.tempPath);
					await this.commitReservedTarget(target);
					return {
						sourceUrl: source.sourceUrl,
						previewUrl: `${this.trimDomain(domain)}${targetFilename}`,
						sourceFilename: source.sourceFilename,
						previewFilename: targetFilename,
						sourceWidth,
						sourceHeight,
						previewWidth: sourceWidth,
						previewHeight: sourceHeight,
						previewSizeBytes: source.sizeBytes,
						previewMimeType: source.mimeType,
					};
				}

				const transform = sharp(source.input, { animated: false });
				const shouldResize = !this.shouldUseOriginalSize(source.sizeBytes, sourceWidth, sourceHeight, options);
				if (shouldResize) {
					transform.resize({ width: options.maxLongEdge, height: options.maxLongEdge, fit: "inside", withoutEnlargement: true });
				}
				const previewInfo = await this.writeSharpOutput(transform.webp({ quality: options.webpQuality }), target.tempPath);
				await this.commitReservedTarget(target);

				return {
					sourceUrl: source.sourceUrl,
					previewUrl: `${this.trimDomain(domain)}${targetFilename}`,
					sourceFilename: source.sourceFilename,
					previewFilename: targetFilename,
					sourceWidth,
					sourceHeight,
					previewWidth: this.positiveInteger(previewInfo.width) || sourceWidth,
					previewHeight: this.positiveInteger(previewInfo.height) || sourceHeight,
					previewSizeBytes: previewInfo.size,
					previewMimeType: "image/webp",
				};
			} catch (error) {
				await this.cleanupReservedTarget(target);
				throw error;
			}
		} finally {
			await this.cleanupTempFile(source.cleanupPath);
		}
	}

	async resizeImage(input: ResizeImageInput, domain: string): Promise<ResizeImageResult> {
		const options = this.resolveImageOptions(input);
		const targetFilename = this.normalizeRequiredTarget(input.targetFilename);
		const targetWidth = this.positiveInteger(input.width);
		const targetHeight = this.positiveInteger(input.height);
		if (!targetWidth && !targetHeight) {
			throw new Error("IMAGE_RESIZE_DIMENSIONS_REQUIRED");
		}
		if ((targetWidth && targetWidth > options.maxDimension) || (targetHeight && targetHeight > options.maxDimension)) {
			throw new Error("IMAGE_DIMENSION_TOO_LARGE");
		}

		const source = await this.readInputSource(input, domain, options);
		try {
			if (source.sourceFilename && source.sourceFilename == targetFilename) {
				throw new Error("IMAGE_TARGET_EQUALS_SOURCE");
			}
			if (source.mimeType == "image/gif") {
				throw new Error("IMAGE_RESIZE_UNSUPPORTED_FORMAT");
			}
			const metadata = await this.readImageMetadata(source.input);
			const sourceWidth = this.positiveInteger(metadata.width);
			const sourceHeight = this.positiveInteger(metadata.height);
			if (!sourceWidth || !sourceHeight) {
				throw new Error("PREVIEW_DIMENSIONS_MISSING");
			}
			const target = await this.reserveTargetPath(targetFilename);
			try {
				const outputFormat = this.resolveResizeOutputFormat(source.mimeType);

				const resizeInfo = await sharp(source.input, { animated: false })
					.resize({
						width: targetWidth,
						height: targetHeight,
						fit: "inside",
						withoutEnlargement: false,
						kernel: sharp.kernel.lanczos3,
					})
					;
				const outputInfo = await this.writeSharpOutput(outputFormat.encode(resizeInfo, options.webpQuality), target.tempPath);
				await this.commitReservedTarget(target);
				const resultWidth = this.positiveInteger(outputInfo.width) || sourceWidth;
				const resultHeight = this.positiveInteger(outputInfo.height) || sourceHeight;

				return {
					sourceUrl: source.sourceUrl,
					resultUrl: `${this.trimDomain(domain)}${targetFilename}`,
					sourceFilename: source.sourceFilename,
					targetFilename,
					sourceWidth,
					sourceHeight,
					resultWidth,
					resultHeight,
					resultSizeBytes: outputInfo.size,
					resultMimeType: outputFormat.mimeType,
					upscaled: resultWidth > sourceWidth || resultHeight > sourceHeight,
				};
			} catch (error) {
				await this.cleanupReservedTarget(target);
				throw error;
			}
		} finally {
			await this.cleanupTempFile(source.cleanupPath);
		}
	}

	private async readInputSource(input: { filename?: string; sourceUrl?: string }, domain: string, options: ImageOptions): Promise<ImageSource> {
		const filename = input.filename?.trim();
		const sourceUrl = input.sourceUrl?.trim();
		if (!!filename == !!sourceUrl) {
			throw new Error("IMAGE_SOURCE_INVALID");
		}

		return filename ? this.readLocalSource(filename, domain, options) : this.readExternalSource(sourceUrl || "", options);
	}

	private async readLocalSource(filename: string, domain: string, options: ImageOptions): Promise<ImageSource> {
		const normalized = normalizeCosFilename(filename);
		const filePath = this.resolveFilePathInsideDataDir(normalized);
		if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
			throw new Error("PREVIEW_SOURCE_NOT_FOUND");
		}
		const mimeType = FILE_MAP(normalized) || "";
		if (!mimeType.startsWith("image/")) {
			throw new Error("PREVIEW_SOURCE_NOT_IMAGE");
		}
		const stats = await fsp.stat(filePath);
		if (stats.size > options.localImageMaxBytes) {
			throw new Error("PREVIEW_SOURCE_TOO_LARGE");
		}

		return {
			input: filePath,
			mimeType: mimeType.split(";")[0],
			sizeBytes: stats.size,
			sourceUrl: `${this.trimDomain(domain)}${normalized}`,
			sourceFilename: normalized,
		};
	}

	private async readExternalSource(sourceUrl: string, options: ImageOptions): Promise<ImageSource> {
		const url = this.parseExternalImageUrl(sourceUrl);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), options.externalImageTimeoutMs);
		let tempPath = "";
		try {
			const response = await fetch(url.href, { signal: controller.signal });
			if (!response.ok) {
				throw new Error(`PREVIEW_SOURCE_HTTP_${response.status}`);
			}
			const mimeType = this.responseImageMimeType(response.headers.get("content-type"));
			const contentLength = Number(response.headers.get("content-length") || 0);
			if (contentLength > options.externalImageMaxBytes) {
				throw new Error("PREVIEW_SOURCE_TOO_LARGE");
			}
			tempPath = this.externalTempPath(sourceUrl);
			createDirPath(path.dirname(tempPath));
			const sizeBytes = await this.writeResponseBodyToFile(response, tempPath, options);

			return {
				input: tempPath,
				mimeType,
				sizeBytes,
				sourceUrl: url.href,
				cleanupPath: tempPath,
			};
		} catch (error) {
			await this.cleanupTempFile(tempPath);
			if (error instanceof Error && error.name == "AbortError") {
				throw new Error("PREVIEW_SOURCE_TIMEOUT");
			}
			if (error instanceof TypeError) {
				throw new Error("PREVIEW_SOURCE_FETCH_FAILED");
			}
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}

	private normalizeRequiredTarget(targetFilename: string): string {
		if (!targetFilename || !targetFilename.trim()) {
			throw new Error("IMAGE_TARGET_FILENAME_REQUIRED");
		}
		return normalizeCosFilename(targetFilename);
	}

	private async reserveTargetPath(targetFilename: string): Promise<ReservedTarget> {
		const targetPath = this.resolveFilePathInsideDataDir(targetFilename);
		createDirPath(path.dirname(targetPath));
		const targetDir = path.dirname(targetPath);
		const targetBasename = path.basename(targetPath);
		const targetHash = createHash("sha256").update(targetPath).digest("hex").slice(0, 16);
		const lockPath = path.join(targetDir, `.${targetBasename}.${targetHash}.lock`);
		const tempPath = path.join(targetDir, `.${targetBasename}.${nanoid()}.tmp`);
		try {
			const handle = await fsp.open(lockPath, "wx");
			await handle.close();
		} catch (error: any) {
			if (error?.code == "EEXIST") {
				throw new Error("IMAGE_TARGET_EXISTS");
			}
			throw new Error("PREVIEW_FILENAME_INVALID");
		}
		if (fs.existsSync(targetPath)) {
			await this.cleanupTempFile(lockPath);
			throw new Error("IMAGE_TARGET_EXISTS");
		}

		return { targetPath, tempPath, lockPath };
	}

	private async commitReservedTarget(target: ReservedTarget): Promise<void> {
		try {
			await fsp.copyFile(target.tempPath, target.targetPath, fs.constants.COPYFILE_EXCL);
			await this.cleanupTempFile(target.tempPath);
		} finally {
			await this.cleanupTempFile(target.lockPath);
		}
	}

	private async cleanupReservedTarget(target: ReservedTarget): Promise<void> {
		await Promise.all([this.cleanupTempFile(target.tempPath), this.cleanupTempFile(target.lockPath)]);
	}

	private parseExternalImageUrl(sourceUrl: string): URL {
		let url: URL;
		try {
			url = new URL(sourceUrl);
		} catch (_error) {
			throw new Error("PREVIEW_SOURCE_URL_INVALID");
		}
		if (!["http:", "https:"].includes(url.protocol)) {
			throw new Error("PREVIEW_SOURCE_URL_UNSUPPORTED");
		}

		return url;
	}

	private responseImageMimeType(contentType: string | null): string {
		const mimeType = (contentType || "").split(";")[0].trim().toLowerCase();
		if (!mimeType.startsWith("image/")) {
			throw new Error("PREVIEW_SOURCE_NOT_IMAGE");
		}

		return mimeType;
	}

	private async readImageMetadata(input: string): Promise<sharp.Metadata> {
		try {
			return await sharp(input, { animated: false }).metadata();
		} catch (_error) {
			throw new Error("PREVIEW_SOURCE_NOT_IMAGE");
		}
	}

	private async writeSharpOutput(image: sharp.Sharp, targetPath: string): Promise<sharp.OutputInfo> {
		try {
			return await image.toFile(targetPath);
		} catch (error) {
			if (this.isSharpDecodeError(error)) {
				throw new Error("PREVIEW_SOURCE_DECODE_FAILED");
			}
			throw error;
		}
	}

	private isSharpDecodeError(error: unknown): boolean {
		const message = error instanceof Error ? error.message.toLowerCase() : "";
		return message.includes("load") || message.includes("decode") || message.includes("corrupt") || message.includes("idat");
	}

	private resolveResizeOutputFormat(mimeType: string): ResizeOutputFormat {
		switch (mimeType) {
			case "image/jpeg":
			case "image/jpg":
				return {
					mimeType: "image/jpeg",
					encode: (image, quality) => image.jpeg({ quality }),
				};
			case "image/png":
				return {
					mimeType: "image/png",
					encode: (image) => image.png(),
				};
			case "image/webp":
				return {
					mimeType: "image/webp",
					encode: (image, quality) => image.webp({ quality }),
				};
			case "image/avif":
				return {
					mimeType: "image/avif",
					encode: (image, quality) => image.avif({ quality }),
				};
			case "image/tiff":
				return {
					mimeType: "image/tiff",
					encode: (image) => image.tiff(),
				};
			default:
				throw new Error("IMAGE_RESIZE_UNSUPPORTED_FORMAT");
		}
	}

	private shouldUseOriginalSize(sizeBytes: number, width: number, height: number, options: PreviewOptions): boolean {
		return Math.max(width, height) <= options.maxLongEdge && sizeBytes <= options.maxOriginalBytes;
	}

	private positiveInteger(value: unknown): number | undefined {
		const numberValue = Number(value);
		return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
	}

	private trimDomain(domain: string): string {
		return String(domain || "").replace(/\/+$/, "");
	}

	private externalTempPath(sourceUrl: string): string {
		const hash = createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16);
		return this.resolveFilePathInsideDataDir(`/.image-tmp/${hash}-${nanoid()}`);
	}

	private async writeResponseBodyToFile(response: Response, filePath: string, options: ImageOptions): Promise<number> {
		if (!response.body) {
			throw new Error("PREVIEW_SOURCE_EMPTY");
		}
		let sizeBytes = 0;
		const maxBytes = options.externalImageMaxBytes;
		const limiter = new Transform({
			transform(chunk: Buffer, _encoding, callback) {
				sizeBytes += chunk.byteLength;
				if (sizeBytes > maxBytes) {
					callback(new Error("PREVIEW_SOURCE_TOO_LARGE"));
					return;
				}
				callback(null, chunk);
			},
		});
		await pipeline(response.body as any, limiter, fs.createWriteStream(filePath));
		return sizeBytes;
	}

	private resolvePreviewOptions(input: GeneratePreviewInput): PreviewOptions {
		return {
			...this.resolveImageOptions(input),
			maxLongEdge: Math.min(this.positiveOption(input.maxLongEdge, "preview.maxLongEdge", PREVIEW_MAX_LONG_EDGE), this.positiveOption(input.maxDimension, "preview.maxDimension", IMAGE_MAX_DIMENSION)),
			maxOriginalBytes: this.positiveOption(input.maxOriginalBytes, "preview.maxOriginalBytes", PREVIEW_MAX_ORIGINAL_BYTES),
		};
	}

	private resolveImageOptions(input: { localImageMaxBytes?: number; externalImageMaxBytes?: number; externalImageTimeoutMs?: number; webpQuality?: number; maxDimension?: number }): ImageOptions {
		return {
			localImageMaxBytes: this.positiveOption(input.localImageMaxBytes, "preview.localImageMaxBytes", LOCAL_IMAGE_MAX_BYTES),
			externalImageMaxBytes: this.positiveOption(input.externalImageMaxBytes, "preview.externalImageMaxBytes", EXTERNAL_IMAGE_MAX_BYTES),
			externalImageTimeoutMs: this.positiveOption(input.externalImageTimeoutMs, "preview.externalImageTimeoutMs", EXTERNAL_IMAGE_TIMEOUT_MS),
			webpQuality: this.webpQuality(input.webpQuality),
			maxDimension: this.positiveOption(input.maxDimension, "preview.maxDimension", IMAGE_MAX_DIMENSION),
		};
	}

	private webpQuality(inputQuality?: number): number {
		const quality = this.positiveOption(inputQuality, "preview.webpQuality", PREVIEW_WEBP_QUALITY);
		return Math.min(Math.max(Math.round(quality), 1), 100);
	}

	private positiveOption(inputValue: unknown, settingKey: string, defaultValue: number): number {
		const override = Number(inputValue);
		if (Number.isFinite(override) && override > 0) return override;
		return this.positiveSetting(settingKey, defaultValue);
	}

	private positiveSetting(key: string, defaultValue: number): number {
		const value = Number(this.app.getSetting(key));
		return Number.isFinite(value) && value > 0 ? value : defaultValue;
	}

	private async cleanupTempFile(filePath?: string): Promise<void> {
		if (!filePath) return;
		try {
			await fsp.rm(filePath, { force: true });
		} catch (_error) {
			// 临时源文件清理是 best-effort，不能覆盖主流程的处理结果。
		}
	}

	private resolveFilePathInsideDataDir(filename: string): string {
		const dataDir = path.resolve(this.cosService.getFilePath());
		const filePath = path.resolve(dataDir, filename.replace(/^[/\\]+/, ""));
		if (filePath != dataDir && !filePath.startsWith(`${dataDir}${path.sep}`)) {
			throw new Error("PREVIEW_FILENAME_INVALID");
		}

		return filePath;
	}
}
