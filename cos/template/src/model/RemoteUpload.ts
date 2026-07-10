export enum RemoteUploadStatus {
	probing = "probing",
	queued = "queued",
	downloading = "downloading",
	merging = "merging",
	completed = "completed",
	failed = "failed",
}

export enum RemoteUploadErrorCode {
	conflict = "REMOTE_UPLOAD_CONFLICT",
	forbidden = "REMOTE_UPLOAD_FORBIDDEN",
	invalidTarget = "REMOTE_UPLOAD_TARGET_INVALID",
	invalidUrl = "REMOTE_UPLOAD_URL_INVALID",
	unsupportedUrl = "REMOTE_UPLOAD_URL_UNSUPPORTED",
	privateAddress = "REMOTE_UPLOAD_PRIVATE_ADDRESS",
	redirectLimit = "REMOTE_UPLOAD_REDIRECT_LIMIT",
	httpError = "REMOTE_UPLOAD_HTTP_ERROR",
	rangeMismatch = "REMOTE_UPLOAD_RANGE_MISMATCH",
	tooLarge = "REMOTE_UPLOAD_TOO_LARGE",
	emptyFile = "REMOTE_UPLOAD_EMPTY_FILE",
	timeout = "REMOTE_UPLOAD_TIMEOUT",
	networkError = "REMOTE_UPLOAD_NETWORK_ERROR",
	storageError = "REMOTE_UPLOAD_STORAGE_ERROR",
	notFound = "REMOTE_UPLOAD_TASK_NOT_FOUND",
}

export interface RemoteUploadOptions {
	maxBytes: number;
	chunkSize: number;
	chunkConcurrency: number;
	fileConcurrency: number;
	requestTimeoutMs: number;
	maxAttempts: number;
	maxRedirects: number;
	taskRetentionMs: number;
}

export interface RemoteUploadAuthClaims {
	appid: string;
	dir_path?: string;
	expireTime: number;
	mode: number;
}

export interface RemoteUploadChunk {
	index: number;
	start: number;
	end: number | null;
	filePath: string;
	downloadedBytes: number;
	attempts: number;
	active: boolean;
	completed: boolean;
	failed: boolean;
}

export interface RemoteUploadTask {
	runId: string;
	sourceUrl: string;
	downloadUrl: string;
	targetFilename: string;
	targetPath: string;
	tempDir: string;
	appid: string;
	status: RemoteUploadStatus;
	totalBytes: number | null;
	rangeSupported: boolean;
	ifRange?: string;
	chunks: RemoteUploadChunk[];
	attempts: number;
	resultUrl: string | null;
	errorCode: RemoteUploadErrorCode | null;
	createdAt: number;
	updatedAt: number;
}

export interface RemoteUploadProgress {
	targetFilename: string;
	status: RemoteUploadStatus;
	totalChunks: number;
	completedChunks: number;
	activeChunks: number;
	failedChunks: number;
	progress: number;
	downloadedBytes: number;
	totalBytes: number | null;
	attempts: number;
	resultUrl: string | null;
	errorCode: RemoteUploadErrorCode | null;
	createdAt: number;
	updatedAt: number;
}

export class RemoteUploadError extends Error {
	constructor(
		public readonly errorCode: RemoteUploadErrorCode,
		public readonly httpCode: number,
		public readonly retryable: boolean = false,
		public readonly resetChunk: boolean = false
	) {
		super(errorCode);
		this.name = "RemoteUploadError";
	}
}
