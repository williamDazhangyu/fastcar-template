import { Application } from "@fastcar/core/annotation";
import { EnableKoa, KoaMiddleware } from "@fastcar/koa/annotation";
import { ExceptionGlobalHandler, KoaStatic } from "@fastcar/koa";

@Application
@EnableKoa
@KoaMiddleware(ExceptionGlobalHandler)
@KoaMiddleware(KoaStatic)
class APP {
	app!: any;
}

export default new APP();
