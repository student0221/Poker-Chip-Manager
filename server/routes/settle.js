const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/players/:id/final', (req, res) => {
  const { final_chips } = req.body;
  const id = req.params.id;

  db.get('SELECT chip_rate, status FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!settings) return res.status(500).json({ error: 'Settings unavailable' });
    if (settings.status !== 'settling') {
      return res.status(409).json({ error: 'Final chips can only be updated during settlement', currentStatus: settings.status });
    }

    db.run('UPDATE players SET final_chips=? WHERE id=?', [final_chips, id], function(runErr) {
      if (runErr) return res.status(500).json({ error: runErr.message });
      db.get('SELECT * FROM players WHERE id=?', [id], (getErr, row) => {
        if (getErr) return res.status(500).json({ error: getErr.message });
        const chip_net = row.final_chips - row.initial_chips;
        const money_net = chip_net * settings.chip_rate;
        const total_settlement = row.initial_chips * settings.chip_rate;
        res.json({
          ...row,
          chip_net,
          money_net,
          chip_rate: settings.chip_rate,
          total_settlement
        });
      });
    });
  });
});

router.post('/submit-final', (req, res) => {
  const { nickname, final_chips, device_id } = req.body;

  if (!nickname || final_chips === undefined) {
    return res.status(400).json({ error: 'Nickname and final chips are required' });
  }

  db.get('SELECT chip_rate, status FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!settings) return res.status(500).json({ error: 'Settings unavailable' });
    if (settings.status !== 'settling') {
      return res.status(409).json({ error: 'Final chips can only be submitted during settlement', currentStatus: settings.status });
    }

    db.all('SELECT * FROM players WHERE nickname=? AND deleted_at IS NULL', [nickname], (playersErr, players) => {
      if (playersErr) return res.status(500).json({ error: playersErr.message });
      if (!players || players.length === 0) {
        return res.status(404).json({ error: 'Player not found for that nickname' });
      }
      if (players.length > 1) {
        return res.status(409).json({ error: 'Multiple players match this nickname, please use admin override' });
      }

      const player = players[0];
      if (device_id && player.device_id && player.device_id !== device_id) {
        return res.status(403).json({ error: 'Device mismatch for final chip submission' });
      }

      db.run('UPDATE players SET final_chips=? WHERE id=?', [final_chips, player.id], function(runErr) {
        if (runErr) return res.status(500).json({ error: runErr.message });

        const chip_net = final_chips - player.initial_chips;
        const money_net = chip_net * settings.chip_rate;
        const total_settlement = player.initial_chips * settings.chip_rate;

        res.json({
          id: player.id,
          name: player.name,
          nickname: player.nickname,
          initial_chips: player.initial_chips,
          final_chips,
          chip_net,
          money_net,
          chip_rate: settings.chip_rate,
          total_settlement
        });
      });
    });
  });
});

router.get('/settle/progress', (req, res) => {
  db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all('SELECT * FROM players WHERE deleted_at IS NULL ORDER BY created_at', (playersErr, players) => {
      if (playersErr) return res.status(500).json({ error: playersErr.message });

      const submitted = [];
      const pending = [];

      for (const p of players) {
        if (p.final_chips !== null) {
          const chip_net = p.final_chips - p.initial_chips;
          const money_net = chip_net * settings.chip_rate;
          const total_settlement = p.initial_chips * settings.chip_rate;
          submitted.push({ ...p, chip_net, money_net, total_settlement });
        } else {
          pending.push(p);
        }
      }

      submitted.sort((a, b) => b.money_net - a.money_net);

      res.json({
        chip_rate: settings.chip_rate,
        total: players.length,
        submitted_count: submitted.length,
        pending_count: pending.length,
        submitted,
        pending
      });
    });
  });
});

router.post('/settle', (req, res) => {
  db.get('SELECT chip_rate, status FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!settings) return res.status(500).json({ error: 'Settings unavailable' });
    if (settings.status !== 'settling') {
      return res.status(409).json({ error: 'Settlement is only available during settlement status', currentStatus: settings.status });
    }

    db.all('SELECT * FROM players WHERE deleted_at IS NULL', (playersErr, players) => {
      if (playersErr) return res.status(500).json({ error: playersErr.message });

      let completed = 0;
      const total = players.length;

      if (total === 0) {
        db.run("UPDATE settings SET status='completed', updated_at=? WHERE id=1 AND status='settling'", [Date.now()], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          if (this.changes === 0) {
            return res.status(409).json({ error: '清算已被执行，请勿重复提交' });
          }
          res.json({ rankings: [] });
        });
        return;
      }

      for (const player of players) {
        const final = player.final_chips !== null ? player.final_chips : 0;
        const net_profit = (final - player.initial_chips) * settings.chip_rate;
        db.run('UPDATE players SET final_chips=?, net_profit=? WHERE id=?', [final, net_profit, player.id], function(runErr) {
          if (runErr) return res.status(500).json({ error: runErr.message });
          completed++;
          if (completed === total) {
            db.run("UPDATE settings SET status='completed', updated_at=? WHERE id=1 AND status='settling'", [Date.now()], function(err) {
              if (err) return res.status(500).json({ error: err.message });
              if (this.changes === 0) {
                return res.status(409).json({ error: '清算已被执行，请勿重复提交' });
              }
              db.all('SELECT id, name, nickname, initial_chips, final_chips, net_profit FROM players WHERE deleted_at IS NULL ORDER BY net_profit DESC', (err, rankings) => {
                const enriched = (rankings || []).map(r => ({
                  ...r,
                  total_settlement: r.initial_chips * settings.chip_rate,
                  final_settlement: (r.final_chips ?? 0) * settings.chip_rate
                }));
                res.json({ rankings: enriched });
              });
            });
          }
        });
      }
    });
  });
});

router.get('/rankings', (req, res) => {
  db.all('SELECT id, name, nickname, initial_chips, final_chips, net_profit FROM players WHERE deleted_at IS NULL ORDER BY net_profit DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT chip_rate FROM settings WHERE id=1', (settingsErr, settings) => {
      if (settingsErr) return res.status(500).json({ error: settingsErr.message });
      const chipRate = settings?.chip_rate || 0.05;
      const enriched = (rows || []).map(r => ({
        ...r,
        total_settlement: r.initial_chips * chipRate,
        final_settlement: (r.final_chips ?? 0) * chipRate
      }));
      res.json({ rankings: enriched });
    });
  });
});

module.exports = router;
