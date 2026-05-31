# 弱电工程管理平台

弱电工程管理平台是一个基于 Web 的工程管理系统，支持项目发布、工程师投标、合同管理等功能。

## 功能特性

- **用户系统**：注册、登录、个人信息管理
- **项目管理**：发布工程项目、浏览项目详情
- **投标系统**：工程师可对项目进行投标
- **合同管理**：在线签订电子合同
- **消息通知**：系统消息推送
- **工程师认证**：资质认证审核
- **管理后台**：用户管理、数据统计

## 技术栈

**前端**
- Vue 3 + Vite
- Element Plus
- Vue Router
- Pinia
- ECharts

**后端**
- Node.js + Express
- SQLite (better-sqlite3)
- JWT 认证
- bcryptjs 密码加密

## 快速开始

### 安装依赖

```bash
npm install
cd client && npm install
```

### 启动开发模式

```bash
npm run dev
```

### 生产部署

双击 `start.bat` 即可启动（Windows）

或手动执行：

```bash
cd client && npm run build
cd .. && npm start
```

## 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | 123456 | 管理员 |
| zhangsan | 123456 | 普通用户 |
| engineer1 | 123456 | 工程师 |

## 局域网访问

启动后访问 `http://你的IP:3000` 即可局域网共享

## 许可证

[木兰宽松许可证，第2版](LICENSE) (Mulan PSL v2)

Copyright (c) 2026 ZSQ320
