process.env.TEST_DB = '1';

const http = require('http');
const request = require('supertest');
const { io: createClient } = require('socket.io-client');

let app;
let db;
let attachSocketServer;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

beforeAll(async () => {
  jest.resetModules();
  app = require('../server/index');
  db = require('../server/db');
  attachSocketServer = require('../server/socket').attachSocketServer;
});

beforeEach(async () => {
  await run('DELETE FROM pots');
  await run('DELETE FROM hand_actions');
  await run('DELETE FROM hand_players');
  await run('DELETE FROM hands');
  await run('DELETE FROM players');
  await run("DELETE FROM rooms WHERE id <> 'default'");
  await run("UPDATE settings SET status='pending', chip_rate=0.05, updated_at=?", [Date.now()]);
  await run("UPDATE rooms SET status='pending', chip_rate=0.05, game_mode='tournament', sb_amount=1, bb_amount=2, current_hand_id=NULL, updated_at=? WHERE id='default'", [Date.now()]);
  delete process.env.PUBLIC_URL;
  delete process.env.PUBLIC_PORT;
  delete process.env.PORT;
});

afterAll(async () => {
  await new Promise((resolve, reject) => {
    db.close(err => {
      if (err) return reject(err);
      resolve();
    });
  });
});

test('full game flow settles rankings correctly', async () => {
  const statusRes = await request(app).get('/api/status');
  expect(statusRes.status).toBe(200);
  expect(statusRes.body).toMatchObject({ status: 'pending', chip_rate: 0.05 });

  const rateRes = await request(app)
    .post('/api/rate')
    .send({ chip_rate: 5 });
  expect(rateRes.status).toBe(200);

  const startRes = await request(app).post('/api/start');
  expect(startRes.status).toBe(200);

  const playerOneRes = await request(app)
    .post('/api/players/admin-add')
    .send({ name: 'Alice', nickname: 'A1', initial_chips: 1000 });
  expect(playerOneRes.status).toBe(201);

  const rebuyRes = await request(app)
    .post(`/api/players/${playerOneRes.body.id}/add-chips`)
    .send({ amount: 300 });
  expect(rebuyRes.status).toBe(200);
  expect(rebuyRes.body).toMatchObject({
    nickname: 'A1',
    initial_chips: 1300,
    added_chips: 300
  });

  const playerTwoRes = await request(app)
    .post('/api/players/join')
    .send({ name: 'Bob', nickname: 'B1', initial_chips: 1000, device_id: 'dev-bob' });
  expect(playerTwoRes.status).toBe(201);

  const leaveRes = await request(app)
    .post(`/api/players/${playerTwoRes.body.id}/leave`)
    .send({ final_chips: 700, device_id: 'dev-bob' });
  expect(leaveRes.status).toBe(200);

  const endRes = await request(app).post('/api/end');
  expect(endRes.status).toBe(200);
  expect(endRes.body.status).toBe('settling');

  const submitFinalRes = await request(app)
    .post('/api/submit-final')
    .send({ nickname: 'A1', final_chips: 1600 });
  expect(submitFinalRes.status).toBe(200);
  expect(submitFinalRes.body).toMatchObject({
    nickname: 'A1',
    initial_chips: 1300,
    chip_net: 300,
    money_net: 1500,
    total_settlement: 6500
  });

  const settleRes = await request(app).post('/api/settle');
  expect(settleRes.status).toBe(200);
  expect(settleRes.body.rankings).toHaveLength(2);
  expect(settleRes.body.rankings[0]).toMatchObject({
    nickname: 'A1',
    net_profit: 1500,
    total_settlement: 6500
  });
  expect(settleRes.body.rankings[1]).toMatchObject({
    nickname: 'B1',
    net_profit: -1500
  });
});

test('allows adding players and chips while running but blocks chip additions after running', async () => {
  let response = await request(app).post('/api/start');
  expect(response.status).toBe(200);

  response = await request(app)
    .post('/api/players/admin-add')
    .send({ name: 'Alice', nickname: 'A1', initial_chips: 1000 });
  expect(response.status).toBe(201);

  const player = await get('SELECT id FROM players WHERE nickname=?', ['A1']);

  response = await request(app)
    .post(`/api/players/${player.id}/add-chips`)
    .send({ amount: 200 });
  expect(response.status).toBe(200);
  expect(response.body.initial_chips).toBe(1200);

  response = await request(app)
    .post('/api/rate')
    .send({ chip_rate: 3 });
  expect(response.status).toBe(409);

  response = await request(app)
    .post('/api/submit-final')
    .send({ nickname: 'A1', final_chips: 1200 });
  expect(response.status).toBe(409);

  response = await request(app).post('/api/end');
  expect(response.status).toBe(200);

  response = await request(app)
    .post(`/api/players/${player.id}/add-chips`)
    .send({ amount: 100 });
  expect(response.status).toBe(409);
});

