# 局域网竞技模式设计方案

## 1. 目标与边界

将当前单实例比赛升级为支持同一局域网内多设备参与的竞技模式。推荐采用渐进式实现：先让玩家通过主机 IP/二维码稳定加入，再扩展多房间，最后加入实时同步和可选的局域网自动发现。

### 核心目标

- **局域网可访问**：主机启动服务后，手机/电脑可通过 `http://主机局域网IP:3000` 访问。
- **扫码加入**：主机页面显示访问地址和二维码，降低同 WiFi 玩家加入成本。
- **多房间隔离**：同一台主机可同时运行多个比赛房间，玩家、状态、结算互不干扰。
- **实时同步**：报名、离场、补筹码、比赛状态、结算结果在所有设备上同步。
- **房主控制**：创建房间的设备拥有开始、结束、清算、重置、解散等管理权限。

### 非目标或后置目标

- **普通浏览器不能直接监听 UDP/mDNS**：自动发现不能写成纯前端能力，应由 Node 后端或桌面端承担。
- **跨公网联机不是本阶段目标**：当前方案只覆盖同一 WiFi/局域网。
- **多主机自动发现是锦上添花**：第一版不依赖自动发现，优先保证 IP/二维码加入稳定可用。

---

## 2. 推荐阶段

### 兼容原则

新增局域网竞技模式必须默认不破坏现有单局功能。当前 `/#/` 玩家页、`/#/admin` 管理页、旧版 `/api/...` 路由和现有 API 测试都应继续可用。

实现上采用“双轨兼容”：

1. 旧功能继续走当前入口：`/#/`、`/#/admin`、`/api/status`、`/api/players`、`/api/start` 等。
2. 新功能使用新入口：`/#/lobby` 或 `/#/rooms`、`/#/room/:roomId`、`/api/rooms/:roomId/...`。
3. 后端维护一个 `DEFAULT_ROOM_ID`，旧 API 自动映射到默认房间。
4. 数据库迁移必须给历史玩家补默认 `room_id`，避免旧数据丢失或旧页面查不到数据。
5. 旧 API 在至少一个稳定版本内不删除，只在内部复用新房间服务逻辑。

这样可以先把底层改成房间模型，同时让原来的单局玩法继续像以前一样工作。

### 阶段 1：基础局域网 MVP

**目标**：不改核心数据模型，先让多台设备在同一 WiFi 下稳定访问同一场比赛。

**建议工作量**：0.5-1.5 天。

**改动内容**：

1. 保持后端监听 `0.0.0.0`，允许局域网访问。
2. 新增接口 `GET /api/network-info`，返回本机局域网 IP、端口、访问 URL。
3. 首页或管理页显示访问 URL 和二维码。
4. 增加局域网访问提示：同一 WiFi 下打开二维码或手动输入地址。
5. 验证手机端访问、头像上传、报名、离场、结算是否正常。

**说明**：当前后端已经监听 `0.0.0.0`，所以这个阶段主要是产品化入口，而不是重构。

### 阶段 2：多房间支持

**目标**：把当前全局单局游戏升级为房间作用域模型。

**建议工作量**：4-7 天。为了不影响原有功能，必须包含旧 API 兼容层和回归测试。

**改动内容**：

1. 新增 `rooms` 表，将 `status`、`chip_rate` 从全局 `settings` 迁移到房间。
2. `players` 增加 `room_id`，所有玩家查询、更新、删除都必须带房间条件。
3. 将昵称唯一约束从全局唯一改为同房间唯一。
4. 前端增加大厅页和房间页：`/#/` 显示创建/加入房间，`/#/room/:roomId` 进入房间。
5. 所有 API 增加房间作用域：`/api/rooms/:roomId/...`。
6. 用 `device_id` 判断房主权限，管理操作必须校验 `host_device_id`。
7. 保留原有页面和旧 API，旧 API 自动读写默认房间。

### 阶段 3：实时同步

**目标**：用 Socket.io 替代或减少轮询，让所有设备看到实时变化。

**建议工作量**：2-4 天。

**原则**：

- HTTP API 仍然是权威写入入口。
- Socket.io 主要负责广播“已发生的状态变化”。
- 客户端收到事件后可以局部更新，也可以重新拉取房间状态，避免前端状态漂移。

### 阶段 4：局域网发现

**目标**：在不影响主路径的前提下，让用户更容易找到局域网内的主机或房间。

**建议工作量**：2-5 天。

**推荐优先级**：

1. **手动 IP/二维码**：最可靠，第一版必须有。
2. **后端 UDP 广播/监听**：Node 服务负责发现，前端只读取后端发现结果。
3. **mDNS/Bonjour**：体验更好，但 Windows、防火墙、路由器兼容性需要实测。
4. **前端 IP 扫描**：不推荐作为主方案，浏览器并发请求大量局域网地址体验差，且易受 CORS、超时和安全策略影响。

