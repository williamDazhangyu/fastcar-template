"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = getMimeMap;
const core_1 = require("@fastcar/core");
const db = require("mime-db");
const FILE_MAP = new core_1.DataMap();
Object.keys(db).forEach((item) => {
    let value = db[item];
    value.extensions?.forEach((e) => {
        let v = item;
        if (value.charset) {
            v += `;charest=${value.charset}`;
        }
        FILE_MAP.set(e.toLowerCase(), v);
    });
});
function getMimeMap(m) {
    let last = m.toLowerCase().split(".");
    let suffix = last.pop();
    if (!suffix) {
        return "";
    }
    return FILE_MAP.get(suffix);
}
