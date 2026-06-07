const express = require('express');
const router = express.Router();
const db = require('../db');
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

router.post('/players/:id/final', (req, res) => {
  const { final_chips, admin_secret } = req.body;
  const expected = process.env.ADMIN_SECRET || 'admin123';
  if (admin_secret !== expected) {
    return res.status(403).json({ error: 'Unauthorized: invalid admin_secret' });
  }
  const id = req.params.id;

  withDefaultRoom(res, (room) => {
    roomGame.updateFinalById(room, id, final_chips, (err, player) => {
      if (err) return sendServiceError(res, err);
      res.json(player);
    });
  });
});

router.post('/submit-final', (req, res) => {
  withDefaultRoom(res, (room) => {
    roomGame.submitFinalByNickname(room, req.body, (err, player) => {
      if (err) return sendServiceError(res, err);
      res.json(player);
    });
  });
});

router.get('/settle/progress', (req, res) => {
  withDefaultRoom(res, (room) => {
    roomGame.getSettleProgress(room, (err, progress) => {
      if (err) return sendServiceError(res, err);
      res.json(progress);
    });
  });
});

router.post('/settle', (req, res) => {
  withDefaultRoom(res, (room) => {
    roomGame.settleRoom(room, (err, result) => {
      if (err) return sendServiceError(res, err);
      db.run("UPDATE settings SET status='completed', updated_at=? WHERE id=1 AND status='settling'", [Date.now()], function(settingsErr) {
        if (settingsErr) return res.status(500).json({ error: settingsErr.message });
        if (this.changes === 0) {
          return res.status(409).json({ error: 'Settlement has already been completed' });
        }
        res.json(result);
      });
    });
  });
});

router.get('/rankings', (req, res) => {
  withDefaultRoom(res, (room) => {
    roomGame.getRankings(room, (err, result) => {
      if (err) return sendServiceError(res, err);
      res.json(result);
    });
  });
});

module.exports = router;
