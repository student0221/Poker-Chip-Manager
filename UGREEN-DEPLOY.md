# 绿联云部署指南

## 方案一：Docker 部署（推荐）

### 1. 构建 Docker 镜像

在 Poker-Chip-Manager 项目根目录创建 `Dockerfile`：

```dockerfile
# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# 复制项目文件
COPY . .

# 构建前端
RUN cd client && npm install && npm run build

# 运行阶段
FROM node:18-alpine

WORKDIR /app

# 复制后端依赖
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/data ./data

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "server/index.js"]
```

### 2. 构建并推送镜像

```bash
# 构建镜像
docker build -t poker-chip-manager:latest .

# 保存为 tar（方便上传到绿联云）
docker save poker-chip-manager:latest > poker-chip-manager.tar
```

### 3. 绿联云 Docker 部署步骤

1. **打开绿联云 Docker 管理器**
   - 登录绿联云客户端 → Docker → 镜像管理

2. **导入镜像**
   - 点击「导入镜像」→ 选择 `poker-chip-manager.tar`
   - 或者使用「镜像仓库」搜索（如果你推到了 Docker Hub）

3. **创建容器**
   - 镜像：选择 `poker-chip-manager`
   - 容器名称：`poker-chip-manager`
   - 端口映射：`3000:3000`（或自定义，如 `8080:3000`）
   - 存储卷映射：
     - 主机路径：`/volume1/docker/poker-chip-manager/data`
     - 容器路径：`/app/data`
   - 网络：桥接模式
   - 重启策略：总是重启

4. **启动容器**
   - 点击「创建并启动」

5. **访问**
   - 浏览器打开 `http://绿联云IP:3000`
   - 如端口映射为 8080:3000，则访问 `http://绿联云IP:8080`

---

## 方案二：直接 Node.js 运行

如果你的绿联云开启了 SSH：

```bash
# 1. SSH 登录绿联云
ssh username@绿联云IP

# 2. 安装 Node.js（如未安装）
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. 克隆项目
cd /volume1/docker
git clone https://github.com/student0221/Poker-Chip-Manager.git
cd Poker-Chip-Manager

# 4. 安装依赖
npm install
cd client && npm install && npm run build && cd ..

# 5. 启动
npm start

# 6. 后台运行（使用 pm2）
sudo npm install -g pm2
pm2 start server/index.js --name poker-chip
pm2 save
pm2 startup
```

---

## 方案三：Docker Compose（高级）

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  poker-chip-manager:
    build: .
    container_name: poker-chip-manager
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    restart: always
    environment:
      - NODE_ENV=production
      - PORT=3000
```

绿联云 Docker 管理器支持 Compose 部署：
1. 上传 `docker-compose.yml` 到绿联云
2. Docker → 项目 → 创建 → 选择文件
3. 启动项目

---

## 数据库持久化说明

SQLite 数据库文件在容器内的路径：`/app/data/poker.db`

通过存储卷映射，数据会保存在绿联云本地：
- 即使删除容器，数据不丢失
- 升级镜像时只需重新创建容器，数据自动继承

---

## 绿联云特定注意事项

1. **端口冲突**：绿联云自带服务可能占用 3000 端口，建议映射到 8080/8888 等
2. **防火墙**：绿联云安全中心需放行对应端口
3. **内网访问**：手机连接同一 WiFi，访问 `http://绿联云IP:端口`
4. **外网访问**：如需外网访问，配置绿联云「网络穿透」或 DDNS

---

## 快速验证

部署完成后：
1. 浏览器访问 `http://绿联云IP:端口`
2. 应看到管理后台界面
3. 创建比赛 → 扫码测试参与者页面
4. 检查 `data/poker.db` 是否生成
