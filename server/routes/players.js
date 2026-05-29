const express = require('express');
const router = express.Router();
const db = require('../db');

function getSettings(callback) {
  db.get('SELECT status FROM settings WHERE id=1', callback);
}

function handlePlayerInsert(res, params) {
  db.run(
    'INSERT INTO players (name, nickname, initial_chips, device_id) VALUES (?, ?, ?, ?)',
    params,
    function(err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed: players.nickname')) {
          return res.status(409).json({ error: 'Nickname is already in use' });
        }
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT * FROM players WHERE id=?', [this.lastID], (getErr, row) => {
        if (getErr) return res.status(500).json({ error: getErr.message });
        res.status(201).json(row);
      });
    }
  );
}

router.get('/players', (req, res) => {
  db.all('SELECT * FROM players WHERE deleted_at IS NULL ORDER BY created_at', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/players/join', (req, res) => {
  getSettings((err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!settings || settings.status !== 'running') {
      return res.status(403).json({ error: 'Game is not accepting player signups' });
    }

    const { name, nickname, initial_chips, device_id } = req.body;
    if (!nickname || initial_chips === undefined || initial_chips < 0) {
      return res.status(400).json({ error: 'Invalid player data' });
    }

    const realName = name && name.trim() ? name.trim() : nickname;

    if (device_id) {
      db.get('SELECT id FROM players WHERE device_id = ? AND left_at IS NULL AND deleted_at IS NULL', [device_id], (deviceErr, row) => {
        if (deviceErr) return res.status(500).json({ error: deviceErr.message });
        if (row) {
          return res.status(409).json({ error: 'This device has already joined the current game' });
        }
        handlePlayerInsert(res, [realName, nickname, initial_chips, device_id || null]);
      });
    } else {
      handlePlayerInsert(res, [realName, nickname, initial_chips, device_id || null]);
    }
  });
});

router.post('/players/admin-add', (req, res) => {
  getSettings((err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!settings || !['pending', 'running'].includes(settings.status)) {
      return res.status(409).json({ error: 'Players can only be added before settlement begins', currentStatus: settings?.status || null });
    }

    const { name, nickname, initial_chips } = req.body;
    if (!nickname || initial_chips === undefined || initial_chips < 0) {
      return res.status(400).json({ error: 'Invalid player data' });
    }

    const realName = name && name.trim() ? name.trim() : nickname;
    handlePlayerInsert(res, [realName, nickname, initial_chips, null]);
  });
});

router.post('/players/:id/leave', (req, res) => {
  const { final_chips, device_id } = req.body;
  const id = req.params.id;

  if (final_chips === undefined || final_chips < 0) {
    return res.status(400).json({ error: 'Invalid final_chips value' });
  }

  getSettings((settingsErr, settings) => {
    if (settingsErr) return res.status(500).json({ error: settingsErr.message });
    if (!settings || settings.status !== 'running') {
      return res.status(409).json({ error: 'Players can only leave while the game is running', currentStatus: settings?.status || null });
    }

    db.get('SELECT * FROM players WHERE id=? AND deleted_at IS NULL', [id], (err, player) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!player) return res.status(404).json({ error: 'Player not found' });
      if (player.left_at) return res.status(409).json({ error: 'Player has already left' });
      if (device_id && player.device_id && player.device_id !== device_id) {
        return res.status(403).json({ error: 'Device mismatch for player leave request' });
      }

      db.run(
        'UPDATE players SET final_chips=?, left_at=? WHERE id=?',
        [final_chips, Date.now(), id],
        function(runErr) {
          if (runErr) return res.status(500).json({ error: runErr.message });
          db.get('SELECT * FROM players WHERE id=?', [id], (getErr, row) => {
            if (getErr) return res.status(500).json({ error: getErr.message });
            res.json({
              ...row,
              message: 'Player leave recorded'
            });
          });
        }
      );
    });
  });
});

router.delete('/players/:id', (req, res) => {
  db.run('UPDATE players SET deleted_at = ? WHERE id=?', [Date.now(), req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json({ message: 'Player removed' });
  });
});

module.exports = router;
