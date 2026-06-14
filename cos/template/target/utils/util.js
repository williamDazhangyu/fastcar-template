"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatFlow = formatFlow;
exports.createDirPath = createDirPath;
exports.gcmEncrypt = gcmEncrypt;
exports.gcmDecrypt = gcmDecrypt;
exports.fillEnd = fillEnd;
exports.includeFile = includeFile;
exports.normalizeCosFilename = normalizeCosFilename;
exports.matchPermissions = matchPermissions;
const utils_1 = require("@fastcar/core/utils");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const minimatch_1 = require("minimatch");
function formatFlow(n) {
    if (utils_1.ValidationUtil.isNumber(n)) {
        return parseFloat(n);
    }
    else {
        let suffix = n.substring(n.length - 1);
        let index = ["B", "K", "M", "G"].indexOf(suffix);
        if (index == -1) {
            return 0;
        }
        let f = n.substring(0, n.length - 1);
        if (!utils_1.ValidationUtil.isNumber(parseFloat(f))) {
            return 0;
        }
        return Math.floor(parseFloat(f) * Math.pow(1024, index));
    }
}
function createDirPath(filepath) {
    let list = filepath.split(path.sep);
    let rootPath = list[0];
    for (let i = 1; i < list.length; i++) {
        rootPath = `${rootPath}${path.sep}${list[i]}`;
        if (!fs.existsSync(rootPath)) {
            fs.mkdirSync(rootPath);
        }
        else if (fs.statSync(rootPath).isFile()) {
            fs.unlinkSync(rootPath);
            fs.mkdirSync(rootPath);
        }
    }
    return true;
}
function gcmEncrypt(password, msg) {
    try {
        let pwd = Buffer.from(password);
        let iv = crypto.randomBytes(12);
        let cipher = crypto.createCipheriv("aes-256-gcm", pwd, iv);
        //加密
        let enc = cipher.update(msg, "utf8", "base64");
        enc += cipher.final("base64");
        //cipher.getAuthTag() 方法返回一个 Buffer，它包含已从给定数据计算后的认证标签。
        //cipher.getAuthTag() 方法只能在使用 cipher.final() 之后调用 这里返回的是一个十六进制后的数组
        let tags = cipher.getAuthTag();
        let encStr = Buffer.from(enc, "base64");
        //由于和java对应的AES/GCM/PKCS5Padding模式对应 所以采用这个拼接
        let totalLength = iv.length + encStr.length + tags.length;
        let bufferMsg = Buffer.concat([iv, encStr, tags], totalLength);
        return bufferMsg.toString("base64");
    }
    catch (e) {
        console.log("Encrypt is error", e);
        return null;
    }
}
function gcmDecrypt(password, serect) {
    try {
        let tmpSerect = Buffer.from(serect, "base64");
        let pwd = Buffer.from(password);
        //读取数组
        let iv = tmpSerect.subarray(0, 12);
        let cipher = crypto.createDecipheriv("aes-256-gcm", pwd, iv);
        //这边的数据为 去除头的iv12位和尾部的tags的16位
        let msg = cipher.update(tmpSerect.subarray(12, tmpSerect.length - 16));
        return msg.toString("utf8");
    }
    catch (e) {
        console.log("Decrypt is error", e);
        return null;
    }
}
function fillEnd(filename) {
    if (filename.split("/").pop()?.indexOf(".") != -1) {
        return filename;
    }
    return !filename.endsWith("/*") ? filename + "/*" : filename;
}
function includeFile(filename, dirname) {
    if (filename == dirname) {
        return true;
    }
    return (0, minimatch_1.minimatch)(filename, dirname) || (0, minimatch_1.minimatch)(filename, `${dirname}/**`); //兼容程序内的设置
}
function normalizeCosFilename(filename) {
    let normalized = filename.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
    if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
    }
    return normalized;
}
function matchPermissions(permissions, filename) {
    let macthRes = {
        key: "",
        flag: "private",
        len: 0,
    };
    Object.keys(permissions).forEach((key) => {
        let len = key.split("/").length;
        if (len > macthRes.len) {
            if (includeFile(filename, key)) {
                //采用最顶级的匹配模式
                macthRes = {
                    key,
                    flag: permissions[key],
                    len,
                };
            }
        }
    });
    return macthRes.flag;
}
