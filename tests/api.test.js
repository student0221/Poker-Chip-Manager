process.env.TEST_DB = '1';

const request = require('supertest');

let app;
let db;

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
});

beforeEach(async () => {
  await run('DELETE FROM players');
  await run("UPDATE settings SET status='pending', chip_rate=10, updated_at=?", [Date.now()]);
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
  expect(statusRes.body).toMatchObject({ status: 'pending', chip_rate: 10 });

  const rateRes = await request(app)
    .post('/api/rate')
    .send({ chip_rate: 5 });
  expect(rateRes.status).toBe(200);
  expect(rateRes.body).toMatchObject({ status: 'pending', chip_rate: 5 });

  const startRes = await request(app).post('/api/start');
  expect(startRes.status).toBe(200);
  expect(startRes.body.status).toBe('running');

  const playerOneRes = await request(app)
    .post('/api/players/admin-add')
    .send({ name: 'Alice', nickname: 'A1', initial_chips: 1000 });
  expect(playerOneRes.status).toBe(201);

  const playerTwoRes = await request(app)
    .post('/api/players/join')
    .send({ name: 'Bob', nickname: 'B1', initial_chips: 1000, device_id: 'dev-bob' });
  expect(playerTwoRes.status).toBe(201);

  const leaveRes = await request(app)
    .post(`/api/players/${playerTwoRes.body.id}/leave`)
    .send({ final_chips: 700, device_id: 'dev-bob' });
  expect(leaveRes.status).toBe(200);
  expect(leaveRes.body.final_chips).toBe(700);

  const endRes = await request(app).post('/api/end');
  expect(endRes.status).toBe(200);
  expect(endRes.body.status).toBe('settling');

  const submitFinalRes = await request(app)
    .post('/api/submit-final')
    .send({ nickname: 'A1', final_chips: 1300 });
  expect(submitFinalRes.status).toBe(200);
  expect(submitFinalRes.body).toMatchObject({
    nickname: 'A1',
    chip_net: 300,
    money_net: 1500,
    total_settlement: 5000
  });

  const settleRes = await request(app).post('/api/settle');
  expect(settleRes.status).toBe(200);
  expect(settleRes.body.rankings).toHaveLength(2);
  expect(settleRes.body.rankings[0]).toMatchObject({
    nickname: 'A1',
    net_profit: 1500
  });
  expect(settleRes.body.rankings[1]).toMatchObject({
    nickname: 'B1',
    net_profit: -1500
  });

  const storedSettings = await get('SELECT status, chip_rate FROM settings WHERE id=1');
  expect(storedSettings).toMatchObject({ status: 'completed', chip_rate: 5 });
});

test('rejects state-changing operations in the wrong game phase', async () => {
  let response = await request(app)
    .post('/api/players/admin-add')
    .send({ name: 'Alice', nickname: 'A1', initial_chips: 1000 });
  expect(response.status).toBe(201);

  response = await request(app).post('/api/start');
  expect(response.status).toBe(200);

  response = await request(app)
    .post('/api/rate')
    .send({ chip_rate: 3 });
  expect(response.status).toBe(409);

  response = await request(app)
    .post('/api/submit-final')
    .send({ nickname: 'A1', final_chips: 1000 });
  expect(response.status).toBe(409);

  response = await request(app).post('/api/start');
  expect(response.status).toBe(409);

  response = await request(app).post('/api/end');
  expect(response.status).toBe(200);

  response = await request(app)
    .post('/api/players/admin-add')
    .send({ name: 'Bob', nickname: 'B1', initial_chips: 800 });
  expect(response.status).toBe(409);
});

test('manual final update requires the backend default admin secret', async () => {
  await request(app)
    .post('/api/players/admin-add')
    .send({ name: 'Alice', nickname: 'A1', initial_chips: 1000 });

  await request(app).post('/api/start');
  await request(app).post('/api/end');

  const player = await get('SELECT id FROM players WHERE nickname=?', ['A1']);

  const deniedRes = await request(app)
    .post(`/api/players/${player.id}/final`)
    .send({ final_chips: 1200 });
  expect(deniedRes.status).toBe(403);

  const allowedRes = await request(app)
    .post(`/api/players/${player.id}/final`)
    .set('X-Admin-Secret', 'admin123')
    .send({ final_chips: 1200 });
  expect(allowedRes.status).toBe(200);
  expect(allowedRes.body).toMatchObject({
    final_chips: 1200,
    chip_net: 200,
    money_net: 2000
  });
});
