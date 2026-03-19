import { ReqSession } from "@/types/ReqSession";
import { Autowired, HotterCallBack, Log, Service } from "@fastcar/core/annotation";
import { ClientRequestStatic, ClientSession, RetryConfig } from "@fastcar/rpc";
import Result from "@/common/Result";
import Code from "@/common/Code";
import { ValidationUtil } from "@fastcar/core/utils";
import CenterClient from "@/servers/base/service/CenterClient";
import { ResultType } from "@/types/ResultType";
import { Logger } from "@fastcar/core";
import { nanoid } from "nanoid";
import { SessionAttribute } from "@/types/SessionAttribute";
import { ClientSimpleSession } from "@/types/ClientSimpleSession";
import CODE from "@/common/Code";

/**
 * @version 1.0 路由导航
 */
@HotterCallBack("loadRouteNav")
@Service
export default class RouterService {
	@Autowired
	private client!: CenterClient;

	@Log()
	private logger!: Logger;

	public routeNavigation: Record<string, (serverType: string, session: ClientSession) => string> = this.getRouteNav();

	loadRouteNav() {
		this.logger.debug(`加载导航路由`);
		this.routeNavigation = this.getRouteNav();
	}

	//根据uid一致性找servers
	getServerByUid(serverType: string, session: ClientSession) {
		let uid: number = session.settings.get(SessionAttribute.uid);
		if (!uid) {
			return "";
		}

		let m = this.client.getServerMap();
		let list = m.findByAtts({ serverType }).sort((a, b) => {
			return a.serviceId < b.serviceId ? -1 : 1;
		});

		if (list.length == 0) {
			return "";
		}

		return list[uid % list.length]?.serviceId;
	}

	getRouteNav() {
		return {
			common: (serverType: string) => {
				let m = this.client.getServerMap();
				let list = m.findByAtts({ serverType, status: true });

				if (list.length == 0) {
					return "";
				}
				if (list.length == 1) {
					return list[0].serviceId;
				}

				let index = Math.floor(Math.random() * list.length);

				return list[index].serviceId || "";
			},
			connector: (serverType: string, session: ClientSimpleSession) => {
				return session.settings.get(SessionAttribute.serviceId);
			},
			user: (serverType: string, session: ClientSession) => {
				let uid: number = session.settings.get(SessionAttribute.uid);
				if (!uid) {
					return "";
				}

				let m = this.client.getServerMap();
				let list = m.findByAtts({ serverType }).sort((a, b) => {
					return a.serviceId < b.serviceId ? -1 : 1;
				});

				if (list.length == 0) {
					return "";
				}

				return list[uid % list.length]?.serviceId;
			},
		};
	}

	/**
	 * @version 1.0 采用懒加载模式 当客户端连接没有时自动创建连接
	 */
	async request<T, K>({
		forward = false,
		serverType,
		session,
		data,
		url,
		opts,
		customServiceId,
	}: {
		url: string;
		data?: T;
		opts?: RetryConfig;
		session?: ClientSimpleSession;
		serverType: string;
		forward?: boolean;
		customServiceId?: string;
		//指定一个serviceID
	}): Promise<ResultType<K>> {
		//计算类型
		let fn = Reflect.get(this.routeNavigation, serverType);
		if (!fn) {
			fn = this.routeNavigation.common;
		}

		if (!session) {
			session = {
				sessionId: nanoid(),
				connectedTime: Date.now(),
				settings: new Map(),
			};
		}

		let serviceId = customServiceId || (await Promise.resolve(Reflect.apply(fn, this, [serverType, session])));
		if (!serviceId) {
			return Result.errorCode(Code.SYS.UNAVAILABLE);
		}

		//找client
		let rpcClient = await this.client.getRemoteClientByserviceId(serviceId);
		if (!rpcClient) {
			this.logger.info(`${serviceId} service unavailable cid:${customServiceId} serverType:${serverType} forward:${forward} url:${url}`);
			return Result.errorCode(Code.SYS.UNAVAILABLE);
		}

		let sendData: any = {
			session: this.sessionTOReqSession(session),
			forward,
		};

		if (ValidationUtil.isNotNull(data)) {
			Reflect.set(sendData, "data", data);
		}

		//应该是存在code响应码
		let res: ResultType<K> | null = await ClientRequestStatic({
			client: rpcClient,
			url,
			data: sendData,
			opts,
		});

		if (!res) {
			return Result.errorCode(CODE.SYS.FAIL);
		}

		return res;
	}

	sessionTOReqSession(session: ClientSimpleSession): ReqSession {
		let s: ReqSession = {
			sessionId: session.sessionId,
			connectedTime: session.connectedTime,
			settings: Object.fromEntries(session.settings.entries()),
			cid: session.cid,
		};

		return s;
	}

	reqSessionToSession(session: ReqSession): ClientSimpleSession {
		let s: ClientSimpleSession = {
			sessionId: session.sessionId,
			connectedTime: session.connectedTime,
			settings: new Map(Object.entries(session.settings)),
			cid: session.cid,
		};

		return s;
	}
}
