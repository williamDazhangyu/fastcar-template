import { setHotKey } from "@/hotconfig/HotConfigInterface";
import { ComponentInjection } from "@fastcar/core/annotation";
import path = require("path");

export default function EnableHotConfig(obj: { [rp: string]: string[] }) {
	return function (target: any) {
		Object.keys(obj).forEach((rp) => {
			let fp = require.resolve(path.join(__dirname, "../", "hotconfig", rp));
			setHotKey(fp, Reflect.get(obj, rp));
			ComponentInjection(target, fp);
		});
	};
}
