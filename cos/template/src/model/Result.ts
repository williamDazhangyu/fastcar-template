import { TypeUtil, ValidationUtil } from "@fastcar/core/utils";
import { CODE } from "./Code";

/***
 * @version 1.0 封装返回类
 */
export default class Result {
	static ok(data?: Object) {
		return {
			code: CODE.OK,
			msg: "success",
			data: ValidationUtil.isNotNull(data) ? data : {},
		};
	}

	static errorMsg(msg: string) {
		return {
			code: CODE.FAIL,
			msg: msg,
			data: {},
		};
	}

	static errorCode(code: number, msg?: string) {
		return {
			code: code ? code : CODE.FAIL,
			msg: msg || "",
			data: {},
		};
	}

	static isOK(code: number) {
		return code == CODE.OK;
	}

	static isResult(v: any) {
		if (!TypeUtil.isObject(v)) {
			return false;
		}
		return Reflect.has(v, "code") && Reflect.has(v, "msg");
	}
}
