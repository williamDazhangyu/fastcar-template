import { RpcContext } from "@fastcar/rpc";
import Code from "@/common/Code";
import { ValidError } from "@fastcar/core";
import Result from "@/common/Result";

//针对表单校验抛出的错误进行处理
export default async function checkForm(context: RpcContext, next?: Function): Promise<void> {
	if (next) {
		try {
			await next();
		} catch (e: any) {
			if (e instanceof ValidError) {
				context.body = Result.errorCode(Code.COMMON.PARAMETER_ERROR, e?.message);
				return;
			}

			throw e;
		}
	}
}
