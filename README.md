# Fastcar Template

Fastcar 框架官方模板集合，帮助你快速搭建各种类型的 Node.js 应用。

## 📦 模板列表

| 模板 | 说明 | 目录 |
|------|------|------|
| [@fastcar/template-web](./web) | Web 项目模板 | `web/` |
| [@fastcar/template-static](./static) | 静态资源服务器模板 | `static/` |
| [@fastcar/template-rpc](./rpc) | RPC 服务器模板 | `rpc/` |
| [@fastcar/template-cos](./cos) | 对象存储服务模板 | `cos/` |
| [@fastcar/template-microservices](./microservices) | 微服务应用模板 | `microservices/` |

## 🚀 快速开始

### 使用 fastcar-cli（推荐）

```bash
# 安装脚手架
npm install -g @fastcar/cli

# 创建项目
fastcar-cli init <template-name>

# 例如
fastcar-cli init web
fastcar-cli init static
fastcar-cli init rpc
fastcar-cli init cos
fastcar-cli init microservices
```

### 手动使用

```bash
# 克隆仓库
git clone https://github.com/williamDazhangyu/fastcar-template.git

# 进入对应模板目录
cd fastcar-template/web/template

# 安装依赖
npm install

# 开发调试
npm run debug

# 编译项目
npm run build

# 启动服务
npm start
```

## 📖 各模板说明

### Web 模板

基于 fastcar-core 和 koa 的 Web 项目模板，适用于构建 RESTful API 服务。

```bash
fastcar init web
```

### Static 模板

静态资源服务器模板，适用于提供静态文件访问服务。

```bash
fastcar init static
```

### RPC 模板

RPC 服务器模板，适用于构建微服务通信场景。

```bash
fastcar init rpc
```

### COS 模板

对象存储服务模板，支持文件上传、下载、压缩、直播转码等功能。

```bash
fastcar init cos
```

### Microservices 模板

微服务应用模板，包含 center、connector、chat、web 等多个服务模块。

```bash
fastcar init microservices
```

## 🏗️ 项目结构

所有模板遵循统一的目录结构：

```
<template-name>/
├── README.md              # 模板说明文档
├── LICENSE                # 许可证
├── package.json           # 模板配置
└── template/              # 实际模板内容
    ├── src/               # 源代码
    ├── resource/          # 配置文件
    ├── package.json       # 项目依赖
    ├── tsconfig.json      # TypeScript 配置
    └── ecosystem.config.yml # PM2 配置
```

## 📝 常用命令

| 命令 | 说明 |
|------|------|
| `npm install` | 安装依赖 |
| `npm run debug` | 开发调试模式 |
| `npm run build` | 编译项目 |
| `npm start` | 启动服务（PM2） |
| `npm stop` | 停止服务 |
| `npm run delete` | 删除 PM2 进程 |

## 🔧 环境要求

- Node.js >= 16
- TypeScript >= 5.0
- PM2 >= 5.0（可选，用于生产环境）

## 📚 核心依赖

- [@fastcar/core](https://www.npmjs.com/package/@fastcar/core) - 核心框架
- [@fastcar/koa](https://www.npmjs.com/package/@fastcar/koa) - Koa 集成
- [@fastcar/rpc](https://www.npmjs.com/package/@fastcar/rpc) - RPC 支持
- [@fastcar/server](https://www.npmjs.com/package/@fastcar/server) - 服务器支持
- [@fastcar/timer](https://www.npmjs.com/package/@fastcar/timer) - 定时器支持

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

## 📄 License

[MIT](./LICENSE)

---

Made with ❤️ by [william_zhong](https://github.com/williamDazhangyu)
