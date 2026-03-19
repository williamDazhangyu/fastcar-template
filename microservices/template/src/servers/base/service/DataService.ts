import { Autowired, Service } from "@fastcar/core/annotation";
import { FastCarApplication } from "@fastcar/core";
import { ServerGroupType, ServerMeta } from "@/types/ServerMeta";
import { ServerKind, ServerMicroservices } from "@/common/Constant";
import { ChannelKind } from "@/common/Constant";
import { SessionAttribute } from "@/types/SessionAttribute";

/**
 * 实现对当前服务的管理
 */
@Service
export default class DataService {
	@Autowired
	private app!: FastCarApplication;

	//获取当前服务的id
	getCurrServiceId(): string {
		return this.app.getSetting(SessionAttribute.serviceId);
	}

	getCurrServerType() {
		return this.app.getSetting(SessionAttribute.serverType);
	}

	getMicroservices(): ServerGroupType {
		const microservices: ServerGroupType = this.app.getSetting(ServerMicroservices);
		return microservices;
	}

	getServerGroup(serverType: string = this.getCurrServerType()): { token: string; servers: ServerMeta[] } {
		let services = this.getMicroservices();
		return services[serverType];
	}

	getServerMeta(serviceId: string = this.getCurrServiceId()): (ServerMeta & { serverType: string; token: string }) | null {
		let services = this.getMicroservices();
		for (let serverType in services) {
			let item = services[serverType];
			for (let server of item.servers) {
				if (server.serviceId == serviceId) {
					return Object.assign({ token: item.token, serverType }, server);
				}
			}
		}

		return null;
	}

	getServerKindByServerType(serverType: string = this.getCurrServerType()): ServerKind {
		let services = this.getMicroservices();
		if (!Reflect.has(services, serverType)) {
			return ServerKind.front;
		}

		if (serverType.toLowerCase() == ServerKind.center) {
			return ServerKind.center;
		}

		return ServerKind.remote;
	}

	getChannelKindByServerType(serverType: string = this.getCurrServerType()): ChannelKind {
		let services = this.getMicroservices();
		if (!Reflect.has(services, serverType)) {
			return ChannelKind.FRONT;
		}

		if (serverType.toLowerCase() == ServerKind.center) {
			return ChannelKind.CENTER;
		}

		return ChannelKind.REMOTE;
	}

	getServiceIdByIndex(serverType: string, index: number) {
		let services = this.getMicroservices();
		let item = services[serverType];

		let citem = item?.servers?.[index];
		if (citem?.id != index) {
			console.error(`server route index error ${serverType} ${index}`);
		}
		return citem?.serviceId || "";
	}
}
