const express = require('express');
const router = express.Router();
const os = require('os');
const db = require('../db');
const { DEFAULT_ROOM_ID } = require('../constants');
const { cleanupRoomData } = require('../room-cleanup');

function getSettings(callback) {
  db.get('SELECT status, chip_rate FROM settings WHERE id=1', callback);
}

function syncDefaultRoom(fields, callback) {
  const updates = [];
  const values = [];

  if (fields.status !== undefined) {
    updates.push('status=?');
    values.push(fields.status);
  }
  if (fields.chip_rate !== undefined) {
    updates.push('chip_rate=?');
    values.push(fields.chip_rate);
  }

  if (updates.length === 0) return callback();

  updates.push('updated_at=?');
  values.push(Date.now(), DEFAULT_ROOM_ID);
  db.run(`UPDATE rooms SET ${updates.join(', ')} WHERE id=?`, values, callback);
}

function getLanIpv4() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const detail of entries) {
      const family = typeof detail.family === 'string' ? detail.family : String(detail.family);
      if (family === 'IPv4' && !detail.internal) {
        return detail.address;
      }
    }
  }
  return '127.0.0.1';
}

router.get('/network-info', (req, res) => {
  if (process.env.PUBLIC_URL) {
    return res.json({
      ip: getLanIpv4(),
      port: null,
      url: process.env.PUBLIC_URL
    });
  }

  const ip = getLanIpv4();
  const port = Number(process.env.PUBLIC_PORT || process.env.PORT || 3000);
  const url = `http://${ip}:${port}/#/`;
  res.json({
    ip,
    port,
    url
  });
});

router.get('/status', (req, res) => {
  getSettings((err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { status: 'pending', chip_rate: 0.05 });
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
      syncDefaultRoom({ status: 'running' }, (syncErr) => {
        if (syncErr) return res.status(500).json({ error: syncErr.message });
        getSettings((getErr, nextRow) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          res.json(nextRow);
        });
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
      syncDefaultRoom({ status: 'settling' }, (syncErr) => {
        if (syncErr) return res.status(500).json({ error: syncErr.message });
        getSettings((getErr, nextRow) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          res.json(nextRow);
        });
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
      syncDefaultRoom({ chip_rate }, (syncErr) => {
        if (syncErr) return res.status(500).json({ error: syncErr.message });
        getSettings((getErr, nextRow) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          res.json(nextRow);
        });
      });
    });
  });
});

router.post('/reset', (req, res) => {
  const { confirm } = req.body;
  if (!confirm || confirm !== 'RESET_ALL_PLAYERS') {
    return res.status(400).json({ error: '缺少确认参数' });
  }

  cleanupRoomData(DEFAULT_ROOM_ID, { status: 'pending', chip_rate: 0.05 }, (cleanupErr) => {
    if (cleanupErr) return res.status(500).json({ error: cleanupErr.message });
    db.run("UPDATE settings SET status='pending', chip_rate=0.05, updated_at=? WHERE id=1", [Date.now()], (settingsErr) => {
      if (settingsErr) return res.status(500).json({ error: settingsErr.message });
      res.json({ status: 'pending', chip_rate: 0.05, message: '已重置，可以开始新比赛' });
    });
  });
});

module.exports = router;
