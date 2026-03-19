//使用pm2启动微服务
import NetWork from "@/utils/NetWork";
import * as path from "path";
import { FileUtil } from "@fastcar/core/utils";
import * as os from "os";
import MicroservicesUtils from "./utils/MicroservicesUtils";
import * as fs from "fs";
import * as yaml from "yaml";
import { exec, execSync } from "child_process";

class APPPm2 {
	exec() {
		let cmdArgs = MicroservicesUtils.parseArgs(process.argv);
		let { cmd } = cmdArgs;

		cmd = "start"; // 测试

		switch (cmd) {
			case "start": {
				this.start();
				break;
			}
			case "stop": {
				this.stop();
				break;
			}
			default: {
				console.log(`未匹配到cmd---->${cmd}`);
				break;
			}
		}
	}

	async start() {
		const serverPath = path.join(__dirname, "servers");
		let microservices = MicroservicesUtils.format(MicroservicesUtils.getMicroservicesConfig());
		let pargs = MicroservicesUtils.parseArgs(process.argv);
		let argServerType = Reflect.get(pargs, "serverType");
		let argServiceId = Reflect.get(pargs, "serviceId");
		let apps = [];

		for (let serverType in microservices) {
			if (argServerType && argServerType != serverType) {
				continue;
			}

			//判断是否为
			let item = microservices[serverType];
			let servers = item.servers;
			for (let s of servers) {
				if (argServiceId && argServiceId != s.serviceId) {
					continue;
				}

				if (NetWork.isLocalIP(s.host)) {
					let args: string[] = [];

					args.push(serverType);
					args.push(s.serviceId);

					console.log(s.serviceId);

					let scriptPath = require.resolve(path.join(serverPath, serverType, "app"));
					let execArgs: { [key: string]: any } = {
						name: `${s.serviceId}-usa`,
						script: scriptPath,
						args, //动态参数
						// max_memory_restart: 1024 * 1024 * 1024, //最大重启内存
						// max_restarts: 1, //最大重启一次
						// autorestart: true,
						cwd: __dirname,
						env: {
							TZ: "UTC", //替换成统一的时区
						},
						wait_ready: true,
						kill_timeout: 5000,
					};

					if (FileUtil.getSuffix(scriptPath) == "ts") {
						execArgs.interpreter = path.join(__dirname, "../", "node_modules", ".bin", "ts-node");

						if (os.type().startsWith("Windows")) {
							execArgs.exec_mode = "cluster"; //不改为集群模式会有问题
						}

						if (execArgs?.env) {
							execArgs.env["TS_NODE_PROJECT"] = path.join(__dirname, "../tsconfig.json");
						}
					}

					if (s.debugPort && execArgs.exec_mode != "cluster") {
						let nodeArgs: string = execArgs.node_args as string;
						if (!nodeArgs) {
							execArgs.node_args = "";
						}
						execArgs.node_args += ` --inspect=${s.host}:${s.debugPort}`;
					}

					apps.push(execArgs);
				}
			}
		}

		let execPath = path.join(__dirname, "../", "resource", "ecosystem.config.yml");
		//写入配置文件
		fs.writeFileSync(
			execPath,
			yaml.stringify({
				apps,
			})
		);

		//先杀掉进程在执行启动
		execSync(`pm2 stop ${execPath}`);
		console.log("pm2 stop server complete");

		let execRes = exec(`pm2 start ${execPath}`);
		execRes.on("exit", () => {
			console.info("start complete");
			let startRes = execSync(`pm2 list`);
			console.log(startRes.toString());
			process.exit(0);
		});
		// setTimeout(() => {
		// 	execRes.kill();
		// }, 1000);
	}

	async stop() {
		let microservices = MicroservicesUtils.format(MicroservicesUtils.getMicroservicesConfig());
		let pargs = MicroservicesUtils.parseArgs(process.argv);
		let argServerType: string = Reflect.get(pargs, "serverType");
		let argServiceId: string = Reflect.get(pargs, "serviceId");

		let all = false;
		if (!argServerType && !argServiceId) {
			all = true;
		}

		let names: string[] = [];
		if (all) {
			Object.values(microservices).forEach((t) => {
				t.servers.forEach((item) => {
					if (NetWork.isLocalIP(item.host)) {
						names.push(item.serviceId);
					}
				});
			});
		} else {
			if (!!argServerType) {
				let t = microservices[argServerType];
				t.servers.forEach((item) => {
					if (!argServiceId || item.serviceId == argServiceId) {
						if (NetWork.isLocalIP(item.host)) {
							names.push(item.serviceId);
						}
					}
				});
			} else if (!!argServiceId) {
				Object.keys(microservices).forEach((k) => {
					let v = microservices[k];
					v.servers.forEach((item) => {
						if (item.serviceId == argServiceId) {
							if (NetWork.isLocalIP(item.host)) {
								names.push(item.serviceId);
							}
						}
					});
				});
			}
		}

		if (names.length > 0) {
			names = names.map((n) => {
				return `${n}-usa`;
			});

			let cmdStr = `pm2 stop ${names.join(" ")}`;
			let execRes = exec(cmdStr);
			execRes.on("exit", () => {
				console.log("pm2 stop server list:");
				names.forEach((item) => {
					console.log(item);
				});
				process.exit(0);
			});
		}
	}
}

export default new APPPm2().exec();
