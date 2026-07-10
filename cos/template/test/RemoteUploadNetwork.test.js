const { strict: assert } = require("assert");
const {
	RemoteUploadError,
	RemoteUploadErrorCode,
} = require("../src/model/RemoteUpload");
const {
	SecureRemoteUploadNetworkClient,
} = require("../src/remote/RemoteUploadNetwork");

describe("SecureRemoteUploadNetworkClient", () => {
	const client = new SecureRemoteUploadNetworkClient();

	it("rejects non-public IPv4 and IPv6 ranges", () => {
		assert.equal(client.isPublicAddress("127.0.0.1"), false);
		assert.equal(client.isPublicAddress("10.0.0.1"), false);
		assert.equal(client.isPublicAddress("::1"), false);
		assert.equal(client.isPublicAddress("fc00::1"), false);
		assert.equal(client.isPublicAddress("2001:db8::1"), false);
		assert.equal(client.isPublicAddress("8.8.8.8"), true);
		assert.equal(client.isPublicAddress("2606:4700:4700::1111"), true);
	});

	it("allows only credential-free HTTP URLs on standard ports", () => {
		assert.equal(client.parseUrl("https://example.com/file").protocol, "https:");
		assert.throws(
			() => client.parseUrl("https://user:pass@example.com/file"),
			(error) => error instanceof RemoteUploadError && error.errorCode == RemoteUploadErrorCode.invalidUrl
		);
		assert.throws(
			() => client.parseUrl("http://example.com:8080/file"),
			(error) => error instanceof RemoteUploadError && error.errorCode == RemoteUploadErrorCode.unsupportedUrl
		);
	});

	it("returns every validated address when lookup requests all results", async () => {
		const addresses = [
			{ address: "8.8.8.8", family: 4 },
			{ address: "2606:4700:4700::1111", family: 6 },
		];
		const lookup = client.createLookup(addresses);

		const result = await new Promise((resolve, reject) => {
			lookup("example.com", { all: true }, (error, resolved) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(resolved);
			});
		});

		assert.deepEqual(result, addresses);
		assert.notEqual(result, addresses);
	});

	it("returns one address matching the requested lookup family", async () => {
		const lookup = client.createLookup([
			{ address: "8.8.8.8", family: 4 },
			{ address: "2606:4700:4700::1111", family: 6 },
		]);

		const result = await new Promise((resolve, reject) => {
			lookup("example.com", { all: false, family: 6 }, (error, address, family) => {
				if (error) {
					reject(error);
					return;
				}
				resolve({ address, family });
			});
		});

		assert.deepEqual(result, {
			address: "2606:4700:4700::1111",
			family: 6,
		});
	});
});
