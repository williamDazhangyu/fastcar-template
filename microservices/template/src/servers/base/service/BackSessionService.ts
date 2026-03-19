import { DataMap, Logger } from "@fastcar/core";
import { Autowired, Log, Service } from "@fastcar/core/annotation";
import { InteractiveMode } from "@fastcar/rpc";
import CenterClient from "./CenterClient";
import RouterService from "./RouterService";
import { SessionAttribute } from "@/types/SessionAttribute";
import SessionUtil from "@/utils/SessionUtil";
import { ClientSimpleSession } from "@/types/ClientSimpleSession";

@Service
export default class BackSessionService {
	private sidMap: DataMap<number, ClientSimpleSession>;

	@Log()
	private logger!: Logger;

	@Autowired
	private client!: CenterClient;

	@Autowired
	private routerService!: RouterService;

	constructor() {
		this.sidMap = new DataMap();
	}

	hasUser(uid: number) {
		return this.sidMap.has(uid);
	}

	getUids(): Array<number> {
		return [...this.sidMap.keys()];
	}

	getSessionByUid(uid: number) {
		return this.sidMap.get(uid);
	}

	join(session: ClientSimpleSession) {
		let uid = session.settings.get(SessionAttribute.uid);
		this.sidMap.set(uid, session);
	}

	remove(uid: number) {
		this.sidMap.delete(uid);
	}

	removeByTid(uid: number, tid: string) {
		let session = this.getSessionByUid(uid);
		if (session && session.settings.get(SessionAttribute.tid) == tid) {
			this.remove(uid);
		}
	}

	//异步通知根据渠道
	notifyByChannel({ channel, data, url }: { channel: string; data?: any; url: string }) {
		let m = this.client.getServerMap();
		let list = m.findByAtts({ serverType: "connector", status: true });

		list.forEach((item) => {
			this.routerService.request({
				serverType: "connector",
				session: SessionUtil.createSessionByServiceId({ serviceId: item.serviceId }),
				data: {
					channel,
					msg: {
						url,
						data,
						mode: InteractiveMode.notify,
					},
				},
				url: "/channelRemote/broadcastByChannel",
			});
		});
	}

	notifyByUid({ uid, data, url }: { uid: number; data?: any; url: string }) {
		let session = this.sidMap.get(uid);
		if (!session) {
			// this.logger.error(`not found session ${uid}`)
			return;
		}
		this.routerService.request({
			serverType: "connector",
			session,
			data: {
				data: {
					url,
					data,
					mode: InteractiveMode.notify,
				},
				uid,
			},
			url: "/channelRemote/broadcastByUid",
		});
	}
}
