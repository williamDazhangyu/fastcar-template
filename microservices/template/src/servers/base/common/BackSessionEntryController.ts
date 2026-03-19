import { Autowired, Controller } from "@fastcar/core/annotation";
import { RPC, RPCMethod } from "@fastcar/rpc/annotation";
import BackSessionService from "../service/BackSessionService";
import Result from "@/common/Result";
import { SessionAttribute } from "@/types/SessionAttribute";
import RouterService from "../service/RouterService";
import { ReqSession } from "@/types/ReqSession";

@Controller
@RPC("/backSession")
export default class BackSessionEntryController {
	@Autowired
	private backSessionService!: BackSessionService;

	@Autowired
	private routerService!: RouterService;

	@RPCMethod()
	join({ session }: { session: ReqSession }) {
		this.backSessionService.join(this.routerService.reqSessionToSession(session));

		return Result.ok();
	}

	@RPCMethod()
	leave({ session }: { session: ReqSession }) {
		let clientSession = this.routerService.reqSessionToSession(session);
		let uid = clientSession.settings.get(SessionAttribute.uid);
		this.backSessionService.remove(uid);

		return Result.ok();
	}
}