---

## 3. 技术架构

```
┌─────────────────────────────────────────────┐
│              局域网（同一 WiFi）              │
│                                             │
│  玩家手机/电脑 ───────┐                      │
│  管理平板/电脑 ───────┼── HTTP + WebSocket   │
│  观战设备     ───────┘                      │
│                      │                      │
│              ┌───────┴────────┐             │
│              │ 主机 Node 服务  │             │
│              │ Express         │             │
│              │ Socket.io       │             │
│              │ SQLite          │             │
│              │ 可选 UDP/mDNS   │             │
│              └────────────────┘             │
└─────────────────────────────────────────────┘
```

---

## 4. 数据模型

### 4.1 rooms 表

```sql
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host_device_id TEXT NOT NULL,
  chip_rate REAL NOT NULL DEFAULT 0.05,
  status TEXT NOT NULL DEFAULT 'waiting',
  max_players INTEGER DEFAULT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  deleted_at INTEGER DEFAULT NULL
);
```

默认房间建议固定使用：

```sql
INSERT OR IGNORE INTO rooms (
  id,
  name,
  host_device_id,
  chip_rate,
  status
) VALUES (
  'default',
  '默认比赛',
  'legacy-admin',
  0.05,
  'waiting'
);
```

状态说明：

- `waiting`：等待开始，可报名，可调整筹码倍率。
- `running`：比赛进行中，可报名、补筹码、离场。
- `settling`：结算中，玩家提交最终筹码。
- `completed`：已清算，只读展示结果。

### 4.2 players 表改造

```sql
ALTER TABLE players ADD COLUMN room_id TEXT REFERENCES rooms(id);
```

需要同步调整：

- 所有 `SELECT/UPDATE/DELETE players` 都必须加 `room_id = ?`。
- 当前 `nickname TEXT NOT NULL UNIQUE` 不适合多房间，应迁移为同房间唯一。
- 历史数据迁移时应执行 `UPDATE players SET room_id = 'default' WHERE room_id IS NULL`。
- 推荐索引：

```sql
CREATE INDEX idx_players_room_id ON players(room_id);
CREATE UNIQUE INDEX idx_players_room_nickname
  ON players(room_id, nickname)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_players_room_device
  ON players(room_id, device_id)
  WHERE deleted_at IS NULL AND left_at IS NULL;
```

### 4.3 settings 表处理

当前 `settings` 是全局单行配置。多房间后建议二选一：

- **推荐**：将 `status`、`chip_rate` 迁移进 `rooms`，但旧 API 继续通过默认房间模拟原有 `settings` 行为。
- **兼容方案**：保留 `settings` 只作为旧单房间兼容，不参与新房间逻辑。

---

## 5. API 设计

### 5.1 房间 API

| 路由 | 说明 |
|------|------|
| `POST /api/rooms` | 创建房间，返回 `roomId` 和访问 URL |
| `GET /api/rooms` | 列出本主机活跃房间 |
| `GET /api/rooms/:roomId` | 获取房间详情 |
| `DELETE /api/rooms/:roomId` | 解散房间，仅房主 |
| `POST /api/rooms/:roomId/reset` | 重置房间，仅房主 |
| `GET /api/network-info` | 获取本机局域网访问地址和二维码所需 URL |

### 5.2 房间内 API

| 原路由 | 新路由 |
|--------|--------|
| `GET /api/status` | `GET /api/rooms/:roomId/status` |
| `POST /api/rate` | `POST /api/rooms/:roomId/rate` |
| `GET /api/players` | `GET /api/rooms/:roomId/players` |
| `POST /api/players/join` | `POST /api/rooms/:roomId/players/join` |
| `POST /api/players/admin-add` | `POST /api/rooms/:roomId/players/admin-add` |
| `POST /api/players/:id/add-chips` | `POST /api/rooms/:roomId/players/:id/add-chips` |
| `POST /api/players/:id/leave` | `POST /api/rooms/:roomId/players/:id/leave` |
| `POST /api/players/:id/final` | `POST /api/rooms/:roomId/players/:id/final` |
| `POST /api/submit-final` | `POST /api/rooms/:roomId/submit-final` |
| `GET /api/settle/progress` | `GET /api/rooms/:roomId/settle/progress` |
| `POST /api/start` | `POST /api/rooms/:roomId/start` |
| `POST /api/end` | `POST /api/rooms/:roomId/end` |
| `POST /api/settle` | `POST /api/rooms/:roomId/settle` |
| `GET /api/rankings` | `GET /api/rooms/:roomId/rankings` |

