import { Autowired, Controller, Rule, ValidForm } from "@fastcar/core/annotation";
import { ClientSession, RpcContext, RpcServer } from "@fastcar/rpc";
import { RPC, RPCMethod } from "@fastcar/rpc/annotation";
import Result from "@/common/Result";
import { SessionAttribute } from "@/types/SessionAttribute";
import RouterService from "@/servers/base/service/RouterService";
import { ChannelKind, ServerKind } from "@/common/Constant";
import Code from "@/common/Code";
import DataService from "@/servers/base/service/DataService";

type DisconnectType = {
	session: ClientSession;
	reason: string;
};

@Controller
export default class AccountHandler {
	@Autowired
	private rpcServer!: RpcServer;

	@Autowired
	private routerService!: RouterService;

	@Autowired
	private dataService!: DataService;

	@RPCMethod("/account/login")
	@ValidForm
	async login(
		@Rule({
			uid: { required: true, type: "number" },
		})
		{ uid }: { uid: number },
		ctx: RpcContext
	) {
		//这边做一个校验 如果当前不是front连进来的则拒绝
		let socketMgr = this.rpcServer.getSocketManager();
		let socketServer = socketMgr.getSocketServerBySessionId(ctx.sessionId);

		if (!socketServer?.getConfig().extra?.front) {
			this.rpcServer.kickSessionId(ctx.sessionId, Code.COMMON.SERVER_CONNECT_FORBID.toString());
			return Result.errorCode(Code.COMMON.SERVER_CONNECT_FORBID);
		}

		//这边可以进行校验
		//加入频道 绑定会话
		socketMgr.bindCustomID(uid.toString(), ctx.sessionId);
		socketMgr.joinChannelByCustomId(uid.toString(), ChannelKind.FRONT);
		ctx.settings.set(SessionAttribute.logged, true);
		ctx.settings.set(SessionAttribute.uid, uid);
		ctx.settings.set(SessionAttribute.serverKind, ServerKind.front);
		ctx.settings.set(SessionAttribute.serviceId, this.dataService.getCurrServiceId());
		ctx.settings.set(SessionAttribute.loginTime, Date.now());

		this.routerService.request({
			url: "/room/join",
			serverType: "chat",
			session: ctx,
		});

		//便于客户端同步
		return Result.ok();
	}

	@RPCMethod()
	async disconnect({ session, reason }: DisconnectType, ctx: RpcContext) {
		let uid: number = ctx.settings.get(SessionAttribute.uid);
		if (!!uid) {
			this.rpcServer.getSocketManager().removeCustomID(uid.toString());

			this.routerService.request({
				url: "/room/leave",
				serverType: "chat",
				session,
			});
		}

		return Result.ok();
	}
}
