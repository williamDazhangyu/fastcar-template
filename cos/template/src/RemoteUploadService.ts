import { FastCarApplication, Logger } from "@fastcar/core";
import { Autowired, Log, Service, Value } from "@fastcar/core/annotation";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import CosService from "./CosService";
import { CODE } from "./model/Code";
import {
	RemoteUploadAuthClaims,
	RemoteUploadChunk,
	RemoteUploadError,
	RemoteUploadErrorCode,
	RemoteUploadOptions,
	RemoteUploadProgress,
	RemoteUploadStatus,
	RemoteUploadTask,
} from "./model/RemoteUpload";
import {
	RemoteDownloadInput,
	RemoteProbeResult,
	RemoteUploadNetworkClient,
	SecureRemoteUploadNetworkClient,
} from "./remote/RemoteUploadNetwork";
import { includeFile, normalizeCosFilename } from "./utils/util";

const DEFAULT_REMOTE_UPLOAD_OPTIONS: RemoteUploadOptions = {
	maxBytes: 1073741824,
	chunkSize: 5242880,
	chunkConcurrency: 4,
	fileConcurrency: 2,
	requestTimeoutMs: 600000,
	maxAttempts: 3,
	maxRedirects: 5,
	taskRetentionMs: 86400000,
};

const ACTIVE_STATUSES = new Set<RemoteUploadStatus>([
	RemoteUploadStatus.probing,
	RemoteUploadStatus.queued,
	RemoteUploadStatus.downloading,
	RemoteUploadStatus.merging,
]);

@Service
export default class RemoteUploadService {
	@Autowired
	private app!: FastCarApplication;

	@Autowired
	private cosService!: CosService;

	@Value("sys.domain")
	private domain!: string;

	@Value("sys.remoteUpload")
	private configuredOptions?: Partial<RemoteUploadOptions>;

	@Log()
	private logger!: Logger;

	private readonly tasks = new Map<string, RemoteUploadTask>();
	private readonly queue: RemoteUploadTask[] = [];
	private activeFiles = 0;

	constructor(private networkClient: RemoteUploadNetworkClient = new SecureRemoteUploadNetworkClient()) {}