### 5.3 兼容策略

为了降低一次性重构风险，可以短期保留旧路由，并让旧路由指向一个默认房间。

建议顺序：

1. 先新增新路由，不删除旧路由。
2. 抽出共享 service 层，让旧路由和新路由调用同一套业务逻辑。
3. 旧路由内部使用 `DEFAULT_ROOM_ID = 'default'`。
4. 前端新增房间页时，不改动现有 `PlayerPage` 和 `AdminPage` 的入口。
5. 测试稳定后，再决定是否废弃旧路由。

必须继续通过的旧路由：

| 旧路由 | 兼容行为 |
|--------|----------|
| `GET /api/status` | 返回默认房间状态 |
| `POST /api/rate` | 修改默认房间筹码倍率 |
| `GET /api/players` | 返回默认房间玩家 |
| `POST /api/players/join` | 加入默认房间 |
| `POST /api/players/admin-add` | 管理员向默认房间加人 |
| `POST /api/start` | 开始默认房间 |
| `POST /api/end` | 结束默认房间 |
| `POST /api/settle` | 清算默认房间 |
| `POST /api/reset` | 重置默认房间 |

---

## 6. 实时通信设计

安装：

```bash
npm install socket.io socket.io-client
```

### 6.1 连接流程

1. 客户端进入 `/#/room/:roomId`。
2. 建立 Socket.io 连接。
3. 客户端发送 `room:subscribe`，携带 `roomId` 和 `deviceId`。
4. 服务端 `socket.join(roomId)`。
5. 服务端返回当前房间快照或提示客户端重新拉取 HTTP 状态。

### 6.2 事件设计

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `room:subscribe` | C -> S | 订阅房间事件 |
| `room:state` | S -> C | 房间状态变化 |
| `players:changed` | S -> C | 玩家列表变化，建议客户端重新拉取 |
| `chips:added` | S -> C | 补筹码成功 |
| `settle:progress` | S -> C | 最终筹码提交进度变化 |
| `game:settled` | S -> C | 清算完成，携带 rankings |
| `room:deleted` | S -> C | 房间已解散 |

### 6.3 写入原则

不建议让 `chips:add`、`game:start` 等 Socket 事件直接写数据库。推荐流程：

```
客户端调用 HTTP API
  -> 服务端校验权限和状态
  -> 数据库写入成功
  -> 服务端向 roomId 广播 Socket 事件
  -> 客户端刷新局部状态或重新拉取房间快照
```

---

## 7. 局域网发现方案

### 7.1 第一版：IP + 二维码

主机提供访问 URL：

```json
{
  "hostIp": "192.168.1.100",
  "port": 3000,
  "url": "http://192.168.1.100:3000/#/room/A3B9K2"
}
```

前端使用 `qrcode` 生成二维码。这个方案不依赖 UDP、mDNS、防火墙组播规则，最适合作为主路径。

### 7.2 可选：Node 后端 UDP 广播

主机 Node 服务定时广播：

```json
{
  "type": "poker-room-heartbeat",
  "roomId": "A3B9K2",
  "roomName": "张三的比赛",
  "status": "waiting",
  "players": 3,
  "hostIp": "192.168.1.100",
  "port": 3000
}
```

注意：监听 UDP 的也应是 Node 服务，不是浏览器页面。浏览器通过 `GET /api/discovered-hosts` 读取后端发现结果。

### 7.3 可选：mDNS/Bonjour

mDNS 适合更自然的服务发现，但兼容性依赖系统网络设置、防火墙和路由器。建议作为增强功能，不阻塞核心流程。

---

## 8. 前端设计

### 8.1 大厅页

路径：`/#/`

能力：

- 创建新房间。
- 输入房间码或访问链接加入。
- 显示本机作为主机时的局域网访问地址。
- 可选显示后端发现到的局域网房间。

### 8.2 房间页

路径：`/#/room/:roomId`

能力：

- 显示房间名、房间码、状态、筹码倍率。
- 显示“邀请玩家”的二维码和访问链接。
- 玩家报名、离场、提交最终筹码。
- 房主可开始、结束、补筹码、清算、重置、解散。
- Socket 事件驱动刷新玩家列表和结算进度。

### 8.3 管理入口

可以保留 `/#/admin`，但建议最终收敛为房间内的房主管理模式：

- 普通玩家访问房间页只显示玩家能力。
- 房主设备访问同一房间页时显示管理能力。

---

## 9. 数据流

### 9.1 创建房间

```
用户点击创建房间
  -> POST /api/rooms { name, chip_rate, device_id }
  -> 插入 rooms
  -> 返回 roomId
  -> 前端跳转 /#/room/:roomId
  -> 展示邀请二维码
```

