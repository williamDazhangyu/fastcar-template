import { Autowired, Controller, Log, Rule, ValidForm, Value } from "@fastcar/core/annotation";
import { DELETE, GET, POST, PUT, AddMapping } from "@fastcar/koa/annotation";
import Result from "./model/Result";
import { nanoid } from "nanoid";
import { Context } from "koa";
import { Logger } from "@fastcar/core";
import * as fs from "fs";
import * as path from "path";
import { createDirPath, matchPermissions } from "./utils/util";
import { CODE } from "./model/Code";
import FILE_MAP from "@/model/MimeMap";
import CosService from "./CosService";
import Data from "./model/Data";
import * as compressing from "compressing";
import { ZipMap, ZipSuffixs } from "./model/ZipMap";
const crypto = require("crypto");
const CompressZip = [".gz", ".br"];
const CompressSuffix = ["gzip", "br"];

@Controller
export default class CosController {
	@Autowired
	private cosService!: CosService;

	@Value("sys.domain")
	private domain!: string;

	@Log()
	private logger!: Logger;

	@Autowired
	private data!: Data;

	@GET("/common/getAccountInfo")
	getAccountInfo() {
		return Result.ok(this.cosService.createAccount());
	}

	@GET()
	checkSign() {
		return Result.ok();
	}

	@POST("/common/createSign")
	@ValidForm
	createSign(
		@Rule({
			appid: { required: true },
			expireTime: { required: true, type: "int" },
			dir_path: { required: true },
			mode: { required: true, type: "int" },
			serectkey: { required: true },
		})
		info: {
			appid: string; //账号id
			expireTime: number; //时间戳精确到秒
			dir_path: string; //授权的可访问路径
			mode: number; // 1可读 2可写 4可查 相互独立
			serectkey: string;
		}
	) {
		let serectkey = Reflect.get(info, "serectkey");
		Reflect.deleteProperty(info, serectkey);
		let encMsg: string = "";

		try {
			let pwd = Buffer.from(serectkey);
			let iv = crypto.randomBytes(12);

			let cipher = crypto.createCipheriv("aes-256-gcm", pwd, iv);

			//加密
			let enc = cipher.update(JSON.stringify(info), "utf8", "base64");
			enc += cipher.final("base64");

			let tags = cipher.getAuthTag();
			let encStr = Buffer.from(enc, "base64");

			//由于和java对应的AES/GCM/PKCS5Padding模式对应 所以采用这个拼接
			let totalLength = iv.length + encStr.length + tags.length;
			let bufferMsg = Buffer.concat([iv, encStr, tags], totalLength);

			encMsg = encodeURIComponent(`${info.appid};${bufferMsg.toString("base64")}`);
		} catch (e) {
			this.logger.error("Encrypt is error", e);
		}

		return Result.ok(encMsg);
	}

	@GET()
	@ValidForm
	getFile(
		@Rule({
			filename: { required: true },
		})
		{ filename }: { filename: string },
		ctx: Context
	) {
		return this.handleGetFile(filename, ctx, false);
	}

	// 添加 HEAD 方法支持
	@ValidForm
	headFile(
		@Rule({
			filename: { required: true },
		})
		{ filename }: { filename: string },
		ctx: Context
	) {
		return this.handleGetFile(filename, ctx, true);
	}

