"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Auth;
const Result_1 = require("../model/Result");
const Code_1 = require("../model/Code");
const Data_1 = require("../model/Data");
const util_1 = require("../utils/util");
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
    "/image/generatePreview",
    "/image/resize",
    "/uploadByUrl",
    "/uploadByUrl/progress",
    "/getRedirect",
    "/queryRedirect",
];
function Auth(app) {
    return async (ctx, next) => {
        let url = ctx.request.path;
        let data = app.getComponentByTarget(Data_1.default);
        //合并传参
        let body = {};
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
            let filename = body.filename;
            if (filename) {
                //匹配结果
                if (data && data.permissions) {
                    let macthRes = (0, util_1.matchPermissions)(data.permissions, filename);
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
        let xsign = decodeURIComponent(body.sign);
        if (xsign && body.sign) {
            let accounts = data.accounts;
            let [appid, sign] = xsign.split(";");
            if (appid && sign) {
                if (Array.isArray(accounts)) {
                    for (let item of accounts) {
                        if (item.appid == appid) {
                            let parseInfo = (0, util_1.gcmDecrypt)(item.serectkey, sign);
                            if (parseInfo) {
                                let pobj = JSON.parse(parseInfo);
                                if (pobj && pobj.appid == appid && Date.now() < pobj.expireTime * 1000) {
                                    //进行路径匹配
                                    if (pobj.dir_path && pobj.dir_path != "/") {
                                        if (url == "/image/generatePreview" || url == "/image/resize") {
                                            if (isImageProcessAllowed(body, pobj.dir_path)) {
                                                ctx.state.authClaims = pobj;
                                                return await next();
                                            }
                                        }
                                        else if (url == "/uploadByUrl" || url == "/uploadByUrl/progress") {
                                            if (isRemoteUploadAllowed(body, pobj.dir_path)) {
                                                ctx.state.authClaims = pobj;
                                                return await next();
                                            }
                                        }
                                        else if (AuthFileUrls.includes(url)) {
                                            let { filename } = body;
                                            if (filename && typeof filename == "string" && (0, util_1.includeFile)(filename, pobj.dir_path)) {
                                                ctx.state.authClaims = pobj;
                                                return await next();
                                            }
                                        }
                                        else if (url == "/uploadfile") {
                                            let files = Reflect.get(ctx.request, "files");
                                            if (!!files) {
                                                if (Object.keys(files).every((f) => {
                                                    if (!f.startsWith("/")) {
                                                        f = `/${f}`;
                                                    }
                                                    return (0, util_1.includeFile)(f, pobj.dir_path);
                                                })) {
                                                    ctx.state.authClaims = pobj;
                                                    return await next();
                                                }
                                            }
                                        }
                                    }
                                    else {
                                        ctx.state.authClaims = pobj;
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
        ctx.body = Result_1.default.errorCode(Code_1.CODE.FORBID);
        ctx.status = Code_1.CODE.FORBID;
    };
}
function isRemoteUploadAllowed(body, dirPath) {
    const { targetFilename } = body;
    if (!targetFilename || typeof targetFilename != "string") {
        return false;
    }
    return (0, util_1.includeFile)((0, util_1.normalizeCosFilename)(targetFilename), (0, util_1.normalizeCosFilename)(dirPath));
}
function isImageProcessAllowed(body, dirPath) {
    const { filename, sourceUrl, targetFilename } = body;
    const normalizedDirPath = (0, util_1.normalizeCosFilename)(dirPath);
    if (!targetFilename || typeof targetFilename != "string") {
        return false;
    }
    if (!!filename == !!sourceUrl) {
        return false;
    }
    const normalizedTargetFilename = (0, util_1.normalizeCosFilename)(targetFilename);
    if (filename && typeof filename == "string") {
        const sourceFilename = (0, util_1.normalizeCosFilename)(filename);
        return (0, util_1.includeFile)(sourceFilename, normalizedDirPath) && (0, util_1.includeFile)(normalizedTargetFilename, normalizedDirPath);
    }
    if (sourceUrl && typeof sourceUrl == "string") {
        return (0, util_1.includeFile)(normalizedTargetFilename, normalizedDirPath);
    }
    return false;
}
