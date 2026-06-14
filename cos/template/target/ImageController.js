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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const annotation_1 = require("@fastcar/core/annotation");
const core_1 = require("@fastcar/core");
const annotation_2 = require("@fastcar/koa/annotation");
const Result_1 = require("./model/Result");
const Code_1 = require("./model/Code");
const ImageService_1 = require("./ImageService");
var ImageErrorMessage;
(function (ImageErrorMessage) {
    ImageErrorMessage["imageProcessFailed"] = "IMAGE_PROCESS_FAILED";
    ImageErrorMessage["previewSourceNotFound"] = "PREVIEW_SOURCE_NOT_FOUND";
    ImageErrorMessage["previewSourceNotImage"] = "PREVIEW_SOURCE_NOT_IMAGE";
    ImageErrorMessage["previewSourceUrlUnsupported"] = "PREVIEW_SOURCE_URL_UNSUPPORTED";
    ImageErrorMessage["imageResizeUnsupportedFormat"] = "IMAGE_RESIZE_UNSUPPORTED_FORMAT";
    ImageErrorMessage["imageTargetExists"] = "IMAGE_TARGET_EXISTS";
    ImageErrorMessage["previewSourceHttpPrefix"] = "PREVIEW_SOURCE_HTTP_";
    ImageErrorMessage["imageSourceInvalid"] = "IMAGE_SOURCE_INVALID";
    ImageErrorMessage["imageTargetFilenameRequired"] = "IMAGE_TARGET_FILENAME_REQUIRED";
    ImageErrorMessage["imageTargetEqualsSource"] = "IMAGE_TARGET_EQUALS_SOURCE";
    ImageErrorMessage["imageResizeDimensionsRequired"] = "IMAGE_RESIZE_DIMENSIONS_REQUIRED";
    ImageErrorMessage["imageDimensionTooLarge"] = "IMAGE_DIMENSION_TOO_LARGE";
    ImageErrorMessage["previewSourceTooLarge"] = "PREVIEW_SOURCE_TOO_LARGE";
    ImageErrorMessage["previewSourceDecodeFailed"] = "PREVIEW_SOURCE_DECODE_FAILED";
    ImageErrorMessage["previewSourceTimeout"] = "PREVIEW_SOURCE_TIMEOUT";
    ImageErrorMessage["previewSourceFetchFailed"] = "PREVIEW_SOURCE_FETCH_FAILED";
    ImageErrorMessage["previewSourceUrlInvalid"] = "PREVIEW_SOURCE_URL_INVALID";
    ImageErrorMessage["previewDimensionsMissing"] = "PREVIEW_DIMENSIONS_MISSING";
    ImageErrorMessage["previewFilenameInvalid"] = "PREVIEW_FILENAME_INVALID";
    ImageErrorMessage["previewSourceEmpty"] = "PREVIEW_SOURCE_EMPTY";
})(ImageErrorMessage || (ImageErrorMessage = {}));
let ImageController = class ImageController {
    imageService;
    domain;
    logger;
    async generatePreview(body) {
        try {
            return Result_1.default.ok(await this.imageService.generatePreview(body, this.domain));
        }
        catch (error) {
            return this.toImageErrorResult("Generate preview failed", error);
        }
    }
    async resize(body) {
        try {
            return Result_1.default.ok(await this.imageService.resizeImage(body, this.domain));
        }
        catch (error) {
            return this.toImageErrorResult("Resize image failed", error);
        }
    }
    toImageErrorResult(logMessage, error) {
        const message = error instanceof Error ? error.message : ImageErrorMessage.imageProcessFailed;
        if (message == ImageErrorMessage.previewSourceNotFound) {
            return Result_1.default.errorCode(Code_1.CODE.NOT_FOUND, message);
        }
        if (message == ImageErrorMessage.previewSourceNotImage || message == ImageErrorMessage.previewSourceUrlUnsupported || message == ImageErrorMessage.imageResizeUnsupportedFormat) {
            return Result_1.default.errorCode(Code_1.CODE.NOT_SUPPORT, message);
        }
        if (message == ImageErrorMessage.imageTargetExists) {
            return Result_1.default.errorCode(Code_1.CODE.FILE_EXIST, message);
        }
        if (message.startsWith(ImageErrorMessage.previewSourceHttpPrefix) ||
            message == ImageErrorMessage.imageSourceInvalid ||
            message == ImageErrorMessage.imageTargetFilenameRequired ||
            message == ImageErrorMessage.imageTargetEqualsSource ||
            message == ImageErrorMessage.imageResizeDimensionsRequired ||
            message == ImageErrorMessage.imageDimensionTooLarge ||
            message == ImageErrorMessage.previewSourceTooLarge ||
            message == ImageErrorMessage.previewSourceDecodeFailed ||
            message == ImageErrorMessage.previewSourceTimeout ||
            message == ImageErrorMessage.previewSourceFetchFailed ||
            message == ImageErrorMessage.previewSourceUrlInvalid ||
            message == ImageErrorMessage.previewDimensionsMissing ||
            message == ImageErrorMessage.previewFilenameInvalid ||
            message == ImageErrorMessage.previewSourceEmpty) {
            return Result_1.default.errorCode(Code_1.CODE.BAD_REQUEST, message);
        }
        this.logger.error(logMessage, error);
        return Result_1.default.errorCode(Code_1.CODE.FAIL, message);
    }
};
__decorate([
    annotation_1.Autowired,
    __metadata("design:type", ImageService_1.default)
], ImageController.prototype, "imageService", void 0);
__decorate([
    (0, annotation_1.Value)("sys.domain"),
    __metadata("design:type", String)
], ImageController.prototype, "domain", void 0);
__decorate([
    (0, annotation_1.Log)(),
    __metadata("design:type", core_1.Logger)
], ImageController.prototype, "logger", void 0);
__decorate([
    (0, annotation_2.POST)("/image/generatePreview"),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: false },
        sourceUrl: { required: false },
        targetFilename: { required: true },
        maxLongEdge: { required: false, type: "int" },
        maxOriginalBytes: { required: false, type: "int" },
        localImageMaxBytes: { required: false, type: "int" },
        externalImageMaxBytes: { required: false, type: "int" },
        externalImageTimeoutMs: { required: false, type: "int" },
        webpQuality: { required: false, type: "int" },
        maxDimension: { required: false, type: "int" },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ImageController.prototype, "generatePreview", null);
__decorate([
    (0, annotation_2.POST)("/image/resize"),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: false },
        sourceUrl: { required: false },
        targetFilename: { required: true },
        width: { required: false, type: "int" },
        height: { required: false, type: "int" },
        localImageMaxBytes: { required: false, type: "int" },
        externalImageMaxBytes: { required: false, type: "int" },
        externalImageTimeoutMs: { required: false, type: "int" },
        webpQuality: { required: false, type: "int" },
        maxDimension: { required: false, type: "int" },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ImageController.prototype, "resize", null);
ImageController = __decorate([
    annotation_1.Controller
], ImageController);
exports.default = ImageController;
