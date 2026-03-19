import { ServerItemConfig } from "@/types/ServerMeta";
import { SocketEnum } from "@fastcar/rpc";

export default class ConnectorUtils {
	static getConnectUrl(item: ServerItemConfig, host: string = "localhost") {
		let sslFlag = !!item.server.ssl;
		let defaultPort = sslFlag ? "443" : "80";

		switch (item.type) {
			case SocketEnum.SocketIO:
			case SocketEnum.WS: {
				return `${sslFlag ? "wss" : "ws"}://${host}:${item.server.port || defaultPort}`;
			}
			case SocketEnum.MQTT: {
				return `mqtt://${host}:${item.server.port || defaultPort}`;
			}
			case SocketEnum.Grpc: {
				return `${host}:${item.server.port || defaultPort}`;
			}
			default: {
				return "";
			}
		}
	}
}