	// 处理文件请求的核心逻辑
	handleGetFile(
		filename: string,
		ctx: Context,
		isHead: boolean
	) {
		let range = ctx.headers["range"];
		let positions = {
			start: 0,
			end: 0,
		};
		let ETag = "";
		let modifyTime = "Last-Modified";

		let fp = this.cosService.getFilePath(filename);
		if (fs.existsSync(fp)) {
			let stats = fs.statSync(fp);
			if (!stats.isFile()) {
				// ctx.status = CODE.BAD_REQUEST;
				// return Result.errorCode(ctx.status);
				//修改为404方便重定向
				ctx.status = CODE.NOT_FOUND;
				return Result.errorCode(CODE.NOT_FOUND);
			}

			ctx.set({
				"Content-Length": stats.size.toString(),
			});

			if (range) {
				let [start, end] = range.replace(/bytes=/, "").split("-");
				positions = {
					start: parseInt(start, 10),
					end: end ? parseInt(end, 10) : stats.size - 1,
				};

				if (!isNaN(positions.start) && !isNaN(positions.end)) {
					ctx.set({
						"Content-Range": `bytes ${positions.start}-${positions.end}/${stats.size}`,
						"Content-Length": (positions.end - positions.start + 1).toString(),
					});
				}
			}

			ETag = stats.mtime.getTime().toString();
			modifyTime = stats.mtime.toUTCString();
		} else {
			ctx.status = CODE.NOT_FOUND;
			return Result.errorCode(CODE.NOT_FOUND);
		}

		// let disposition = fp.split(path.sep).pop();

		ctx.set({
			"Content-Type": FILE_MAP(filename) || "application/json",
			"Accept-Ranges": "bytes",
			ETag: ETag,
			"Last-Modified": modifyTime,
			// "Content-Disposition": `attachment; filename="${disposition}"`,
		});

		CompressZip.some((suffix, index) => {
			if (filename.endsWith(suffix)) {
				let gzindex = filename.indexOf(suffix);
				ctx.set("Content-Encoding", CompressSuffix[index]);
				ctx.set("Content-Type", FILE_MAP(filename.substring(0, gzindex)) || "application/json");

				return true;
			}

			return false;
		});

		// HEAD 请求只返回响应头，不返回响应体
		if (isHead) {
			ctx.status = 200;
			ctx.body = "";
			return;
		}

		if (!range) {
			ctx.status = 200;
			ctx.body = fs.createReadStream(fp); // 发送文件流
		} else {
			ctx.status = 206;
			ctx.body = fs.createReadStream(fp, positions); // 发送文件流
		}
	}

	@POST()
	@ValidForm
	async uploadfile(
		@Rule({
			chunkNumber: { type: "int", defaultVal: 1 },
			totalChunks: { type: "int", defaultVal: 1 },
		})
		{ chunkNumber, totalChunks }: { chunkNumber: number; totalChunks: number },
		ctx: Context
	) {
		if (!Reflect.has(ctx.request, "files")) {
			return Result.errorMsg("请选择内容上传");
		}

		let files = Reflect.get(ctx.request, "files");
		let rootPath = this.cosService.getFilePath();

		let keys = Object.keys(files);
		if (keys.length == 0) {
			return Result.errorMsg("请选择内容上传");
		}

		//现在只取单一的一个元素
		let dir = keys[0];
		let fileValue = files[dir];
		let originalFilename = fileValue.originalFilename as string;

		//重命名文件
		if (totalChunks > 1) {
			originalFilename = `${originalFilename}.${chunkNumber}`;
		}

		if (!originalFilename) {
			originalFilename = nanoid();
		}
		if (!originalFilename.startsWith("/")) {
			originalFilename = `/${originalFilename}`;
		}

		let wp = path.join(rootPath, dir, originalFilename);

		let dirIndex = wp.lastIndexOf(path.sep);
		let dirpath = wp.substring(0, dirIndex);

		let flag = createDirPath(dirpath);
		if (!flag) {
			return Result.errorCode(CODE.FILE_EXIST);
		}

		let realfpIndex = wp.lastIndexOf(".");
		let realfilename = wp.substring(0, realfpIndex);

		return new Promise((resolve) => {
			const reader = fs.createReadStream(fileValue.filepath); // 创建可读流
			const writer = fs.createWriteStream(wp); // 创建可写流

			reader.pipe(writer);

			writer.on("finish", async () => {
				reader.destroy();
				writer.destroy();

				let rp = `${dir || ""}${originalFilename}`;
				if (!rp.startsWith("/")) {
					rp = `/${rp}`;
				}

				if (totalChunks > 1 && totalChunks == this.cosService.getTaskLength(realfilename, totalChunks)) {
					rp = rp.substring(0, rp.lastIndexOf("."));
					let flag = await this.cosService.mergeFile(realfilename, totalChunks);
					this.cosService.deleteFiles(realfilename, totalChunks);

					if (!flag) {
						if (fs.existsSync(realfilename)) {
							fs.rm(
								realfilename,
								{
									recursive: true,
									force: true,
								},
								() => {}
							);
						}
					}

					resolve(flag ? Result.ok(`${this.domain}${rp}`) : Result.errorCode(CODE.BAD_REQUEST));
				} else {
					resolve(Result.ok(`${this.domain}${rp}`));
				}
			});

			reader.on("error", (err) => {
				this.logger.error(`读取流出错${fileValue.filepath}:${err.message}`);

				reader.destroy();
				writer.destroy();
				resolve(Result.errorCode(CODE.BAD_REQUEST));
			});

			writer.on("error", (err) => {
				this.logger.error(`写入流出错${wp}:${err.message}`);

				reader.destroy();
				writer.destroy();
				resolve(Result.errorCode(CODE.BAD_REQUEST));
			});
		});
	}

