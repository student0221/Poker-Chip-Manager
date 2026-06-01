const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const db = require('../db');
const { upload } = require('../multerConfig');
const { DEFAULT_ROOM_ID } = require('../constants');
const { getDiscoveredRooms } = require('../discovery');
const { emitRoomEvent } = require('../socket');

const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function getDeviceId(req) {
  return req.body?.device_id || req.get('x-device-id') || null;
}

function generateRoomId() {
  let id = '';
  for (let i = 0; i < 6; i++) {
    const index = crypto.randomInt(ROOM_ID_ALPHABET.length);
    id += ROOM_ID_ALPHABET[index];
  }
  return id;
}

function getRoom(roomId, callback) {
  db.get('SELECT * FROM rooms WHERE id=? AND deleted_at IS NULL', [roomId], callback);
}

function requireRoom(req, res, callback) {
  getRoom(req.params.roomId, (err, room) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    callback(room);
  });
}

function requireHost(req, res, room, callback) {
  const deviceId = getDeviceId(req);
  if (!deviceId || deviceId !== room.host_device_id) {
    return res.status(403).json({ error: 'Only the room host can perform this action' });
  }
  callback();
}

function createRoomWithRetry(input, attempts, res) {
  const roomId = generateRoomId();
  db.run(
    `
      INSERT INTO rooms (id, name, host_device_id, chip_rate, status, game_mode, sb_amount, bb_amount)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `,
    [roomId, input.name, input.hostDeviceId, input.chipRate, input.gameMode, input.sb, input.bb],
    function(err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE') && attempts > 0) {
          return createRoomWithRetry(input, attempts - 1, res);
        }
        return res.status(500).json({ error: err.message });
      }
      getRoom(roomId, (getErr, room) => {
        if (getErr) return res.status(500).json({ error: getErr.message });
        res.status(201).json(room);
      });
    }
  );
}

function handlePlayerInsert(res, roomId, params, avatarPath) {
  const sql = avatarPath
    ? 'INSERT INTO players (room_id, name, nickname, initial_chips, device_id, avatar) VALUES (?, ?, ?, ?, ?, ?)'
    : 'INSERT INTO players (room_id, name, nickname, initial_chips, device_id) VALUES (?, ?, ?, ?, ?)';
  const values = avatarPath ? [roomId, ...params, avatarPath] : [roomId, ...params];

  db.run(sql, values, function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Nickname is already in use' });
      }
      return res.status(500).json({ error: err.message });
    }
    db.get('SELECT * FROM players WHERE id=? AND room_id=?', [this.lastID, roomId], (getErr, row) => {
      if (getErr) return res.status(500).json({ error: getErr.message });
      emitRoomEvent(roomId, 'players:changed', { player: row });
      res.status(201).json(row);
    });
  });
}

function enrichPlayer(player, chipRate) {
  const finalChips = player.final_chips ?? 0;
  return {
    ...player,
    total_settlement: player.initial_chips * chipRate,
    final_settlement: finalChips * chipRate
  };
}

router.post('/rooms', (req, res) => {
  const { name, chip_rate, device_id, game_mode, sb_amount, bb_amount } = req.body;
  const hostDeviceId = device_id || req.get('x-device-id');
  if (!hostDeviceId) {
    return res.status(400).json({ error: 'device_id is required to create a room' });
  }

  const chipRate = chip_rate === undefined ? 0.05 : Number(chip_rate);
  if (!Number.isFinite(chipRate) || chipRate <= 0) {
    return res.status(400).json({ error: 'Invalid chip_rate' });
  }

  const mode = game_mode === 'cash' ? 'cash' : 'tournament';
  const sb = sb_amount ? Number(sb_amount) : 10;
  const bb = bb_amount ? Number(bb_amount) : 20;

  createRoomWithRetry(
    {
      name: name && name.trim() ? name.trim() : 'Poker Room',
      hostDeviceId,
      chipRate,
      gameMode: mode,
      sb,
      bb
    },
    5,
    res
  );
});

