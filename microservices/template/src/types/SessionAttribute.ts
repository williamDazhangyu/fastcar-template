//session的属性key值
export enum SessionAttribute {
	logged = "logged", //是否登录
	serviceId = "serviceId", //服务索引id
	serverType = "serverType", //自定义服务器类型
	uid = "uid",
	serverKind = "serverKind", //服务器分类
	tid = "tid", //桌子分类
	gameServerType = "gameServerType", //桌子的gameKey
	logLoginId = "loginId", //登录日志id
	loginTime = "loginTime", //登录时间
	center_serviceId = "center_serviceId", //注册中心服务id
}
