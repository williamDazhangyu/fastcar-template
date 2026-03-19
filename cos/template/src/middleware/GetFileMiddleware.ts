import { FastCarApplication } from "@fastcar/core";
import * as koa from "koa";
import * as fs from "fs";
import path = require("path");
import { stringify } from "querystring";
import { CODE } from "@/model/Code";
import Data from "@/model/Data";
import CosService from "@/CosService";
import { URL } from "url";

export default function GetFileMiddleware(app: FastCarApplication): koa.Middleware {
	return async (ctx: koa.Context, next: Function) => {
		let url = ctx.request.path;

		if (ctx.request.method == "GET" && url != "/getFile") {
			let cosService = app.getComponentByTarget(CosService) as CosService;
			let dataPath = cosService.getFilePath();

			//url 做code解析操作
			url = decodeURIComponent(url);
			const filePath = path.join(dataPath, url);

			if (fs.existsSync(filePath)) {
				//重定向
				let forwardUrl = `/getFile?filename=${url}`;
				if (Object.keys(ctx.query).length > 0) {
					forwardUrl += `&${stringify(ctx.query)}`;
				}

				//重写url 不再直接重定向
				ctx.url = forwardUrl;
			}
		}

		//如果存在该文件
		await next();

		if (ctx.request.method == "GET" && (ctx.status == CODE.NOT_FOUND || ctx.status == CODE.FORBID)) {
			//进行重定向
			let configData = app.getComponentByTarget<Data>(Data);
			if (configData) {
				let b = url.split("/")[1];
				let redirectUrl = configData?.redirect?.[`/${b}`] || configData.defaultredirect;
				if (redirectUrl && url != redirectUrl) {
					delete ctx?.query?.filename;
					if (Object.keys(ctx.query).length > 0) {
						if (redirectUrl.includes("?")) {
							let formatUrl = new URL(redirectUrl);
							Object.keys(ctx.query).forEach((key) => {
								formatUrl.searchParams.set(key, Reflect.get(ctx.query, key) as string);
							});

							ctx.redirect(formatUrl.href);
						} else {
							ctx.redirect(`${redirectUrl}?${stringify(ctx.query)}`);
						}
					} else {
						ctx.redirect(redirectUrl);
					}
				}
			}
		}
	};
}
