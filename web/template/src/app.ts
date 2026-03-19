import { FastCarApplication } from "@fastcar/core";
import { ExceptionGlobalHandler, KoaBodyParser } from "@fastcar/koa";
import { Application } from "@fastcar/core/annotation";
import { EnableKoa, KoaMiddleware } from "@fastcar/koa/annotation";
import Example from "./middleware/Example";

//开启应用管理
@Application
//开启koa
@EnableKoa
//开启异常捕捉 可自定义 通常是放在中间件第一个
@KoaMiddleware(ExceptionGlobalHandler)
//开启参数解析
@KoaMiddleware(KoaBodyParser)
//自定义中间件使用
@KoaMiddleware(Example)
class APP {
	app!: FastCarApplication;
}

export default new APP();
