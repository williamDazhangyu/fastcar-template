import { Application } from "@fastcar/core/annotation";
import { EnableKoa, KoaMiddleware } from "@fastcar/koa/annotation";
import { ExceptionGlobalHandler, KoaBodyParser } from "@fastcar/koa";
import BaseServer from "../base/BaseServer";

@Application
//开启koa
//开启异常捕捉 可自定义 通常是放在中间件第一个
@KoaMiddleware(ExceptionGlobalHandler)
//开启参数解析
// @KoaMiddleware(KoaBody)
@KoaMiddleware(KoaBodyParser)
class APP extends BaseServer {}

export default new APP();
