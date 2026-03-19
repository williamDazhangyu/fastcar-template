import { Autowired, Log, Service } from "@fastcar/core/annotation";
import Data from "./model/Data";
import * as yaml from "yaml";
import * as fs from "fs";
import * as path from "path";
import { CryptoUtil, FileUtil } from "@fastcar/core/utils";
import { FastCarApplication, Logger } from "@fastcar/core";
import { nanoid } from "nanoid";

@Service
export default class CosService {
	@Autowired
	private app!: FastCarApplication;

	@Log()
	private logger!: Logger;

	getTaskLength(f: string, total: number) {
		let count = 0;
		for (let i = 0; i < total; i++) {
			let chunkPath = `${f}.${i + 1}`;
			if (fs.existsSync(chunkPath)) {
				count++;
			}
		}

		return count;
	}

	getData(): Data {
		let datafp = path.join(this.app.getResourcePath(), "data.yml");
		if (fs.existsSync(datafp)) {
			return Object.assign(
				{
					accounts: [],
					permissions: {},
					redirect: {},
				},
				FileUtil.getResource(datafp)
			) as Data;
		}

		let d = {
			accounts: [],
			permissions: {},
			redirect: {},
		};

		this.writeData(d);
		return d;
	}

	writeData(d: Data) {
		let datafp = path.join(this.app.getResourcePath(), "data.yml");
		fs.writeFileSync(datafp, yaml.stringify(d));
	}

	createAccount() {
		return {
			appid: nanoid(),
			serectkey: CryptoUtil.getHashStr(16),
		};
	}

	getFilePath(f?: string): string {
		let dp = this.app.getSetting("dir_path");
		if (!dp) {
			dp = path.join(this.app.getResourcePath(), "../", "data");
		}

		return f ? path.join(dp, f) : dp;
	}

	deleteFiles(filename: string, total: number) {
		for (let i = 0; i < total; i++) {
			let chunkPath = `${filename}.${i + 1}`;
			if (fs.existsSync(chunkPath)) {
				fs.rm(
					chunkPath,
					{
						recursive: true,
						force: true,
					},
					() => {}
				);
			}
		}
	}

	sleep(timer: number) {
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve("");
			}, timer);
		});
	}

	async mergeFile(filename: string, total: number) {
		return new Promise(async (resolve) => {
			let writeStream = fs.createWriteStream(filename);

			writeStream.on("error", (err) => {
				this.logger.error(`合并的写入流错误:`, err);
				writeStream.destroy();
				resolve(false);
			});

			writeStream.on("finish", () => {
				writeStream.destroy();
				resolve(true);
			});

			for (let i = 0; i < total; i++) {
				let chunkPath = `${filename}.${i + 1}`;

				if (!fs.existsSync(chunkPath)) {
					//等待100ms
					await this.sleep(100);
				}

				let readStream = fs.createReadStream(chunkPath);

				let res = await new Promise((resolve1) => {
					readStream.on("error", (err) => {
						this.logger.error(`合并的读取流错误:`, err);
						readStream.destroy();
						resolve1(false);
					});

					readStream.pipe(writeStream, { end: false });
					readStream.on("end", () => {
						readStream.destroy();
						resolve1(true);
					});
				});

				if (!res) {
					writeStream.destroy();
					resolve(false);
					break;
				}
			}

			writeStream.end();
		});
	}
}
