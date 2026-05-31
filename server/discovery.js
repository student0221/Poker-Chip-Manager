const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const db = require('./db');
const { DEFAULT_ROOM_ID } = require('./constants');

const DISCOVERY_PORT = Number(process.env.DISCOVERY_PORT || 41234);
const HEARTBEAT_INTERVAL_MS = 3000;
const HEARTBEAT_TTL_MS = 10000;
const INSTANCE_ID = crypto.randomUUID();

const discoveredRooms = new Map();

let socket = null;
let heartbeatTimer = null;

function getLanIpv4() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const detail of entries) {
      const family = typeof detail.family === 'string' ? detail.family : String(detail.family);
      if (family === 'IPv4' && !detail.internal) {
        return detail.address;
      }
    }
  }
  return '127.0.0.1';
}

function startDiscovery(httpPort) {
  if (socket) return;

  socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('message', handleMessage);
  socket.on('error', (err) => {
    console.warn('[DISCOVERY] UDP discovery disabled:', err.message);
    stopDiscovery();
  });
  socket.bind(DISCOVERY_PORT, () => {
    socket.setBroadcast(true);
  });

  heartbeatTimer = setInterval(() => broadcastRooms(httpPort), HEARTBEAT_INTERVAL_MS);
  setTimeout(() => broadcastRooms(httpPort), 500);
}

function stopDiscovery() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
}

function broadcastRooms(httpPort) {
  if (!socket) return;
  db.all(
    'SELECT id, name, status, chip_rate FROM rooms WHERE deleted_at IS NULL AND id <> ?',
    [DEFAULT_ROOM_ID],
    (err, rooms) => {
      if (err || !rooms || rooms.length === 0) return;
      const hostIp = getLanIpv4();
      for (const room of rooms) {
        db.get(
          'SELECT COUNT(*) AS count FROM players WHERE room_id=? AND deleted_at IS NULL',
          [room.id],
          (countErr, row) => {
            if (countErr) return;
            const payload = Buffer.from(JSON.stringify({
              type: 'poker-room-heartbeat',
              instanceId: INSTANCE_ID,
              roomId: room.id,
              roomName: room.name,
              status: room.status,
              chipRate: room.chip_rate,
              players: row?.count || 0,
              hostIp,
              port: Number(httpPort),
              url: `http://${hostIp}:${httpPort}/#/room/${room.id}`,
              timestamp: Date.now()
            }));
            socket.send(payload, 0, payload.length, DISCOVERY_PORT, '255.255.255.255');
          }
        );
      }
    }
  );
}

function handleMessage(message, rinfo) {
  let payload;
  try {
    payload = JSON.parse(message.toString('utf8'));
  } catch {
    return;
  }

  if (payload.type !== 'poker-room-heartbeat' || payload.instanceId === INSTANCE_ID || !payload.roomId) {
    return;
  }

  discoveredRooms.set(`${payload.hostIp || rinfo.address}:${payload.port}:${payload.roomId}`, {
    roomId: payload.roomId,
    roomName: payload.roomName,
    status: payload.status,
    chipRate: payload.chipRate,
    players: payload.players,
    hostIp: payload.hostIp || rinfo.address,
    port: payload.port,
    url: payload.url || `http://${payload.hostIp || rinfo.address}:${payload.port}/#/room/${payload.roomId}`,
    lastSeen: Date.now()
  });
}

function getDiscoveredRooms() {
  const now = Date.now();
  for (const [key, room] of discoveredRooms.entries()) {
    if (now - room.lastSeen > HEARTBEAT_TTL_MS) {
      discoveredRooms.delete(key);
    }
  }
  return Array.from(discoveredRooms.values()).sort((a, b) => b.lastSeen - a.lastSeen);
}

module.exports = {
  getDiscoveredRooms,
  startDiscovery,
  stopDiscovery
};
