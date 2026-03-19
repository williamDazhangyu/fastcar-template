import { Autowired, Controller, Log } from "@fastcar/core/annotation";
import { RpcServer, RpcMessage, InteractiveMode } from "@fastcar/rpc";
import { RPC, RPCMethod } from "@fastcar/rpc/annotation";
import AuthServiceRole from "@/annotation/AuthServiceRole";
import { ServerKind } from "@/common/Constant";
import Result from "@/common/Result";
import { Logger } from "@fastcar/core";

@Controller
@RPC("/channelRemote")
@AuthServiceRole(ServerKind.remote)
export default class ChannelRemote {
	@Autowired
	private rpcServer!: RpcServer;

	@Log()
	private logger!: Logger;

	@RPCMethod()
	addChannelByUid(data: { channel: string; uid: number }) {
		this.rpcServer.getSocketManager().joinChannelByCustomId(data.uid.toString(), data.channel);
		return Result.ok();
	}

	@RPCMethod()
	delChannelByUid(data: { channel: string; uid: string }) {
		this.rpcServer.getSocketManager().leaveChannelByCustomId(data.uid.toString(), data.channel);
		return Result.ok();
	}

	//根据渠道广播
	@RPCMethod()
	broadcastByChannel(data: { channel: string; msg: RpcMessage; excludeIds?: string[] }) {
		this.rpcServer.getSocketManager().sendMsgToCustomIdByChannel(data.channel, Object.assign(data.msg, { firstPriority: true }), data.excludeIds);
		return Result.ok();
	}

	//根据单用户广播消息
	@RPCMethod()
	broadcastByUid(data: { data: RpcMessage; uid: number }) {
		this.rpcServer.getSocketManager().sendMsgByCustomId(data.uid.toString(), Object.assign(data.data, { firstPriority: true }));
		return Result.ok();
	}

	//消息踢掉
	@RPCMethod()
	logoutKick({ sessionId }: { sessionId: string }) {
		this.rpcServer.getSocketManager().sendMsg(sessionId, {
			url: "/logout/kick",
			mode: InteractiveMode.notify,
		});
		//这边不强制删除
		return Result.ok();
	}

	//强制踢掉
	@RPCMethod()
	forceKick({ sessionId }: { sessionId: string }) {
		this.rpcServer.kickSessionId(sessionId, "force kick");
		//这边不强制删除
		return Result.ok();
	}
}
