import Result from "@/model/Result";
import { CommonConstant, DataMap, FastCarApplication } from "@fastcar/core";
import * as koa from "koa";
import { CODE } from "@/model/Code";
import { Heartbeat, TimeUnitNum } from "@fastcar/timer";

const clientIPMap: DataMap<string, number> = new DataMap();
let heartbeat = new Heartbeat({
	fixedRate: 100,
});

setTimeout(() => {
	let app: FastCarApplication = Reflect.get(global, CommonConstant.FastcarApp);
	let limit: { frequency: number } = app.getSetting("limit");
	if (!!limit) {
		let timer = limit.frequency * TimeUnitNum.second;
		heartbeat.start((diff: number) => {
			timer -= diff;
			if (timer <= 0) {
				clientIPMap.clear();
				timer = limit.frequency * TimeUnitNum.second;
			}
		}, this);
	}
}, TimeUnitNum.second * 30);

export default function LimitMiddleware(app: FastCarApplication): koa.Middleware {
	return async (ctx: koa.Context, next: Function) => {
		let limit: { count: number; frequency: number } = app.getSetting("limit");
		if (limit) {
			let ip = ctx.remoteAddress;
			let limitItem = clientIPMap.get(ip) || 0;

			if (limitItem > limit.count) {
				ctx.body = Result.errorCode(CODE.BAD_REQUEST);
				ctx.status = 400;
				return;
			}

			clientIPMap.set(ip, ++limitItem);
		}

		await next();
	};
}
