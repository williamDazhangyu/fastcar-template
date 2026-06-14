"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@fastcar/core");
const annotation_1 = require("@fastcar/core/annotation");
const nanoid_1 = require("nanoid");
const crypto_1 = require("crypto");
const fs = require("fs");
const fs_1 = require("fs");
const path = require("path");
const stream_1 = require("stream");
const promises_1 = require("stream/promises");
const sharp = require("sharp");
const CosService_1 = require("./CosService");
const MimeMap_1 = require("./model/MimeMap");
const util_1 = require("./utils/util");
const PREVIEW_MAX_LONG_EDGE = 1280;
const PREVIEW_MAX_ORIGINAL_BYTES = 500 * 1024;
const LOCAL_IMAGE_MAX_BYTES = 100 * 1024 * 1024;
const PREVIEW_WEBP_QUALITY = 82;
const EXTERNAL_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const EXTERNAL_IMAGE_TIMEOUT_MS = 15000;
const SHARP_CACHE_MEMORY_MB = 64;
const IMAGE_MAX_DIMENSION = 8192;
sharp.cache({ files: 0, items: 32, memory: SHARP_CACHE_MEMORY_MB });
let ImageService = class ImageService {
    app;
    cosService;
    async generatePreview(input, domain) {
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
                    await fs_1.promises.copyFile(source.input, target.tempPath);
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
            }
            catch (error) {
                await this.cleanupReservedTarget(target);
                throw error;
            }
        }
        finally {
            await this.cleanupTempFile(source.cleanupPath);
        }
    }
    async resizeImage(input, domain) {
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
                });
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
            }
            catch (error) {
                await this.cleanupReservedTarget(target);
                throw error;
            }
        }
        finally {
            await this.cleanupTempFile(source.cleanupPath);
        }
    }
    async readInputSource(input, domain, options) {
        const filename = input.filename?.trim();
        const sourceUrl = input.sourceUrl?.trim();
        if (!!filename == !!sourceUrl) {
            throw new Error("IMAGE_SOURCE_INVALID");
        }
        return filename ? this.readLocalSource(filename, domain, options) : this.readExternalSource(sourceUrl || "", options);
    }
    async readLocalSource(filename, domain, options) {
        const normalized = (0, util_1.normalizeCosFilename)(filename);
        const filePath = this.resolveFilePathInsideDataDir(normalized);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            throw new Error("PREVIEW_SOURCE_NOT_FOUND");
        }
        const mimeType = (0, MimeMap_1.default)(normalized) || "";
        if (!mimeType.startsWith("image/")) {
            throw new Error("PREVIEW_SOURCE_NOT_IMAGE");
        }
        const stats = await fs_1.promises.stat(filePath);
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
    async readExternalSource(sourceUrl, options) {
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
            (0, util_1.createDirPath)(path.dirname(tempPath));
            const sizeBytes = await this.writeResponseBodyToFile(response, tempPath, options);
            return {
                input: tempPath,
                mimeType,
                sizeBytes,
                sourceUrl: url.href,
                cleanupPath: tempPath,
            };
        }
        catch (error) {
            await this.cleanupTempFile(tempPath);
            if (error instanceof Error && error.name == "AbortError") {
                throw new Error("PREVIEW_SOURCE_TIMEOUT");
            }
            if (error instanceof TypeError) {
                throw new Error("PREVIEW_SOURCE_FETCH_FAILED");
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    normalizeRequiredTarget(targetFilename) {
        if (!targetFilename || !targetFilename.trim()) {
            throw new Error("IMAGE_TARGET_FILENAME_REQUIRED");
        }
        return (0, util_1.normalizeCosFilename)(targetFilename);
    }
    async reserveTargetPath(targetFilename) {
        const targetPath = this.resolveFilePathInsideDataDir(targetFilename);
        (0, util_1.createDirPath)(path.dirname(targetPath));
        const targetDir = path.dirname(targetPath);
        const targetBasename = path.basename(targetPath);
        const targetHash = (0, crypto_1.createHash)("sha256").update(targetPath).digest("hex").slice(0, 16);
        const lockPath = path.join(targetDir, `.${targetBasename}.${targetHash}.lock`);
        const tempPath = path.join(targetDir, `.${targetBasename}.${(0, nanoid_1.nanoid)()}.tmp`);
        try {
            const handle = await fs_1.promises.open(lockPath, "wx");
            await handle.close();
        }
        catch (error) {
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
    async commitReservedTarget(target) {
        try {
            await fs_1.promises.copyFile(target.tempPath, target.targetPath, fs.constants.COPYFILE_EXCL);
            await this.cleanupTempFile(target.tempPath);
        }
        finally {
            await this.cleanupTempFile(target.lockPath);
        }
    }
    async cleanupReservedTarget(target) {
        await Promise.all([this.cleanupTempFile(target.tempPath), this.cleanupTempFile(target.lockPath)]);
    }
    parseExternalImageUrl(sourceUrl) {
        let url;
        try {
            url = new URL(sourceUrl);
        }
        catch (_error) {
            throw new Error("PREVIEW_SOURCE_URL_INVALID");
        }
        if (!["http:", "https:"].includes(url.protocol)) {
            throw new Error("PREVIEW_SOURCE_URL_UNSUPPORTED");
        }
        return url;
    }
    responseImageMimeType(contentType) {
        const mimeType = (contentType || "").split(";")[0].trim().toLowerCase();
        if (!mimeType.startsWith("image/")) {
            throw new Error("PREVIEW_SOURCE_NOT_IMAGE");
        }
        return mimeType;
    }
    async readImageMetadata(input) {
        try {
            return await sharp(input, { animated: false }).metadata();
        }
        catch (_error) {
            throw new Error("PREVIEW_SOURCE_NOT_IMAGE");
        }
    }
    async writeSharpOutput(image, targetPath) {
        try {
            return await image.toFile(targetPath);
        }
        catch (error) {
            if (this.isSharpDecodeError(error)) {
                throw new Error("PREVIEW_SOURCE_DECODE_FAILED");
            }
            throw error;
        }
    }
    isSharpDecodeError(error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        return message.includes("load") || message.includes("decode") || message.includes("corrupt") || message.includes("idat");
    }
    resolveResizeOutputFormat(mimeType) {
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
    shouldUseOriginalSize(sizeBytes, width, height, options) {
        return Math.max(width, height) <= options.maxLongEdge && sizeBytes <= options.maxOriginalBytes;
    }
    positiveInteger(value) {
        const numberValue = Number(value);
        return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
    }
    trimDomain(domain) {
        return String(domain || "").replace(/\/+$/, "");
    }
    externalTempPath(sourceUrl) {
        const hash = (0, crypto_1.createHash)("sha256").update(sourceUrl).digest("hex").slice(0, 16);
        return this.resolveFilePathInsideDataDir(`/.image-tmp/${hash}-${(0, nanoid_1.nanoid)()}`);
    }
    async writeResponseBodyToFile(response, filePath, options) {
        if (!response.body) {
            throw new Error("PREVIEW_SOURCE_EMPTY");
        }
        let sizeBytes = 0;
        const maxBytes = options.externalImageMaxBytes;
        const limiter = new stream_1.Transform({
            transform(chunk, _encoding, callback) {
                sizeBytes += chunk.byteLength;
                if (sizeBytes > maxBytes) {
                    callback(new Error("PREVIEW_SOURCE_TOO_LARGE"));
                    return;
                }
                callback(null, chunk);
            },
        });
        await (0, promises_1.pipeline)(response.body, limiter, fs.createWriteStream(filePath));
        return sizeBytes;
    }
    resolvePreviewOptions(input) {
        return {
            ...this.resolveImageOptions(input),
            maxLongEdge: Math.min(this.positiveOption(input.maxLongEdge, "preview.maxLongEdge", PREVIEW_MAX_LONG_EDGE), this.positiveOption(input.maxDimension, "preview.maxDimension", IMAGE_MAX_DIMENSION)),
            maxOriginalBytes: this.positiveOption(input.maxOriginalBytes, "preview.maxOriginalBytes", PREVIEW_MAX_ORIGINAL_BYTES),
        };
    }
    resolveImageOptions(input) {
        return {
            localImageMaxBytes: this.positiveOption(input.localImageMaxBytes, "preview.localImageMaxBytes", LOCAL_IMAGE_MAX_BYTES),
            externalImageMaxBytes: this.positiveOption(input.externalImageMaxBytes, "preview.externalImageMaxBytes", EXTERNAL_IMAGE_MAX_BYTES),
            externalImageTimeoutMs: this.positiveOption(input.externalImageTimeoutMs, "preview.externalImageTimeoutMs", EXTERNAL_IMAGE_TIMEOUT_MS),
            webpQuality: this.webpQuality(input.webpQuality),
            maxDimension: this.positiveOption(input.maxDimension, "preview.maxDimension", IMAGE_MAX_DIMENSION),
        };
    }
    webpQuality(inputQuality) {
        const quality = this.positiveOption(inputQuality, "preview.webpQuality", PREVIEW_WEBP_QUALITY);
        return Math.min(Math.max(Math.round(quality), 1), 100);
    }
    positiveOption(inputValue, settingKey, defaultValue) {
        const override = Number(inputValue);
        if (Number.isFinite(override) && override > 0)
            return override;
        return this.positiveSetting(settingKey, defaultValue);
    }
    positiveSetting(key, defaultValue) {
        const value = Number(this.app.getSetting(key));
        return Number.isFinite(value) && value > 0 ? value : defaultValue;
    }
    async cleanupTempFile(filePath) {
        if (!filePath)
            return;
        try {
            await fs_1.promises.rm(filePath, { force: true });
        }
        catch (_error) {
            // 临时源文件清理是 best-effort，不能覆盖主流程的处理结果。
        }
    }
    resolveFilePathInsideDataDir(filename) {
        const dataDir = path.resolve(this.cosService.getFilePath());
        const filePath = path.resolve(dataDir, filename.replace(/^[/\\]+/, ""));
        if (filePath != dataDir && !filePath.startsWith(`${dataDir}${path.sep}`)) {
            throw new Error("PREVIEW_FILENAME_INVALID");
        }
        return filePath;
    }
};
__decorate([
    annotation_1.Autowired,
    __metadata("design:type", core_1.FastCarApplication)
], ImageService.prototype, "app", void 0);
__decorate([
    annotation_1.Autowired,
    __metadata("design:type", CosService_1.default)
], ImageService.prototype, "cosService", void 0);
ImageService = __decorate([
    annotation_1.Service
], ImageService);
exports.default = ImageService;
