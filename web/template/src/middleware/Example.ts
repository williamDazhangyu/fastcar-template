import * as koa from "koa";

//自定义中间件示范
export default function Example(): koa.Middleware {
	return async (ctx: koa.Context, next: Function) => {
		console.log("example--- in");
		await next();
		console.log("example--- out");
	};
}
