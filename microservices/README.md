# @fastcar/template-microservices

基于 fastcar-core 的微服务应用模板

## 简介

这是一个用于快速搭建微服务架构的模板，包含多个服务模块，适用于构建分布式系统。

## 特性

- 🚀 基于 [fastcar-core](https://www.npmjs.com/package/@fastcar/core) 框架
- 🏗️ 多服务模式（center、connector、chat、web）
- 🔗 内置 RPC 通信
- 📦 支持 TypeScript
- 🔄 支持 PM2 进程管理
- 🔌 支持 WebSocket

## 服务模块

- **center**: 服务中心，提供服务注册与发现
- **connector**: 连接器服务，处理客户端连接
- **chat**: 聊天服务，处理实时消息
- **web**: Web 服务，提供 HTTP 接口
- **base**: 基础服务，提供公共功能

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
# 启动单个节点模式
npm run start-node

# 启动 PM2 管理模式
npm run start-pm2
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

## 配置说明

配置文件位于 `resource/` 目录：

- `application.yml` - 主配置
- `application-dev.yml` - 开发环境配置
- `ecosystem.config.yml` - PM2 配置

## 项目结构

```
template/
├── src/
│   ├── annotation/       # 注解定义
│   ├── common/           # 公共代码
│   ├── middleware/       # 中间件
│   ├── servers/          # 服务目录
│   │   ├── base/         # 基础服务
│   │   ├── center/       # 服务中心
│   │   ├── chat/         # 聊天服务
│   │   ├── connector/    # 连接器服务
│   │   └── web/          # Web 服务
│   ├── types/            # 类型定义
│   ├── utils/            # 工具函数
│   ├── app-node.ts       # 单节点入口
│   └── app-pm2.ts        # PM2 入口
├── resource/
│   ├── application.yml
│   ├── application-dev.yml
│   └── ecosystem.config.yml
├── test/                 # 测试文件
├── package.json
├── tsconfig.json
└── ecosystem.config.yml
```

## 依赖

- [@fastcar/core](https://www.npmjs.com/package/@fastcar/core) - 核心框架
- [@fastcar/koa](https://www.npmjs.com/package/@fastcar/koa) - Koa 集成
- [@fastcar/rpc](https://www.npmjs.com/package/@fastcar/rpc) - RPC 支持
- [@fastcar/server](https://www.npmjs.com/package/@fastcar/server) - 服务器支持
- [@fastcar/timer](https://www.npmjs.com/package/@fastcar/timer) - 定时器支持

## 相关模板

- [@fastcar/template-web](../web) - Web 项目模板
- [@fastcar/template-static](../static) - 静态资源服务器模板
- [@fastcar/template-rpc](../rpc) - RPC 服务器模板
- [@fastcar/template-cos](../cos) - 对象存储服务模板

## License

MIT
