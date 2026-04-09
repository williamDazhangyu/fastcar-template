import { Configure, Hotter } from "@fastcar/core/annotation";

@Hotter
@Configure("data.yml")
export default class Data {
	accounts!: Array<{
		appid: string;
		serectkey: string;
	}>;
	permissions!: { [key: string]: "public" | "private" };
	redirect!: { [key: string]: string | { [path: string]: string } }; //重定向配置，支持域名嵌套或全局路径
	defaultredirect?: string; //全局的重定向
}
