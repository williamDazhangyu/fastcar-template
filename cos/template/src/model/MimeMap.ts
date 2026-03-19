import { DataMap } from "@fastcar/core";
import db = require("mime-db");

const FILE_MAP = new DataMap<string, string>();

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

export default function getMimeMap(m: string) {
	let last = m.toLowerCase().split(".");
	let suffix = last.pop();

	if (!suffix) {
		return "";
	}

	return FILE_MAP.get(suffix);
}
