import { Autowired, Controller, Log, Rule, ValidForm } from "@fastcar/core/annotation";
import { ClientSession, RpcContext, RpcServer } from "@fastcar/rpc";
import { RPCMethod } from "@fastcar/rpc/annotation";
import DataService from "@/servers/base/service/DataService";
import Result from "@/common/Result";
import Code from "@/common/Code";
import ServerManager from "../service/ServerManager";
import { SessionAttribute } from "@/types/SessionAttribute";
import { ValidationUtil } from "@fastcar/core/utils";
import { ServerKind } from "@/common/Constant";
import { Logger } from "@fastcar/core";

type DisconnectType = {
	session: ClientSession;
	reason: string;
};

@Controller
export default class EntryController {
	@Autowired
	private rpcServer!: RpcServer;

	@Autowired
	private dataService!: DataService;

	@Autowired
	private serverManager!: ServerManager;

	@Log()
	private logger!: Logger;

	@RPCMethod()
	@ValidForm
	async login(
		@Rule({
			serviceId: { required: true },
			token: { required: true },
		})
		{ serviceId, token }: { serviceId: string; token: string },
		ctx: RpcContext
	) {
		//进行校验是否相同
		let serverMeta = this.dataService.getServerMeta(serviceId);
		if (!serverMeta) {
			return Result.errorCode(Code.CENTER.SERVER_NOT_FOUND);
		}

		if (serverMeta.token != token) {
			return Result.errorCode(Code.CENTER.SERVER_TOKEN_ERROR);
		}

		let serverKind = this.dataService.getServerKindByServerType(serverMeta.serverType);
		this.serverManager.registrationService(serviceId, serverMeta.serverType);

		//加入频道 绑定会话
		this.rpcServer.getSocketManager().joinChannel(ctx.sessionId, this.dataService.getChannelKindByServerType(serverMeta.serverType));
		if (serviceId != this.dataService.getCurrServiceId()) {
			this.rpcServer.getSocketManager().bindCustomID(serviceId, ctx.sessionId);
			this.rpcServer.getSocketManager().joinChannelByCustomId(serviceId, ServerKind.remote);
		}

		ctx.settings.set(SessionAttribute.logged, true);
		ctx.settings.set(SessionAttribute.serviceId, serviceId);
		ctx.settings.set(SessionAttribute.center_serviceId, serviceId);
		ctx.settings.set(SessionAttribute.serverKind, serverKind);
		ctx.settings.set(SessionAttribute.serverType, serverMeta.serverType);

		return Result.ok({ serverList: this.serverManager.getServerList() });
	}

	@RPCMethod()
	disconnect({ session, reason }: DisconnectType, ctx: RpcContext) {
		let serviceId = ctx.settings.get(SessionAttribute.center_serviceId);
		if (!serviceId) {
			return Result.ok();
		}

		let serverType = ctx.settings.get(SessionAttribute.serverType);
		if (ValidationUtil.isNull(serviceId)) {
			return Result.errorCode(Code.CENTER.SERVER_NOT_LOGIN);
		}

		this.rpcServer.getSocketManager().leaveChannel(session.sessionId, this.dataService.getChannelKindByServerType(serverType));
		this.logger.info(`disconnect---------${serviceId}`);
		this.serverManager.removeService(serviceId);

		return Result.ok();
	}
}
