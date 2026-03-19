import { ValidationUtil } from "@fastcar/core/utils";
import * as fs from "fs";
import path = require("path");
import * as crypto from "crypto";
import { minimatch } from "minimatch";

export function formatFlow(n: string) {
	if (ValidationUtil.isNumber(n)) {
		return parseFloat(n);
	} else {
		let suffix = n.substring(n.length - 1);
		let index = ["B", "K", "M", "G"].indexOf(suffix);
		if (index == -1) {
			return 0;
		}
		let f = n.substring(0, n.length - 1);
		if (!ValidationUtil.isNumber(parseFloat(f))) {
			return 0;
		}

		return Math.floor(parseFloat(f) * Math.pow(1024, index));
	}
}

export function createDirPath(filepath: string): boolean {
	let list = filepath.split(path.sep);

	let rootPath = list[0];

	for (let i = 1; i < list.length; i++) {
		rootPath = `${rootPath}${path.sep}${list[i]}`;
		if (!fs.existsSync(rootPath)) {
			fs.mkdirSync(rootPath);
		} else if (fs.statSync(rootPath).isFile()) {
			fs.unlinkSync(rootPath);
			fs.mkdirSync(rootPath);
		}
	}

	return true;
}

export function gcmEncrypt(password: string, msg: string): string | null {
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
	} catch (e) {
		console.log("Encrypt is error", e);
		return null;
	}
}

export function gcmDecrypt(password: string, serect: string): string | null {
	try {
		let tmpSerect = Buffer.from(serect, "base64");
		let pwd = Buffer.from(password);

		//读取数组
		let iv = tmpSerect.subarray(0, 12);
		let cipher = crypto.createDecipheriv("aes-256-gcm", pwd, iv);

		//这边的数据为 去除头的iv12位和尾部的tags的16位
		let msg = cipher.update(tmpSerect.subarray(12, tmpSerect.length - 16));

		return msg.toString("utf8");
	} catch (e) {
		console.log("Decrypt is error", e);
		return null;
	}
}

export function fillEnd(filename: string) {
	if (filename.split("/").pop()?.indexOf(".") != -1) {
		return filename;
	}

	return !filename.endsWith("/*") ? filename + "/*" : filename;
}

export function includeFile(filename: string, dirname: string): boolean {
	if (filename == dirname) {
		return true;
	}

	return minimatch(filename, dirname) || minimatch(filename, `${dirname}/**`); //兼容程序内的设置
}

export function matchPermissions(permissions: { [key: string]: "public" | "private" }, filename: string) {
	let macthRes: { key: string; flag: "public" | "private"; len: number } = {
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
					flag: permissions[key] as "public" | "private",
					len,
				};
			}
		}
	});

	return macthRes.flag;
}
