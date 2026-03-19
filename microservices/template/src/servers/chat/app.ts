import checkForm from "@/middleware/checkForm";
import parseSession from "@/middleware/parseSession";
import { Application } from "@fastcar/core/annotation";
import { RPCMiddleware } from "@fastcar/rpc/annotation";
import BaseServer from "../base/BaseServer";

@Application
@RPCMiddleware(checkForm, parseSession)
class APP extends BaseServer {}

export default new APP();