test('manual final update no longer requires an admin secret', async () => {
  await request(app)
    .post('/api/players/admin-add')
    .send({ name: 'Alice', nickname: 'A1', initial_chips: 1000 });

  await request(app).post('/api/start');
  await request(app).post('/api/end');

  const player = await get('SELECT id FROM players WHERE nickname=?', ['A1']);

  const updateRes = await request(app)
    .post(`/api/players/${player.id}/final`)
    .send({ final_chips: 1200 });
  expect(updateRes.status).toBe(200);
  expect(updateRes.body).toMatchObject({
    final_chips: 1200,
    chip_net: 200,
    money_net: 10
  });
});

test('returns LAN network info and ignores host header port by default', async () => {
  const res = await request(app)
    .get('/api/network-info')
    .set('Host', 'localhost:5173');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(
    expect.objectContaining({
      ip: expect.any(String),
      port: expect.any(Number),
      url: expect.any(String)
    })
  );
  expect(res.body.port).toBe(3000);
  expect(res.body.url).toContain('/#/');
  expect(res.body.url).toContain(`:${res.body.port}`);
});

test('supports PUBLIC_PORT and PUBLIC_URL overrides for network info', async () => {
  process.env.PUBLIC_PORT = '4100';
  let res = await request(app).get('/api/network-info');
  expect(res.status).toBe(200);
  expect(res.body.port).toBe(4100);
  expect(res.body.url).toContain(':4100/#/');

  process.env.PUBLIC_URL = 'https://poker.example.com/#/';
  res = await request(app).get('/api/network-info');
  expect(res.status).toBe(200);
  expect(res.body.url).toBe('https://poker.example.com/#/');
  expect(res.body.port).toBeNull();
});

test('returns discovered LAN hosts list', async () => {
  const res = await request(app).get('/api/discovered-hosts');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('keeps legacy API mapped to the default room data model', async () => {
  let defaultRoom = await get('SELECT id, status, chip_rate FROM rooms WHERE id=?', ['default']);
  expect(defaultRoom).toMatchObject({ id: 'default', status: 'pending', chip_rate: 0.05 });

  await request(app)
    .post('/api/rate')
    .send({ chip_rate: 2 });
  defaultRoom = await get('SELECT status, chip_rate FROM rooms WHERE id=?', ['default']);
  expect(defaultRoom).toMatchObject({ status: 'pending', chip_rate: 2 });

  await request(app).post('/api/start');
  defaultRoom = await get('SELECT status, chip_rate FROM rooms WHERE id=?', ['default']);
  expect(defaultRoom).toMatchObject({ status: 'running', chip_rate: 2 });

  const playerRes = await request(app)
    .post('/api/players/join')
    .send({ name: 'Charlie', nickname: 'C1', initial_chips: 500, device_id: 'dev-charlie' });
  expect(playerRes.status).toBe(201);

  const player = await get('SELECT nickname, room_id FROM players WHERE id=?', [playerRes.body.id]);
  expect(player).toMatchObject({ nickname: 'C1', room_id: 'default' });
});

test('supports room-scoped APIs without leaking players into legacy default room', async () => {
  const roomOneRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Table One', chip_rate: 3, device_id: 'host-one' });
  expect(roomOneRes.status).toBe(201);
  const roomOne = roomOneRes.body;

  const roomTwoRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Table Two', chip_rate: 7, device_id: 'host-two' });
  expect(roomTwoRes.status).toBe(201);
  const roomTwo = roomTwoRes.body;

  let response = await request(app)
    .post(`/api/rooms/${roomOne.id}/start`)
    .send({ device_id: 'not-host' });
  expect(response.status).toBe(403);

  response = await request(app)
    .post(`/api/rooms/${roomOne.id}/start`)
    .send({ device_id: 'host-one' });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ status: 'running', chip_rate: 3 });

  response = await request(app)
    .post(`/api/rooms/${roomOne.id}/players/join`)
    .send({ name: 'Room One Player', nickname: 'R1', initial_chips: 100, device_id: 'device-r1' });
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({ nickname: 'R1', room_id: roomOne.id });

  response = await request(app)
    .post(`/api/rooms/${roomTwo.id}/players/admin-add`)
    .send({ name: 'Room Two Player', nickname: 'R1', initial_chips: 200, device_id: 'host-two' });
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({ nickname: 'R1', room_id: roomTwo.id });

  response = await request(app)
    .post(`/api/rooms/${roomOne.id}/players/admin-add`)
    .send({ name: 'Duplicate Player', nickname: 'R1', initial_chips: 300, device_id: 'host-one' });
  expect(response.status).toBe(409);

  const roomOnePlayers = await request(app).get(`/api/rooms/${roomOne.id}/players`);
  expect(roomOnePlayers.status).toBe(200);
  expect(roomOnePlayers.body.map(p => p.nickname)).toEqual(['R1']);

  const roomTwoPlayers = await request(app).get(`/api/rooms/${roomTwo.id}/players`);
  expect(roomTwoPlayers.status).toBe(200);
  expect(roomTwoPlayers.body.map(p => p.nickname)).toEqual(['R1']);

  const legacyPlayers = await request(app).get('/api/players');
  expect(legacyPlayers.status).toBe(200);
  expect(legacyPlayers.body).toEqual([]);
});

