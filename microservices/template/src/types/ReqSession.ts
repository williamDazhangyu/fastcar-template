import { CustomId } from "@fastcar/rpc";

export type ReqSession = {
	sessionId: string;
	connectedTime: number; //连接的开始时间
	cid?: CustomId; //自定义逻辑id 这边可以代指uid
	settings: { [key: string | symbol]: any }; //自定义设置项
};
