const express = require('express');
const router = express.Router();
const db = require('../db');

function getSettings(callback) {
  db.get('SELECT status FROM settings WHERE id=1', callback);
}

router.get('/players', (req, res) => {
  db.all("SELECT * FROM players WHERE status='active' ORDER BY created_at", (err, rows) => {
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

    // 检查 device_id 是否已存在（防止重复提交）
    if (device_id) {
      db.get('SELECT id FROM players WHERE device_id=? AND status="active"', [device_id], (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existing) {
          return res.status(409).json({ error: '该设备已报名，请勿重复提交' });
        }
        doInsert();
      });
    } else {
      doInsert();
    }

    function doInsert() {
      db.run(
        'INSERT INTO players (name, nickname, device_id, initial_chips) VALUES (?, ?, ?, ?)',
        [realName, nickname, device_id || null, initial_chips],
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

// 玩家主动离场（标记为 left，保留记录）
router.patch('/players/:id/leave', (req, res) => {
  const id = req.params.id;
  const { device_id } = req.body;
  
  // 如果提供了 device_id，校验设备所有权
  if (device_id) {
    db.get('SELECT id FROM players WHERE id=? AND device_id=?', [id, device_id], (err, player) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!player) {
        return res.status(403).json({ error: '无权操作该玩家' });
      }
      doLeave();
    });
  } else {
    doLeave();
  }

  function doLeave() {
    db.run(
      "UPDATE players SET status='left', updated_at=? WHERE id=?",
      [Date.now(), id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM players WHERE id=?', [id], (err, row) => {
          res.json(row);
        });
      }
    );
  }
});

router.delete('/players/:id', (req, res) => {
  db.run('DELETE FROM players WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(204).send();
  });
});

module.exports = router;