test('cash rooms default blinds to 1/2 when not provided', async () => {
  const roomRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Default Blinds Table', chip_rate: 1, device_id: 'default-blinds-host', game_mode: 'cash' });

  expect(roomRes.status).toBe(201);
  expect(roomRes.body).toMatchObject({
    game_mode: 'cash',
    sb_amount: 1,
    bb_amount: 2
  });
});

test('room-scoped full game flow settles without affecting another room', async () => {
  const roomOneRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Main Table', chip_rate: 4, device_id: 'host-main' });
  const roomTwoRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Side Table', chip_rate: 9, device_id: 'host-side' });
  const roomOne = roomOneRes.body;
  const roomTwo = roomTwoRes.body;

  await request(app)
    .post(`/api/rooms/${roomOne.id}/start`)
    .send({ device_id: 'host-main' });

  const aliceRes = await request(app)
    .post(`/api/rooms/${roomOne.id}/players/join`)
    .send({ name: 'Alice', nickname: 'Alice', initial_chips: 1000, device_id: 'alice-device' });
  const bobRes = await request(app)
    .post(`/api/rooms/${roomOne.id}/players/admin-add`)
    .send({ name: 'Bob', nickname: 'Bob', initial_chips: 800, device_id: 'host-main' });

  await request(app)
    .post(`/api/rooms/${roomOne.id}/players/${bobRes.body.id}/add-chips`)
    .send({ amount: 200, device_id: 'host-main' });

  await request(app)
    .post(`/api/rooms/${roomOne.id}/end`)
    .send({ device_id: 'host-main' });

  await request(app)
    .post(`/api/rooms/${roomOne.id}/submit-final`)
    .send({ nickname: 'Alice', final_chips: 1400, device_id: 'alice-device' });

  await request(app)
    .post(`/api/rooms/${roomOne.id}/players/${bobRes.body.id}/final`)
    .send({ final_chips: 600 });

  const settleRes = await request(app)
    .post(`/api/rooms/${roomOne.id}/settle`)
    .send({ device_id: 'host-main' });
  expect(settleRes.status).toBe(200);
  expect(settleRes.body.rankings).toHaveLength(2);
  expect(settleRes.body.rankings[0]).toMatchObject({
    id: aliceRes.body.id,
    nickname: 'Alice',
    net_profit: 1600
  });
  expect(settleRes.body.rankings[1]).toMatchObject({
    id: bobRes.body.id,
    nickname: 'Bob',
    net_profit: -1600
  });

  const roomOneStatus = await get('SELECT status FROM rooms WHERE id=?', [roomOne.id]);
  const roomTwoStatus = await get('SELECT status FROM rooms WHERE id=?', [roomTwo.id]);
  expect(roomOneStatus.status).toBe('completed');
  expect(roomTwoStatus.status).toBe('pending');

  const roomTwoPlayers = await request(app).get(`/api/rooms/${roomTwo.id}/players`);
  expect(roomTwoPlayers.body).toEqual([]);
});

