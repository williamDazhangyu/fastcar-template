import ConnectorUtils from "@/utils/ConnectorUtils";
import Code from "@/common/Code";
import { ChannelKind, ServerCommonUrl, ServerKind } from "@/common/Constant";
import DataService from "@/servers/base/service/DataService";
import { ServerStatus } from "@/types/ServerMeta";
import { SessionAttribute } from "@/types/SessionAttribute";
import { DataMap, Logger, FastCarApplication } from "@fastcar/core";
import { Autowired, Log, Service, Value } from "@fastcar/core/annotation";
import { ClientRequestStatic, InteractiveMode, RpcAsyncService, RpcClient, RpcServer } from "@fastcar/rpc";
import { EnableScheduling, ScheduledInterval, TimeUnit, TimeUnitNum } from "@fastcar/timer";

@Service
@EnableScheduling
export default class ServerManager implements RpcAsyncService {
	private serverMap: DataMap<string, ServerStatus>;

	@Autowired
	private dataService!: DataService;

	@Autowired
	private rpcServer!: RpcServer;

	@Log()
	private logger!: Logger;

	private centerClientMap: DataMap<string, RpcClient>;

	@Autowired
	private app!: FastCarApplication;

	@Value("application.env")
	env!: string;

	constructor() {
		this.serverMap = new DataMap();
		this.centerClientMap = new DataMap();
	}

	loadServerList() {
		let obj = this.dataService.getMicroservices();
		let existServerIds: string[] = [];
		let change = false;

		for (let serverType of Object.keys(obj)) {
			let item = obj[serverType];
			item.servers.forEach((citem) => {
				existServerIds.push(citem.serviceId);
				if (!this.serverMap.has(citem.serviceId)) {
					change = true;
					this.serverMap.set(citem.serviceId, {
						serviceId: citem.serviceId,
						status: false,
						createTime: Date.now(),
						updateTime: Date.now(),
						serverType,
						centerId: "",
					});
				}
			});
		}

		//刷新服务列表
		let ids = [...this.serverMap.keys()];
		for (let id of ids) {
			if (!existServerIds.includes(id)) {
				this.serverMap.delete(id);
				change = true;
			}
		}

		//广播全局
		if (change) {
			this.logger.debug(this.getServerList());
			this.rpcServer.getSocketManager().sendMsgByChannel(ChannelKind.REMOTE, {
				url: ServerCommonUrl.ServiceStatusAllNotify,
				data: this.getServerList(),
				mode: InteractiveMode.notify,
			});
		}
	}

	//注册服务
	registrationService(serviceId: string, serverType: string): ServerStatus {
		this.logger.info(`${serviceId} Service Registration`);

		let centerId = this.dataService.getCurrServiceId();

		let serverStatus: ServerStatus = { serviceId, status: true, createTime: Date.now(), updateTime: Date.now(), serverType, centerId };
		this.updateServerStatus(serverStatus);
		this.broadcastUpdateService(serviceId);
		return serverStatus;
	}

	//更新服务
	updateServiceUpdateTime(serviceId: string) {
		let item = this.serverMap.get(serviceId);
		if (item) {
			item.updateTime = Date.now();
			if (item.status) {
				//重新登录
				return true;
			} else {
				this.logger.debug(`service status is error ${serviceId}`);
			}
		} else {
			this.logger.debug(`service not found ${serviceId}`);
		}

		return false;
	}

	//移除服务
	removeService(serviceId: string): boolean {
		let item = this.serverMap.get(serviceId);

		if (!item) {
			return false;
		}

		this.logger.debug(`${serviceId} Service Remove`);
		item.status = false;
		item.createTime = Date.now();
		this.updateServerStatus(item);

		//如果是中心服务则找出挂载在这个上面的服务
		let kind = this.dataService.getServerKindByServerType(item.serverType);
		if (kind == ServerKind.center) {
			let statusList = this.serverMap.findByAtts({ centerId: serviceId });
			statusList.forEach((citem: ServerStatus) => {
				if (citem.serverType.toLowerCase() == ServerKind.center) {
					return;
				}

				// this.logger.debug(`${citem.serviceId} Service Remove`);
				citem.status = false;
				this.updateServerStatus(citem);
			});

			this.rpcServer.getSocketManager().sendMsgByChannel(ChannelKind.REMOTE, {
				url: ServerCommonUrl.ServiceStatusAllNotify,
				data: this.getServerList(),
				mode: InteractiveMode.notify,
			});
		} else {
			this.broadcastUpdateService(serviceId);
		}

		return true;
	}

	//增量通知客户端
	broadcastUpdateService(serviceId: string) {
		let status = this.serverMap.get(serviceId);

		if (status) {
			this.rpcServer.getSocketManager().sendMsgByChannel(ChannelKind.REMOTE, {
				url: ServerCommonUrl.ServiceStatusNotify,
				data: status,
				mode: InteractiveMode.notify,
			});

			let kind = this.dataService.getServerKindByServerType(status.serverType);
			if (kind == ServerKind.remote) {
				this.rpcServer.getSocketManager().sendMsgByChannel(ChannelKind.CENTER, {
					url: ServerCommonUrl.ServiceStatusNotify,
					data: status,
					mode: InteractiveMode.notify,
				});
			}
		}
	}

