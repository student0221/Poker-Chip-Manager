const db = require('../db');

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function getRoom(roomId, callback) {
  db.get('SELECT * FROM rooms WHERE id=? AND deleted_at IS NULL', [roomId], callback);
}

function getRequiredRoom(roomId, callback) {
  getRoom(roomId, (err, room) => {
    if (err) return callback(err);
    if (!room) return callback(httpError(404, 'Room not found'));
    callback(null, room);
  });
}

function normalizePlayerInput(input = {}) {
  const nickname = input.nickname && String(input.nickname).trim();
  const initialChips = Number(input.initial_chips);
  if (!nickname || input.initial_chips === undefined || initialChips < 0 || !Number.isFinite(initialChips)) {
    return { error: httpError(400, 'Invalid player data') };
  }

  const name = input.name && String(input.name).trim() ? String(input.name).trim() : nickname;
  return {
    name,
    nickname,
    initialChips,
    deviceId: input.device_id || null
  };
}

function createPlayer(room, input, options, callback) {
  const normalized = normalizePlayerInput(input);
  if (normalized.error) return callback(normalized.error);

  if (options?.requireRunning && room.status !== 'running') {
    return callback(httpError(403, 'Game is not accepting player signups'));
  }
  if (options?.allowedStatuses && !options.allowedStatuses.includes(room.status)) {
    return callback(httpError(409, 'Players can only be added before settlement completes', { currentStatus: room.status }));
  }

  const insert = () => insertPlayer(room.id, normalized, options?.avatarPath || null, callback);

  if (!options?.enforceDeviceUnique || !normalized.deviceId) {
    return insert();
  }

  db.get(
    'SELECT id FROM players WHERE room_id=? AND device_id=? AND left_at IS NULL AND deleted_at IS NULL',
    [room.id, normalized.deviceId],
    (deviceErr, row) => {
      if (deviceErr) return callback(deviceErr);
      if (row) return callback(httpError(409, 'This device has already joined the current game'));
      insert();
    }
  );
}

function insertPlayer(roomId, player, avatarPath, callback) {
  const sql = avatarPath
    ? 'INSERT INTO players (room_id, name, nickname, initial_chips, device_id, avatar) VALUES (?, ?, ?, ?, ?, ?)'
    : 'INSERT INTO players (room_id, name, nickname, initial_chips, device_id) VALUES (?, ?, ?, ?, ?)';
  const values = avatarPath
    ? [roomId, player.name, player.nickname, player.initialChips, player.deviceId, avatarPath]
    : [roomId, player.name, player.nickname, player.initialChips, player.deviceId];

  db.run(sql, values, function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return callback(httpError(409, 'Nickname is already in use'));
      }
      return callback(err);
    }

    db.get('SELECT * FROM players WHERE id=? AND room_id=?', [this.lastID, roomId], callback);
  });
}

function addChips(room, playerId, amountInput, callback) {
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) {
    return callback(httpError(400, 'Invalid chip amount'));
  }
  if (room.status !== 'running') {
    return callback(httpError(409, 'Chips can only be added while the game is running', { currentStatus: room.status }));
  }

  db.get('SELECT * FROM players WHERE id=? AND room_id=? AND deleted_at IS NULL', [playerId, room.id], (err, player) => {
    if (err) return callback(err);
    if (!player) return callback(httpError(404, 'Player not found'));
    if (player.left_at) return callback(httpError(409, 'Cannot add chips after the player has left'));

    const nextInitialChips = player.initial_chips + amount;
    db.run('UPDATE players SET initial_chips=? WHERE id=? AND room_id=?', [nextInitialChips, player.id, room.id], (runErr) => {
      if (runErr) return callback(runErr);
      db.get('SELECT * FROM players WHERE id=? AND room_id=?', [player.id, room.id], (getErr, row) => {
        if (getErr) return callback(getErr);
        callback(null, { ...row, added_chips: amount, message: 'Chips added successfully' });
      });
    });
  });
}

function leavePlayer(room, playerId, finalChipsInput, deviceId, callback) {
  const finalChips = Number(finalChipsInput);
  if (finalChipsInput === undefined || finalChips < 0 || !Number.isFinite(finalChips)) {
    return callback(httpError(400, 'Invalid final_chips value'));
  }
  if (room.status !== 'running') {
    return callback(httpError(409, 'Players can only leave while the game is running', { currentStatus: room.status }));
  }

  db.get('SELECT * FROM players WHERE id=? AND room_id=? AND deleted_at IS NULL', [playerId, room.id], (err, player) => {
    if (err) return callback(err);
    if (!player) return callback(httpError(404, 'Player not found'));
    if (player.left_at) return callback(httpError(409, 'Player has already left'));
    if (deviceId && player.device_id && player.device_id !== deviceId) {
      return callback(httpError(403, 'Device mismatch for player leave request'));
    }

    db.run('UPDATE players SET final_chips=?, left_at=? WHERE id=? AND room_id=?', [finalChips, Date.now(), player.id, room.id], (runErr) => {
      if (runErr) return callback(runErr);
      db.get('SELECT * FROM players WHERE id=? AND room_id=?', [player.id, room.id], (getErr, row) => {
        if (getErr) return callback(getErr);
        callback(null, { ...row, message: 'Player leave recorded' });
      });
    });
  });
}