test('room host permissions protect reset and delete actions', async () => {
  const roomRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Host Protected Table', chip_rate: 5, device_id: 'host-device' });
  expect(roomRes.status).toBe(201);
  const room = roomRes.body;

  let response = await request(app)
    .post(`/api/rooms/${room.id}/players/admin-add`)
    .send({ name: 'Protected Player', nickname: 'Protected', initial_chips: 100, device_id: 'host-device' });
  expect(response.status).toBe(201);

  response = await request(app)
    .post(`/api/rooms/${room.id}/reset`)
    .send({ device_id: 'other-device' });
  expect(response.status).toBe(403);

  response = await request(app)
    .delete(`/api/rooms/${room.id}`)
    .send({ device_id: 'other-device' });
  expect(response.status).toBe(403);

  response = await request(app)
    .post(`/api/rooms/${room.id}/reset`)
    .send({ device_id: 'host-device' });
  expect(response.status).toBe(200);

  const playersAfterReset = await request(app).get(`/api/rooms/${room.id}/players`);
  expect(playersAfterReset.body).toEqual([]);

  response = await request(app)
    .delete(`/api/rooms/${room.id}`)
    .send({ device_id: 'host-device' });
  expect(response.status).toBe(200);

  response = await request(app).get(`/api/rooms/${room.id}`);
  expect(response.status).toBe(404);
});

test('room reset clears completed cash-game history without breaking subsequent reads', async () => {
  const roomRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Reset Cash Table', chip_rate: 1, device_id: 'reset-host', game_mode: 'cash', sb_amount: 10, bb_amount: 20 });
  expect(roomRes.status).toBe(201);
  const roomId = roomRes.body.id;

  await request(app)
    .post(`/api/rooms/${roomId}/start`)
    .send({ device_id: 'reset-host' });

  const aliceRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Alice', nickname: 'Alice', initial_chips: 1000, device_id: 'reset-alice' });
  const bobRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Bob', nickname: 'Bob', initial_chips: 1000, device_id: 'reset-bob' });
  expect(aliceRes.status).toBe(201);
  expect(bobRes.status).toBe(201);

  const handRes = await request(app)
    .post(`/api/rooms/${roomId}/hands`)
    .send({ device_id: 'reset-host' });
  expect(handRes.status).toBe(201);

  let actionRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'call', amount: 10, device_id: 'reset-alice' });
  expect(actionRes.status).toBe(200);

  actionRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'check', device_id: 'reset-bob' });
  expect(actionRes.status).toBe(200);

  await request(app)
    .post(`/api/rooms/${roomId}/end`)
    .send({ device_id: 'reset-host' });

  await request(app)
    .post(`/api/rooms/${roomId}/players/${aliceRes.body.id}/final`)
    .send({ final_chips: 990 });

  await request(app)
    .post(`/api/rooms/${roomId}/players/${bobRes.body.id}/final`)
    .send({ final_chips: 1010 });

  const settleRes = await request(app)
    .post(`/api/rooms/${roomId}/settle`)
    .send({ device_id: 'reset-host' });
  expect(settleRes.status).toBe(200);
  expect(settleRes.body.rankings).toHaveLength(2);

  const resetRes = await request(app)
    .post(`/api/rooms/${roomId}/reset`)
    .send({ device_id: 'reset-host' });
  expect(resetRes.status).toBe(200);
  expect(resetRes.body).toMatchObject({ id: roomId, status: 'pending', current_hand_id: null });

  const roomAfterReset = await request(app).get(`/api/rooms/${roomId}`);
  expect(roomAfterReset.status).toBe(200);
  expect(roomAfterReset.body).toMatchObject({ id: roomId, status: 'pending', current_hand_id: null });

  const playersAfterReset = await request(app).get(`/api/rooms/${roomId}/players`);
  expect(playersAfterReset.status).toBe(200);
  expect(playersAfterReset.body).toEqual([]);

  const handsAfterReset = await request(app).get(`/api/rooms/${roomId}/hands`);
  expect(handsAfterReset.status).toBe(200);
  expect(handsAfterReset.body.hands).toEqual([]);
});

