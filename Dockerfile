# ============================================
# 弱电工程管理平台 - Docker 多阶段构建
# ============================================

# ---- 阶段1: 构建前端 ----
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

# 复制前端依赖配置
COPY client/package.json client/package-lock.json* ./

# 安装前端依赖
RUN npm ci --production=false

# 复制前端源码
COPY client/ ./

# 构建前端
RUN npm run build

# ---- 阶段2: 安装后端依赖 ----
FROM node:20-alpine AS backend-deps

WORKDIR /app

# 复制后端依赖配置
COPY package.json package-lock.json* ./

# 安装生产依赖
RUN npm ci --production

# ---- 阶段3: 运行镜像 ----
FROM node:20-alpine

# 设置镜像信息
LABEL maintainer="ZSQ320"
LABEL description="弱电工程管理平台"
LABEL version="1.0.0"

# 创建非 root 用户
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# 设置工作目录
WORKDIR /app

# 从构建阶段复制文件
COPY --from=backend-deps /app/node_modules ./node_modules
COPY --from=frontend-builder /app/client/dist ./client/dist

# 复制后端源码
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY package.json ./

# 创建数据/上传/备份目录（用于挂载卷；uploads 与 backups 必须持久化，容器重建不丢文件）
RUN mkdir -p /data /app/server/uploads /app/backups && chown -R appuser:appgroup /data /app/server/uploads /app/backups

# 设置环境变量
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/data.db \
    JWT_SECRET=change-me-in-production

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 切换到非 root 用户
USER appuser

# 启动服务
CMD ["node", "server/index.js"]
