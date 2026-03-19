import { RpcAsyncService, RpcClient, SocketEnum } from "@fastcar/rpc";

class NotifyHandle implements RpcAsyncService {
	async handleMsg(url: string, data: Object): Promise<void | Object> {
		// console.log("收到服务端消息", url, data);
		// return {
		// 	url,
		// 	data: "来自客户端的消息---",
		// };
	}
}

let success: number = 0;
let totalTime = 0;
let testTotal = 10;
let testUids = 100;

let index = parseInt(process.argv.pop() || "0");
index = 0;
console.log("index----", index);

setTimeout(() => {
	console.log("成功率---", success);
	console.log("平均耗时", totalTime / (testTotal * testUids));
}, 10000);

let clients: RpcClient[] = [];

async function test() {
	for (let j = 1; j < testUids + 1; j++) {
		let client1 = new RpcClient(
			{
				url: `ws://localhost:${Math.random() > 0.5 ? 4002 : 2002}`,
				type: SocketEnum.WS,
			},
			new NotifyHandle()
		);
		await client1.start();
		if (!client1.isConnect()) {
			console.error("连接未成功");
			continue;
		}

		clients.push(client1);
	}

	clients.forEach(async (c, cindex) => {
		let uid = cindex + testUids * index;
		let result = await c.request("/account/login", { uid });
		console.log("登录结果", result);
		//向自身发送消息
		for (let i = 0; i < testTotal; i++) {
			let now = Date.now();
			c.request("/room/sendMsg", {
				toUid: uid,
				msg: "hello world",
				serverType: "chat",
			}).then((res) => {
				if (res.code == 200) {
					success++;
				}
				// console.log("耗时----" + i, Date.now() - now);
				totalTime += Date.now() - now;
			});
		}
	});
}

setTimeout(() => {
	test();
}, Math.random() * 2000);
