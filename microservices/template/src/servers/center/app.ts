import { Application } from "@fastcar/core/annotation";
import BaseServer from "../base/BaseServer";
import { RPCMiddleware } from "@fastcar/rpc/annotation";
import parseSession from "@/middleware/parseSession";
import checkForm from "@/middleware/checkForm";

@Application
@RPCMiddleware(checkForm, parseSession)
class APP extends BaseServer {
	constructor() {
		super();
	}
}
export default new APP();