test('legacy reset clears default-room cash-game history and lets the default room start cleanly again', async () => {
  await run("UPDATE rooms SET game_mode='cash', sb_amount=10, bb_amount=20, current_hand_id=NULL, updated_at=? WHERE id='default'", [Date.now()]);

  let response = await request(app).post('/api/start');
  expect(response.status).toBe(200);

  const aliceRes = await request(app)
    .post('/api/players/join')
    .send({ name: 'Default Alice', nickname: 'DA', initial_chips: 1000, device_id: 'default-alice' });
  const bobRes = await request(app)
    .post('/api/players/join')
    .send({ name: 'Default Bob', nickname: 'DB', initial_chips: 1000, device_id: 'default-bob' });
  expect(aliceRes.status).toBe(201);
  expect(bobRes.status).toBe(201);

  const handRes = await request(app)
    .post('/api/rooms/default/hands')
    .send({ device_id: 'legacy-admin' });
  expect(handRes.status).toBe(201);

  response = await request(app)
    .post(`/api/rooms/default/hands/${handRes.body.handId}/actions`)
    .send({ action: 'call', amount: 10, device_id: 'default-alice' });
  expect(response.status).toBe(200);

  response = await request(app)
    .post(`/api/rooms/default/hands/${handRes.body.handId}/actions`)
    .send({ action: 'check', device_id: 'default-bob' });
  expect(response.status).toBe(200);

  response = await request(app)
    .post('/api/reset')
    .send({ confirm: 'RESET_ALL_PLAYERS' });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ status: 'pending', chip_rate: 0.05 });

  const defaultRoom = await get("SELECT status, chip_rate, current_hand_id FROM rooms WHERE id='default'");
  expect(defaultRoom).toMatchObject({ status: 'pending', chip_rate: 0.05, current_hand_id: null });

  const legacyPlayers = await request(app).get('/api/players');
  expect(legacyPlayers.status).toBe(200);
  expect(legacyPlayers.body).toEqual([]);

  const defaultHands = await request(app).get('/api/rooms/default/hands');
  expect(defaultHands.status).toBe(200);
  expect(defaultHands.body.hands).toEqual([]);

  response = await request(app).post('/api/start');
  expect(response.status).toBe(200);
});

test('deleting a room with an active hand clears related game state before hiding the room', async () => {
  const roomRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Delete Active Table', chip_rate: 1, device_id: 'delete-host', game_mode: 'cash', sb_amount: 10, bb_amount: 20 });
  expect(roomRes.status).toBe(201);
  const roomId = roomRes.body.id;

  let response = await request(app)
    .post(`/api/rooms/${roomId}/start`)
    .send({ device_id: 'delete-host' });
  expect(response.status).toBe(200);

  const aliceRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Delete Alice', nickname: 'DeleteAlice', initial_chips: 1000, device_id: 'delete-alice' });
  const bobRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Delete Bob', nickname: 'DeleteBob', initial_chips: 1000, device_id: 'delete-bob' });
  expect(aliceRes.status).toBe(201);
  expect(bobRes.status).toBe(201);

  const handRes = await request(app)
    .post(`/api/rooms/${roomId}/hands`)
    .send({ device_id: 'delete-host' });
  expect(handRes.status).toBe(201);

  response = await request(app)
    .delete(`/api/rooms/${roomId}`)
    .send({ device_id: 'delete-host' });
  expect(response.status).toBe(200);

  const deletedRoom = await get('SELECT deleted_at, current_hand_id, status FROM rooms WHERE id=?', [roomId]);
  expect(deletedRoom.deleted_at).not.toBeNull();
  expect(deletedRoom.current_hand_id).toBeNull();
  expect(deletedRoom.status).toBe('pending');

  const playerCount = await get('SELECT COUNT(*) AS count FROM players WHERE room_id=?', [roomId]);
  const handCount = await get('SELECT COUNT(*) AS count FROM hands WHERE room_id=?', [roomId]);
  expect(playerCount.count).toBe(0);
  expect(handCount.count).toBe(0);

  const handPlayerCount = await get(
    'SELECT COUNT(*) AS count FROM hand_players WHERE hand_id IN (SELECT id FROM hands WHERE room_id=?)',
    [roomId]
  );
  expect(handPlayerCount.count).toBe(0);

  const roomFetch = await request(app).get(`/api/rooms/${roomId}`);
  expect(roomFetch.status).toBe(404);
});

