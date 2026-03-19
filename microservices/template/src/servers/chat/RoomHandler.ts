import { Autowired, Controller, Rule, ValidForm } from "@fastcar/core/annotation";
import { InteractiveMode } from "@fastcar/rpc";
import { RPC, RPCMethod } from "@fastcar/rpc/annotation";
import RoomService from "./RoomService";
import Result from "@/common/Result";
import { SessionAttribute } from "@/types/SessionAttribute";
import { ForwardRpcContext } from "@/types/ForwardRpcContext";
import AuthServiceRole from "@/annotation/AuthServiceRole";
import { ServerKind } from "@/common/Constant";
import RouterService from "@/servers/base/service/RouterService";

@Controller
@RPC("/room")
export default class RoomHandler {
	@Autowired
	private roomService!: RoomService;

	@Autowired
	private routerService!: RouterService;

	//加入世界
	@RPCMethod()
	@AuthServiceRole(ServerKind.remote)
	join({}, { session }: ForwardRpcContext) {
		this.roomService.add(session.settings.get(SessionAttribute.uid), session);
		return Result.ok();
	}

	//离开世界
	@RPCMethod()
	@AuthServiceRole(ServerKind.remote)
	leave({}, { session }: ForwardRpcContext) {
		this.roomService.del(session.settings.get(SessionAttribute.uid));
		return Result.ok();
	}

	//向别人发送消息
	@RPCMethod()
	@ValidForm
	@AuthServiceRole(ServerKind.front)
	sendMsg(
		@Rule({
			msg: { maxSize: 1000, required: true },
			toUid: { required: true, type: "number" },
		})
		{ msg, toUid }: { toUid: number; msg: string }
	) {
		let otherSession = this.roomService.getSid(toUid);
		if (!otherSession) {
			return Result.ok();
		}

		this.routerService.request({
			url: "/channelRemote/broadcastBySessionId",
			serverType: "connector",
			data: {
				data: { data: msg, url: "/room/notify", mode: InteractiveMode.notify },
				sessionId: otherSession.sessionId,
			},
			session: otherSession,
		});

		return Result.ok();
	}
}
