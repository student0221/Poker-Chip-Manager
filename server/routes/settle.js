const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/players/:id/final', (req, res) => {
  const { final_chips } = req.body;
  const id = req.params.id;

  db.run('UPDATE players SET final_chips=? WHERE id=?', [final_chips, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM players WHERE id=?', [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row);
    });
  });
});

router.post('/settle', (req, res) => {
  db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all('SELECT * FROM players WHERE final_chips IS NOT NULL', (err, players) => {
      if (err) return res.status(500).json({ error: err.message });

      let completed = 0;
      if (players.length === 0) {
        db.run("UPDATE settings SET status='completed' WHERE id=1", (err) => {
          if (err) return res.status(500).json({ error: err.message });
          db.all('SELECT id, name, nickname, initial_chips, final_chips, net_profit FROM players ORDER BY net_profit DESC', (err, rankings) => {
            res.json({ rankings: rankings || [] });
          });
        });
        return;
      }

      for (const player of players) {
        const net_profit = (player.final_chips - player.initial_chips) * settings.chip_rate;
        db.run('UPDATE players SET net_profit=? WHERE id=?', [net_profit, player.id], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          completed++;
          if (completed === players.length) {
            db.run("UPDATE settings SET status='completed' WHERE id=1", (err) => {
              if (err) return res.status(500).json({ error: err.message });
              db.all('SELECT id, name, nickname, initial_chips, final_chips, net_profit FROM players ORDER BY net_profit DESC', (err, rankings) => {
                res.json({ rankings: rankings || [] });
              });
            });
          }
        });
      }
    });
  });
});

router.get('/rankings', (req, res) => {
  db.all('SELECT id, name, nickname, initial_chips, final_chips, net_profit FROM players ORDER BY net_profit DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ rankings: rows || [] });
  });
});

module.exports = router;