test('socket subscribers receive room updates after room API writes', async () => {
  const httpServer = http.createServer(app);
  const socketServer = attachSocketServer(httpServer);
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  const client = createClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    forceNew: true
  });

  try {
    await new Promise((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
    });

    const roomRes = await request(app)
      .post('/api/rooms')
      .send({ name: 'Socket Table', chip_rate: 2, device_id: 'socket-host' });
    const room = roomRes.body;

    const stateEvent = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for room:state')), 5000);
      client.on('room:state', payload => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
    client.emit('room:subscribe', { roomId: room.id });

    const startRes = await request(app)
      .post(`/api/rooms/${room.id}/start`)
      .send({ device_id: 'socket-host' });
    expect(startRes.status).toBe(200);

    const payload = await stateEvent;
    expect(payload).toMatchObject({ roomId: room.id, status: 'running' });
  } finally {
    client.disconnect();
    await new Promise(resolve => socketServer.close(resolve));
    await new Promise(resolve => httpServer.close(resolve));
  }
});

test('cash game start deals private hole cards and enforces turn order', async () => {
  const roomRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Cash Table', chip_rate: 1, device_id: 'cash-host', game_mode: 'cash', sb_amount: 10, bb_amount: 20 });
  expect(roomRes.status).toBe(201);
  const roomId = roomRes.body.id;

  let response = await request(app)
    .post(`/api/rooms/${roomId}/start`)
    .send({ device_id: 'cash-host' });
  expect(response.status).toBe(200);

  const aliceRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Alice', nickname: 'Alice', initial_chips: 1000, device_id: 'cash-alice' });
  const bobRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Bob', nickname: 'Bob', initial_chips: 1000, device_id: 'cash-bob' });
  expect(aliceRes.status).toBe(201);
  expect(bobRes.status).toBe(201);

  const handRes = await request(app)
    .post(`/api/rooms/${roomId}/hands`)
    .send({ device_id: 'cash-host' });
  expect(handRes.status).toBe(201);
  expect(handRes.body).toMatchObject({ status: 'preflop', currentSeat: 0 });

  const aliceView = await request(app)
    .get(`/api/rooms/${roomId}/hands/current`)
    .set('x-device-id', 'cash-alice');
  expect(aliceView.status).toBe(200);
  expect(aliceView.body.hand).toMatchObject({ current_round: 'preflop', current_seat: 0 });

  const aliceSelf = aliceView.body.players.find(p => p.player_id === aliceRes.body.id);
  const aliceBob = aliceView.body.players.find(p => p.player_id === bobRes.body.id);
  expect(JSON.parse(aliceSelf.hole_cards)).toHaveLength(2);
  expect(JSON.parse(aliceBob.hole_cards)).toEqual([]);

  response = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'check', device_id: 'cash-bob' });
  expect(response.status).toBe(403);
  expect(response.body.error).toContain('turn');
});

test('cash game fold awards full pot including folded player contribution', async () => {
  const roomRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Fold Pot Table', chip_rate: 1, device_id: 'fold-host', game_mode: 'cash', sb_amount: 10, bb_amount: 20 });
  expect(roomRes.status).toBe(201);
  const roomId = roomRes.body.id;

  await request(app)
    .post(`/api/rooms/${roomId}/start`)
    .send({ device_id: 'fold-host' });

  const aliceRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Alice', nickname: 'Alice', initial_chips: 1000, device_id: 'fold-alice' });
  const bobRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Bob', nickname: 'Bob', initial_chips: 1000, device_id: 'fold-bob' });
  expect(aliceRes.status).toBe(201);
  expect(bobRes.status).toBe(201);

  const handRes = await request(app)
    .post(`/api/rooms/${roomId}/hands`)
    .send({ device_id: 'fold-host' });
  expect(handRes.status).toBe(201);

  const foldRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'fold', device_id: 'fold-alice' });
  expect(foldRes.status).toBe(200);
  expect(foldRes.body.ended).toBe(true);
  expect(foldRes.body.result.winners).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ player_id: bobRes.body.id, amount: 30 })
    ])
  );

  const aliceAfter = await get('SELECT initial_chips FROM players WHERE id=?', [aliceRes.body.id]);
  const bobAfter = await get('SELECT initial_chips FROM players WHERE id=?', [bobRes.body.id]);
  expect(aliceAfter.initial_chips).toBe(990);
  expect(bobAfter.initial_chips).toBe(1010);

  const pots = await request(app).get(`/api/rooms/${roomId}/hands/${handRes.body.handId}`);
  expect(pots.status).toBe(200);
  const totalPot = pots.body.pots.reduce((sum, pot) => sum + pot.amount, 0);
  expect(totalPot).toBe(30);
});