router.get('/rooms', (req, res) => {
  db.all('SELECT * FROM rooms WHERE deleted_at IS NULL ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/discovered-hosts', (req, res) => {
  res.json(getDiscoveredRooms());
});

router.get('/rooms/:roomId', (req, res) => {
  requireRoom(req, res, (room) => res.json(room));
});

router.delete('/rooms/:roomId', (req, res) => {
  requireRoom(req, res, (room) => {
    if (room.id === DEFAULT_ROOM_ID) {
      return res.status(409).json({ error: 'Default room cannot be deleted' });
    }
    requireHost(req, res, room, () => {
      db.run('UPDATE rooms SET deleted_at=?, updated_at=? WHERE id=?', [Date.now(), Date.now(), room.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        emitRoomEvent(room.id, 'room:deleted');
        res.json({ message: 'Room deleted' });
      });
    });
  });
});

router.post('/rooms/:roomId/reset', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Clear hands data first to avoid FK constraints
        db.all('SELECT id FROM hands WHERE room_id=?', [room.id], (handsErr, hands) => {
          if (handsErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: handsErr.message });
          }
          const handIds = (hands || []).map(h => h.id);
          let step = 0;

          const cleanup = () => {
            step++;
            if (step < 5) return;

            db.run('DELETE FROM players WHERE room_id=?', [room.id], (playersErr) => {
              if (playersErr) { db.run('ROLLBACK'); return res.status(500).json({ error: playersErr.message }); }
              db.run("UPDATE rooms SET status='pending', current_hand_id=NULL, updated_at=? WHERE id=?", [Date.now(), room.id], (roomErr) => {
                if (roomErr) { db.run('ROLLBACK'); return res.status(500).json({ error: roomErr.message }); }
                db.run('COMMIT');
                getRoom(room.id, (getErr, nextRoom) => {
                  if (getErr) return res.status(500).json({ error: getErr.message });
                  emitRoomEvent(room.id, 'room:state', { room: nextRoom });
                  emitRoomEvent(room.id, 'players:changed');
                  res.json(nextRoom);
                });
              });
            });
          };

          if (handIds.length === 0) {
            step = 4;
            cleanup();
          } else {
            const placeholders = handIds.map(() => '?').join(',');
            db.run(`DELETE FROM pots WHERE hand_id IN (${placeholders})`, handIds, () => { step++; cleanup(); });
            db.run(`DELETE FROM hand_actions WHERE hand_id IN (${placeholders})`, handIds, () => { step++; cleanup(); });
            db.run(`DELETE FROM hand_players WHERE hand_id IN (${placeholders})`, handIds, () => { step++; cleanup(); });
            db.run(`DELETE FROM hands WHERE room_id=?`, [room.id], () => { step++; cleanup(); });
          }
        });
      });
    });
  });
});

router.get('/rooms/:roomId/status', (req, res) => {
  requireRoom(req, res, (room) => {
    res.json({ status: room.status, chip_rate: room.chip_rate });
  });
});

router.post('/rooms/:roomId/rate', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      const chipRate = Number(req.body.chip_rate);
      if (!Number.isFinite(chipRate) || chipRate <= 0) {
        return res.status(400).json({ error: 'Invalid chip_rate' });
      }
      if (room.status !== 'pending') {
        return res.status(409).json({ error: 'Chip rate can only be changed before the game starts', currentStatus: room.status });
      }
      db.run('UPDATE rooms SET chip_rate=?, updated_at=? WHERE id=?', [chipRate, Date.now(), room.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        getRoom(room.id, (getErr, nextRoom) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          emitRoomEvent(room.id, 'room:state', { room: nextRoom });
          res.json({ status: nextRoom.status, chip_rate: nextRoom.chip_rate });
        });
      });
    });
  });
});

