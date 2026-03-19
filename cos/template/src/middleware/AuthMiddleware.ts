import { FastCarApplication } from "@fastcar/core";
import * as koa from "koa";
import Result from "@/model/Result";
import { CODE } from "@/model/Code";
import Data from "@/model/Data";
import { gcmDecrypt, includeFile, matchPermissions } from "@/utils/util";

const AuthFileUrls = [
	"/getFile",
	"/deleteFile",
	"/deleteChunkFile",
	"/queryFilelist",
	"/createDir",
	"/checkSign",
	"/getAccountList",
	"/addAccount",
	"/delAccount",
	"/setPermissions",
	"/getPermissions",
	"/delPermissions",
	"/setRedirect",
	"/rename",
	"/extractFile",
	"/getRedirect",
	"/queryRedirect",
];

export default function Auth(app: FastCarApplication): koa.Middleware {
	return async (ctx: koa.Context, next: Function) => {
		let url = ctx.request.path;
		let data: Data = app.getComponentByTarget(Data) as Data;

		//合并传参
		let body: { [key: string]: any } = {};
		//自动合并传参 如果有重合的部分 需要再次单独取就好了
		if (Object.keys(ctx.query).length > 0) {
			Object.assign(body, ctx.query);
		}

		if (!!Reflect.has(ctx.request, "body")) {
			Object.assign(body, Reflect.get(ctx.request, "body"));
		}

		if (!!ctx.params) {
			Object.assign(body, ctx.params);
		}

		if (url.startsWith("/getFile")) {
			//校验是否为公有权限
			let filename = body.filename as string;

			if (filename) {
				//匹配结果
				if (data && data.permissions) {
					let macthRes = matchPermissions(data.permissions, filename);
					if (macthRes == "public") {
						return await next();
					}
				}
			}
		}

		if (!AuthFileUrls.includes(url) && !url.startsWith("/uploadfile")) {
			return await next();
		}

		//获取权限
		let xsign = decodeURIComponent(body.sign as string);

		if (xsign && body.sign) {
			let accounts = data.accounts;
			let [appid, sign] = xsign.split(";");
			if (appid && sign) {
				if (Array.isArray(accounts)) {
					for (let item of accounts) {
						if (item.appid == appid) {
							let parseInfo = gcmDecrypt(item.serectkey, sign);
							if (parseInfo) {
								let pobj: {
									expireTime: number; //时间戳精确到秒
									dir_path?: string; //授权的可访问路径
									appid: string; //账号id
									mode: number; // 1可读 2可写 4可查 相互独立
								} = JSON.parse(parseInfo);
								if (pobj && pobj.appid == appid && Date.now() < pobj.expireTime * 1000) {
									//进行路径匹配
									if (pobj.dir_path && pobj.dir_path != "/") {
										if (AuthFileUrls.includes(url)) {
											let { filename } = body;
											if (filename && typeof filename == "string" && includeFile(filename, pobj.dir_path)) {
												return await next();
											}
										} else if (url == "/uploadfile") {
											let files = Reflect.get(ctx.request, "files");
											if (!!files) {
												if (
													Object.keys(files).every((f) => {
														return includeFile(f, pobj.dir_path as string);
													})
												) {
													return await next();
												}
											}
										}
									} else {
										return await next();
									}
								}
							}
							break;
						}
					}
				}
			}
		}

		ctx.body = Result.errorCode(CODE.FORBID);
		ctx.status = CODE.FORBID;
	};
}