### 9.2 玩家报名

```
玩家扫码进入房间
  -> 输入昵称、初始筹码、头像
  -> POST /api/rooms/:roomId/players/join
  -> 服务端校验房间状态和同房间昵称唯一
  -> 插入 players
  -> 广播 players:changed
```

### 9.3 补筹码

```
房主点击补筹码
  -> POST /api/rooms/:roomId/players/:id/add-chips
  -> 校验房主 device_id 和 running 状态
  -> 更新 initial_chips
  -> 广播 chips:added 和 players:changed
```

### 9.4 清算

```
房主点击结束比赛
  -> POST /api/rooms/:roomId/end
  -> 房间进入 settling
  -> 玩家提交最终筹码
  -> 房主点击执行清算
  -> POST /api/rooms/:roomId/settle
  -> 事务批量更新 final_chips/net_profit
  -> 房间进入 completed
  -> 广播 game:settled
```

---

## 10. 数据库与并发

### 10.1 SQLite 设置

建议初始化数据库时启用：

```javascript
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA busy_timeout = 5000');
db.run('PRAGMA foreign_keys = ON');
```

### 10.2 事务

结算、重置、解散房间等批量操作必须使用事务，避免部分玩家已更新、房间状态未更新的半完成状态。

### 10.3 并发预期

局域网牌局通常是 3-20 人，SQLite 足够。若未来要支持大量并发房间或公网部署，再考虑 PostgreSQL。

---

## 11. 权限与安全

### 11.1 device_id

当前项目已有 `device_id` 概念，可以继续使用，但要明确它只是轻量权限标识，不是强认证。

建议：

- 创建房间时记录 `host_device_id`。
- 管理操作必须携带 `device_id` 并与房间房主匹配。
- 玩家离场、提交最终筹码时，若玩家记录有 `device_id`，必须匹配。

### 11.2 房主转移

房主断线转移不建议第一版实现。因为普通 Web 很难可靠判断“断线”和“只是后台休眠”。推荐后置：

- 第一版允许显示房主恢复链接或房主设备重新进入继续管理。
- 后续可增加“房主转移码”或“管理员 PIN”。

---

## 12. 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| Windows 防火墙阻止 3000 端口 | 高 | 第一版展示排查提示；提供端口检测说明 |
| 手机和电脑不在同一网段 | 高 | 页面提示必须连接同一 WiFi，避免访客网络隔离 |
| 浏览器不能 UDP/mDNS 发现 | 高 | 自动发现放到 Node 后端；主路径使用 IP/二维码 |
| 多房间改造遗漏 room_id | 高 | 所有玩家 SQL 必须 code review；增加 API 测试覆盖 |
| 全局 nickname 唯一阻塞多房间 | 高 | 迁移为 `(room_id, nickname)` 唯一 |
| Socket 状态漂移 | 中 | Socket 只做通知，关键状态通过 HTTP 重新拉取 |
| SQLite 写入锁 | 中 | WAL + busy_timeout + 事务；必要时串行化关键写入 |
| 房主断线 | 中 | 第一版不自动转移；后续增加管理员 PIN 或转移机制 |

---

## 13. 验收标准

### 兼容验收

- [ ] 原有 `/#/` 玩家页仍可完成报名、离场、提交最终筹码。
- [ ] 原有 `/#/admin` 管理页仍可开始、结束、补筹码、清算、重置。
- [ ] 现有 `tests/api.test.js` 不需要大改即可继续通过。
- [ ] 旧 API 和新房间 API 同时存在，不互相覆盖。
- [ ] 历史数据库升级后，旧玩家数据仍能在默认房间中看到。

### 阶段 1

- [ ] 同一 WiFi 下，至少 3 台设备可通过二维码或 IP 访问主机。
- [ ] 手机端可完成报名、离场、提交最终筹码。
- [ ] 管理端可开始、结束、清算一场比赛。
- [ ] 页面能清楚展示局域网访问地址和二维码。

### 阶段 2

- [ ] 可创建 2 个以上房间。
- [ ] 不同房间玩家列表、比赛状态、结算结果互不影响。
- [ ] 同一昵称可出现在不同房间，但不能在同一房间重复。
- [ ] 非房主设备不能执行开始、结束、清算、重置、解散。

### 阶段 3

- [ ] 报名、离场、补筹码、状态变化能在 500ms 内同步到其他设备。
- [ ] 清算完成后所有设备能看到一致 rankings。
- [ ] Socket 断开重连后，客户端能重新拉取最新房间状态。

### 阶段 4

- [ ] 后端可发现同局域网内其他主机广播的房间。
- [ ] 自动发现失败时，IP/二维码加入仍然可用。
