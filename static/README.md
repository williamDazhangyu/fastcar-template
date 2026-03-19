# @fastcar/template-static

基于 fastcar-core 和 koa 的静态资源服务器模板

## 简介

这是一个用于快速搭建静态资源服务器的模板，适用于需要提供静态文件访问的场景。

## 特性

- 🚀 基于 [fastcar-core](https://www.npmjs.com/package/@fastcar/core) 框架
- 📁 内置静态文件服务
- 📦 支持 TypeScript
- 🔄 支持 PM2 进程管理
- 📝 内置日志和错误处理

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

## 配置说明

配置文件位于 `resource/application.yml`：

```yaml
application:
  env: "prod"
  settings:
    koa:
      server:
        - { port: 80, host: "0.0.0.0" }
      koaStatic:
        { "public": "public" }  # 别名: 路径
```

## 项目结构

```
template/
├── src/
│   └── app.ts            # 应用入口
├── resource/
│   └── application.yml   # 配置文件
├── target/               # 编译输出
├── package.json
├── tsconfig.json
└── ecosystem.config.yml
```

## 依赖

- [@fastcar/core](https://www.npmjs.com/package/@fastcar/core) - 核心框架
- [@fastcar/koa](https://www.npmjs.com/package/@fastcar/koa) - Koa 集成
- [@fastcar/server](https://www.npmjs.com/package/@fastcar/server) - 服务器支持

## 相关模板

- [@fastcar/template-web](../web) - Web 项目模板
- [@fastcar/template-rpc](../rpc) - RPC 服务器模板
- [@fastcar/template-cos](../cos) - 对象存储服务模板
- [@fastcar/template-microservices](../microservices) - 微服务应用模板

## License

MIT