	create(sourceUrl: string, targetFilename: string, claims: RemoteUploadAuthClaims): { targetFilename: string; status: RemoteUploadStatus } {
		const normalizedTarget = this.normalizeTargetFilename(targetFilename);
		this.assertAuthorized(normalizedTarget, claims);

		const existing = this.tasks.get(normalizedTarget);
		if (existing && ACTIVE_STATUSES.has(existing.status)) {
			if (existing.sourceUrl == sourceUrl) {
				return { targetFilename: normalizedTarget, status: existing.status };
			}
			throw new RemoteUploadError(RemoteUploadErrorCode.conflict, CODE.CONFLICT);
		}

		const runId = crypto.randomUUID();
		const task: RemoteUploadTask = {
			runId,
			sourceUrl,
			downloadUrl: sourceUrl,
			targetFilename: normalizedTarget,
			targetPath: this.resolveTargetPath(normalizedTarget),
			tempDir: path.join(this.getRuntimeRoot(), runId),
			appid: claims.appid,
			status: RemoteUploadStatus.queued,
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

	getProgress(targetFilename: string, claims: RemoteUploadAuthClaims): RemoteUploadProgress {
		const normalizedTarget = this.normalizeTargetFilename(targetFilename);
		this.assertAuthorized(normalizedTarget, claims);

		const task = this.tasks.get(normalizedTarget);
		if (!task) {
			throw new RemoteUploadError(RemoteUploadErrorCode.notFound, CODE.NOT_FOUND);
		}
		if (task.appid != claims.appid) {
			throw new RemoteUploadError(RemoteUploadErrorCode.forbidden, CODE.FORBID);
		}

		const completedChunks = task.chunks.filter((chunk) => chunk.completed).length;
		const activeChunks = task.chunks.filter((chunk) => chunk.active).length;
		const failedChunks = task.chunks.filter((chunk) => chunk.failed).length;
		const downloadedBytes = task.chunks.reduce((total, chunk) => total + chunk.downloadedBytes, 0);
		const totalChunks = task.chunks.length;
		let progress = totalChunks > 0 ? Math.floor(completedChunks / totalChunks * 100) : 0;
		if (task.status == RemoteUploadStatus.merging) {
			progress = Math.min(progress, 99);
		} else if (task.status == RemoteUploadStatus.completed) {
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

	private pumpQueue() {
		const options = this.options();
		while (this.activeFiles < options.fileConcurrency && this.queue.length > 0) {
			const task = this.queue.shift();
			if (!task || task.status != RemoteUploadStatus.queued) {
				continue;
			}
			this.activeFiles++;
			void this.runTask(task).finally(() => {
				this.activeFiles--;
				this.pumpQueue();
			});
		}
	}

	private async runTask(task: RemoteUploadTask) {
		try {
			task.status = RemoteUploadStatus.probing;
			this.touch(task);
			const probe = await this.probeWithRetry(task);
			this.prepareChunks(task, probe);

			task.status = RemoteUploadStatus.downloading;
			this.touch(task);
			await fs.promises.mkdir(task.tempDir, { recursive: true });
			await this.downloadChunks(task);

			task.status = RemoteUploadStatus.merging;
			this.touch(task);
			await this.mergeAndCommit(task);

			task.status = RemoteUploadStatus.completed;
			task.resultUrl = `${String(this.domain || "").replace(/\/+$/, "")}${task.targetFilename}`;
			this.touch(task);
			await this.cleanupTaskFiles(task);
		} catch (error) {
			const remoteError = this.toRemoteError(error);
			task.status = RemoteUploadStatus.failed;
			task.errorCode = remoteError.errorCode;
			this.touch(task);
			await this.cleanupTaskFiles(task);
			this.logger?.error?.(`Remote upload failed: ${task.targetFilename}`, remoteError.errorCode);
		} finally {
			this.scheduleRetention(task);
		}
	}

	private async probeWithRetry(task: RemoteUploadTask, attempt: number = 1): Promise<RemoteProbeResult> {
		task.attempts++;
		this.touch(task);
		try {
			return await this.networkClient.probe(task.sourceUrl, this.options());
		} catch (error) {
			const remoteError = this.toRemoteError(error);
			if (!remoteError.retryable || attempt >= this.options().maxAttempts) {
				throw remoteError;
			}
			await this.retryDelay(attempt);
			return await this.probeWithRetry(task, attempt + 1);
		}
	}

	private prepareChunks(task: RemoteUploadTask, probe: RemoteProbeResult) {
		const options = this.options();
		task.downloadUrl = probe.finalUrl;
		task.totalBytes = probe.totalBytes;
		task.rangeSupported = probe.rangeSupported;
		task.ifRange = probe.etag && !probe.etag.startsWith("W/") ? probe.etag : probe.lastModified;

		if (task.totalBytes !== null && task.totalBytes > options.maxBytes) {
			throw new RemoteUploadError(RemoteUploadErrorCode.tooLarge, CODE.BAD_REQUEST);
		}

		const shouldSplit = task.rangeSupported && task.totalBytes !== null && task.totalBytes >= options.chunkSize;
		const totalChunks = shouldSplit ? Math.ceil(task.totalBytes! / options.chunkSize) : 1;
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

	private async downloadChunks(task: RemoteUploadTask) {
		let nextIndex = 0;
		const worker = async (): Promise<void> => {
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
		const failed = results.find((result): result is PromiseRejectedResult => result.status == "rejected");
		if (failed) {
			throw failed.reason;
		}
	}

	private async downloadChunk(task: RemoteUploadTask, chunk: RemoteUploadChunk, attempt: number = 1): Promise<void> {
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
			const input: RemoteDownloadInput = {
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
				throw new RemoteUploadError(RemoteUploadErrorCode.rangeMismatch, CODE.BAD_REQUEST, true, true);
			}
			if (expectedBytes === null) {
				if (finalSize == 0) {
					throw new RemoteUploadError(RemoteUploadErrorCode.emptyFile, CODE.BAD_REQUEST);
				}
				task.totalBytes = finalSize;
				chunk.end = finalSize - 1;
			}

			chunk.downloadedBytes = finalSize;
			chunk.completed = true;
			chunk.active = false;
			this.touch(task);
		} catch (error) {
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

	private async mergeAndCommit(task: RemoteUploadTask) {
		const targetDir = path.dirname(task.targetPath);
		await this.ensureSafeTargetDirectory(targetDir);
		const baseName = path.basename(task.targetPath);
		const mergedPath = path.join(targetDir, `.${baseName}.${task.runId}.tmp`);
		const backupPath = path.join(targetDir, `.${baseName}.${task.runId}.bak`);

		try {
			await fs.promises.writeFile(mergedPath, Buffer.alloc(0));
			for (const chunk of task.chunks) {
				await pipeline(fs.createReadStream(chunk.filePath), fs.createWriteStream(mergedPath, { flags: "a" }));
			}

			const mergedSize = await this.fileSize(mergedPath);
			if (task.totalBytes === null || mergedSize != task.totalBytes) {
				throw new RemoteUploadError(RemoteUploadErrorCode.storageError, CODE.FAIL);
			}

			let backupCreated = false;
			try {
				const targetStat = await this.statOrNull(task.targetPath);
				if (targetStat) {
					if (!targetStat.isFile()) {
						throw new RemoteUploadError(RemoteUploadErrorCode.storageError, CODE.FAIL);
					}
					await fs.promises.rename(task.targetPath, backupPath);
					backupCreated = true;
				}
				// The completed merge is moved only after validation; the backup permits rollback on Windows too.
				await fs.promises.rename(mergedPath, task.targetPath);
				if (backupCreated) {
					await fs.promises.rm(backupPath, { force: true }).catch(() => undefined);
				}
			} catch (error) {
				if (backupCreated && !await this.exists(task.targetPath)) {
					await fs.promises.rename(backupPath, task.targetPath).catch(() => undefined);
				}
				throw error;
			}
		} catch (error) {
			await fs.promises.rm(mergedPath, { force: true }).catch(() => undefined);
			throw this.toRemoteError(error, RemoteUploadErrorCode.storageError);
		}
	}

	private normalizeTargetFilename(filename: string): string {
		if (typeof filename != "string" || !filename.trim() || filename.includes("\0")) {
			throw new RemoteUploadError(RemoteUploadErrorCode.invalidTarget, CODE.BAD_REQUEST);
		}
		const slashNormalized = filename.trim().replace(/\\/g, "/");
		if (slashNormalized.split("/").some((part) => part == "..")) {
			throw new RemoteUploadError(RemoteUploadErrorCode.invalidTarget, CODE.BAD_REQUEST);
		}
		const normalized = path.posix.normalize(normalizeCosFilename(slashNormalized));
		if (normalized == "/" || normalized.endsWith("/")) {
			throw new RemoteUploadError(RemoteUploadErrorCode.invalidTarget, CODE.BAD_REQUEST);
		}
		return normalized;
	}

	private resolveTargetPath(filename: string): string {
		const dataRoot = path.resolve(this.cosService.getFilePath());
		const targetPath = path.resolve(dataRoot, filename.replace(/^[/\\]+/, ""));
		if (targetPath == dataRoot || !targetPath.startsWith(`${dataRoot}${path.sep}`)) {
			throw new RemoteUploadError(RemoteUploadErrorCode.invalidTarget, CODE.BAD_REQUEST);
		}
		return targetPath;
	}

	private async ensureSafeTargetDirectory(targetDir: string) {
		const dataRoot = path.resolve(this.cosService.getFilePath());
		await fs.promises.mkdir(dataRoot, { recursive: true });
		const realDataRoot = await fs.promises.realpath(dataRoot);
		const relativeDir = path.relative(dataRoot, targetDir);
		if (relativeDir.startsWith("..") || path.isAbsolute(relativeDir)) {
			throw new RemoteUploadError(RemoteUploadErrorCode.invalidTarget, CODE.BAD_REQUEST);
		}

		let currentPath = dataRoot;
		for (const segment of relativeDir.split(path.sep).filter(Boolean)) {
			currentPath = path.join(currentPath, segment);
			const stat = await fs.promises.lstat(currentPath).catch((error: NodeJS.ErrnoException) => {
				if (error.code == "ENOENT") {
					return null;
				}
				throw error;
			});
			if (!stat) {
				await fs.promises.mkdir(currentPath);
			} else if (!stat.isDirectory() && !stat.isSymbolicLink()) {
				throw new RemoteUploadError(RemoteUploadErrorCode.storageError, CODE.FAIL);
			}

			const realCurrentPath = await fs.promises.realpath(currentPath);
			if (realCurrentPath != realDataRoot && !realCurrentPath.startsWith(`${realDataRoot}${path.sep}`)) {
				throw new RemoteUploadError(RemoteUploadErrorCode.invalidTarget, CODE.BAD_REQUEST);
			}
		}
	}

	private assertAuthorized(filename: string, claims: RemoteUploadAuthClaims) {
		if (!claims?.appid) {
			throw new RemoteUploadError(RemoteUploadErrorCode.forbidden, CODE.FORBID);
		}
		const dirPath = normalizeCosFilename(claims.dir_path || "/");
		if (dirPath != "/" && !includeFile(filename, dirPath)) {
			throw new RemoteUploadError(RemoteUploadErrorCode.forbidden, CODE.FORBID);
		}
	}

	private getRuntimeRoot(): string {
		return path.resolve(this.app.getResourcePath(), "..", "runtime", "remote-upload");
	}

	private options(): RemoteUploadOptions {
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

	private positiveOption(value: number | undefined, fallback: number): number {
		return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
	}

	private nonNegativeOption(value: number | undefined, fallback: number): number {
		return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
	}

	private async retryDelay(attempt: number) {
		const base = attempt == 1 ? 2000 : 8000;
		const jitter = Math.floor(Math.random() * 400);
		await new Promise<void>((resolve) => setTimeout(resolve, base + jitter));
	}

	private touch(task: RemoteUploadTask) {
		task.updatedAt = Date.now();
	}

	private async cleanupTaskFiles(task: RemoteUploadTask) {
		await fs.promises.rm(task.tempDir, { recursive: true, force: true }).catch(() => undefined);
	}

	private scheduleRetention(task: RemoteUploadTask) {
		const timer = setTimeout(() => {
			if (this.tasks.get(task.targetFilename)?.runId == task.runId) {
				this.tasks.delete(task.targetFilename);
			}
		}, this.options().taskRetentionMs);
		timer.unref();
	}

	private async fileSize(filePath: string): Promise<number> {
		const stat = await this.statOrNull(filePath);
		return stat?.isFile() ? stat.size : 0;
	}

	private async statOrNull(filePath: string): Promise<fs.Stats | null> {
		try {
			return await fs.promises.stat(filePath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code == "ENOENT") {
				return null;
			}
			throw error;
		}
	}

	private async exists(filePath: string): Promise<boolean> {
		return await this.statOrNull(filePath) !== null;
	}

	private toRemoteError(error: unknown, fallback: RemoteUploadErrorCode = RemoteUploadErrorCode.storageError): RemoteUploadError {
		if (error instanceof RemoteUploadError) {
			return error;
		}
		return new RemoteUploadError(fallback, CODE.FAIL);
	}
}
