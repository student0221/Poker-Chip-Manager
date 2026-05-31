const express = require('express');
const router = express.Router();
const db = require('../db');
const { DEFAULT_ROOM_ID } = require('../constants');

function enrichSettlement(player, chipRate) {
  const chip_net = (player.final_chips ?? 0) - player.initial_chips;
  const money_net = chip_net * chipRate;
  return {
    ...player,
    chip_net,
    money_net,
    chip_rate: chipRate,
    total_settlement: player.initial_chips * chipRate,
    final_settlement: (player.final_chips ?? 0) * chipRate
  };
}

router.post('/players/:id/final', (req, res) => {
  const { final_chips } = req.body;
  const id = req.params.id;

  db.get('SELECT chip_rate, status FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!settings) return res.status(500).json({ error: 'Settings unavailable' });
    if (settings.status !== 'settling') {
      return res.status(409).json({ error: 'Final chips can only be updated during settlement', currentStatus: settings.status });
    }

    db.run('UPDATE players SET final_chips=? WHERE id=? AND room_id=?', [final_chips, id, DEFAULT_ROOM_ID], function(runErr) {
      if (runErr) return res.status(500).json({ error: runErr.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Player not found' });
      db.get(
        'SELECT id, name, nickname, initial_chips, final_chips, net_profit, avatar FROM players WHERE id=? AND room_id=?',
        [id, DEFAULT_ROOM_ID],
        (getErr, row) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          res.json(enrichSettlement(row, settings.chip_rate));
        }
      );
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

    db.all('SELECT * FROM players WHERE room_id=? AND nickname=? AND deleted_at IS NULL', [DEFAULT_ROOM_ID, nickname], (playersErr, players) => {
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

      db.run('UPDATE players SET final_chips=? WHERE id=? AND room_id=?', [final_chips, player.id, DEFAULT_ROOM_ID], function(runErr) {
        if (runErr) return res.status(500).json({ error: runErr.message });
        res.json(enrichSettlement({ ...player, final_chips }, settings.chip_rate));
      });
    });
  });
});

router.get('/settle/progress', (req, res) => {
  db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all('SELECT * FROM players WHERE room_id=? AND deleted_at IS NULL ORDER BY created_at', [DEFAULT_ROOM_ID], (playersErr, players) => {
      if (playersErr) return res.status(500).json({ error: playersErr.message });

      const submitted = [];
      const pending = [];
      for (const player of players) {
        if (player.final_chips !== null) {
          submitted.push(enrichSettlement(player, settings.chip_rate));
        } else {
          pending.push(player);
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

    db.all('SELECT * FROM players WHERE room_id=? AND deleted_at IS NULL', [DEFAULT_ROOM_ID], (playersErr, players) => {
      if (playersErr) return res.status(500).json({ error: playersErr.message });

      let completed = 0;
      const total = players.length;

      const finishSettlement = () => {
        db.run("UPDATE settings SET status='completed', updated_at=? WHERE id=1 AND status='settling'", [Date.now()], function(settingsErr) {
          if (settingsErr) return res.status(500).json({ error: settingsErr.message });
          if (this.changes === 0) {
            return res.status(409).json({ error: 'Settlement has already been completed' });
          }

          db.run("UPDATE rooms SET status='completed', updated_at=? WHERE id=?", [Date.now(), DEFAULT_ROOM_ID], (roomErr) => {
            if (roomErr) return res.status(500).json({ error: roomErr.message });
            db.all(
              'SELECT id, name, nickname, initial_chips, final_chips, net_profit, avatar FROM players WHERE room_id=? AND deleted_at IS NULL ORDER BY net_profit DESC',
              [DEFAULT_ROOM_ID],
              (rankErr, rankings) => {
                if (rankErr) return res.status(500).json({ error: rankErr.message });
                res.json({
                  rankings: (rankings || []).map((player) => ({
                    ...player,
                    total_settlement: player.initial_chips * settings.chip_rate,
                    final_settlement: (player.final_chips ?? 0) * settings.chip_rate
                  }))
                });
              }
            );
          });
        });
      };

      if (total === 0) return finishSettlement();

      for (const player of players) {
        const final = player.final_chips !== null ? player.final_chips : 0;
        const net_profit = (final - player.initial_chips) * settings.chip_rate;
        db.run('UPDATE players SET final_chips=?, net_profit=? WHERE id=? AND room_id=?', [final, net_profit, player.id, DEFAULT_ROOM_ID], function(runErr) {
          if (runErr) return res.status(500).json({ error: runErr.message });
          completed++;
          if (completed === total) finishSettlement();
        });
      }
    });
  });
});

router.get('/rankings', (req, res) => {
  db.all(
    'SELECT id, name, nickname, initial_chips, final_chips, net_profit, avatar FROM players WHERE room_id=? AND deleted_at IS NULL ORDER BY net_profit DESC',
    [DEFAULT_ROOM_ID],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT chip_rate FROM settings WHERE id=1', (settingsErr, settings) => {
        if (settingsErr) return res.status(500).json({ error: settingsErr.message });
        const chipRate = settings?.chip_rate || 0.05;
        const enriched = (rows || []).map((player) => ({
          ...player,
          total_settlement: player.initial_chips * chipRate,
          final_settlement: (player.final_chips ?? 0) * chipRate
        }));
        res.json({ rankings: enriched });
      });
    }
  );
});

module.exports = router;
