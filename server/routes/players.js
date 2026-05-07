const express = require('express');
const router = express.Router();
const db = require('../db');

function getSettings(callback) {
  db.get('SELECT status FROM settings WHERE id=1', callback);
}

router.get('/players', (req, res) => {
  db.all('SELECT * FROM players ORDER BY created_at', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/players', (req, res) => {
  getSettings((err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!settings || settings.status !== 'running') {
      return res.status(403).json({ error: '比赛未开始或已结束' });
    }

    const { name, nickname, initial_chips, device_id } = req.body;
    if (!nickname || initial_chips === undefined || initial_chips < 0) {
      return res.status(400).json({ error: 'Invalid player data' });
    }

    // 姓名可选，不传的话用昵称代替
    const realName = name && name.trim() ? name.trim() : nickname;

    // 同一设备已报名则禁止重复入场
    if (device_id) {
      const existing = db.get('SELECT id FROM players WHERE device_id = ? AND left_at IS NULL', [device_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
          return res.status(409).json({ error: '该设备已报名，请勿重复入场' });
        }

        db.run(
          'INSERT INTO players (name, nickname, initial_chips, device_id) VALUES (?, ?, ?, ?)',
          [realName, nickname, initial_chips, device_id || null],
          function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.get('SELECT * FROM players WHERE id=?', [this.lastID], (err, row) => {
              res.status(201).json(row);
            });
          }
        );
      });
    } else {
      db.run(
        'INSERT INTO players (name, nickname, initial_chips, device_id) VALUES (?, ?, ?, ?)',
        [realName, nickname, initial_chips, device_id || null],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          db.get('SELECT * FROM players WHERE id=?', [this.lastID], (err, row) => {
            res.status(201).json(row);
          });
        }
      );
    }
  });
});

// 玩家中途离场（running 状态下提交剩余筹码并标记离场）
router.post('/players/:id/leave', (req, res) => {
  const { final_chips, device_id } = req.body;
  const id = req.params.id;

  if (final_chips === undefined || final_chips < 0) {
    return res.status(400).json({ error: '请提供有效的剩余筹码' });
  }

  db.get('SELECT * FROM players WHERE id=?', [id], (err, player) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!player) return res.status(404).json({ error: '玩家不存在' });
    if (player.left_at) return res.status(409).json({ error: '该玩家已经离场' });
    if (device_id && player.device_id && player.device_id !== device_id) {
      return res.status(403).json({ error: '设备不匹配，无法代他人离场' });
    }

    db.run(
      'UPDATE players SET final_chips=?, left_at=? WHERE id=?',
      [final_chips, Date.now(), id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM players WHERE id=?', [id], (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({
            ...row,
            message: '离场成功，筹码已记录'
          });
        });
      }
    );
  });
});

router.delete('/players/:id', (req, res) => {
  db.run('DELETE FROM players WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(204).send();
  });
});

module.exports = router;
