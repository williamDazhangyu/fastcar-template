export const ServerTypeSymbol = Symbol("ServerType"); //特指每一组的类型

export const ServerMicroservices = "microservices";

//频道
export enum ChannelKind {
	"FRONT" = "__front__", //前端服务
	"REMOTE" = "__remote__", //后端调用服务
	"CENTER" = "__center__", //中心服务
}

//进行服务分类
export enum ServerKind {
	"front" = "front", //前端程序服务
	"remote" = "remote", //内部通讯服务
	"center" = "center", //中心服务
}

export enum ServerCommonUrl {
	Connect = "connect_receipt",
	ServiceStatusNotify = "/center/client/serviceStatusNotify", //客户端服务更新
	ServiceStatusAllNotify = "/center/client/serviceStatusAllNotify", //全部路由更新
	ServiceBalance = "/center/rebalance", //重新负载均衡
	ServiceSyncConfig = "/center/syncConfig", //同步配置
}

//热更新配置集合
export const HotConfigKeys = Symbol("hotConfigKeys");
