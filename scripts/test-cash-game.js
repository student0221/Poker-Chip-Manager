const http = require('http');

const BASE = 'http://localhost:3001';
const HOST_DEVICE = 'test-host';
const PLAYER1_DEVICE = 'player1-dev';
const PLAYER2_DEVICE = 'player2-dev';

function req(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function run() {
  console.log('=== Test Cash Game ===\n');

  // 1. Create room
  const roomRes = await req('POST', '/api/rooms', {
    name: 'Cash Test',
    chip_rate: 0.05,
    game_mode: 'cash',
    sb_amount: 10,
    bb_amount: 20,
    device_id: HOST_DEVICE
  });
  console.log('Create room:', roomRes.status, roomRes.body.id || roomRes.body.error);
  if (roomRes.status !== 201) return;
  const roomId = roomRes.body.id;

  // 2. Start room
  const startRes = await req('POST', `/api/rooms/${roomId}/start`, { device_id: HOST_DEVICE });
  console.log('Start room:', startRes.status, startRes.body.status);

  // 3. Join players
  const p1 = await req('POST', `/api/rooms/${roomId}/players/join`, {
    nickname: 'Alice', initial_chips: 1000, device_id: PLAYER1_DEVICE
  });
  console.log('Join Alice:', p1.status, p1.body.nickname);

  const p2 = await req('POST', `/api/rooms/${roomId}/players/join`, {
    nickname: 'Bob', initial_chips: 1000, device_id: PLAYER2_DEVICE
  });
  console.log('Join Bob:', p2.status, p2.body.nickname);

  // 4. Start a hand
  const handRes = await req('POST', `/api/rooms/${roomId}/hands`, { device_id: HOST_DEVICE });
  console.log('Start hand:', handRes.status, handRes.body.handId ? `hand ${handRes.body.handId}` : handRes.body.error);
  if (handRes.status !== 201) return;

  // 5. Get current hand
  const current = await req('GET', `/api/rooms/${roomId}/hands/current`, null, { 'x-device-id': PLAYER1_DEVICE });
  console.log('Current hand:', current.status);
  if (current.body?.hand) {
    console.log('  Status:', current.body.hand.status);
    console.log('  Round:', current.body.hand.current_round);
    console.log('  Current seat:', current.body.hand.current_seat);
    console.log('  Community:', current.body.hand.community_cards);
    console.log('  Players:', current.body.players?.map(p => `${p.nickname}(seat${p.seat}):${p.current_chips} bet:${p.current_bet} folded:${p.is_folded} allin:${p.is_all_in}`));
    console.log('  My hole cards:', current.body.players?.find(p => p.player_id === p1.body.id)?.hole_cards);
  }

  // 6. Alice acts (call 10, since she's SB and already bet 10, needs 10 more to match BB)
  const aliceAct = await req('POST', `/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`, {
    action: 'call', amount: 10, device_id: PLAYER1_DEVICE
  });
  console.log('Alice call:', aliceAct.status, aliceAct.body);

  // 7. Get current hand again
  const current2 = await req('GET', `/api/rooms/${roomId}/hands/current`, null, { 'x-device-id': PLAYER2_DEVICE });
  console.log('Current hand after Alice:', current2.status);
  if (current2.body?.hand) {
    console.log('  Current seat:', current2.body.hand.current_seat);
    console.log('  Bob hole cards:', current2.body.players?.find(p => p.player_id === p2.body.id)?.hole_cards);
  }

  // 8. Bob acts (check - he's BB and already bet 20, current bet is 20, so he can check)
  const bobCheck = await req('POST', `/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`, {
    action: 'check', device_id: PLAYER2_DEVICE
  });
  console.log('Bob check:', bobCheck.status, bobCheck.body.error || 'OK');

  // 10. Get current hand - should be flop now
  const current3 = await req('GET', `/api/rooms/${roomId}/hands/current`, null, { 'x-device-id': HOST_DEVICE });
  console.log('Current hand after flop:', current3.status);
  if (current3.body?.hand) {
    console.log('  Round:', current3.body.hand.current_round);
    console.log('  Community:', current3.body.hand.community_cards);
    console.log('  Current seat:', current3.body.hand.current_seat);
  }

  // 11. Alice checks
  const aliceCheck = await req('POST', `/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`, {
    action: 'check', device_id: PLAYER1_DEVICE
  });
  console.log('Alice check:', aliceCheck.status, aliceCheck.body);

  // 12. Bob checks
  const bobCheck2 = await req('POST', `/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`, {
    action: 'check', device_id: PLAYER2_DEVICE
  });
  console.log('Bob check:', bobCheck2.status, bobCheck2.body);

  // 13. Should be turn now
  const current4 = await req('GET', `/api/rooms/${roomId}/hands/current`, null, { 'x-device-id': HOST_DEVICE });
  console.log('Current hand after turn:', current4.status);
  if (current4.body?.hand) {
    console.log('  Round:', current4.body.hand.current_round);
    console.log('  Community:', current4.body.hand.community_cards);
  }

  // Fast-forward: both check through flop, turn, river
  // Flop
  const flopAlice = await req('POST', `/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`, { action: 'check', device_id: PLAYER1_DEVICE });
  console.log('Flop Alice check:', flopAlice.status, flopAlice.body?.advanced ? '-> turn' : flopAlice.body);
  const flopBob = await req('POST', `/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`, { action: 'check', device_id: PLAYER2_DEVICE });
  console.log('Flop Bob check:', flopBob.status, flopBob.body?.advanced ? '-> turn' : flopBob.body);

  // Turn
  const turnAlice = await req('POST', `/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`, { action: 'check', device_id: PLAYER1_DEVICE });
  console.log('Turn Alice check:', turnAlice.status, turnAlice.body?.advanced ? '-> river' : turnAlice.body);
  const turnBob = await req('POST', `/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`, { action: 'check', device_id: PLAYER2_DEVICE });
  console.log('Turn Bob check:', turnBob.status, turnBob.body?.advanced ? '-> river' : turnBob.body);

  // River
  const riverAlice = await req('POST', `/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`, { action: 'check', device_id: PLAYER1_DEVICE });
  console.log('River Alice check:', riverAlice.status, riverAlice.body?.showdown ? '-> showdown' : riverAlice.body);
  const riverBob = await req('POST', `/api/rooms/${roomId}/hands/${handRes.body.handId}/actions`, { action: 'check', device_id: PLAYER2_DEVICE });
  console.log('River Bob check:', riverBob.status, riverBob.body?.showdown ? '-> showdown' : riverBob.body);

  // 14. Get final hand state
  const final = await req('GET', `/api/rooms/${roomId}/hands/${handRes.body.handId}`, null, { 'x-device-id': HOST_DEVICE });
  console.log('\nFinal hand:', final.status);
  if (final.body?.hand) {
    console.log('  Status:', final.body.hand.status);
    console.log('  Community:', final.body.hand.community_cards);
    console.log('  Players:', final.body.players?.map(p =>
      `${p.nickname}: cards=${p.hole_cards} rank=${p.hand_rank} result=${p.result}`
    ));
    console.log('  Pots:', final.body.pots);
  }

  // 15. Check player chips after hand
  const playersAfter = await req('GET', `/api/rooms/${roomId}/players`);
  console.log('\nPlayer chips after hand:');
  playersAfter.body.forEach(p => console.log(`  ${p.nickname}: ${p.initial_chips}`));

  console.log('\n=== Test Complete ===');
}

run().catch(console.error);