test('cash game uses room blinds, timeout setting, and automatic timeout actions', async () => {
  const { processTimeoutAction } = require('../server/poker/game-controller');
  const roomRes = await request(app)
    .post('/api/rooms')
    .send({
      name: 'Timeout Table',
      chip_rate: 1,
      device_id: 'timeout-host',
      game_mode: 'cash',
      sb_amount: 15,
      bb_amount: 30,
      action_timeout_seconds: 12
    });
  expect(roomRes.status).toBe(201);
  const roomId = roomRes.body.id;

  await request(app)
    .post(`/api/rooms/${roomId}/start`)
    .send({ device_id: 'timeout-host' });

  const aliceRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Alice', nickname: 'Timeout Alice', initial_chips: 1000, device_id: 'timeout-alice' });
  const bobRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Bob', nickname: 'Timeout Bob', initial_chips: 1000, device_id: 'timeout-bob' });
  expect(aliceRes.status).toBe(201);
  expect(bobRes.status).toBe(201);

  const handRes = await request(app)
    .post(`/api/rooms/${roomId}/hands`)
    .send({ device_id: 'timeout-host' });
  expect(handRes.status).toBe(201);

  let state = await request(app)
    .get(`/api/rooms/${roomId}/hands/current`)
    .set('x-device-id', 'timeout-host');
  expect(state.body.hand).toMatchObject({
    small_blind_amount: 15,
    big_blind_amount: 30,
    action_timeout_seconds: 12
  });
  expect(state.body.hand.total_pot).toBe(45);

  let actionRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'call', amount: 15, device_id: 'timeout-alice' });
  expect(actionRes.status).toBe(200);

  actionRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'check', device_id: 'timeout-bob' });
  expect(actionRes.status).toBe(200);
  expect(actionRes.body.advanced).toBe(true);

  const timeoutCheck = await new Promise((resolve, reject) => {
    processTimeoutAction(handRes.body.handId, (err, result) => err ? reject(err) : resolve(result));
  });
  expect(timeoutCheck).toMatchObject({ timedOut: true, playerId: bobRes.body.id, action: 'check' });

  actionRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'raise', amount: 30, device_id: 'timeout-alice' });
  expect(actionRes.status).toBe(200);

  const timeoutFold = await new Promise((resolve, reject) => {
    processTimeoutAction(handRes.body.handId, (err, result) => err ? reject(err) : resolve(result));
  });
  expect(timeoutFold).toMatchObject({ timedOut: true, playerId: bobRes.body.id, action: 'fold', ended: true });
});

test('cash game supports nine-player preflop order and postflop first action', async () => {
  const roomRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Nine Max', chip_rate: 1, device_id: 'nine-host', game_mode: 'cash', sb_amount: 10, bb_amount: 20 });
  expect(roomRes.status).toBe(201);
  const roomId = roomRes.body.id;

  await request(app)
    .post(`/api/rooms/${roomId}/start`)
    .send({ device_id: 'nine-host' });

  for (let i = 0; i < 9; i++) {
    const playerRes = await request(app)
      .post(`/api/rooms/${roomId}/players/join`)
      .send({ name: `P${i}`, nickname: `P${i}`, initial_chips: 1000, device_id: `nine-p${i}` });
    expect(playerRes.status).toBe(201);
  }

  const handRes = await request(app)
    .post(`/api/rooms/${roomId}/hands`)
    .send({ device_id: 'nine-host' });
  expect(handRes.status).toBe(201);
  expect(handRes.body).toMatchObject({ status: 'preflop', currentSeat: 3 });

  for (const seat of [3, 4, 5, 6, 7, 8, 0]) {
    const callRes = await request(app)
      .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
      .send({ action: 'call', amount: 20, device_id: `nine-p${seat}` });
    expect(callRes.status).toBe(200);
    expect(callRes.body.nextSeat).toBe((seat + 1) % 9);
  }

  const sbCallRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'call', amount: 10, device_id: 'nine-p1' });
  expect(sbCallRes.status).toBe(200);
  expect(sbCallRes.body.nextSeat).toBe(2);

  const bbCheckRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'check', device_id: 'nine-p2' });
  expect(bbCheckRes.status).toBe(200);
  expect(bbCheckRes.body).toMatchObject({ advanced: true, newRound: 'flop' });

  const state = await request(app)
    .get(`/api/rooms/${roomId}/hands/current`)
    .set('x-device-id', 'nine-host');
  expect(state.status).toBe(200);
  expect(state.body.hand).toMatchObject({ current_round: 'flop', current_seat: 1 });
  expect(state.body.players).toHaveLength(9);
});

