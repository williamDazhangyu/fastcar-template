import { Autowired, Controller, Rule, ValidForm } from "@fastcar/core/annotation";
import { RpcContext, RpcServer } from "@fastcar/rpc";
import { RPC, RPCMethod } from "@fastcar/rpc/annotation";
import DataService from "@/servers/base/service/DataService";
import Result from "@/common/Result";
import Code from "@/common/Code";
import { SessionAttribute } from "@/types/SessionAttribute";
import ServerManager from "@/servers/center/service/ServerManager";

//内部服务公用的接口
@Controller
@RPC("/remote")
export default class EntryController {
	@Autowired
	private rpcServer!: RpcServer;

	@Autowired
	private dataService!: DataService;

	@Autowired
	private serverManager!: ServerManager;

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

		//加入频道 绑定会话
		this.rpcServer.getSocketManager().joinChannel(ctx.sessionId, this.dataService.getChannelKindByServerType(serverMeta.serverType));
		ctx.settings.set(SessionAttribute.logged, true);
		ctx.settings.set(SessionAttribute.serviceId, serviceId);
		ctx.settings.set(SessionAttribute.serverKind, serverKind);
		ctx.settings.set(SessionAttribute.serverType, serverMeta.serverType);

		//便于客户端同步
		return Result.ok();
	}

	@RPCMethod()
	@ValidForm
	async health({}, ctx: RpcContext) {
		let logged = ctx.settings.get(SessionAttribute.logged);
		if (logged) {
			let serviceId = ctx.settings.get(SessionAttribute.serviceId);
			if (!this.serverManager.updateServiceUpdateTime(serviceId)) {
				// this.rpcServer.kickSessionId(ctx.sessionId, "status is error");
				return Result.errorCode(Code.SYS.NOACCESS);
			}
		}

		return Result.ok();
	}
}
