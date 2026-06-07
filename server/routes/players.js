const express = require('express');
const router = express.Router();
const db = require('../db');
const { upload } = require('../multerConfig');
const { DEFAULT_ROOM_ID } = require('../constants');
const roomGame = require('../services/room-game-service');

function withDefaultRoom(res, callback) {
  roomGame.getRequiredRoom(DEFAULT_ROOM_ID, (err, room) => {
    if (err) return sendServiceError(res, err);
    callback(room);
  });
}

function sendServiceError(res, err) {
  res.status(err.status || 500).json({ error: err.message, currentStatus: err.currentStatus });
}

router.get('/players', (req, res) => {
  db.all('SELECT * FROM players WHERE room_id=? AND deleted_at IS NULL ORDER BY created_at', [DEFAULT_ROOM_ID], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/players/join', upload.single('avatar'), (req, res) => {
  withDefaultRoom(res, (room) => {
    const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : null;
    roomGame.createPlayer(
      room,
      req.body,
      { avatarPath, enforceDeviceUnique: true, requireRunning: true },
      (err, player) => {
        if (err) return sendServiceError(res, err);
        res.status(201).json(player);
      }
    );
  });
});

router.post('/players/admin-add', upload.single('avatar'), (req, res) => {
  withDefaultRoom(res, (room) => {
    const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : null;
    roomGame.createPlayer(
      room,
      { ...req.body, device_id: null },
      { avatarPath, allowedStatuses: ['pending', 'running', 'settling'] },
      (err, player) => {
        if (err) return sendServiceError(res, err);
        res.status(201).json(player);
      }
    );
  });
});

router.post('/players/:id/avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No avatar file uploaded' });
  }
  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  db.run('UPDATE players SET avatar = ? WHERE id = ? AND room_id=?', [avatarPath, req.params.id, DEFAULT_ROOM_ID], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM players WHERE id = ? AND room_id=?', [req.params.id, DEFAULT_ROOM_ID], (getErr, row) => {
      if (getErr) return res.status(500).json({ error: getErr.message });
      res.json(row);
    });
  });
});

router.post('/players/:id/add-chips', (req, res) => {
  const id = req.params.id;
  withDefaultRoom(res, (room) => {
    roomGame.addChips(room, id, req.body.amount, (err, player) => {
      if (err) return sendServiceError(res, err);
      res.json(player);
    });
  });
});

router.post('/players/:id/leave', (req, res) => {
  const { final_chips, device_id } = req.body;
  const id = req.params.id;

  withDefaultRoom(res, (room) => {
    roomGame.leavePlayer(room, id, final_chips, device_id, (err, player) => {
      if (err) return sendServiceError(res, err);
      res.json(player);
    });
  });
});

router.delete('/players/:id', (req, res) => {
  db.run('UPDATE players SET deleted_at = ? WHERE id=? AND room_id=?', [Date.now(), req.params.id, DEFAULT_ROOM_ID], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json({ message: 'Player removed' });
  });
});

module.exports = router;