test('cash game raise amount is treated as target bet amount', async () => {
  const roomRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Raise Target', chip_rate: 1, device_id: 'raise-host', game_mode: 'cash', sb_amount: 10, bb_amount: 20 });
  expect(roomRes.status).toBe(201);
  const roomId = roomRes.body.id;

  await request(app)
    .post(`/api/rooms/${roomId}/start`)
    .send({ device_id: 'raise-host' });

  const aliceRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Alice', nickname: 'Raise Alice', initial_chips: 1000, device_id: 'raise-alice' });
  const bobRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Bob', nickname: 'Raise Bob', initial_chips: 1000, device_id: 'raise-bob' });
  expect(aliceRes.status).toBe(201);
  expect(bobRes.status).toBe(201);

  const handRes = await request(app)
    .post(`/api/rooms/${roomId}/hands`)
    .send({ device_id: 'raise-host' });
  expect(handRes.status).toBe(201);

  const raiseRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'raise', amount: 40, device_id: 'raise-alice' });
  expect(raiseRes.status).toBe(200);

  const aliceHand = await get('SELECT current_bet, current_chips, total_bet FROM hand_players WHERE hand_id=? AND player_id=?', [handRes.body.handId, aliceRes.body.id]);
  const alicePlayer = await get('SELECT initial_chips FROM players WHERE id=?', [aliceRes.body.id]);
  expect(aliceHand).toMatchObject({ current_bet: 40, current_chips: 960, total_bet: 40 });
  expect(alicePlayer.initial_chips).toBe(960);
});

test('cash game auto-runs board and reaches showdown when all remaining players are all-in', async () => {
  const roomRes = await request(app)
    .post('/api/rooms')
    .send({ name: 'Auto Runout', chip_rate: 1, device_id: 'runout-host', game_mode: 'cash', sb_amount: 10, bb_amount: 20 });
  expect(roomRes.status).toBe(201);
  const roomId = roomRes.body.id;

  await request(app)
    .post(`/api/rooms/${roomId}/start`)
    .send({ device_id: 'runout-host' });

  const aliceRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Alice', nickname: 'Alice', initial_chips: 25, device_id: 'runout-alice' });
  const bobRes = await request(app)
    .post(`/api/rooms/${roomId}/players/join`)
    .send({ name: 'Bob', nickname: 'Bob', initial_chips: 25, device_id: 'runout-bob' });
  expect(aliceRes.status).toBe(201);
  expect(bobRes.status).toBe(201);

  const handRes = await request(app)
    .post(`/api/rooms/${roomId}/hands`)
    .send({ device_id: 'runout-host' });
  expect(handRes.status).toBe(201);

  let actionRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'all-in', device_id: 'runout-alice' });
  expect(actionRes.status).toBe(200);
  expect(actionRes.body.nextSeat).toBe(1);

  actionRes = await request(app)
    .post(`/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`)
    .send({ action: 'call', amount: 5, device_id: 'runout-bob' });
  expect(actionRes.status).toBe(200);
  expect(actionRes.body).toMatchObject({ showdown: true, autoRunout: true });
  expect(actionRes.body.communityCards).toHaveLength(5);

  const room = await get('SELECT current_hand_id FROM rooms WHERE id=?', [roomId]);
  expect(room.current_hand_id).toBeNull();

  const handState = await request(app)
    .get(`/api/rooms/${roomId}/hands/${handRes.body.handId}`)
    .set('x-device-id', 'runout-host');
  expect(handState.status).toBe(200);
  expect(JSON.parse(handState.body.hand.community_cards)).toHaveLength(5);
  expect(handState.body.hand.status).toBe('showdown');

  const totalWon = (actionRes.body.result.winners || []).reduce((sum, winner) => sum + winner.amount, 0);
  expect(totalWon).toBe(50);
});
