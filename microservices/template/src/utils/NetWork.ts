import { Context } from "koa";
import * as os from "os";

const localIps: string[] = ["127.0.0.1", "localhost", "0.0.0.0"];
(function () {
	let ifaces = os.networkInterfaces();
	for (let key in ifaces) {
		let details = ifaces[key];
		details?.forEach((item) => {
			if (item.family === "IPv4" && !localIps.includes(item.address)) {
				localIps.push(item.address);
			}
		});
	}
})();

export default class NetWork {
	//判断是否为本地ip
	static isLocalIP(host: string): boolean {
		return localIps.includes(host);
	}
}

export function getIP(ctx: Context): string {
	let req = ctx.request;
	let ips = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || ctx.ip;
	if (Array.isArray(ips)) {
		return ips[0] || "";
	}
	return ips;
}
