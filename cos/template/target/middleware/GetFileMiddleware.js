"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = GetFileMiddleware;
const fs = require("fs");
const path = require("path");
const querystring_1 = require("querystring");
const Code_1 = require("../model/Code");
const Data_1 = require("../model/Data");
const CosService_1 = require("../CosService");
const url_1 = require("url");
function GetFileMiddleware(app) {
    return async (ctx, next) => {
        let url = ctx.request.path;
        if ((ctx.request.method == "GET" || ctx.request.method == "HEAD") && url != "/getFile") {
            let cosService = app.getComponentByTarget(CosService_1.default);
            let dataPath = cosService.getFilePath();
            //url 做code解析操作
            url = decodeURIComponent(url);
            const filePath = path.join(dataPath, url);
            if (fs.existsSync(filePath)) {
                //重定向
                let forwardUrl = `/getFile?filename=${url}`;
                if (Object.keys(ctx.query).length > 0) {
                    forwardUrl += `&${(0, querystring_1.stringify)(ctx.query)}`;
                }
                //重写url 不再直接重定向
                ctx.url = forwardUrl;
            }
        }
        //如果存在该文件
        await next();
        if ((ctx.request.method == "GET" || ctx.request.method == "HEAD") && (ctx.status == Code_1.CODE.NOT_FOUND || ctx.status == Code_1.CODE.FORBID)) {
            //进行重定向
            let configData = app.getComponentByTarget(Data_1.default);
            if (configData) {
                let b = url.split("/")[1];
                let pathKey = `/${b}`;
                const host = ctx.request.host || ctx.request.hostname;
                let redirectUrl;
                // 1. 优先匹配域名下的路径配置
                if (host && configData?.redirect?.[host]) {
                    const domainConfig = configData.redirect[host];
                    if (typeof domainConfig === "object") {
                        redirectUrl = domainConfig[pathKey];
                    }
                }
                // 2. 次级匹配：全局相对路径配置
                if (!redirectUrl) {
                    const globalConfig = configData?.redirect?.[pathKey];
                    if (typeof globalConfig === "string") {
                        redirectUrl = globalConfig;
                    }
                }
                // 3. 最后使用默认重定向
                if (!redirectUrl) {
                    redirectUrl = configData.defaultredirect;
                }
                if (redirectUrl && url != redirectUrl) {
                    delete ctx?.query?.filename;
                    if (Object.keys(ctx.query).length > 0) {
                        if (redirectUrl.includes("?")) {
                            let formatUrl = new url_1.URL(redirectUrl);
                            Object.keys(ctx.query).forEach((key) => {
                                formatUrl.searchParams.set(key, Reflect.get(ctx.query, key));
                            });
                            ctx.redirect(formatUrl.href);
                        }
                        else {
                            ctx.redirect(`${redirectUrl}?${(0, querystring_1.stringify)(ctx.query)}`);
                        }
                    }
                    else {
                        ctx.redirect(redirectUrl);
                    }
                }
            }
        }
    };
}