function updateFinalById(room, playerId, finalChipsInput, callback) {
  const finalChips = Number(finalChipsInput);
  if (finalChipsInput === undefined || !Number.isFinite(finalChips)) {
    return callback(httpError(400, 'Invalid final_chips value'));
  }
  if (room.status !== 'settling') {
    return callback(httpError(409, 'Final chips can only be updated during settlement', { currentStatus: room.status }));
  }

  db.run('UPDATE players SET final_chips=? WHERE id=? AND room_id=?', [finalChips, playerId, room.id], function(runErr) {
    if (runErr) return callback(runErr);
    if (this.changes === 0) return callback(httpError(404, 'Player not found'));
    db.get('SELECT id, name, nickname, initial_chips, final_chips, net_profit, avatar FROM players WHERE id=? AND room_id=?', [playerId, room.id], (getErr, row) => {
      if (getErr) return callback(getErr);
      callback(null, enrichSettlement(row, room.chip_rate));
    });
  });
}

function submitFinalByNickname(room, input, callback) {
  const nickname = input?.nickname && String(input.nickname).trim();
  const finalChips = Number(input?.final_chips);
  if (!nickname || input?.final_chips === undefined || !Number.isFinite(finalChips)) {
    return callback(httpError(400, 'Nickname and final chips are required'));
  }
  if (room.status !== 'settling') {
    return callback(httpError(409, 'Final chips can only be submitted during settlement', { currentStatus: room.status }));
  }

  db.all('SELECT * FROM players WHERE room_id=? AND nickname=? AND deleted_at IS NULL', [room.id, nickname], (playersErr, players) => {
    if (playersErr) return callback(playersErr);
    if (!players || players.length === 0) return callback(httpError(404, 'Player not found for that nickname'));
    if (players.length > 1) return callback(httpError(409, 'Multiple players match this nickname, please use admin override'));

    const player = players[0];
    if (input.device_id && player.device_id && player.device_id !== input.device_id) {
      return callback(httpError(403, 'Device mismatch for final chip submission'));
    }

    db.run('UPDATE players SET final_chips=? WHERE id=? AND room_id=?', [finalChips, player.id, room.id], (runErr) => {
      if (runErr) return callback(runErr);
      callback(null, enrichSettlement({ ...player, final_chips: finalChips }, room.chip_rate));
    });
  });
}

function getSettleProgress(room, callback) {
  db.all('SELECT * FROM players WHERE room_id=? AND deleted_at IS NULL ORDER BY created_at', [room.id], (playersErr, players) => {
    if (playersErr) return callback(playersErr);

    const submitted = [];
    const pending = [];
    for (const player of players) {
      if (player.final_chips !== null) {
        submitted.push(enrichSettlement(player, room.chip_rate));
      } else {
        pending.push(player);
      }
    }
    submitted.sort((a, b) => b.money_net - a.money_net);
    callback(null, {
      chip_rate: room.chip_rate,
      total: players.length,
      submitted_count: submitted.length,
      pending_count: pending.length,
      submitted,
      pending
    });
  });
}

function settleRoom(room, callback) {
  if (room.status !== 'settling') {
    return callback(httpError(409, 'Settlement is only available during settlement status', { currentStatus: room.status }));
  }

  db.all('SELECT * FROM players WHERE room_id=? AND deleted_at IS NULL', [room.id], (playersErr, players) => {
    if (playersErr) return callback(playersErr);

    let completed = 0;
    const total = players.length;
    const finishRoom = () => {
      db.run("UPDATE rooms SET status='completed', updated_at=? WHERE id=? AND status='settling'", [Date.now(), room.id], function(err) {
        if (err) return callback(err);
        if (this.changes === 0) return callback(httpError(409, 'Settlement has already been completed'));
        getRankings({ ...room, status: 'completed' }, callback);
      });
    };

    if (total === 0) return finishRoom();

    for (const player of players) {
      const final = player.final_chips !== null ? player.final_chips : 0;
      const netProfit = (final - player.initial_chips) * room.chip_rate;
      db.run('UPDATE players SET final_chips=?, net_profit=? WHERE id=? AND room_id=?', [final, netProfit, player.id, room.id], (runErr) => {
        if (runErr) return callback(runErr);
        completed++;
        if (completed === total) finishRoom();
      });
    }
  });
}

function getRankings(room, callback) {
  db.all(
    'SELECT id, name, nickname, initial_chips, final_chips, net_profit, avatar FROM players WHERE room_id=? AND deleted_at IS NULL ORDER BY net_profit DESC',
    [room.id],
    (err, rows) => {
      if (err) return callback(err);
      callback(null, { rankings: (rows || []).map((player) => enrichRanking(player, room.chip_rate)) });
    }
  );
}

function enrichSettlement(player, chipRate) {
  const chipNet = (player.final_chips ?? 0) - player.initial_chips;
  const moneyNet = chipNet * chipRate;
  return {
    ...player,
    chip_net: chipNet,
    money_net: moneyNet,
    chip_rate: chipRate,
    total_settlement: player.initial_chips * chipRate,
    final_settlement: (player.final_chips ?? 0) * chipRate
  };
}

function enrichRanking(player, chipRate) {
  return {
    ...player,
    total_settlement: player.initial_chips * chipRate,
    final_settlement: (player.final_chips ?? 0) * chipRate
  };
}

module.exports = {
  addChips,
  createPlayer,
  getRankings,
  getRequiredRoom,
  getRoom,
  getSettleProgress,
  leavePlayer,
  settleRoom,
  submitFinalByNickname,
  updateFinalById
};