	@DELETE()
	@ValidForm
	deleteChunkFile(
		@Rule({
			filename: { required: true },
			totalChunks: { type: "int", defaultVal: 1 },
		})
		{ filename, totalChunks }: { filename: string; totalChunks: number }
	) {
		//删除分块文件
		let fp = this.cosService.getFilePath(filename);

		let baseDir = path.dirname(fp);
		let baseName = path.basename(filename);
		let deleteChunks = 0;
		for (let i = 1; i <= totalChunks; i++) {
			let chunkPath = path.join(baseDir, `${baseName}.${i}`);
			if (fs.existsSync(chunkPath)) {
				fs.rmSync(chunkPath, { force: true });
				deleteChunks++;
			}
		}
		return Result.ok();
	}

	@DELETE()
	@ValidForm
	deleteFile(
		@Rule({
			filename: { required: true },
		})
		{ filename }: { filename: string }
	) {
		//删除文件
		let fp = this.cosService.getFilePath(filename);

		if (fs.existsSync(fp)) {
			fs.rmSync(fp, { recursive: true, force: true });
		}

		return Result.ok();
	}

	@POST()
	@ValidForm
	async extractFile(
		@Rule({
			filename: { required: true },
			targetDir: { required: false },
		})
		{ filename, targetDir }: { filename: string; targetDir: string }
	) {
		let fp = this.cosService.getFilePath(filename);

		if (!fs.existsSync(fp)) {
			return Result.errorCode(CODE.BAD_REQUEST);
		}

		let stats = fs.statSync(fp);
		if (!stats.isFile()) {
			return Result.errorCode(CODE.BAD_REQUEST);
		}
		let baseDir = path.dirname(fp);

		//获取后缀名
		let suffix = "";
		ZipSuffixs.some((item) => {
			if (fp.endsWith(item)) {
				suffix = item;
				return true;
			}
			return false;
		});
		let fn = ZipMap.get(suffix);
		if (!fn) {
			return Result.errorCode(CODE.NOT_SUPPORT, "method does not support");
		}

		//处理文件名称
		if (!targetDir) {
			//直接创建一个文件夹并放置下面
			let index = fp.lastIndexOf(suffix);
			if (index != -1) {
				baseDir = fp.substring(0, index);
			}
		} else {
			baseDir = this.cosService.getFilePath(targetDir);
		}

		let cfn = Reflect.get(compressing, fn);
		if (!cfn) {
			return Result.errorCode(CODE.NOT_SUPPORT, "method does not support");
		}

		return new Promise((resolve) => {
			cfn.uncompress(fp, baseDir)
				.then(() => {
					resolve(Result.ok());
				})
				.catch((e: Error) => {
					this.logger.error(`${filename} unzip error`, e);
					resolve(Result.errorMsg(`Extraction failed: ${e.message}`));
				});
		});
	}

