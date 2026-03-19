export const CODE = {
	OK: 200,
	BAD_REQUEST: 400,
	NOT_FOUND: 404, //找不到服务
	FAIL: 500, //内部错误
	UNAVAILABLE: 503, //不可用
	TIMEOUT: 504, //超时
	FORBID: 403, //没有权限
	FILE_EXIST: 410, //文件夹被当成文件使用了
	NOT_SUPPORT: 405, //方法不支持
};
