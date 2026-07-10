"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteUploadError = exports.RemoteUploadErrorCode = exports.RemoteUploadStatus = void 0;
var RemoteUploadStatus;
(function (RemoteUploadStatus) {
    RemoteUploadStatus["probing"] = "probing";
    RemoteUploadStatus["queued"] = "queued";
    RemoteUploadStatus["downloading"] = "downloading";
    RemoteUploadStatus["merging"] = "merging";
    RemoteUploadStatus["completed"] = "completed";
    RemoteUploadStatus["failed"] = "failed";
})(RemoteUploadStatus || (exports.RemoteUploadStatus = RemoteUploadStatus = {}));
var RemoteUploadErrorCode;
(function (RemoteUploadErrorCode) {
    RemoteUploadErrorCode["conflict"] = "REMOTE_UPLOAD_CONFLICT";
    RemoteUploadErrorCode["forbidden"] = "REMOTE_UPLOAD_FORBIDDEN";
    RemoteUploadErrorCode["invalidTarget"] = "REMOTE_UPLOAD_TARGET_INVALID";
    RemoteUploadErrorCode["invalidUrl"] = "REMOTE_UPLOAD_URL_INVALID";
    RemoteUploadErrorCode["unsupportedUrl"] = "REMOTE_UPLOAD_URL_UNSUPPORTED";
    RemoteUploadErrorCode["privateAddress"] = "REMOTE_UPLOAD_PRIVATE_ADDRESS";
    RemoteUploadErrorCode["redirectLimit"] = "REMOTE_UPLOAD_REDIRECT_LIMIT";
    RemoteUploadErrorCode["httpError"] = "REMOTE_UPLOAD_HTTP_ERROR";
    RemoteUploadErrorCode["rangeMismatch"] = "REMOTE_UPLOAD_RANGE_MISMATCH";
    RemoteUploadErrorCode["tooLarge"] = "REMOTE_UPLOAD_TOO_LARGE";
    RemoteUploadErrorCode["emptyFile"] = "REMOTE_UPLOAD_EMPTY_FILE";
    RemoteUploadErrorCode["timeout"] = "REMOTE_UPLOAD_TIMEOUT";
    RemoteUploadErrorCode["networkError"] = "REMOTE_UPLOAD_NETWORK_ERROR";
    RemoteUploadErrorCode["storageError"] = "REMOTE_UPLOAD_STORAGE_ERROR";
    RemoteUploadErrorCode["notFound"] = "REMOTE_UPLOAD_TASK_NOT_FOUND";
})(RemoteUploadErrorCode || (exports.RemoteUploadErrorCode = RemoteUploadErrorCode = {}));
class RemoteUploadError extends Error {
    errorCode;
    httpCode;
    retryable;
    resetChunk;
    constructor(errorCode, httpCode, retryable = false, resetChunk = false) {
        super(errorCode);
        this.errorCode = errorCode;
        this.httpCode = httpCode;
        this.retryable = retryable;
        this.resetChunk = resetChunk;
        this.name = "RemoteUploadError";
    }
}
exports.RemoteUploadError = RemoteUploadError;
