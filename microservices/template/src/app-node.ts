import { ChildProcess, spawn, SpawnOptions } from "child_process";
import { FileUtil } from "@fastcar/core/utils";
import * as path from "path";
import { execPath } from "process";
import NetWork from "./utils/NetWork";
import * as fs from "fs";
import MicroservicesUtils from "./utils/MicroservicesUtils";

//使用子进程启动微服务
class APPNode {
	spawnProcess(options: string[], debug: boolean = false) {
		let stdioArgs: SpawnOptions = { detached: true, stdio: "inherit" };
		let child: ChildProcess = spawn(execPath, options, debug ? {} : stdioArgs);

		child?.stderr?.on("data", function (chunk) {
			process.stderr.write(chunk.toString());
		});

		child?.stdout?.on("data", function (chunk) {
			process.stdout.write(chunk.toString());
		});

		child.on("error", function (error) {
			console.error(error);
		});

		child.on("exit", function (code) {
			if (code !== 0) {
				console.error("child process exit with error, error code: %s", code);
			}
		});
	}

	start() {
		const serverPath = path.join(__dirname, "servers");
		//加载配置
		//根据配置读取server集群
		let microservices = MicroservicesUtils.getMicroservicesConfig();
		microservices = MicroservicesUtils.format(microservices);

		let pargs = MicroservicesUtils.parseArgs(process.argv);
		let argServerType = Reflect.get(pargs, "serverType");
		let argServiceId = Reflect.get(pargs, "serviceId");

		Object.keys(microservices).forEach((serverType) => {
			if (argServerType && argServerType != serverType) {
				return;
			}

			//判断是否为本地IP
			let item = microservices[serverType];
			let servers = item.servers;
			servers.forEach((s) => {
				if (argServiceId && argServiceId != s.serviceId) {
					return;
				}

				if (NetWork.isLocalIP(s.host)) {
					try {
						let args: string[] = [];

						if (!!s.debugPort) {
							args.push(`--inspect=${s.host}:${s.debugPort}`);
						}

						let scriptPath = require.resolve(path.join(serverPath, serverType, "app"));
						if (!fs.existsSync(scriptPath)) {
							return;
						}
						if (FileUtil.getSuffix(scriptPath) == "ts") {
							args.push("-r");
							args.push("ts-node/register");
						}

						args.push(scriptPath);

						args.push(serverType);
						args.push(s.serviceId);

						this.spawnProcess(args, !!s.debugPort);
					} catch (e) {
						console.error(`${s.serviceId} startup failed`);
						console.error(e);
					}
				}
			});
		});
	}
}

//设置时区
process.env.TZ = "UTC";

export default new APPNode().start();
