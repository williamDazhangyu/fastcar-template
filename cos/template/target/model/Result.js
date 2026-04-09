"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@fastcar/core/utils");
const Code_1 = require("./Code");
/***
 * @version 1.0 封装返回类
 */
class Result {
    static ok(data) {
        return {
            code: Code_1.CODE.OK,
            msg: "success",
            data: utils_1.ValidationUtil.isNotNull(data) ? data : {},
        };
    }
    static errorMsg(msg) {
        return {
            code: Code_1.CODE.FAIL,
            msg: msg,
            data: {},
        };
    }
    static errorCode(code, msg) {
        return {
            code: code ? code : Code_1.CODE.FAIL,
            msg: msg || "",
            data: {},
        };
    }
    static isOK(code) {
        return code == Code_1.CODE.OK;
    }
    static isResult(v) {
        if (!utils_1.TypeUtil.isObject(v)) {
            return false;
        }
        return Reflect.has(v, "code") && Reflect.has(v, "msg");
    }
}
exports.default = Result;
