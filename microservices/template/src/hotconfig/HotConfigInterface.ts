import { HotConfigKeys } from "@/common/Constant";
import { DataMap } from "@fastcar/core";

export interface HotConfigInterface {
	load(...args: any[]): void;
}

//设置热更新的模块和key值
export function setHotKey(filename: string, keys: Array<string>) {
	if (keys && keys.length > 0) {
		let m: DataMap<string, string[]> = Reflect.get(global, HotConfigKeys);
		if (!m) {
			m = new DataMap<string, string[]>();
			Reflect.set(global, HotConfigKeys, m);
		}

		if (keys.length == 0) {
			m.set(filename, keys);
		} else {
			//全局存在的则忽略
			let currKeys = m.get(filename);
			if (!!currKeys && currKeys.length == 0) {
				return;
			}

			if (!currKeys) {
				currKeys = [];
				m.set(filename, currKeys);
			}
			keys.forEach((key) => {
				if (!currKeys.includes(key)) {
					currKeys.push(key);
				}
			});
		}
	}
}

export function getHotKey(filename: string): string[] | undefined {
	let m: DataMap<string, string[]> = Reflect.get(global, HotConfigKeys);

	return m && m.get(filename);
}