router.post('/rooms/:roomId/mode', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      const { game_mode, sb_amount, bb_amount } = req.body;
      if (!game_mode || !['tournament', 'cash'].includes(game_mode)) {
        return res.status(400).json({ error: 'game_mode must be tournament or cash' });
      }
      if (room.status !== 'pending') {
        return res.status(409).json({ error: 'Game mode can only be changed before the game starts', currentStatus: room.status });
      }
      const updates = [game_mode, Date.now(), room.id];
      let sql = 'UPDATE rooms SET game_mode=?, updated_at=? WHERE id=?';
      if (sb_amount !== undefined) {
        sql = 'UPDATE rooms SET game_mode=?, sb_amount=?, updated_at=? WHERE id=?';
        updates.splice(1, 0, Number(sb_amount));
      }
      if (bb_amount !== undefined) {
        const idx = sql.indexOf('updated_at');
        sql = sql.slice(0, idx) + 'bb_amount=?, ' + sql.slice(idx);
        updates.splice(updates.length - 1, 0, Number(bb_amount));
      }
      db.run(sql, updates, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        getRoom(room.id, (getErr, nextRoom) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          emitRoomEvent(room.id, 'room:state', { room: nextRoom });
          res.json(nextRoom);
        });
      });
    });
  });
});

router.post('/rooms/:roomId/start', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      if (room.status !== 'pending') {
        return res.status(409).json({ error: 'Game can only start from pending status', currentStatus: room.status });
      }
      db.run("UPDATE rooms SET status='running', updated_at=? WHERE id=?", [Date.now(), room.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        emitRoomEvent(room.id, 'room:state', { status: 'running' });
        res.json({ status: 'running', chip_rate: room.chip_rate });
      });
    });
  });
});

router.post('/rooms/:roomId/end', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      if (room.status !== 'running') {
        return res.status(409).json({ error: 'Game can only end from running status', currentStatus: room.status });
      }
      db.run("UPDATE rooms SET status='settling', updated_at=? WHERE id=?", [Date.now(), room.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        emitRoomEvent(room.id, 'room:state', { status: 'settling' });
        res.json({ status: 'settling', chip_rate: room.chip_rate });
      });
    });
  });
});

router.get('/rooms/:roomId/players', (req, res) => {
  requireRoom(req, res, (room) => {
    db.all('SELECT * FROM players WHERE room_id=? AND deleted_at IS NULL ORDER BY created_at', [room.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
});

router.post('/rooms/:roomId/players/join', upload.single('avatar'), (req, res) => {
  requireRoom(req, res, (room) => {
    if (room.status !== 'running') {
      return res.status(403).json({ error: 'Game is not accepting player signups' });
    }

    const { name, nickname, initial_chips, device_id } = req.body;
    if (!nickname || initial_chips === undefined || initial_chips < 0) {
      return res.status(400).json({ error: 'Invalid player data' });
    }

    const realName = name && name.trim() ? name.trim() : nickname;
    const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : null;

    if (device_id) {
      db.get(
        'SELECT id FROM players WHERE room_id=? AND device_id=? AND left_at IS NULL AND deleted_at IS NULL',
        [room.id, device_id],
        (deviceErr, row) => {
          if (deviceErr) return res.status(500).json({ error: deviceErr.message });
          if (row) return res.status(409).json({ error: 'This device has already joined the current game' });
          handlePlayerInsert(res, room.id, [realName, nickname, initial_chips, device_id || null], avatarPath);
        }
      );
    } else {
      handlePlayerInsert(res, room.id, [realName, nickname, initial_chips, device_id || null], avatarPath);
    }
  });
});

router.post('/rooms/:roomId/players/admin-add', upload.single('avatar'), (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      if (!['pending', 'running', 'settling'].includes(room.status)) {
        return res.status(409).json({ error: 'Players can only be added before settlement completes', currentStatus: room.status });
      }

      const { name, nickname, initial_chips } = req.body;
      if (!nickname || initial_chips === undefined || initial_chips < 0) {
        return res.status(400).json({ error: 'Invalid player data' });
      }

      const realName = name && name.trim() ? name.trim() : nickname;
      const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : null;
      handlePlayerInsert(res, room.id, [realName, nickname, initial_chips, null], avatarPath);
    });
  });
});

