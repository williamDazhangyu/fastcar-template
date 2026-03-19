import ConnectorUtils from "@/utils/ConnectorUtils";
import { ServerCommonUrl, ServerKind } from "@/common/Constant";
import DataService from "@/servers/base/service/DataService";
import { ServerMeta, ServerStatus } from "@/types/ServerMeta";
import { BootPriority, DataMap, FastCarApplication, Logger } from "@fastcar/core";
import { ApplicationStart, ApplicationStop, Autowired, Log } from "@fastcar/core/annotation";
import { ClientRequestStatic, RpcAsyncService, RpcClient } from "@fastcar/rpc";
import Code from "@/common/Code";
import { EnableScheduling, ScheduledInterval, TimeUnit, TimeUnitNum } from "@fastcar/timer";
import TaskAsync from "@/common/TaskAsync";

//中心注册客户端服务
@ApplicationStart(BootPriority.Lowest, "start")
@ApplicationStop(BootPriority.Base, "stop")
@EnableScheduling
export default class CenterClient implements RpcAsyncService {
	private client: RpcClient | null;
	private serverMap: DataMap<string, ServerStatus>;
	private remoteClient: DataMap<string, RpcClient>;
	private pendingRemoteClient: string[];

	@Autowired
	private dataService!: DataService;

	@Log()
	private logger!: Logger;

	@Autowired
	private app!: FastCarApplication;

	private checkFlag: boolean; //防止多次连接

	private pendingClients: Map<
		string,
		Array<{
			cb: TaskAsync;
			timer: NodeJS.Timeout;
		}>
	> = new Map();

	constructor() {
		this.serverMap = new DataMap();
		this.client = null; //中心管理服务器客户端
		this.checkFlag = false;
		this.remoteClient = new DataMap();
		this.pendingRemoteClient = [];
	}

	//上报至注册服务中心 随机选择一台
	start() {}

	//上报注册服务中心  告诉其将要停止
	stop() {
		this.checkCenter(0, true);
		this.client?.close();
	}

	private getRandomServiceId(serviceId: string, mod: number) {
		let strList = serviceId.split("-");
		let index = parseInt(strList[strList.length - 1]);
		if (!isNaN(index)) {
			return index % mod;
		}

		return Math.floor(Math.random() * mod);
	}

	//根据hash权重进行负载均衡
	getBestCenter(): Array<ServerMeta> {
		let centerList = this.dataService.getServerGroup(ServerKind.center);
		let randomList = [...centerList.servers];

		//仅过滤已有正常的
		if (this.serverMap.size > 0) {
			randomList = randomList.filter((item) => {
				let s = this.serverMap.get(item.serviceId);
				if (s && s.status) {
					return true;
				}
				return false;
			});
			if (randomList.length == 0) {
				randomList = [...centerList.servers];
			}
		}

		let sindex = this.getRandomServiceId(this.dataService.getCurrServiceId(), randomList.length);
		return [...randomList.slice(sindex), ...randomList.slice(0, sindex)];
	}

