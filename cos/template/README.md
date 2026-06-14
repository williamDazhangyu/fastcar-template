# @fastcar/template-cos

基于 fastcar-core 的对象存储服务模板

## 简介

这是一个用于快速搭建对象存储服务的模板，支持文件上传、下载、压缩、直播转码等功能。

## 特性

- 🚀 基于 [fastcar-core](https://www.npmjs.com/package/@fastcar/core) 框架
- ☁️ 集成 COS SDK
- 📦 支持文件上传/下载
- 🗜️ 支持文件压缩
- 📺 支持直播转码
- 📦 支持 TypeScript
- 🔄 支持 PM2 进程管理

## 使用方式

### 安装依赖

```bash
cd template
npm install
# 或者
yarn install
```

### 开发调试

```bash
npm run debug
# 或者
yarn debug
```

### 编译项目

```bash
npm run build
# 或者
yarn build
```

## 图片处理能力

图片处理能力独立在 `/image` 路由下，支持对 COS 内已有 `filename` 或外部 `sourceUrl` 处理。`filename` 和 `sourceUrl` 必须二选一，`targetFilename` 必填，服务端不会自动推断输出文件名，也不会覆盖已存在文件。签名鉴权时，本地源文件和目标文件都必须在授权 `dir_path` 内；外部 URL 只校验目标文件在授权路径内。

### 生成预览图

`POST /image/generatePreview`

```json
{
	"filename": "/images/demo.png",
	"targetFilename": "/images/demo-preview.webp"
}
```

大图会按最长边等比缩放并输出 WebP。小图也会生成到 `targetFilename`，只是保持原尺寸输出 WebP；GIF 预览会复制原 GIF 到 `targetFilename`。本地 `filename` 与 `targetFilename` 规范化后相同时返回 `BAD_REQUEST`。

### 等比缩放

`POST /image/resize`

```json
{
	"sourceUrl": "https://example.com/demo.png",
	"targetFilename": "/images/demo-640.webp",
	"width": 640
}
```

`width` 和 `height` 至少传一个；两个都传时按目标框 `inside` 等比缩放，不裁剪。目标尺寸大于源图时使用 sharp 的高质量插值放大，并在返回值中标记 `upscaled: true`。resize 输出格式保持源图片格式，写入 `targetFilename`，不覆盖源文件或已有目标文件。

阈值可在 `resource/application*.yml` 的 `settings.preview` 中配置；代码内默认值只用于兜底。本地 `filename` 最大可处理大小默认 `100MB`，外部 URL 最大下载大小默认 `25MB`，最大输出边长默认 `8192px`。请求参数可以临时覆盖配置，优先级为：请求参数 > `settings.preview` 配置 > 代码兜底默认值。可选字段包括 `maxLongEdge`、`maxOriginalBytes`、`localImageMaxBytes`、`externalImageMaxBytes`、`externalImageTimeoutMs`、`webpQuality`、`maxDimension`。

返回示例：

```json
{
	"code": 200,
	"msg": "success",
	"data": {
		"sourceUrl": "https://cos.example.com/images/demo.png",
		"previewUrl": "https://cos.example.com/images/demo-preview.webp",
		"sourceFilename": "/images/demo.png",
		"previewFilename": "/images/demo-preview.webp",
		"sourceWidth": 1600,
		"sourceHeight": 900,
		"previewWidth": 1280,
		"previewHeight": 720,
		"previewSizeBytes": 102400,
		"previewMimeType": "image/webp"
	}
}
```

### 启动服务

```bash
npm start
# 或者
yarn start
```

### 停止服务

```bash
npm stop
# 或者
yarn stop
```

### 打包

```bash
npm run pkg
# 或者
yarn pkg
```

## 配置说明

配置文件位于 `resource/application.yml`。

## 项目结构

```
template/
├── src/
│   ├── middleware/       # 中间件
│   ├── model/            # 数据模型
│   ├── utils/            # 工具函数
│   ├── CosController.ts  # COS 控制器
│   ├── CosService.ts     # COS 服务
│   ├── LiveController.ts # 直播控制器
│   ├── LiveService.ts    # 直播服务
│   └── app.ts            # 应用入口
├── resource/
│   ├── ssl/              # SSL 证书
│   └── application.yml   # 配置文件
├── target/               # 编译输出
├── build.js              # 打包脚本
├── package.json
├── tsconfig.json
└── ecosystem.config.yml
```

## 依赖

- [@fastcar/core](https://www.npmjs.com/package/@fastcar/core) - 核心框架
- [@fastcar/koa](https://www.npmjs.com/package/@fastcar/koa) - Koa 集成
- [@fastcar/cossdk](https://www.npmjs.com/package/@fastcar/cossdk) - COS SDK
- [@fastcar/server](https://www.npmjs.com/package/@fastcar/server) - 服务器支持

## 相关模板

- [@fastcar/template-web](../web) - Web 项目模板
- [@fastcar/template-static](../static) - 静态资源服务器模板
- [@fastcar/template-rpc](../rpc) - RPC 服务器模板
- [@fastcar/template-microservices](../microservices) - 微服务应用模板

## License

MIT
