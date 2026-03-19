import { Application } from "@fastcar/core/annotation";
import { EnableKoa, KoaMiddleware } from "@fastcar/koa/annotation";
import { ExceptionGlobalHandler, KoaBody, KoaBodyParser, KoaCors } from "@fastcar/koa";
import LimitMiddleware from "./middleware/LimitMiddleware";
import GetFileMiddleware from "./middleware/GetFileMiddleware";
import Auth from "./middleware/AuthMiddleware";

@EnableKoa
@Application
@KoaMiddleware(GetFileMiddleware, ExceptionGlobalHandler, LimitMiddleware, KoaBody, KoaBodyParser, KoaCors, Auth)
class APP {}

export default new APP();