router.post('/rooms/:roomId/players/:id/add-chips', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Invalid chip amount' });
      }
      if (room.status !== 'running') {
        return res.status(409).json({ error: 'Chips can only be added while the game is running', currentStatus: room.status });
      }

      db.get('SELECT * FROM players WHERE id=? AND room_id=? AND deleted_at IS NULL', [req.params.id, room.id], (err, player) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!player) return res.status(404).json({ error: 'Player not found' });
        if (player.left_at) return res.status(409).json({ error: 'Cannot add chips after the player has left' });

        const nextInitialChips = player.initial_chips + amount;
        db.run('UPDATE players SET initial_chips=? WHERE id=? AND room_id=?', [nextInitialChips, player.id, room.id], (runErr) => {
          if (runErr) return res.status(500).json({ error: runErr.message });
          db.get('SELECT * FROM players WHERE id=? AND room_id=?', [player.id, room.id], (getErr, row) => {
            if (getErr) return res.status(500).json({ error: getErr.message });
            emitRoomEvent(room.id, 'chips:added', { playerId: player.id, amount, total: row.initial_chips });
            emitRoomEvent(room.id, 'players:changed');
            res.json({ ...row, added_chips: amount, message: 'Chips added successfully' });
          });
        });
      });
    });
  });
});

router.post('/rooms/:roomId/players/:id/leave', (req, res) => {
  const { final_chips, device_id } = req.body;
  if (final_chips === undefined || final_chips < 0) {
    return res.status(400).json({ error: 'Invalid final_chips value' });
  }

  requireRoom(req, res, (room) => {
    if (room.status !== 'running') {
      return res.status(409).json({ error: 'Players can only leave while the game is running', currentStatus: room.status });
    }

    db.get('SELECT * FROM players WHERE id=? AND room_id=? AND deleted_at IS NULL', [req.params.id, room.id], (err, player) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!player) return res.status(404).json({ error: 'Player not found' });
      if (player.left_at) return res.status(409).json({ error: 'Player has already left' });
      if (device_id && player.device_id && player.device_id !== device_id) {
        return res.status(403).json({ error: 'Device mismatch for player leave request' });
      }

      db.run('UPDATE players SET final_chips=?, left_at=? WHERE id=? AND room_id=?', [final_chips, Date.now(), player.id, room.id], (runErr) => {
        if (runErr) return res.status(500).json({ error: runErr.message });
        db.get('SELECT * FROM players WHERE id=? AND room_id=?', [player.id, room.id], (getErr, row) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          emitRoomEvent(room.id, 'players:changed', { player: row });
          res.json({ ...row, message: 'Player leave recorded' });
        });
      });
    });
  });
});

