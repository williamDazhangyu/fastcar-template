import { ServerMicroservices } from "@/common/Constant";
import { ServerGroupType, ServerItemConfig, ServerMeta } from "@/types/ServerMeta";
import { CommonConstant } from "@fastcar/core";
import { FileUtil, MixTool } from "@fastcar/core/utils";
import * as path from "path";

//格式化微服务配置
export default class MicroservicesUtils {
	static getMicroservicesConfig(): ServerGroupType {
		let resPath = path.join(__dirname, "../../", "resource");
		let sysConfig = FileUtil.getApplicationConfig(resPath, CommonConstant.Application);
		let env = sysConfig.application.env;
		sysConfig = FileUtil.getApplicationConfig(resPath, `${CommonConstant.Application}-${env}`, sysConfig);

		const microservices: ServerGroupType = sysConfig.settings.get(ServerMicroservices);
		if (!microservices) {
			throw new Error("not found microservices");
		}

		return microservices;
	}

	static format(microservices: ServerGroupType): ServerGroupType {
		let newMicroservices = {};
		Object.keys(microservices).forEach((serverType) => {
			//判断是否为
			let item = microservices[serverType];
			let servers = item.servers;

			let n: {
				token: string; //当前服务的token 用于认证使用的
				servers: ServerMeta[];
			} = {
				token: item.token,
				servers: [],
			};

			servers.forEach((citem, index) => {
				let clusters = citem.clusters || 1;
				let units = citem.units || 100;
				let [stype, proto] = citem?.serviceId?.split("-") || "";
				let commonBody: ServerMeta = {
					host: citem.host,
					serviceId: `${stype || serverType}-${proto || "server"}-`,
					list: citem.list,
					retry: citem.retry,
					id: 0,
				};

				if (citem.debugPort) {
					commonBody.debugPort = commonBody.debugPort;
				}

				let addNum = citem.list.length;

				for (let i = 0; i < clusters; i++) {
					let newItem: ServerMeta = Object.create(commonBody); //copy原型链
					MixTool.copyProperties(newItem, JSON.parse(JSON.stringify(commonBody))); //copy序列化的值

					if (newItem.debugPort) {
						newItem.debugPort = newItem.debugPort + i;
					}
					newItem.serviceId = newItem.serviceId + ((index + 1) * units + (i + 1));
					newItem.id = i;

					newItem.list = newItem.list.map((n) => {
						let t: ServerItemConfig = Object.assign({}, n);
						let skipNum = i * addNum;

						if (!!t.server.port) {
							t.server.port = t.server.port + skipNum;
						} else {
							t.server.port = t.server.ssl ? 443 + skipNum : 80 + skipNum;
						}

						return t;
					});

					n.servers.push(newItem);
				}
			});

			Reflect.set(newMicroservices, serverType, Object.assign({}, item, n));
		});

		return newMicroservices;
	}

	//格式化命令行参数
	static parseArgs(args: string[]) {
		let proto: { [key: string]: string } = {};
		args.forEach((item: string) => {
			let list = item.split("=");
			if (list.length == 2) {
				Reflect.set(proto, list[0].trim(), list[1].trim());
			}
		});

		return proto;
	}
}