	//可访问桶
	@GET()
	queryFilelist({ filename }: { filename?: string }, ctx: Context) {
		let rootPath = this.cosService.getFilePath(filename);

		if (!fs.existsSync(rootPath)) {
			ctx.status = CODE.NOT_FOUND;
			return Result.errorCode(CODE.NOT_FOUND);
		}

		let resultFiles: Array<{
			name: string;
			create_time: number;
			modify_time: number;
			size: number; //文件大小
			file: boolean;
		}> = [];

		let rootInfo = fs.statSync(rootPath);
		if (rootInfo.isFile()) {
			resultFiles.push({
				name: rootPath.split(path.sep).pop() || "/",
				create_time: rootInfo.ctime.getTime(),
				modify_time: rootInfo.mtime.getTime(),
				size: rootInfo.size,
				file: true,
			});
		} else {
			const files = fs.readdirSync(rootPath);
			files.forEach((tp) => {
				let t = fs.statSync(path.join(rootPath, tp));
				resultFiles.push({
					name: tp,
					create_time: t.ctime.getTime(),
					modify_time: t.mtime.getTime(),
					size: t.size,
					file: t.isFile(),
				});
			});
		}

		return Result.ok(resultFiles);
	}

	//创建文件夹
	@POST()
	@ValidForm
	createDir(
		@Rule({
			dirname: { required: true },
			permission: {
				filters: [
					{
						fn: (str) => {
							return ["public", "private"].includes(str);
						},
					},
				],
			},
		})
		{ dirname, permission }: { dirname: string; permission?: "public" | "private" },
		ctx: Context
	) {
		let dirpath = this.cosService.getFilePath(dirname);

		if (fs.existsSync(dirpath)) {
			return Result.ok();
		}

		if (createDirPath(dirpath)) {
			if (permission) {
				this.setPermissions(
					{
						filename: dirname,
						permission,
					},
					ctx
				);
			}

			return Result.ok();
		}

		return Result.errorCode(CODE.FAIL);
	}

	//初始化添加用户
	@POST("/common/initAccount")
	initAccount({}, ctx: Context) {
		let data = this.cosService.getData();
		if (data.accounts.length != 0) {
			return Result.errorCode(CODE.FORBID, `Account has been initialized`);
		}

		return this.addAccount({}, ctx);
	}

	@GET()
	getAccountList() {
		return Result.ok(
			this.data.accounts.map((item) => {
				return item.appid;
			})
		);
	}

	//添加用户
	@POST()
	addAccount({}, ctx: Context) {
		let data = this.cosService.getData();
		let info = this.cosService.createAccount();

		data.accounts.push(info);
		this.cosService.writeData(data);

		return Result.ok(info);
	}

	//删除用户
	@DELETE()
	@ValidForm
	delAccount(
		@Rule({
			account: { required: true },
		})
		{ account }: { account: string }
	) {
		let data = this.cosService.getData();
		let findIndex = data.accounts.findIndex((item) => {
			return item.appid == account;
		});

		if (findIndex > -1) {
			data.accounts.splice(findIndex, 1);
			this.cosService.writeData(data);
		}

		return Result.ok();
	}

	//设置桶权限
	@PUT()
	@ValidForm
	setPermissions(
		@Rule({
			filename: { required: true },
		})
		{ filename, permission }: { filename: string; permission: "public" | "private" },
		ctx: Context
	) {
		let fp = this.cosService.getFilePath(filename);
		if (!fs.existsSync(fp)) {
			return Result.errorCode(CODE.NOT_FOUND);
		}

		let data = this.cosService.getData();
		data.permissions[filename] = permission;

		this.cosService.writeData(data);

		return Result.ok();
	}

