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
- **进度管理**：任务分解、里程碑跟踪、甘特图展示、逾期预警
- **投标系统**：多步表单投标、多维度评分、排序筛选、导出评分表
- **合同管理**：在线签订电子合同
- **消息通知**：站内信通知投标状态变更
- **管理后台**：用户管理、数据统计

### 企业级特性
- 统一错误处理中间件
- 请求参数验证
- 验证码频率限制
- 审计日志记录

### 安全特性
- **JWT 双令牌机制**：访问令牌(1小时) + 刷新令牌(7天)
- **令牌黑名单**：登出后令牌立即失效
- **敏感数据加密**：AES-256-GCM 加密存储身份证、银行卡
- **数据脱敏**：手机号、邮箱对外脱敏显示
- **登录限流**：防暴力破解（15分钟10次）
- **API 限流**：全局限流保护
- **安全 HTTP 头**：Helmet 防护
- **CORS 白名单**：限制跨域来源
- **SQL 注入防护**：参数化查询

## 技术栈

**前端**
- Vue 3 + Vite
- Element Plus
- Vue Router + Pinia
- ECharts

**后端**
- Node.js + Express
- SQLite (better-sqlite3)
- JWT 认证（双令牌机制）
- bcryptjs 密码加密
- AES-256-GCM 敏感数据加密
- helmet 安全头
- express-rate-limit 限流
- nodemailer 邮件发送

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 配置环境变量
cp .env.docker .env

# 2. 构建并启动
docker-compose up -d

# 3. 访问 http://localhost:3000
```

> 详细说明请查看 [DEPLOYMENT.md](DEPLOYMENT.md)

### 方式二：手动部署

#### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填写 SMTP 配置（用于发送邮箱验证码）
```

#### 2. 安装依赖

```bash
npm install
cd client && npm install
```

#### 3. 启动服务

```bash
# 开发模式（前后端同时启动）
npm run dev

# 或生产模式
npm start
```

#### 4. Windows 快速启动

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
- `POST /api/auth/refresh` - 刷新访问令牌
- `POST /api/auth/logout` - 登出（令牌失效）
- `GET /api/auth/me` - 获取当前用户信息（脱敏）
- `POST /api/auth/sensitive` - 保存敏感信息（加密）

### 项目任务管理
- `GET /api/projects/:id/tasks` - 获取项目任务列表
- `POST /api/projects/:id/tasks` - 创建任务（项目所有者）
- `PUT /api/projects/:id/tasks/:taskId` - 更新任务
- `DELETE /api/projects/:id/tasks/:taskId` - 删除任务

### 项目里程碑管理
- `GET /api/projects/:id/milestones` - 获取里程碑列表
- `POST /api/projects/:id/milestones` - 创建里程碑
- `PUT /api/projects/:id/milestones/:milestoneId` - 更新里程碑
- `DELETE /api/projects/:id/milestones/:milestoneId` - 删除里程碑
- `GET /api/auth/sensitive` - 获取敏感信息（脱敏）

## 部署说明

### 生产环境配置

1. **必须配置的环境变量**：
```bash
JWT_SECRET=<随机生成的64位字符串>
ENCRYPTION_KEY=<随机生成的32位字符串>
NODE_ENV=production
```

2. **生成密钥命令**：
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

3. **生成的用户数据脱敏示例**：
- 手机号：13812345678 → 138****5678
- 邮箱：zhangsan@example.com → z****n@example.com

## 许可证

[木兰宽松许可证，第2版](LICENSE) (Mulan PSL v2)

Copyright (c) 2026 ZSQ320
