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

describe("基础交互测试", () => {
	it("服务端和客户端交互", async () => {
		let client1 = new RpcClient(
			{
				url: "ws://localhost:1235",
				type: SocketEnum.WS,
				secure: { username: "user", password: "123456" },
			},
			new NotifyHandle()
		);
		await client1.start();
		let result = await client1.request("/hello");
		console.log("普通调用", result);
	});
});
