import { CodeProtocolEnum, DecodeMsg, EncodeMsg, RetryConfig, SecureClientOptions, SocketEnum } from "@fastcar/rpc";
import { ServerConfig } from "@fastcar/server";

export type ServerItemConfig = {
	front: boolean;
	domainName?: string; //对外访问域名
	type: SocketEnum; //具体为哪一种型号的连接器
	server: ServerConfig;
	extra?: any; //第三方拓展配置 用于灵活的调用第三方
	clientExtra?: any; //客户端拓展配置
	encode?: EncodeMsg; //编码解码
	decode?: DecodeMsg;
	codeProtocol?: CodeProtocolEnum; //约定协议 json protobuf 默认json
	secure?: SecureClientOptions;
	maxConnections?: number; //最大连接数 默认1024
	disconnectInterval?: number;
	connectionLimit?: number; //连接数限制 默认1
	retry?: RetryConfig;
};

export type ServerMeta = {
	host: string;
	debugPort?: number; //调试端口号
	serviceId: string;
	clusters?: number; //集群数量
	list: ServerItemConfig[];
	retry?: RetryConfig;
	id: number; //服务唯一ID
	units?: number; //单元数量 默认100
};

type ServiceType = string;

export type ServerGroupType = {
	[key: ServiceType]: {
		token: string; //当前服务的token 用于认证使用的
		servers: ServerMeta[];
	};
};

export type ServerStatus = {
	serviceId: string;
	status: boolean;
	createTime: number;
	updateTime: number;
	serverType: string;
	centerId: string;
};
