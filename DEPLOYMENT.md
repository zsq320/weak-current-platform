# 弱电工程管理平台 - Docker 部署指南

本文档说明如何使用 Docker 和 Docker Compose 部署弱电工程管理平台。

## 前置要求

### 安装 Docker

**Windows (推荐 Docker Desktop)**
1. 访问 https://www.docker.com/products/docker-desktop/
2. 下载并安装 Docker Desktop for Windows
3. 启动 Docker Desktop，等待状态栏显示 "Docker is running"

**Linux (Ubuntu/Debian)**
```bash
# 更新软件包索引
sudo apt update

# 安装依赖
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# 添加 Docker 官方 GPG 密钥
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# 添加 Docker 仓库
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Docker Engine
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# 将当前用户添加到 docker 组（避免每次使用 sudo）
sudo usermod -aG docker $USER
```

**macOS**
```bash
# 使用 Homebrew 安装
brew install --cask docker

# 或者从官网下载
# https://www.docker.com/products/docker-desktop/
```

### 安装 Docker Compose

**Windows/Mac**: Docker Desktop 已内置 Docker Compose

**Linux**
```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 验证安装

```bash
docker --version
docker-compose --version
```

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/zsq320/weak-current-platform.git
cd weak-current-platform
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.docker .env

# 编辑配置文件（可选，使用默认配置也可运行）
# Windows: notepad .env
# Linux/Mac: nano .env
```

**重要**: 生产环境请务必修改以下配置：
- `JWT_SECRET`: 随机生成的密钥（至少32字符）
- `ENCRYPTION_KEY`: 随机生成的加密密钥（32字节）

生成随机密钥：
```bash
# 生成 JWT 密钥
openssl rand -hex 64

# 生成加密密钥
openssl rand -hex 32
```

### 3. 构建并启动

```bash
# 构建镜像并启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 4. 访问应用

打开浏览器访问：http://localhost:3000

默认账号：
- 用户名：`admin`
- 密码：`123456`

## 常用命令

### 容器管理

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f web

# 查看实时日志（仅最近100行）
docker-compose logs -f --tail=100 web
```

### 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build
```

### 进入容器

```bash
# 进入容器 shell
docker exec -it weak-platform sh

# 查看容器内文件
docker exec -it weak-platform ls -la /data
```

## 数据管理

### 数据持久化

数据存储在以下位置：
- `./data/` - SQLite 数据库文件
- `./config/` - 配置文件（可选）

### 备份数据

```bash
# 备份数据库
cp ./data/data.db ./data/data.db.backup.$(date +%Y%m%d)

# 或使用 tar 打包
tar -czvf backup_$(date +%Y%m%d).tar.gz ./data/

# 导出数据库（进入容器执行）
docker exec -it weak-platform sh -c "cp /data/data.db /tmp/backup.db"
docker cp weak-platform:/tmp/backup.db ./backup.db
```

### 恢复数据

```bash
# 停止服务
docker-compose down

# 恢复数据库
cp ./backup.db ./data/data.db

# 启动服务
docker-compose up -d
```

## 生产环境配置

### 1. 使用 Nginx 反向代理

创建 `nginx.conf`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. 使用 HTTPS

推荐使用 Let's Encrypt 获取免费 SSL 证书：

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 3. 配置防火墙

```bash
# 开放 80 和 443 端口
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 4. 设置开机自启

```bash
# 创建 systemd 服务
sudo nano /etc/systemd/system/weak-platform.service
```

```ini
[Unit]
Description=Weak Current Engineering Platform
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/weak-current-platform
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
# 启用服务
sudo systemctl enable weak-platform
sudo systemctl start weak-platform
```

## 故障排查

### 常见问题

**1. 端口被占用**
```
Error: Bind for 0.0.0.0:3000 failed: port is already allocated
```
解决：修改 `.env` 中的 `PORT` 或停止占用端口的程序

**2. 权限错误**
```
Permission denied: '/data'
```
解决：确保 `data` 目录有正确的读写权限
```bash
chmod -R 755 ./data
```

**3. 容器启动失败**
```bash
# 查看详细日志
docker-compose logs web

# 检查容器状态
docker-compose ps -a
```

**4. 数据库错误**
```
SQLITE_CANTOPEN: unable to open database file
```
解决：确保数据目录存在且可写
```bash
mkdir -p ./data
chmod 755 ./data
```

### 获取帮助

- GitHub Issues: https://github.com/zsq320/weak-current-platform/issues
- 文档: 查看项目 README.md

## 安全建议

1. **修改默认密码**: 首次登录后立即修改管理员密码
2. **使用强密钥**: JWT_SECRET 和 ENCRYPTION_KEY 使用随机生成的长密钥
3. **定期备份**: 设置自动备份策略
4. **更新镜像**: 定期更新到最新版本
5. **限制访问**: 使用防火墙限制数据库端口访问

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-05-31 | 初始 Docker 部署支持 |