router.post('/rooms/:roomId/players/:id/final', (req, res) => {
  const { final_chips } = req.body;

  requireRoom(req, res, (room) => {
    if (room.status !== 'settling') {
      return res.status(409).json({ error: 'Final chips can only be updated during settlement', currentStatus: room.status });
    }

    db.run('UPDATE players SET final_chips=? WHERE id=? AND room_id=?', [final_chips, req.params.id, room.id], function(runErr) {
      if (runErr) return res.status(500).json({ error: runErr.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Player not found' });
      db.get('SELECT id, name, nickname, initial_chips, final_chips, net_profit, avatar FROM players WHERE id=? AND room_id=?', [req.params.id, room.id], (getErr, row) => {
        if (getErr) return res.status(500).json({ error: getErr.message });
        const chip_net = row.final_chips - row.initial_chips;
        const money_net = chip_net * room.chip_rate;
        const total_settlement = row.initial_chips * room.chip_rate;
        emitRoomEvent(room.id, 'settle:progress');
        res.json({ ...row, chip_net, money_net, chip_rate: room.chip_rate, total_settlement });
      });
    });
  });
});

router.post('/rooms/:roomId/submit-final', (req, res) => {
  const { nickname, final_chips, device_id } = req.body;
  if (!nickname || final_chips === undefined) {
    return res.status(400).json({ error: 'Nickname and final chips are required' });
  }

  requireRoom(req, res, (room) => {
    if (room.status !== 'settling') {
      return res.status(409).json({ error: 'Final chips can only be submitted during settlement', currentStatus: room.status });
    }

    db.all('SELECT * FROM players WHERE room_id=? AND nickname=? AND deleted_at IS NULL', [room.id, nickname], (playersErr, players) => {
      if (playersErr) return res.status(500).json({ error: playersErr.message });
      if (!players || players.length === 0) return res.status(404).json({ error: 'Player not found for that nickname' });
      if (players.length > 1) return res.status(409).json({ error: 'Multiple players match this nickname, please use admin override' });

      const player = players[0];
      if (device_id && player.device_id && player.device_id !== device_id) {
        return res.status(403).json({ error: 'Device mismatch for final chip submission' });
      }

      db.run('UPDATE players SET final_chips=? WHERE id=? AND room_id=?', [final_chips, player.id, room.id], (runErr) => {
        if (runErr) return res.status(500).json({ error: runErr.message });
        const chip_net = final_chips - player.initial_chips;
        const money_net = chip_net * room.chip_rate;
        const total_settlement = player.initial_chips * room.chip_rate;
        emitRoomEvent(room.id, 'settle:progress');
        res.json({
          id: player.id,
          name: player.name,
          nickname: player.nickname,
          initial_chips: player.initial_chips,
          final_chips,
          chip_net,
          money_net,
          chip_rate: room.chip_rate,
          total_settlement
        });
      });
    });
  });
});

router.get('/rooms/:roomId/settle/progress', (req, res) => {
  requireRoom(req, res, (room) => {
    db.all('SELECT * FROM players WHERE room_id=? AND deleted_at IS NULL ORDER BY created_at', [room.id], (playersErr, players) => {
      if (playersErr) return res.status(500).json({ error: playersErr.message });

      const submitted = [];
      const pending = [];
      for (const player of players) {
        if (player.final_chips !== null) {
          const chip_net = player.final_chips - player.initial_chips;
          const money_net = chip_net * room.chip_rate;
          const total_settlement = player.initial_chips * room.chip_rate;
          submitted.push({ ...player, chip_net, money_net, total_settlement });
        } else {
          pending.push(player);
        }
      }
      submitted.sort((a, b) => b.money_net - a.money_net);
      res.json({
        chip_rate: room.chip_rate,
        total: players.length,
        submitted_count: submitted.length,
        pending_count: pending.length,
        submitted,
        pending
      });
    });
  });
});

router.post('/rooms/:roomId/settle', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      if (room.status !== 'settling') {
        return res.status(409).json({ error: 'Settlement is only available during settlement status', currentStatus: room.status });
      }

      db.all('SELECT * FROM players WHERE room_id=? AND deleted_at IS NULL', [room.id], (playersErr, players) => {
        if (playersErr) return res.status(500).json({ error: playersErr.message });

        let completed = 0;
        const total = players.length;
        const finishRoom = () => {
          db.run("UPDATE rooms SET status='completed', updated_at=? WHERE id=? AND status='settling'", [Date.now(), room.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(409).json({ error: 'Settlement has already been completed' });
            db.all(
              'SELECT id, name, nickname, initial_chips, final_chips, net_profit, avatar FROM players WHERE room_id=? AND deleted_at IS NULL ORDER BY net_profit DESC',
              [room.id],
              (rankErr, rankings) => {
                if (rankErr) return res.status(500).json({ error: rankErr.message });
                const enriched = (rankings || []).map((player) => enrichPlayer(player, room.chip_rate));
                emitRoomEvent(room.id, 'room:state', { status: 'completed' });
                emitRoomEvent(room.id, 'game:settled', { rankings: enriched });
                res.json({ rankings: enriched });
              }
            );
          });
        };

        if (total === 0) return finishRoom();

        for (const player of players) {
          const final = player.final_chips !== null ? player.final_chips : 0;
          const netProfit = (final - player.initial_chips) * room.chip_rate;
          db.run('UPDATE players SET final_chips=?, net_profit=? WHERE id=? AND room_id=?', [final, netProfit, player.id, room.id], (runErr) => {
            if (runErr) return res.status(500).json({ error: runErr.message });
            completed++;
            if (completed === total) finishRoom();
          });
        }
      });
    });
  });
});

router.get('/rooms/:roomId/rankings', (req, res) => {
  requireRoom(req, res, (room) => {
    db.all(
      'SELECT id, name, nickname, initial_chips, final_chips, net_profit, avatar FROM players WHERE room_id=? AND deleted_at IS NULL ORDER BY net_profit DESC',
      [room.id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ rankings: (rows || []).map((player) => enrichPlayer(player, room.chip_rate)) });
      }
    );
  });
});

module.exports = router;
