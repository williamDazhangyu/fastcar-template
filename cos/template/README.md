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
