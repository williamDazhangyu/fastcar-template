import { ServerKind, ServerMicroservices } from "@/common/Constant";
import { ServerGroupType } from "@/types/ServerMeta";
import { SessionAttribute } from "@/types/SessionAttribute";
import MicroservicesUtils from "@/utils/MicroservicesUtils";
import { CommonConstant, FastCarApplication } from "@fastcar/core";
import { ApplicationSetting, Autowired, ComponentScan, ResourcePath } from "@fastcar/core/annotation";
import ApplicationHook from "@fastcar/core/src/interface/ApplicationHook";
import { EnableKoa } from "@fastcar/koa/annotation";
import { RetryConfig, RpcConfig, RpcMetaData, SocketServerConfig } from "@fastcar/rpc";
import * as path from "path";
import { EnableRPC } from "@fastcar/rpc/annotation";
import ServerManager from "../center/service/ServerManager";

@ResourcePath(path.join(__dirname, "../../../resource"))
@ApplicationSetting({
	log: {
		rootPath: path.join(__dirname, "../../../logs"), //将日志移到最外层
	},
})
@ComponentScan(path.join(__dirname))
export default class BaseServer implements ApplicationHook {
	protected serviceId: string;
	protected serviceType: string;

	@Autowired
	protected app!: FastCarApplication;

	constructor() {
		let l = process.argv.length;
		let args = process.argv.slice(l - 2, l);

		if (args.length < 2) {
			throw new Error("not found serviceType and serviceId");
		}

		this.serviceType = args[0];
		this.serviceId = args[1];
	}

	//重载微服务配置 二次解析
	//兼容web应用
	loadSysConfig() {
		this.app.setSetting(SessionAttribute.serviceId, this.serviceId);
		this.app.setSetting(SessionAttribute.serverType, this.serviceType);
		this.app.setSetting(CommonConstant.APPId, this.serviceId);

		const microservices: ServerGroupType = MicroservicesUtils.format(this.app.getSetting(ServerMicroservices));
		this.app.setSetting(ServerMicroservices, microservices);

		let list = microservices[this.serviceType] as any;
		let koaConfig = list?.koa || {};

		//赋值到rpc内 取服务器地址
		let rpc: Partial<RpcConfig> = this.app.getSetting(RpcMetaData.RpcConfig);
		if (!rpc) {
			rpc = {
				list: [],
			};
		}

		for (let item of list.servers) {
			if (item.serviceId == this.serviceId) {
				item.list.forEach((citem: SocketServerConfig, index: number) => {
					if (["http", "https", "http2"].includes(citem.type)) {
						if (!koaConfig.server) {
							koaConfig.server = [];
						}
						koaConfig.server.push(
							Object.assign(citem.server, {
								protocol: citem.type,
							})
						);
					} else {
						//本质还是rpc服务
						rpc.list?.push({
							id: `${this.serviceId}-${index + 1}`, //这个id仅用作socket服务内部标识
							type: citem.type,
							server: citem.server,
							extra: Object.assign({ front: !!citem.front }, citem.extra || {}),
							serviceType: this.serviceType,
							encode: citem.encode,
							decode: citem.decode,
							codeProtocol: citem.codeProtocol,
							secure: citem.secure,
							maxConnections: citem.maxConnections,
							timeout: citem.timeout,
						});
					}
				});
				rpc.retry = item.retry as Required<RetryConfig>;
				break;
			}
		}

		if (!!koaConfig && koaConfig.server && koaConfig?.server.length > 0) {
			this.app.setSetting("koa", koaConfig);
			EnableKoa(BaseServer); //开启web应用
		}

		if (!!rpc && rpc?.list && rpc?.list?.length > 0) {
			this.app.setSetting(RpcMetaData.RpcConfig, rpc);
			EnableRPC(BaseServer); //开启rpc服务
		}

		process.nextTick(() => {
			if (this.serviceType == ServerKind.center) {
				let serverManager = this.app.getComponentByTarget(ServerManager) as any;
				serverManager.loadServerList();
			}
		});
	}

	beforeStartServer(): void | Promise<void> {}

	async beforeStopServer(): Promise<void> {}

	async startServer(): Promise<void> {}

	stopServer(): void {}
}
