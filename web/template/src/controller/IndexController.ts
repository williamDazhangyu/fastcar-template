import { Controller } from "@fastcar/core/annotation";
import { GET } from "@fastcar/koa/annotation";
import Result from "../model/Result";

@Controller
export default class IndexController {
	@GET("/")
	index() {
		return Result.ok("hello world!");
	}
}
