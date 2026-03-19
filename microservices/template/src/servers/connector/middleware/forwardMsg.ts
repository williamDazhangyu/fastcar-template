import Code from "@/common/Code";
import RouterService from "@/servers/base/service/RouterService";
import { SessionAttribute } from "@/types/SessionAttribute";
import { CommonConstant, FastCarApplication } from "@fastcar/core";
import { RpcContext } from "@fastcar/rpc";

//转发消息
export default async function forwardMsg(context: RpcContext, next?: Function) {
	let serverType: string = context.data?.serverType;

	if (!serverType) {
		//如果namespace是以://开头的
		let index = context.url.indexOf(":/");
		if (index != -1) {
			serverType = context.url.substring(0, index);
			context.url = context.url.substring(index + 2);
		}
	}

	if (!!serverType) {
		//这边加个二次重定向
		let customServiceId = "";
		let app: FastCarApplication = Reflect.get(global, CommonConstant.FastcarApp);
		let selfServerType = app.getSetting(SessionAttribute.serverType);
		//本地网关请求
		if (selfServerType != serverType) {
			//计算请求
			let routerService = app.getComponentByTarget<RouterService>(RouterService);
			if (!routerService) {
				return (context.body = {
					code: Code.SYS.NOT_FOUND,
				});
			}

			let res = await routerService.request<{ [key: string]: any }, any>({
				url: context.url,
				data: context.data,
				session: {
					sessionId: context.sessionId,
					settings: context.settings,
					connectedTime: context.connectedTime,
				},
				serverType,
				forward: true,
				customServiceId,
			});
			context.body = res;
		}
	}

	if (next) {
		await next();
	}
}
