import AuthServiceRole from "@/annotation/AuthServiceRole";
import { ChannelKind, ServerCommonUrl, ServerKind } from "@/common/Constant";
import Result from "@/common/Result";
import { Autowired, Controller, Log, Rule, ValidForm } from "@fastcar/core/annotation";
import { RPC, RPCMethod } from "@fastcar/rpc/annotation";
import ServerManager from "../service/ServerManager";
import { InteractiveMode, RpcServer } from "@fastcar/rpc";
import { Logger } from "@fastcar/core";

@Controller
@RPC("/center")
@AuthServiceRole(ServerKind.center, ServerKind.remote)
export default class ServerController {
	@Autowired
	private serverManager!: ServerManager;

	@Autowired
	private rpcServer!: RpcServer;

	@Log()
	private logger!: Logger;

	@RPCMethod()
	getServerList() {
		return Result.ok(this.serverManager.getServerList());
	}

	@RPCMethod()
	rebalance() {
		this.rpcServer.getSocketManager().sendMsgByChannel(ChannelKind.REMOTE, {
			url: ServerCommonUrl.ServiceBalance,
			mode: InteractiveMode.notify,
		});
		return Result.ok();
	}

	@RPCMethod()
	@ValidForm
	syncConfig(
		@Rule({
			key: { required: true },
			data: {
				required: true,
				type: "array",
			},
		})
		info: {
			key: string;
			data: Object;
		}
	) {
		//如果有多个中心服务器 应该去通知其他中心服务对应的参数
		this.logger.info(`同步配置-------------`);
		this.rpcServer.getSocketManager().sendMsgToCustomIdByChannel(ServerKind.remote, {
			url: ServerCommonUrl.ServiceSyncConfig,
			mode: InteractiveMode.notify,
			data: info,
		});

		return Result.ok();
	}
}
