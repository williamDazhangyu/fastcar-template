const { strict: assert } = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
	RemoteUploadError,
	RemoteUploadErrorCode,
	RemoteUploadStatus,
} = require("../src/model/RemoteUpload");
const RemoteUploadService = require("../src/RemoteUploadService").default;

const CHUNK_SIZE = 5242880;
const CLAIMS = {
	appid: "test-app",
	dir_path: "/files",
	expireTime: Math.floor(Date.now() / 1000) + 60,
	mode: 7,
};

class FakeRemoteUploadClient {
	rangeStarts = [];
	failFirstDownload = false;
	downloadDelayMs = 0;
	maxActiveDownloads = 0;
	failed = false;
	activeDownloads = 0;

	constructor(content, rangeSupported, knownSize = true) {
		this.content = content;
		this.rangeSupported = rangeSupported;
		this.knownSize = knownSize;
	}

	async probe(url) {
		return {
			finalUrl: url,
			totalBytes: this.knownSize ? this.content.length : null,
			rangeSupported: this.rangeSupported,
			etag: "\"test-etag\"",
		};
	}

	async download(input) {
		this.rangeStarts.push(input.rangeStart);
		this.activeDownloads++;
		this.maxActiveDownloads = Math.max(this.maxActiveDownloads, this.activeDownloads);
		try {
			if (this.downloadDelayMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, this.downloadDelayMs));
			}
			const start = input.rangeStart || 0;
			const end = input.rangeEnd === undefined ? this.content.length - 1 : input.rangeEnd;
			const data = this.content.subarray(start, end + 1);

			if (this.failFirstDownload && !this.failed) {
				this.failed = true;
				const partial = data.subarray(0, Math.max(1, Math.floor(data.length / 2)));
				await fs.promises.writeFile(input.outputPath, partial, { flag: input.append ? "a" : "w" });
				input.onProgress(partial.length);
				throw new RemoteUploadError(RemoteUploadErrorCode.networkError, 400, true);
			}

			await fs.promises.writeFile(input.outputPath, data, { flag: input.append ? "a" : "w" });
			input.onProgress(data.length);
			return data.length;
		} finally {
			this.activeDownloads--;
		}
	}
}

describe("RemoteUploadService", function () {
	this.timeout(10000);
	let root;

	beforeEach(async () => {
		root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "remote-upload-test-"));
	});

	afterEach(async () => {
		await fs.promises.rm(root, { recursive: true, force: true });
	});

	it("downloads fixed 5MiB chunks concurrently, merges in order, and replaces an existing target", async () => {
		const content = Buffer.alloc(CHUNK_SIZE + 17, 7);
		const client = new FakeRemoteUploadClient(content, true);
		client.downloadDelayMs = 5;
		const service = createService(root, client);
		const targetPath = path.join(root, "data", "files", "file.bin");
		await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
		await fs.promises.writeFile(targetPath, Buffer.from("old-content"));

		const created = service.create("https://example.com/file.bin", "/files/file.bin", CLAIMS);
		assert.equal(created.targetFilename, "/files/file.bin");

		const progress = await waitForTerminal(service, "/files/file.bin");
		assert.equal(progress.status, RemoteUploadStatus.completed);
		assert.equal(progress.totalChunks, 2);
		assert.equal(progress.completedChunks, 2);
		assert.equal(progress.progress, 100);
		assert.equal(client.maxActiveDownloads, 2);
		assert.deepEqual(await fs.promises.readFile(targetPath), content);
	});

	it("keeps a range-capable file smaller than 5MiB as one chunk", async () => {
		const content = Buffer.alloc(CHUNK_SIZE - 1, 5);
		const client = new FakeRemoteUploadClient(content, true);
		const service = createService(root, client);

		service.create("https://example.com/small.bin", "/files/small.bin", CLAIMS);
		const progress = await waitForTerminal(service, "/files/small.bin");

		assert.equal(progress.status, RemoteUploadStatus.completed);
		assert.equal(progress.totalChunks, 1);
		assert.deepEqual(client.rangeStarts, [0]);
		assert.deepEqual(await fs.promises.readFile(path.join(root, "data", "files", "small.bin")), content);
	});

	it("falls back to one stream when size is unknown or ranges are unsupported", async () => {
		const content = Buffer.from("single-stream");
		const client = new FakeRemoteUploadClient(content, false, false);
		const service = createService(root, client);

		service.create("https://example.com/file.txt", "/files/file.txt", CLAIMS);
		const progress = await waitForTerminal(service, "/files/file.txt");

		assert.equal(progress.status, RemoteUploadStatus.completed);
		assert.equal(progress.totalChunks, 1);
		assert.equal(progress.totalBytes, content.length);
		assert.deepEqual(client.rangeStarts, [undefined]);
	});

	it("resumes a failed chunk from its partial offset and rejects a conflicting active target", async () => {
		const content = Buffer.alloc(1024, 3);
		const client = new FakeRemoteUploadClient(content, true);
		client.failFirstDownload = true;
		const service = createService(root, client);

		assert.throws(
			() => service.create("https://example.com/a.bin", "/files/../escape.bin", CLAIMS),
			(error) => error instanceof RemoteUploadError && error.errorCode == RemoteUploadErrorCode.invalidTarget
		);
		service.create("https://example.com/a.bin", "/files/retry.bin", CLAIMS);
		assert.throws(
			() => service.getProgress("/files/retry.bin", { ...CLAIMS, appid: "other-app" }),
			(error) => error instanceof RemoteUploadError && error.errorCode == RemoteUploadErrorCode.forbidden
		);
		assert.throws(
			() => service.create("https://example.com/b.bin", "/files/retry.bin", CLAIMS),
			(error) => error instanceof RemoteUploadError && error.errorCode == RemoteUploadErrorCode.conflict
		);

		const progress = await waitForTerminal(service, "/files/retry.bin");
		assert.equal(progress.status, RemoteUploadStatus.completed);
		assert.equal(progress.totalChunks, 1);
		assert.equal(client.rangeStarts[0], 0);
		assert.ok(client.rangeStarts[1] > 0);
		assert.ok(progress.attempts >= 3);
		assert.deepEqual(await fs.promises.readFile(path.join(root, "data", "files", "retry.bin")), content);
	});
});

function createService(root, client) {
	const service = new RemoteUploadService(client);
	Object.assign(service, {
		app: {
			getResourcePath: () => path.join(root, "resource"),
		},
		cosService: {
			getFilePath: () => path.join(root, "data"),
		},
		domain: "https://cos.example.com",
		configuredOptions: {
			maxBytes: 1073741824,
			chunkSize: CHUNK_SIZE,
			chunkConcurrency: 4,
			fileConcurrency: 2,
			requestTimeoutMs: 600000,
			maxAttempts: 3,
			maxRedirects: 5,
			taskRetentionMs: 60000,
		},
		logger: {
			error: () => undefined,
		},
		retryDelay: async () => undefined,
	});
	return service;
}

async function waitForTerminal(service, targetFilename, attempts = 500) {
	const progress = service.getProgress(targetFilename, CLAIMS);
	if (progress.status == RemoteUploadStatus.completed || progress.status == RemoteUploadStatus.failed) {
		return progress;
	}
	if (attempts <= 0) {
		throw new Error("Timed out waiting for remote upload");
	}
	await new Promise((resolve) => setTimeout(resolve, 10));
	return await waitForTerminal(service, targetFilename, attempts - 1);
}
