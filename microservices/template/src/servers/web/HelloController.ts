import { Autowired, Controller } from "@fastcar/core/annotation";
import { GET } from "@fastcar/koa/annotation";
import CenterClient from "../base/service/CenterClient";
import Result from "../../common/Result";
import RouterService from "../base/service/RouterService";

@Controller
export default class HelloController {
	@Autowired
	private centerClient!: CenterClient;

	@Autowired
	private routerService!: RouterService;

	@GET("/")
	hello() {
		return this.routerService.request({
			url: "/room/join",
			serverType: "chat",
		});
	}

	@GET("/serverList")
	getServerList() {
		return Result.ok(this.centerClient.getServerMap().toValues());
	}

	@GET("/test/rebalance")
	async rebalance() {
		let res = await this.centerClient.sendBalance();
		return res;
	}

	@GET("/test/syncconfig")
	syncConfig() {
		this.routerService
			.request({
				url: "/center/syncConfig",
				serverType: "center",
				data: {
					key: "SyncConfigService",
					data: "hello world",
				},
			})
			.then((res) => {
				console.log(res);
			});

		return Result.ok();
	}
}