	getServerList() {
		return this.serverMap.toValues().sort(); //字典排序
	}

	//这边有个定时任务检测中心服务是否
	//1.找所有的中心服务器 并进行互连
	//2.逐一进行登录 并将服务列表进行比对汇总
	@ScheduledInterval({ fixedRate: 5, fixedRateString: TimeUnit.second, initialDelay: 500 })
	async checkOtherCenter() {
		let centerInfo = this.dataService.getServerGroup(ServerKind.center);
		let serviceId = this.app.getSetting(SessionAttribute.serviceId);
		let flag = false;

		for (let server of centerInfo.servers) {
			if (server.serviceId == serviceId) {
				continue;
			}

			let client = this.centerClientMap.get(server.serviceId);
			if (!client || !client.isConnect()) {
				//先关掉前一个
				if (client) {
					client.close();
					this.centerClientMap.delete(server.serviceId);
				}
				this.logger.debug("开始检测登录");
				for (let citem of server.list) {
					client = new RpcClient(
						{
							url: ConnectorUtils.getConnectUrl(citem, server.host), //连接地址
							type: citem.type, //具体为哪一种型号的连接器
							extra: citem.clientExtra, //第三方拓展参数
							encode: citem.encode, //解码器
							decode: citem.decode,
							secure: citem.secure,
							ssl: citem.server.ssl,
							disconnectInterval: citem.disconnectInterval,
							connectionLimit: citem.connectionLimit || 1,
						},
						this,
						citem.retry
					);
					await client.start();
					if (client.isConnect()) {
						this.centerClientMap.set(server.serviceId, client);
						let loginFlag = await this.loginOtherCenter(server.serviceId);
						if (!flag && loginFlag) {
							flag = true;
						}
						this.logger.debug("校验完毕");
						break;
					} else {
						client.close();
					}
				}
			}

			if (!this.centerClientMap.has(server.serviceId)) {
				this.logger.error(`${server.serviceId} connection lost`);
			}
		}

		if (flag) {
			//全局消息广播
			this.rpcServer.getSocketManager().sendMsgByChannel(ChannelKind.REMOTE, {
				url: ServerCommonUrl.ServiceStatusAllNotify,
				data: this.getServerList(),
				mode: InteractiveMode.notify,
			});
		}
	}

	//定时检测健康状态
	@ScheduledInterval({ fixedRate: 1, fixedRateString: TimeUnit.minute, initialDelay: 500 })
	checkHealth() {
		let list = this.serverMap.toValues();
		let nowTime = Date.now();

		list.forEach((item) => {
			if (item.centerId == this.dataService.getCurrServiceId()) {
				//检测更新时间
				if (nowTime - item.updateTime > TimeUnitNum.minute * 5 && item.status) {
					this.logger.info(`removeService------------${item.serviceId}`);
					this.removeService(item.serviceId);
				}
			}
		});
	}

	async loginOtherCenter(serviceId: string) {
		let client = this.centerClientMap.get(serviceId);

		if (client) {
			let centerInfo = this.dataService.getServerGroup(ServerKind.center);

			let res = await ClientRequestStatic<{ serviceId: string; token: string }, { code: number; data: { serverList: ServerStatus[] } }>({
				url: "/login",
				data: {
					serviceId: this.app.getSetting(SessionAttribute.serviceId),
					token: centerInfo.token,
				},
				client,
				// opts: {
				// 	timeout: 1000,
				// 	retryCount: 1,
				// },
			});
			if (!res || res.code != Code.SYS.OK) {
				this.logger.error(`login center error`);
				client.close();
			} else {
				//同步list
				let updateFlagNotify: boolean = false;
				res.data.serverList.forEach((s) => {
					let f = this.updateServerStatus(s);
					if (!updateFlagNotify && f) {
						updateFlagNotify = true;
					}
				});

				return updateFlagNotify;
			}
		}

		return false;
	}

	updateServerStatus(s: ServerStatus): boolean {
		let flag: boolean = false;
		let serviceId = s.serviceId;
		let beforeStatus = this.serverMap.get(serviceId);

		if (!beforeStatus) {
			this.serverMap.set(serviceId, s);
			flag = true;
		} else {
			if (s.createTime > beforeStatus.createTime) {
				this.serverMap.set(serviceId, s);
				flag = true;
			}
		}

		return flag;
	}

	async handleMsg(url: string, data: Object): Promise<void | Object> {
		switch (url) {
			case ServerCommonUrl.ServiceStatusNotify: {
				let m = data as ServerStatus;
				if (this.updateServerStatus(m)) {
					this.rpcServer.getSocketManager().sendMsgByChannel(ChannelKind.REMOTE, {
						url: ServerCommonUrl.ServiceStatusNotify,
						data: m,
						mode: InteractiveMode.notify,
					});
				}
				break;
			}
			default: {
				break;
			}
		}
	}
}
