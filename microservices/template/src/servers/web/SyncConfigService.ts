import { Logger } from "@fastcar/core";
import { BeanName, Log, Service } from "@fastcar/core/annotation";

@BeanName("SyncConfigService")
@Service
export default class SyncConfigService {
	@Log()
	private logger!: Logger;

	load(m: Object) {
		this.logger.debug(`同步配置更新`, m);
	}
}
