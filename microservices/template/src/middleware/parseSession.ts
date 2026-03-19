//解析session会话
import { CommonConstant, FastCarApplication } from "@fastcar/core";
import Code from "@/common/Code";
import { RpcContext } from "@fastcar/rpc";
import RouterService from "@/servers/base/service/RouterService";
import Result from "@/common/Result";
import { ClientSimpleSession } from "@/types/ClientSimpleSession";

export default async function parseSession(context: RpcContext & { forward?: boolean; session?: ClientSimpleSession }, next?: Function) {
	let forward: boolean = !!context.data?.forward;

	context.forward = forward;
	//进行转义
	let session = context.data?.session;

	if (session) {
		let app: FastCarApplication = Reflect.get(global, CommonConstant.FastcarApp);
		let routerService = app.getComponentByTarget<RouterService>(RouterService);

		if (!routerService) {
			return Result.errorCode(Code.SYS.UNAVAILABLE);
		}

		//重新拆分赋值
		if (context.data?.data) {
			context.data = context.data?.data;
		}
		context.session = routerService.reqSessionToSession(session);
	} else {
		if (forward) {
			return Result.errorCode(Code.ACCOUNT.NOT_LOGIN);
		}

		context.session = {
			sessionId: context.sessionId,
			connectedTime: context.connectedTime,
			settings: context.settings,
		};
	}

	if (next) {
		await next();
	}
}
