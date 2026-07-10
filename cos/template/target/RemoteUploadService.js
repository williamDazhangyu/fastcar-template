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
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const promises_1 = require("stream/promises");
const CosService_1 = require("./CosService");
const Code_1 = require("./model/Code");
const RemoteUpload_1 = require("./model/RemoteUpload");
const RemoteUploadNetwork_1 = require("./remote/RemoteUploadNetwork");
const util_1 = require("./utils/util");
const DEFAULT_REMOTE_UPLOAD_OPTIONS = {
    maxBytes: 1073741824,
    chunkSize: 5242880,
    chunkConcurrency: 4,
    fileConcurrency: 2,
    requestTimeoutMs: 600000,
    maxAttempts: 3,
    maxRedirects: 5,
    taskRetentionMs: 86400000,
};
const ACTIVE_STATUSES = new Set([
    RemoteUpload_1.RemoteUploadStatus.probing,
    RemoteUpload_1.RemoteUploadStatus.queued,
    RemoteUpload_1.RemoteUploadStatus.downloading,
    RemoteUpload_1.RemoteUploadStatus.merging,
]);
let RemoteUploadService = class RemoteUploadService {
    networkClient;
    app;
    cosService;
    domain;
    configuredOptions;
    logger;
    tasks = new Map();
    queue = [];
    activeFiles = 0;
    constructor(networkClient = new RemoteUploadNetwork_1.SecureRemoteUploadNetworkClient()) {
        this.networkClient = networkClient;
    }
    create(sourceUrl, targetFilename, claims) {
        const normalizedTarget = this.normalizeTargetFilename(targetFilename);
        this.assertAuthorized(normalizedTarget, claims);
        const existing = this.tasks.get(normalizedTarget);
        if (existing && ACTIVE_STATUSES.has(existing.status)) {
            if (existing.sourceUrl == sourceUrl) {
                return { targetFilename: normalizedTarget, status: existing.status };
            }
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.conflict, Code_1.CODE.CONFLICT);
        }
        const runId = crypto.randomUUID();
        const task = {
            runId,
            sourceUrl,
            downloadUrl: sourceUrl,
            targetFilename: normalizedTarget,
            targetPath: this.resolveTargetPath(normalizedTarget),
            tempDir: path.join(this.getRuntimeRoot(), runId),
            appid: claims.appid,
            status: RemoteUpload_1.RemoteUploadStatus.queued,
            totalBytes: null,
            rangeSupported: false,
            chunks: [],
            attempts: 0,
            resultUrl: null,
            errorCode: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.tasks.set(normalizedTarget, task);
        this.queue.push(task);
        this.pumpQueue();
        return { targetFilename: normalizedTarget, status: task.status };
    }
    getProgress(targetFilename, claims) {
        const normalizedTarget = this.normalizeTargetFilename(targetFilename);
        this.assertAuthorized(normalizedTarget, claims);
        const task = this.tasks.get(normalizedTarget);
        if (!task) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.notFound, Code_1.CODE.NOT_FOUND);
        }
        if (task.appid != claims.appid) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.forbidden, Code_1.CODE.FORBID);
        }
        const completedChunks = task.chunks.filter((chunk) => chunk.completed).length;
        const activeChunks = task.chunks.filter((chunk) => chunk.active).length;
        const failedChunks = task.chunks.filter((chunk) => chunk.failed).length;
        const downloadedBytes = task.chunks.reduce((total, chunk) => total + chunk.downloadedBytes, 0);
        const totalChunks = task.chunks.length;
        let progress = totalChunks > 0 ? Math.floor(completedChunks / totalChunks * 100) : 0;
        if (task.status == RemoteUpload_1.RemoteUploadStatus.merging) {
            progress = Math.min(progress, 99);
        }
        else if (task.status == RemoteUpload_1.RemoteUploadStatus.completed) {
            progress = 100;
        }
        return {
            targetFilename: normalizedTarget,
            status: task.status,
            totalChunks,
            completedChunks,
            activeChunks,
            failedChunks,
            progress,
            downloadedBytes,
            totalBytes: task.totalBytes,
            attempts: task.attempts,
            resultUrl: task.resultUrl,
            errorCode: task.errorCode,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
        };
    }
    pumpQueue() {
        const options = this.options();
        while (this.activeFiles < options.fileConcurrency && this.queue.length > 0) {
            const task = this.queue.shift();
            if (!task || task.status != RemoteUpload_1.RemoteUploadStatus.queued) {
                continue;
            }
            this.activeFiles++;
            void this.runTask(task).finally(() => {
                this.activeFiles--;
                this.pumpQueue();
            });
        }
    }
    async runTask(task) {
        try {
            task.status = RemoteUpload_1.RemoteUploadStatus.probing;
            this.touch(task);
            const probe = await this.probeWithRetry(task);
            this.prepareChunks(task, probe);
            task.status = RemoteUpload_1.RemoteUploadStatus.downloading;
            this.touch(task);
            await fs.promises.mkdir(task.tempDir, { recursive: true });
            await this.downloadChunks(task);
            task.status = RemoteUpload_1.RemoteUploadStatus.merging;
            this.touch(task);
            await this.mergeAndCommit(task);
            task.status = RemoteUpload_1.RemoteUploadStatus.completed;
            task.resultUrl = `${String(this.domain || "").replace(/\/+$/, "")}${task.targetFilename}`;
            this.touch(task);
            await this.cleanupTaskFiles(task);
        }
        catch (error) {
            const remoteError = this.toRemoteError(error);
            task.status = RemoteUpload_1.RemoteUploadStatus.failed;
            task.errorCode = remoteError.errorCode;
            this.touch(task);
            await this.cleanupTaskFiles(task);
            this.logger?.error?.(`Remote upload failed: ${task.targetFilename}`, remoteError.errorCode);
        }
        finally {
            this.scheduleRetention(task);
        }
    }
    async probeWithRetry(task, attempt = 1) {
        task.attempts++;
        this.touch(task);
        try {
            return await this.networkClient.probe(task.sourceUrl, this.options());
        }
        catch (error) {
            const remoteError = this.toRemoteError(error);
            if (!remoteError.retryable || attempt >= this.options().maxAttempts) {
                throw remoteError;
            }
            await this.retryDelay(attempt);
            return await this.probeWithRetry(task, attempt + 1);
        }
    }
    prepareChunks(task, probe) {
        const options = this.options();
        task.downloadUrl = probe.finalUrl;
        task.totalBytes = probe.totalBytes;
        task.rangeSupported = probe.rangeSupported;
        task.ifRange = probe.etag && !probe.etag.startsWith("W/") ? probe.etag : probe.lastModified;
        if (task.totalBytes !== null && task.totalBytes > options.maxBytes) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.tooLarge, Code_1.CODE.BAD_REQUEST);
        }
        const shouldSplit = task.rangeSupported && task.totalBytes !== null && task.totalBytes >= options.chunkSize;
        const totalChunks = shouldSplit ? Math.ceil(task.totalBytes / options.chunkSize) : 1;
        task.chunks = Array.from({ length: totalChunks }, (_, index) => {
            const start = shouldSplit ? index * options.chunkSize : 0;
            const end = task.totalBytes === null ? null : shouldSplit ? Math.min(task.totalBytes - 1, start + options.chunkSize - 1) : task.totalBytes - 1;
            return {
                index,
                start,
                end,
                filePath: path.join(task.tempDir, `${index}.part`),
                downloadedBytes: 0,
                attempts: 0,
                active: false,
                completed: false,
                failed: false,
            };
        });
        this.touch(task);
    }
    async downloadChunks(task) {
        let nextIndex = 0;
        const worker = async () => {
            const index = nextIndex++;
            if (index >= task.chunks.length) {
                return;
            }
            await this.downloadChunk(task, task.chunks[index]);
            await worker();
        };
        const workerCount = Math.min(this.options().chunkConcurrency, task.chunks.length);
        // Wait for every worker before cleanup so one failed chunk cannot remove files still being written.
        const results = await Promise.allSettled(Array.from({ length: workerCount }, () => worker()));
        const failed = results.find((result) => result.status == "rejected");
        if (failed) {
            throw failed.reason;
        }
    }
    async downloadChunk(task, chunk, attempt = 1) {
        chunk.active = true;
        chunk.failed = false;
        chunk.attempts = attempt;
        task.attempts++;
        this.touch(task);
        try {
            let existingBytes = await this.fileSize(chunk.filePath);
            const expectedBytes = chunk.end === null ? null : chunk.end - chunk.start + 1;
            if (expectedBytes !== null && existingBytes > expectedBytes) {
                await fs.promises.rm(chunk.filePath, { force: true });
                existingBytes = 0;
            }
            if (expectedBytes !== null && existingBytes == expectedBytes) {
                chunk.downloadedBytes = existingBytes;
                chunk.completed = true;
                chunk.active = false;
                this.touch(task);
                return;
            }
            chunk.downloadedBytes = existingBytes;
            const rangeStart = task.rangeSupported ? chunk.start + existingBytes : undefined;
            const rangeEnd = task.rangeSupported && chunk.end !== null ? chunk.end : undefined;
            const input = {
                url: task.downloadUrl,
                outputPath: chunk.filePath,
                append: existingBytes > 0,
                rangeStart,
                rangeEnd,
                expectedTotalBytes: task.totalBytes,
                ifRange: task.ifRange,
                maxBytes: expectedBytes === null ? this.options().maxBytes - existingBytes : expectedBytes - existingBytes,
                options: this.options(),
                onProgress: (receivedBytes) => {
                    chunk.downloadedBytes = existingBytes + receivedBytes;
                    this.touch(task);
                },
            };
            await this.networkClient.download(input);
            const finalSize = await this.fileSize(chunk.filePath);
            if (expectedBytes !== null && finalSize != expectedBytes) {
                throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.rangeMismatch, Code_1.CODE.BAD_REQUEST, true, true);
            }
            if (expectedBytes === null) {
                if (finalSize == 0) {
                    throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.emptyFile, Code_1.CODE.BAD_REQUEST);
                }
                task.totalBytes = finalSize;
                chunk.end = finalSize - 1;
            }
            chunk.downloadedBytes = finalSize;
            chunk.completed = true;
            chunk.active = false;
            this.touch(task);
        }
        catch (error) {
            const remoteError = this.toRemoteError(error);
            chunk.active = false;
            if (remoteError.resetChunk) {
                await fs.promises.rm(chunk.filePath, { force: true });
                chunk.downloadedBytes = 0;
            }
            if (remoteError.retryable && attempt < this.options().maxAttempts) {
                // Without Range support a partial response cannot be resumed safely.
                if (!task.rangeSupported) {
                    await fs.promises.rm(chunk.filePath, { force: true });
                    chunk.downloadedBytes = 0;
                }
                this.touch(task);
                await this.retryDelay(attempt);
                return await this.downloadChunk(task, chunk, attempt + 1);
            }
            chunk.failed = true;
            this.touch(task);
            throw remoteError;
        }
    }
    async mergeAndCommit(task) {
        const targetDir = path.dirname(task.targetPath);
        await this.ensureSafeTargetDirectory(targetDir);
        const baseName = path.basename(task.targetPath);
        const mergedPath = path.join(targetDir, `.${baseName}.${task.runId}.tmp`);
        const backupPath = path.join(targetDir, `.${baseName}.${task.runId}.bak`);
        try {
            await fs.promises.writeFile(mergedPath, Buffer.alloc(0));
            for (const chunk of task.chunks) {
                await (0, promises_1.pipeline)(fs.createReadStream(chunk.filePath), fs.createWriteStream(mergedPath, { flags: "a" }));
            }
            const mergedSize = await this.fileSize(mergedPath);
            if (task.totalBytes === null || mergedSize != task.totalBytes) {
                throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.storageError, Code_1.CODE.FAIL);
            }
            let backupCreated = false;
            try {
                const targetStat = await this.statOrNull(task.targetPath);
                if (targetStat) {
                    if (!targetStat.isFile()) {
                        throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.storageError, Code_1.CODE.FAIL);
                    }
                    await fs.promises.rename(task.targetPath, backupPath);
                    backupCreated = true;
                }
                // The completed merge is moved only after validation; the backup permits rollback on Windows too.
                await fs.promises.rename(mergedPath, task.targetPath);
                if (backupCreated) {
                    await fs.promises.rm(backupPath, { force: true }).catch(() => undefined);
                }
            }
            catch (error) {
                if (backupCreated && !await this.exists(task.targetPath)) {
                    await fs.promises.rename(backupPath, task.targetPath).catch(() => undefined);
                }
                throw error;
            }
        }
        catch (error) {
            await fs.promises.rm(mergedPath, { force: true }).catch(() => undefined);
            throw this.toRemoteError(error, RemoteUpload_1.RemoteUploadErrorCode.storageError);
        }
    }
    normalizeTargetFilename(filename) {
        if (typeof filename != "string" || !filename.trim() || filename.includes("\0")) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.invalidTarget, Code_1.CODE.BAD_REQUEST);
        }
        const slashNormalized = filename.trim().replace(/\\/g, "/");
        if (slashNormalized.split("/").some((part) => part == "..")) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.invalidTarget, Code_1.CODE.BAD_REQUEST);
        }
        const normalized = path.posix.normalize((0, util_1.normalizeCosFilename)(slashNormalized));
        if (normalized == "/" || normalized.endsWith("/")) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.invalidTarget, Code_1.CODE.BAD_REQUEST);
        }
        return normalized;
    }
    resolveTargetPath(filename) {
        const dataRoot = path.resolve(this.cosService.getFilePath());
        const targetPath = path.resolve(dataRoot, filename.replace(/^[/\\]+/, ""));
        if (targetPath == dataRoot || !targetPath.startsWith(`${dataRoot}${path.sep}`)) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.invalidTarget, Code_1.CODE.BAD_REQUEST);
        }
        return targetPath;
    }
    async ensureSafeTargetDirectory(targetDir) {
        const dataRoot = path.resolve(this.cosService.getFilePath());
        await fs.promises.mkdir(dataRoot, { recursive: true });
        const realDataRoot = await fs.promises.realpath(dataRoot);
        const relativeDir = path.relative(dataRoot, targetDir);
        if (relativeDir.startsWith("..") || path.isAbsolute(relativeDir)) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.invalidTarget, Code_1.CODE.BAD_REQUEST);
        }
        let currentPath = dataRoot;
        for (const segment of relativeDir.split(path.sep).filter(Boolean)) {
            currentPath = path.join(currentPath, segment);
            const stat = await fs.promises.lstat(currentPath).catch((error) => {
                if (error.code == "ENOENT") {
                    return null;
                }
                throw error;
            });
            if (!stat) {
                await fs.promises.mkdir(currentPath);
            }
            else if (!stat.isDirectory() && !stat.isSymbolicLink()) {
                throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.storageError, Code_1.CODE.FAIL);
            }
            const realCurrentPath = await fs.promises.realpath(currentPath);
            if (realCurrentPath != realDataRoot && !realCurrentPath.startsWith(`${realDataRoot}${path.sep}`)) {
                throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.invalidTarget, Code_1.CODE.BAD_REQUEST);
            }
        }
    }
    assertAuthorized(filename, claims) {
        if (!claims?.appid) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.forbidden, Code_1.CODE.FORBID);
        }
        const dirPath = (0, util_1.normalizeCosFilename)(claims.dir_path || "/");
        if (dirPath != "/" && !(0, util_1.includeFile)(filename, dirPath)) {
            throw new RemoteUpload_1.RemoteUploadError(RemoteUpload_1.RemoteUploadErrorCode.forbidden, Code_1.CODE.FORBID);
        }
    }
    getRuntimeRoot() {
        return path.resolve(this.app.getResourcePath(), "..", "runtime", "remote-upload");
    }
    options() {
        const configured = this.configuredOptions || {};
        return {
            maxBytes: this.positiveOption(configured.maxBytes, DEFAULT_REMOTE_UPLOAD_OPTIONS.maxBytes),
            chunkSize: this.positiveOption(configured.chunkSize, DEFAULT_REMOTE_UPLOAD_OPTIONS.chunkSize),
            chunkConcurrency: this.positiveOption(configured.chunkConcurrency, DEFAULT_REMOTE_UPLOAD_OPTIONS.chunkConcurrency),
            fileConcurrency: this.positiveOption(configured.fileConcurrency, DEFAULT_REMOTE_UPLOAD_OPTIONS.fileConcurrency),
            requestTimeoutMs: this.positiveOption(configured.requestTimeoutMs, DEFAULT_REMOTE_UPLOAD_OPTIONS.requestTimeoutMs),
            maxAttempts: this.positiveOption(configured.maxAttempts, DEFAULT_REMOTE_UPLOAD_OPTIONS.maxAttempts),
            maxRedirects: this.nonNegativeOption(configured.maxRedirects, DEFAULT_REMOTE_UPLOAD_OPTIONS.maxRedirects),
            taskRetentionMs: this.positiveOption(configured.taskRetentionMs, DEFAULT_REMOTE_UPLOAD_OPTIONS.taskRetentionMs),
        };
    }
    positiveOption(value, fallback) {
        return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
    }
    nonNegativeOption(value, fallback) {
        return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
    }
    async retryDelay(attempt) {
        const base = attempt == 1 ? 2000 : 8000;
        const jitter = Math.floor(Math.random() * 400);
        await new Promise((resolve) => setTimeout(resolve, base + jitter));
    }
    touch(task) {
        task.updatedAt = Date.now();
    }
    async cleanupTaskFiles(task) {
        await fs.promises.rm(task.tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
    scheduleRetention(task) {
        const timer = setTimeout(() => {
            if (this.tasks.get(task.targetFilename)?.runId == task.runId) {
                this.tasks.delete(task.targetFilename);
            }
        }, this.options().taskRetentionMs);
        timer.unref();
    }
    async fileSize(filePath) {
        const stat = await this.statOrNull(filePath);
        return stat?.isFile() ? stat.size : 0;
    }
    async statOrNull(filePath) {
        try {
            return await fs.promises.stat(filePath);
        }
        catch (error) {
            if (error.code == "ENOENT") {
                return null;
            }
            throw error;
        }
    }
    async exists(filePath) {
        return await this.statOrNull(filePath) !== null;
    }
    toRemoteError(error, fallback = RemoteUpload_1.RemoteUploadErrorCode.storageError) {
        if (error instanceof RemoteUpload_1.RemoteUploadError) {
            return error;
        }
        return new RemoteUpload_1.RemoteUploadError(fallback, Code_1.CODE.FAIL);
    }
};
__decorate([
    annotation_1.Autowired,
    __metadata("design:type", core_1.FastCarApplication)
], RemoteUploadService.prototype, "app", void 0);
__decorate([
    annotation_1.Autowired,
    __metadata("design:type", CosService_1.default)
], RemoteUploadService.prototype, "cosService", void 0);
__decorate([
    (0, annotation_1.Value)("sys.domain"),
    __metadata("design:type", String)
], RemoteUploadService.prototype, "domain", void 0);
__decorate([
    (0, annotation_1.Value)("sys.remoteUpload"),
    __metadata("design:type", Object)
], RemoteUploadService.prototype, "configuredOptions", void 0);
__decorate([
    (0, annotation_1.Log)(),
    __metadata("design:type", core_1.Logger)
], RemoteUploadService.prototype, "logger", void 0);
RemoteUploadService = __decorate([
    annotation_1.Service,
    __metadata("design:paramtypes", [Object])
], RemoteUploadService);
exports.default = RemoteUploadService;
