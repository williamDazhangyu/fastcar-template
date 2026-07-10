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
const RemoteUpload_1 = require("./model/RemoteUpload");
const RemoteUploadService_1 = require("./RemoteUploadService");
let RemoteUploadController = class RemoteUploadController {
    remoteUploadService;
    logger;
    uploadByUrl({ url, targetFilename }, ctx) {
        try {
            return Result_1.default.ok(this.remoteUploadService.create(url, targetFilename, this.authClaims(ctx)));
        }
        catch (error) {
            return this.toErrorResult(ctx, error);
        }
    }
    progress({ targetFilename }, ctx) {
        try {
            return Result_1.default.ok(this.remoteUploadService.getProgress(targetFilename, this.authClaims(ctx)));
        }
        catch (error) {
            return this.toErrorResult(ctx, error);
        }
    }
    authClaims(ctx) {
        return ctx.state.authClaims;
    }
    toErrorResult(ctx, error) {
        if (error instanceof RemoteUpload_1.RemoteUploadError) {
            ctx.status = error.httpCode;
            return Result_1.default.errorCode(error.httpCode, error.errorCode);
        }
        this.logger.error("Remote upload request failed", error);
        ctx.status = Code_1.CODE.FAIL;
        return Result_1.default.errorCode(Code_1.CODE.FAIL, RemoteUpload_1.RemoteUploadErrorCode.storageError);
    }
};
__decorate([
    annotation_1.Autowired,
    __metadata("design:type", RemoteUploadService_1.default)
], RemoteUploadController.prototype, "remoteUploadService", void 0);
__decorate([
    (0, annotation_1.Log)(),
    __metadata("design:type", core_1.Logger)
], RemoteUploadController.prototype, "logger", void 0);
__decorate([
    (0, annotation_2.POST)("/uploadByUrl"),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        url: { required: true },
        targetFilename: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RemoteUploadController.prototype, "uploadByUrl", null);
__decorate([
    (0, annotation_2.GET)("/uploadByUrl/progress"),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        targetFilename: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RemoteUploadController.prototype, "progress", null);
RemoteUploadController = __decorate([
    annotation_1.Controller
], RemoteUploadController);
exports.default = RemoteUploadController;
