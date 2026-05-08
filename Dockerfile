# 构建阶段：构建前端
FROM node:18-alpine AS builder

WORKDIR /app

# 先复制 package.json 安装依赖（利用缓存层）
COPY package*.json ./
RUN npm ci

# 复制完整项目并构建前端
COPY . .
RUN cd client && npm ci && npm run build

# 运行阶段：精简镜像
FROM node:18-alpine

WORKDIR /app

# 安装 sqlite3 编译依赖（alpine 需要）
RUN apk add --no-cache python3 make g++

# 只复制生产依赖
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/settings || exit 1

# 启动
CMD ["node", "server/index.js"]
