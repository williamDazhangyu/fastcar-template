import { RPCAuth } from "@fastcar/rpc/annotation";
import {  RpcAuthService, SocketServerConfig } from "@fastcar/rpc";

//校验用户名 可根据自身业务逻辑进行指定
@RPCAuth
export default class Auth implements RpcAuthService {
	async auth(username: string, password: string, config: SocketServerConfig): Promise<boolean> {
		return config.secure?.username == username && config.secure.password == password;
	}
}