	async connectCenter() {
		if (this.checkFlag) {
			return;
		}

		if (this.client) {
			this.client.close();
		}

		this.checkFlag = true;
		let list = this.getBestCenter();
		let currServiceID = this.dataService.getCurrServiceId();

		for (let item of list) {
			let clist = item.list;
			if (clist.length == 0) {
				continue;
			}

			if (item.serviceId == currServiceID && clist.length > 1) {
				continue;
			}

			for (let citem of clist) {
				if (citem.type) {
					let client = new RpcClient(
						{
							url: ConnectorUtils.getConnectUrl(citem, item.host), //连接地址
							type: citem.type, //具体为哪一种型号的连接器
							extra: citem.clientExtra, //第三方拓展参数
							encode: citem.encode, //解码器
							decode: citem.decode,
							secure: citem.secure,
							ssl: citem.server.ssl,
							connectionLimit: 1,
							disconnectInterval: citem.disconnectInterval,
						},
						{
							handleMsg: async (url: string, data: Object) => {
								this.handleMsg(url, data);
							},
							loginAfter: async (clientIndex) => {
								let selfConfig = this.dataService.getServerGroup();
								if (!client.isConnect()) {
									return false;
								}

								let res = await ClientRequestStatic<{ serviceId: string; token: string }, { code: number; data: { serverList: ServerStatus[] } }>({
									url: "/login",
									data: {
										serviceId: currServiceID,
										token: selfConfig.token,
									},
									client,
									opts: {
										timeout: 1000,
										retryCount: 1,
										clientIndex,
									},
								});
								if (!res || res.code != Code.SYS.OK) {
									this.logger.error(`login center error`);
									client.close();
									return false;
								} else {
									//同步list
									res.data.serverList.forEach((s) => {
										this.updateServerStatus(s);
									});
									this.logger.debug(`connected central sererver`);
									return true;
								}
							},
						},
						citem.retry
					);
					await client.start();
					if (client.isConnect()) {
						this.client = client;
						break;
					} else {
						client.close();
					}
				}
			}

			if (this.client?.isConnect()) {
				break;
			}
		}

		this.checkFlag = false;
	}

	//监听服务端的消息
	async handleMsg(url: string, data: Object): Promise<void | Object> {
		switch (url) {
			//监听来自服务端的消息了
			case ServerCommonUrl.ServiceStatusNotify: {
				this.updateServerStatus(data as ServerStatus);
				break;
			}
			case ServerCommonUrl.ServiceStatusAllNotify: {
				let list = data as ServerStatus[];
				this.serverMap.clear();
				list.forEach((item) => {
					this.updateServerStatus(item);
				});
				break;
			}
			case ServerCommonUrl.ServiceBalance: {
				//进行重新处理
				if (!this.checkFlag) {
					this.connectCenter();
				}
				break;
			}
			case ServerCommonUrl.Connect: {
				break;
			}
			case ServerCommonUrl.ServiceSyncConfig: {
				let m: {
					key: string;
					data: any[];
				} = data as any;

				let configService = this.app.getComponentByName(m.key);
				if (configService && Reflect.has(configService, "load")) {
					Reflect.apply(Reflect.get(configService, "load"), configService, m.data);
				}
				break;
			}
			default: {
				this.logger.warn(`unknown url ${url}`);
				break;
			}
		}
	}

	//更新其余服务状态
	updateServerStatus(s: ServerStatus) {
		let beforeStatus = this.serverMap.get(s.serviceId);
		if (!beforeStatus) {
			this.setServerMap(s);
		} else {
			if (s.createTime > beforeStatus.createTime) {
				this.setServerMap(s);
			}
		}
	}

	setServerMap(s: ServerStatus) {
		this.serverMap.set(s.serviceId, s);

		//重新连接远程
		let remoteClient = this.remoteClient.get(s.serviceId);
		if (remoteClient) {
			remoteClient.close();
			this.remoteClient.delete(s.serviceId);
		}
	}

	//这边有一个超时检测 每1秒检测一次是否连上了中心服务
	@ScheduledInterval({ fixedRate: 1, fixedRateString: TimeUnit.second, initialDelay: Math.floor(500 + Math.random() * 1500) })
	async checkCenter(diff: number, stop?: boolean) {
		if (!this.client?.isConnect()) {
			await this.connectCenter();
		}

		//检测已连接的远程服务
		this.remoteClient.forEach((client, id) => {
			if (this.pendingRemoteClient.includes(id)) {
				return;
			}
			let status = this.serverMap.get(id);
			if (!status || !status.status) {
				return;
			}

			if (client.isConnect()) {
				return;
			}

			this.createRemoteClient(id);
		});
	}

	@ScheduledInterval({ fixedRate: 1, fixedRateString: TimeUnit.minute, initialDelay: Math.floor(TimeUnitNum.second * (10 + Math.random() * 20)) })
	reportHealth() {
		if (this.client && this.client.isConnect()) {
			ClientRequestStatic<
				void,
				{
					code: number;
				}
			>({
				url: "/remote/health",
				client: this.client,
				opts: {
					timeout: 1000,
					retryCount: 1,
				},
			}).then((res) => {
				if (res.code != 200) {
					this.logger.debug(`检查健康状况----------------${res.code}`);
					this.client?.close();
				}
			});
		}
	}

