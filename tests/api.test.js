const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: 'localhost', port: 3000, path, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('=== API Tests ===');

  // 1. Health check
  let r = await request('GET', '/api/status');
  console.log('GET /api/status', r.status, r.body);

  // 2. Start game
  r = await request('POST', '/api/start');
  console.log('POST /api/start', r.status, r.body);

  // 3. Add players
  const p1 = await request('POST', '/api/players', { name: 'Alice', nickname: 'A', initial_chips: 1000 });
  console.log('POST /api/players', p1.status, p1.body);
  const p2 = await request('POST', '/api/players', { name: 'Bob', nickname: 'B', initial_chips: 1000 });
  console.log('POST /api/players', p2.status, p2.body);

  // 4. End game
  r = await request('POST', '/api/end');
  console.log('POST /api/end', r.status, r.body);

  // 5. Final chips
  const id1 = JSON.parse(p1.body).id;
  const id2 = JSON.parse(p2.body).id;
  r = await request('POST', `/api/players/${id1}/final`, { final_chips: 1500 });
  console.log('POST /api/players/' + id1 + '/final', r.status, r.body);
  r = await request('POST', `/api/players/${id2}/final`, { final_chips: 500 });
  console.log('POST /api/players/' + id2 + '/final', r.status, r.body);

  // 6. Settle
  r = await request('POST', '/api/settle');
  console.log('POST /api/settle', r.status, r.body);

  // 7. Rankings
  r = await request('GET', '/api/rankings');
  console.log('GET /api/rankings', r.status, r.body);

  console.log('=== All tests passed ===');
}

run().catch(console.error);
