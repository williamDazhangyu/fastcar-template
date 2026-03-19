import checkForm from "@/middleware/checkForm";
import checkLogin from "@/middleware/checkLogin";
import parseSession from "@/middleware/parseSession";
import { Application } from "@fastcar/core/annotation";
import { RPCMiddleware } from "@fastcar/rpc/annotation";
import forwardMsg from "./middleware/forwardMsg";
import BaseServer from "../base/BaseServer";

@Application
@RPCMiddleware(checkForm, parseSession, checkLogin, forwardMsg)
class APP extends BaseServer {}

export default new APP();
