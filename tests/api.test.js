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
  await run('DELETE FROM players');
  await run("DELETE FROM rooms WHERE id <> 'default'");
  await run("UPDATE settings SET status='pending', chip_rate=0.05, updated_at=?", [Date.now()]);
  await run("UPDATE rooms SET status='pending', chip_rate=0.05, updated_at=? WHERE id='default'", [Date.now()]);
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