	//获取当前的文件的权限 返回权限 是否为继承/指定
	@GET()
	@ValidForm
	getPermissions(
		@Rule({
			filename: { required: true },
		})
		{ filename }: { filename: string }
	) {
		let permission = matchPermissions(this.data.permissions, filename);
		return Result.ok({
			filename,
			permission,
			source: Reflect.has(this.data.permissions, filename) ? "set" : "extend", //设定/继承
		});
	}

	//移除文件的权限
	@DELETE()
	@ValidForm
	delPermissions(
		@Rule({
			filename: { required: true },
		})
		{ filename }: { filename: string }
	) {
		let data = this.cosService.getData();

		if (Reflect.has(this.data.permissions, filename)) {
			Reflect.deleteProperty(data.permissions, filename);
			this.cosService.writeData(data);
		}

		return Result.ok();
	}

	//设置重定向
	@POST()
	@ValidForm
	setRedirect(
		@Rule({
			redirectUrl: { required: true },
			flag: { required: true, type: "boolean" },
		})
		{ redirectUrl, flag, bucket, domain }: { redirectUrl: string; flag: boolean; bucket: string; domain?: string }
	) {
		let data = this.cosService.getData();

		if (!redirectUrl.startsWith("/") && !redirectUrl.startsWith("http")) {
			redirectUrl = `/${redirectUrl}`;
		}

		//全部重定向
		if (flag) {
			data.defaultredirect = redirectUrl;
		} else {
			if (!bucket) {
				return Result.errorCode(CODE.BAD_REQUEST);
			}

			if (!bucket.startsWith("/")) {
				bucket = `/${bucket}`;
			}

			// 如果指定了域名，设置域名级别的重定向
			if (domain) {
				if (!data.redirect[domain]) {
					data.redirect[domain] = {};
				}
				(data.redirect[domain] as { [path: string]: string })[bucket] = redirectUrl;
			} else {
				// 全局路径重定向
				data.redirect[bucket] = redirectUrl;
			}
		}

		this.cosService.writeData(data);
		return Result.ok();
	}

	@PUT()
	@ValidForm
	rename(
		@Rule({
			filename: { required: true },
			newname: { required: true },
		})
		{ filename, newname }: { filename: string; newname: string }
	) {
		//删除文件
		let fp = this.cosService.getFilePath(filename);
		let np = this.cosService.getFilePath(newname);

		if (fs.existsSync(fp)) {
			fs.renameSync(fp, np);
		} else {
			return Result.errorCode(CODE.NOT_FOUND);
		}

		return Result.ok();
	}

	@GET()
	@ValidForm
	getRedirect() {
		let data = this.cosService.getData();
		return Result.ok({
			redirect: data.redirect,
			defaultredirect: data.defaultredirect || "",
		});
	}

	@GET()
	queryRedirect({ bucketUrl, domain }: { bucketUrl?: string; domain?: string }) {
		let data = this.cosService.getData();

		if (!bucketUrl) {
			return Result.ok("/");
		}

		if (!bucketUrl.startsWith("/")) {
			bucketUrl = `/${bucketUrl}`;
		}

		let redirectUrl: string | undefined;

		// 如果指定了域名，优先查询域名下的配置
		if (domain) {
			const domainConfig = data.redirect?.[domain];
			if (typeof domainConfig === "object") {
				redirectUrl = domainConfig[bucketUrl];
			}
		}

		// 如果没找到，查询全局配置
		if (!redirectUrl) {
			const globalConfig = data.redirect?.[bucketUrl];
			if (typeof globalConfig === "string") {
				redirectUrl = globalConfig;
			}
		}

		return Result.ok(redirectUrl || "");
	}
}

// 注册 HEAD 路由
AddMapping(CosController.prototype, {
	url: "/getFile",
	method: "headFile",
	request: ["head" as any],
});
