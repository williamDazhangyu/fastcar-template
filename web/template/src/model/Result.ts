import { TypeUtil, ValidationUtil } from "@fastcar/core/utils";
import CODE from "./Code";

/***
 * @version 1.0 封装返回类
 */
export default class Result {
	static ok(data?: any) {
		return {
			code: CODE.SYS.OK,
			msg: "success",
			data: ValidationUtil.isNotNull(data) ? data : {},
		};
	}

	static errorMsg(msg: string) {
		return {
			code: CODE.SYS.FAIL,
			msg: msg,
			data: {},
		};
	}

	static errorCode(code: number, msg?: string, data?: any) {
		let res: { code: number; data: any; msg?: any } = {
			code: code ? code : CODE.SYS.FAIL,
			data: data || {},
		};

		if (msg) {
			res.msg = msg;
		}

		return res;
	}

	static isOK(code: number) {
		return code == CODE.SYS.OK;
	}

	static isResult(v: any) {
		if (!TypeUtil.isObject(v)) {
			return false;
		}
		return Reflect.has(v, "code");
	}
}
