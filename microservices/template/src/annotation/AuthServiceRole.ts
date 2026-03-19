import "reflect-metadata";
import { ServerKind } from "@/common/Constant";
import Result from "@/common/Result";
import Code from "@/common/Code";
import { SessionAttribute } from "@/types/SessionAttribute";
import { ClassUtils } from "@fastcar/core/utils";
import { ForwardRpcContext } from "@/types/ForwardRpcContext";
import { MethodType, RpcMetaData } from "@fastcar/rpc";

const BASETYPE = ["constructor", "prototype", "name"];

//定义方法
function defineFunction(desc: PropertyDescriptor, role: ServerKind[]): PropertyDescriptor {
	let beforeFN = desc.value;
	desc.value = function (data: any, ctx: ForwardRpcContext) {
		if (ctx.forward) {
			let session = ctx.session;

			if (!session) {
				return Result.errorCode(Code.COMMON.PERMISSIONS_MISSING);
			}

			let sessionRole = session.settings.get(SessionAttribute.serverKind);

			if (!role.includes(sessionRole)) {
				return Result.errorCode(Code.COMMON.PERMISSIONS_MISSING);
			}

			return Promise.resolve(Reflect.apply(beforeFN, this, [data, ctx]));
		}

		//优先从session会话中判断
		let roleLevel = ctx.settings.get(SessionAttribute.serverKind);
		if (!role.includes(roleLevel)) {
			return Result.errorCode(Code.COMMON.PERMISSIONS_MISSING);
		}

		return Promise.resolve(Reflect.apply(beforeFN, this, [data, ctx]));
	};

	return desc;
}

//校验角色
export default function AuthServiceRole(...role: ServerKind[]) {
	return function (target: any, methodName?: string, descriptor?: PropertyDescriptor) {
		if (methodName && descriptor) {
			defineFunction(descriptor, role);
		} else {
			let keys = ClassUtils.getProtoType(target);
			let routerMap: Map<string, MethodType> = Reflect.getMetadata(RpcMetaData.RPCMethod, target.prototype);

			if (!routerMap || routerMap.size == 0) {
				return;
			}

			let methods: string[] = [];
			routerMap.forEach((v) => {
				methods.push(v.method);
			});

			keys.forEach((item) => {
				if (BASETYPE.includes(item.toString())) {
					return;
				}
				if (!methods.includes(item.toString())) {
					return;
				}
				let desc: PropertyDescriptor | undefined = Reflect.getOwnPropertyDescriptor(target.prototype, item);
				if (desc) {
					Reflect.defineProperty(target.prototype, item, defineFunction(desc, role));
				}
			});
		}
	};
}
