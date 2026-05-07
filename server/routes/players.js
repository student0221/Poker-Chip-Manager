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

    const { name, nickname, initial_chips } = req.body;
    if (!name || !nickname || initial_chips === undefined || initial_chips < 0) {
      return res.status(400).json({ error: 'Invalid player data' });
    }

    db.run(
      'INSERT INTO players (name, nickname, initial_chips) VALUES (?, ?, ?)',
      [name, nickname, initial_chips],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM players WHERE id=?', [this.lastID], (err, row) => {
          res.status(201).json(row);
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
