# 弱电工程管理平台

弱电工程管理平台是一个基于 Web 的工程管理系统，支持项目发布、工程师投标、合同管理等功能。

## 功能特性

### 用户系统
- **注册验证**：手机号 + 邮箱双重验证
- **多种登录**：账号密码登录 / 手机验证码登录
- **个人信息**：资料管理、实名认证
- **工程师认证**：资质认证审核

### 业务功能
- **项目管理**：发布工程项目、浏览项目详情
- **投标系统**：工程师可对项目进行投标
- **合同管理**：在线签订电子合同
- **消息通知**：系统消息推送
- **管理后台**：用户管理、数据统计

### 企业级特性
- 统一错误处理中间件
- 请求参数验证
- 验证码频率限制
- 审计日志记录

## 技术栈

**前端**
- Vue 3 + Vite
- Element Plus
- Vue Router + Pinia
- ECharts

**后端**
- Node.js + Express
- SQLite (better-sqlite3)
- JWT 认证
- bcryptjs 密码加密
- nodemailer 邮件发送

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填写 SMTP 配置（用于发送邮箱验证码）
```

### 2. 安装依赖

```bash
npm install
cd client && npm install
```

### 3. 启动服务

```bash
# 开发模式（前后端同时启动）
npm run dev

# 或生产模式
npm start
```

### 4. Windows 快速启动

双击 `start.bat` 即可

## 验证码说明

| 类型 | 说明 |
|------|------|
| 手机验证码 | 模拟发送，验证码输出到服务器控制台 |
| 邮箱验证码 | 通过 SMTP 发送真实邮件（需配置 .env） |

## 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | 123456 | 管理员 |
| zhangsan | 123456 | 普通用户 |
| engineer1 | 123456 | 工程师 |

## 局域网访问

启动后访问 `http://你的IP:3000` 即可局域网共享

## API 接口

### 验证码
- `POST /api/verification/phone` - 发送手机验证码
- `POST /api/verification/email` - 发送邮箱验证码
- `POST /api/verification/verify` - 验证验证码

### 认证
- `POST /api/auth/register` - 注册（需验证码）
- `POST /api/auth/login` - 账号密码登录
- `POST /api/auth/login/phone` - 手机验证码登录

## 许可证

[木兰宽松许可证，第2版](LICENSE) (Mulan PSL v2)

Copyright (c) 2026 ZSQ320