	isOnline() {
		return this.client && this.client.isConnect();
	}

	getServerMap() {
		return this.serverMap;
	}

	async createRemoteClient(id: string): Promise<RpcClient | null> {
		let item = this.dataService.getServerMeta(id);

		if (!item) {
			return null;
		}

		let clist = item.list;
		if (clist.length == 0) {
			return null;
		}

		if (this.pendingRemoteClient.includes(id)) {
			//这边保留一个等待时长
			return new Promise((resolve) => {
				let items = this.pendingClients.get(id);
				if (!items) {
					items = [];
					this.pendingClients.set(id, items);
				}

				let cb = new TaskAsync(resolve);
				let timer = setTimeout(() => {
					cb.done(null);
				}, 3000);

				items?.push({
					timer,
					cb,
				});
			});
		}

		this.pendingRemoteClient.push(id);

		for (let citem of clist) {
			//进行连接
			let url = ConnectorUtils.getConnectUrl(citem, item.host);
			if (!url || (citem.front && clist.length > 1)) {
				continue;
			}
			let client = new RpcClient(
				{
					url, //连接地址
					type: citem.type, //具体为哪一种型号的连接器
					extra: citem.clientExtra, //第三方拓展参数
					encode: citem.encode, //解码器
					decode: citem.decode,
					secure: citem.secure,
					ssl: citem.server.ssl,
					disconnectInterval: citem.disconnectInterval,
					connectionLimit: citem.connectionLimit || 1,
				},
				{
					handleMsg: async (url: string, data: Object) => {
						this.handleMsg(url, data);
					},
					loginAfter: async (clientIndex) => {
						if (!client.isConnect()) {
							return false;
						}

						let serverMeta = this.dataService.getServerMeta();
						if (!serverMeta) {
							return false;
						}
						let res = await ClientRequestStatic<{ serviceId: string; token: string }, { code: number; data: { serverList: ServerStatus[] } }>({
							url: "/remote/login",
							data: {
								serviceId: this.dataService.getCurrServiceId(),
								token: serverMeta?.token,
							},
							client,
							opts: {
								timeout: 1000,
								retryCount: 1,
								clientIndex,
							},
						});
						if (res.code != Code.SYS.OK) {
							this.logger.error(`login remote ${id} error`);
						} else {
							this.logger.debug(`登录完成 连接服务ID:${id}`);
							return true;
						}
						return false;
					},
				},
				citem.retry
			);
			await client.start();
			if (client.isConnect()) {
				let oldClient = this.remoteClient.get(id);
				if (oldClient) {
					oldClient.close();
				}
				this.remoteClient.set(id, client);
				break;
			} else {
				this.logger.debug("连接失败");
				client.close();
			}
		}

		let index = this.pendingRemoteClient.indexOf(id);
		this.pendingRemoteClient.splice(index, 1);

		//处理连接的远程客户端
		let remoteClient = this.remoteClient.get(id) || null;
		let pendings = this.pendingClients.get(id);
		if (pendings && pendings?.length > 0) {
			pendings.forEach((c) => {
				c.cb.done(remoteClient);
				clearTimeout(c.timer);
			});

			this.pendingClients.delete(id);
		}

		return remoteClient;
	}

	async getRemoteClientByserviceId(serviceId: string): Promise<RpcClient | null> {
		let status = this.serverMap.get(serviceId);
		if (!status || !status.status) {
			return null;
		}

		let client = this.remoteClient.get(serviceId);
		if (!client || !client.isConnect()) {
			//创建一个等待
			return await this.createRemoteClient(serviceId);
		}

		return client;
	}

	async sendBalance() {
		if (this.client) {
			return await ClientRequestStatic<any, any>({
				client: this.client,
				url: ServerCommonUrl.ServiceBalance,
			});
		}

		return null;
	}
}
