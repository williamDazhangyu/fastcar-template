export default {
	SYS: {
		OK: 200,
		NOACCESS: 403, //禁止访问
		NOT_FOUND: 404, //找不到服务
		FAIL: 500, //内部错误
		DISCONNECT: 501, //断线
		RETRYTIMES: 502,
		UNAVAILABLE: 503, //不可用
		TIMEOUT: 504, //超时
		BUSY: 505,
	},
	COMMON: {
		PARAMETER_ERROR: 10001, //参数错误
		PERMISSIONS_MISSING: 10002, //缺少权限
		SERVER_CONNECT_FORBID: 10003, //连接禁止
	},
	CENTER: {
		SERVER_NOT_FOUND: 20001, //服务不存在
		SERVER_TOKEN_ERROR: 20002, //密码错误
		SERVER_NOT_LOGIN: 20003, //服务未登录
	},
	ACCOUNT: {
		NOT_LOGIN: 30001, //未登录
	},
};
