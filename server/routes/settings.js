const express = require('express');
const router = express.Router();
const db = require('../db');

function getSettings(callback) {
  db.get('SELECT status, chip_rate FROM settings WHERE id=1', callback);
}

router.get('/status', (req, res) => {
  getSettings((err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { status: 'pending', chip_rate: 10 });
  });
});

router.post('/start', (req, res) => {
  getSettings((err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || row.status !== 'pending') {
      return res.status(409).json({ error: 'Game can only start from pending status', currentStatus: row?.status || null });
    }

    db.run("UPDATE settings SET status='running', updated_at=? WHERE id=1", [Date.now()], function(runErr) {
      if (runErr) return res.status(500).json({ error: runErr.message });
      getSettings((getErr, nextRow) => {
        if (getErr) return res.status(500).json({ error: getErr.message });
        res.json(nextRow);
      });
    });
  });
});

router.post('/end', (req, res) => {
  getSettings((err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || row.status !== 'running') {
      return res.status(409).json({ error: 'Game can only end from running status', currentStatus: row?.status || null });
    }

    db.run("UPDATE settings SET status='settling', updated_at=? WHERE id=1", [Date.now()], function(runErr) {
      if (runErr) return res.status(500).json({ error: runErr.message });
      getSettings((getErr, nextRow) => {
        if (getErr) return res.status(500).json({ error: getErr.message });
        res.json(nextRow);
      });
    });
  });
});

router.post('/rate', (req, res) => {
  const { chip_rate } = req.body;
  if (!chip_rate || chip_rate <= 0) {
    return res.status(400).json({ error: 'Invalid chip_rate' });
  }

  getSettings((err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || row.status !== 'pending') {
      return res.status(409).json({ error: 'Chip rate can only be changed before the game starts', currentStatus: row?.status || null });
    }

    db.run('UPDATE settings SET chip_rate=?, updated_at=? WHERE id=1', [chip_rate, Date.now()], function(runErr) {
      if (runErr) return res.status(500).json({ error: runErr.message });
      getSettings((getErr, nextRow) => {
        if (getErr) return res.status(500).json({ error: getErr.message });
        res.json(nextRow);
      });
    });
  });
});

router.post('/reset', (req, res) => {
  const { confirm } = req.body;
  if (!confirm || confirm !== 'RESET_ALL_PLAYERS') {
    return res.status(400).json({ error: '缺少确认参数' });
  }
  
  db.run('DELETE FROM players', (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run("UPDATE settings SET status='pending', chip_rate=10, updated_at=? WHERE id=1", [Date.now()], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'pending', chip_rate: 10, message: '已重置，可以开始新比赛' });
    });
  });
});

module.exports = router;
