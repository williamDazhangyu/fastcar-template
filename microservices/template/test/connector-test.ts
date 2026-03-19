import { RpcAsyncService, RpcClient, SocketEnum } from "@fastcar/rpc";

class NotifyHandle implements RpcAsyncService {
	async handleMsg(url: string, data: Object): Promise<void | Object> {
		console.log("收到服务端消息", url, data);
		return {
			url,
			data: "来自客户端的消息---",
		};
	}
}

describe("连接器连接", () => {
	it("服务端和客户端交互", async () => {
		let success: number = 0;
		let totalTime = 0;
		let testTotal = 10;
		let testUids = 100;

		setTimeout(() => {
			console.log("成功率---", success);
			console.log("平均耗时", totalTime / (testTotal * testUids));
		}, 10000);

		let clients: RpcClient[] = [];

		for (let j = 1; j < testUids + 1; j++) {
			let client1 = new RpcClient(
				{
					url: `ws://localhost:2002`,
					type: SocketEnum.WS,
				},
				new NotifyHandle()
			);
			await client1.start();
			if (client1.isConnect()) {
				clients.push(client1);
			}
		}

		clients.forEach(async (client1, j) => {
			let result = await client1.request("/account/login", { uid: j });
			console.log("登录结果", result);
			//向自身发送消息
			for (let i = 0; i < testTotal; i++) {
				let now = Date.now();
				client1
					.request("/room/sendMsg", {
						toUid: j,
						msg: "hello world",
						serverType: "chat",
					})
					.then((res) => {
						console.log(res.code);
						if (res.code == 200) {
							success++;
						}
						console.log("耗时----" + i, Date.now() - now);
						totalTime += Date.now() - now;
					});
			}
		});
	});
});
