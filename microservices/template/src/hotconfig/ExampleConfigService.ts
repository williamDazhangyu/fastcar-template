import { BootPriority, Logger } from "@fastcar/core";
import { ApplicationStart, BeanName, Log } from "@fastcar/core/annotation";
import { getHotKey, HotConfigInterface } from "./HotConfigInterface";

@BeanName("ExampleConfigService")
@ApplicationStart(BootPriority.Common)
export default class ExampleConfigService implements HotConfigInterface {
	@Log()
	private logger!: Logger;

	async run() {
		this.logger.debug(`初始化配置`);
	}

	//加载游戏配置
	load(list: string[], serverType: string) {
		//通知模板来
		let keys = getHotKey(__filename);
		if (keys && !keys.includes(serverType)) {
			return this.logger.warn(`无需加载配置`);
		}

		if (!!serverType) {
			this.logger.debug(`加载单个配置${serverType}`);
		} else {
			this.logger.debug(`加载全部配置`);
		}
	}
}
