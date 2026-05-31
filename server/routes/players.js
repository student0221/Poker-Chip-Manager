const express = require('express');
const router = express.Router();
const db = require('../db');
const { upload } = require('../multerConfig');

function getSettings(callback) {
  db.get('SELECT status FROM settings WHERE id=1', callback);
}

function handlePlayerInsert(res, params, avatarPath) {
  const sql = avatarPath
    ? 'INSERT INTO players (name, nickname, initial_chips, device_id, avatar) VALUES (?, ?, ?, ?, ?)'
    : 'INSERT INTO players (name, nickname, initial_chips, device_id) VALUES (?, ?, ?, ?)';
  const values = avatarPath ? [...params, avatarPath] : params;

  db.run(sql, values, function(err) {
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
  });
}

router.get('/players', (req, res) => {
  db.all('SELECT * FROM players WHERE deleted_at IS NULL ORDER BY created_at', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/players/join', upload.single('avatar'), (req, res) => {
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
    const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : null;

    if (device_id) {
      db.get('SELECT id FROM players WHERE device_id = ? AND left_at IS NULL AND deleted_at IS NULL', [device_id], (deviceErr, row) => {
        if (deviceErr) return res.status(500).json({ error: deviceErr.message });
        if (row) {
          return res.status(409).json({ error: 'This device has already joined the current game' });
        }
        handlePlayerInsert(res, [realName, nickname, initial_chips, device_id || null], avatarPath);
      });
    } else {
      handlePlayerInsert(res, [realName, nickname, initial_chips, device_id || null], avatarPath);
    }
  });
});

router.post('/players/admin-add', upload.single('avatar'), (req, res) => {
  getSettings((err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!settings || !['pending', 'running', 'settling'].includes(settings.status)) {
      return res.status(409).json({ error: 'Players can only be added before settlement completes', currentStatus: settings?.status || null });
    }

    const { name, nickname, initial_chips } = req.body;
    if (!nickname || initial_chips === undefined || initial_chips < 0) {
      return res.status(400).json({ error: 'Invalid player data' });
    }

    const realName = name && name.trim() ? name.trim() : nickname;
    const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : null;
    handlePlayerInsert(res, [realName, nickname, initial_chips, null], avatarPath);
  });
});

router.post('/players/:id/avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No avatar file uploaded' });
  }
  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  db.run('UPDATE players SET avatar = ? WHERE id = ?', [avatarPath, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM players WHERE id = ?', [req.params.id], (getErr, row) => {
      if (getErr) return res.status(500).json({ error: getErr.message });
      res.json(row);
    });
  });
});

router.post('/players/:id/add-chips', (req, res) => {
  const id = req.params.id;
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid chip amount' });
  }

  getSettings((settingsErr, settings) => {
    if (settingsErr) return res.status(500).json({ error: settingsErr.message });
    if (!settings || settings.status !== 'running') {
      return res.status(409).json({ error: 'Chips can only be added while the game is running', currentStatus: settings?.status || null });
    }

    db.get('SELECT * FROM players WHERE id=? AND deleted_at IS NULL', [id], (err, player) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!player) return res.status(404).json({ error: 'Player not found' });
      if (player.left_at) return res.status(409).json({ error: 'Cannot add chips after the player has left' });

      const nextInitialChips = player.initial_chips + amount;
      db.run('UPDATE players SET initial_chips=? WHERE id=?', [nextInitialChips, id], function(runErr) {
        if (runErr) return res.status(500).json({ error: runErr.message });
        db.get('SELECT * FROM players WHERE id=?', [id], (getErr, row) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          res.json({
            ...row,
            added_chips: amount,
            message: 'Chips added successfully'
          });
        });
      });
    });
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
