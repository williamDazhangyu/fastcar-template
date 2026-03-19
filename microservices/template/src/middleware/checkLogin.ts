import Result from "@/common/Result";
import { ClientSession, RpcContext } from "@fastcar/rpc";
import Code from "@/common/Code";
import { SessionAttribute } from "../types/SessionAttribute";

//未登录请求的白名单
const whiteUrls = ["/remote/login", "/connect", "/disconnect", "/account/login"];

//校验登录
export default async function checkLogin(context: RpcContext & { forward?: boolean; session?: ClientSession }, next?: Function): Promise<void> {
	let url = context.url;
	if (url) {
		if (!whiteUrls.includes(url)) {
			//校验解析中的session
			if (!context.session || !context.session.settings.get(SessionAttribute.logged)) {
				context.body = Result.errorCode(Code.ACCOUNT.NOT_LOGIN);
				return;
			}
		}
	}

	if (next) {
		await next();
	}
}
