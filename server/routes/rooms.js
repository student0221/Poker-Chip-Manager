const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const db = require('../db');
const { upload } = require('../multerConfig');
const { DEFAULT_ROOM_ID } = require('../constants');
const { getDiscoveredRooms } = require('../discovery');
const { emitRoomEvent } = require('../socket');
const { cleanupRoomData } = require('../room-cleanup');
const roomGame = require('../services/room-game-service');

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

function sendServiceError(res, err) {
  res.status(err.status || 500).json({ error: err.message, currentStatus: err.currentStatus });
}

function createRoomWithRetry(input, attempts, res) {
  const roomId = generateRoomId();
  db.run(
    `
      INSERT INTO rooms (id, name, host_device_id, chip_rate, status, game_mode, sb_amount, bb_amount, action_timeout_seconds)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `,
    [roomId, input.name, input.hostDeviceId, input.chipRate, input.gameMode, input.sb, input.bb, input.actionTimeoutSeconds],
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

router.post('/rooms', (req, res) => {
  const { name, chip_rate, device_id, game_mode, sb_amount, bb_amount, action_timeout_seconds } = req.body;
  const hostDeviceId = device_id || req.get('x-device-id');
  if (!hostDeviceId) {
    return res.status(400).json({ error: 'device_id is required to create a room' });
  }

  const chipRate = chip_rate === undefined ? 0.05 : Number(chip_rate);
  if (!Number.isFinite(chipRate) || chipRate <= 0) {
    return res.status(400).json({ error: 'Invalid chip_rate' });
  }

  const mode = game_mode === 'cash' ? 'cash' : 'tournament';
  const sb = sb_amount ? Number(sb_amount) : 1;
  const bb = bb_amount ? Number(bb_amount) : 2;
  const actionTimeoutSeconds = action_timeout_seconds ? Number(action_timeout_seconds) : 30;
  if (!Number.isFinite(actionTimeoutSeconds) || actionTimeoutSeconds < 5 || actionTimeoutSeconds > 300) {
    return res.status(400).json({ error: 'Action timeout must be between 5 and 300 seconds' });
  }

  createRoomWithRetry(
    {
      name: name && name.trim() ? name.trim() : 'Poker Room',
      hostDeviceId,
      chipRate,
      gameMode: mode,
      sb,
      bb,
      actionTimeoutSeconds
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
      cleanupRoomData(room.id, { status: 'pending', deleted_at: Date.now() }, (cleanupErr) => {
        if (cleanupErr) return res.status(500).json({ error: cleanupErr.message });
        emitRoomEvent(room.id, 'room:deleted');
        res.json({ message: 'Room deleted' });
      });
    });
  });
});

router.post('/rooms/:roomId/reset', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      cleanupRoomData(room.id, { status: 'pending' }, (cleanupErr) => {
        if (cleanupErr) return res.status(500).json({ error: cleanupErr.message });
        getRoom(room.id, (getErr, nextRoom) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          emitRoomEvent(room.id, 'room:state', { room: nextRoom });
          emitRoomEvent(room.id, 'players:changed');
          res.json(nextRoom);
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
    const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : null;
    roomGame.createPlayer(
      room,
      req.body,
      { avatarPath, enforceDeviceUnique: true, requireRunning: true },
      (err, player) => {
        if (err) return sendServiceError(res, err);
        emitRoomEvent(room.id, 'players:changed', { player });
        res.status(201).json(player);
      }
    );
  });
});

router.post('/rooms/:roomId/players/admin-add', upload.single('avatar'), (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : null;
      roomGame.createPlayer(
        room,
        { ...req.body, device_id: null },
        { avatarPath, allowedStatuses: ['pending', 'running', 'settling'] },
        (err, player) => {
          if (err) return sendServiceError(res, err);
          emitRoomEvent(room.id, 'players:changed', { player });
          res.status(201).json(player);
        }
      );
    });
  });
});

router.post('/rooms/:roomId/players/:id/add-chips', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      roomGame.addChips(room, req.params.id, req.body.amount, (err, player) => {
        if (err) return sendServiceError(res, err);
        emitRoomEvent(room.id, 'chips:added', { playerId: player.id, amount: player.added_chips, total: player.initial_chips });
        emitRoomEvent(room.id, 'players:changed');
        res.json(player);
      });
    });
  });
});

router.post('/rooms/:roomId/players/:id/leave', (req, res) => {
  const { final_chips, device_id } = req.body;

  requireRoom(req, res, (room) => {
    roomGame.leavePlayer(room, req.params.id, final_chips, device_id, (err, player) => {
      if (err) return sendServiceError(res, err);
      emitRoomEvent(room.id, 'players:changed', { player });
      res.json(player);
    });
  });
});

router.post('/rooms/:roomId/players/:id/final', (req, res) => {
  const { final_chips } = req.body;

  requireRoom(req, res, (room) => {
    roomGame.updateFinalById(room, req.params.id, final_chips, (err, player) => {
      if (err) return sendServiceError(res, err);
      emitRoomEvent(room.id, 'settle:progress');
      res.json(player);
    });
  });
});

router.post('/rooms/:roomId/submit-final', (req, res) => {
  requireRoom(req, res, (room) => {
    roomGame.submitFinalByNickname(room, req.body, (err, player) => {
      if (err) return sendServiceError(res, err);
      emitRoomEvent(room.id, 'settle:progress');
      res.json(player);
    });
  });
});

router.get('/rooms/:roomId/settle/progress', (req, res) => {
  requireRoom(req, res, (room) => {
    roomGame.getSettleProgress(room, (err, progress) => {
      if (err) return sendServiceError(res, err);
      res.json(progress);
    });
  });
});

router.post('/rooms/:roomId/settle', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      roomGame.settleRoom(room, (err, result) => {
        if (err) return sendServiceError(res, err);
        emitRoomEvent(room.id, 'room:state', { status: 'completed' });
        emitRoomEvent(room.id, 'game:settled', { rankings: result.rankings });
        res.json(result);
      });
    });
  });
});

router.get('/rooms/:roomId/rankings', (req, res) => {
  requireRoom(req, res, (room) => {
    roomGame.getRankings(room, (err, result) => {
      if (err) return sendServiceError(res, err);
      res.json(result);
    });
  });
});

module.exports = router;
