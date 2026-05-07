const express = require('express');
const router = express.Router();
const db = require('../db');

// 管理员直接更新某个玩家的最终筹码
router.post('/players/:id/final', (req, res) => {
  const { final_chips } = req.body;
  const id = req.params.id;

  db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.run('UPDATE players SET final_chips=? WHERE id=?', [final_chips, id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM players WHERE id=?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
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

// 玩家自己提交最终筹码（通过 nickname 匹配，支持 settling / running 离场）
router.post('/submit-final', (req, res) => {
  const { nickname, final_chips, device_id } = req.body;
  
  if (!nickname || final_chips === undefined) {
    return res.status(400).json({ error: '请提供昵称和最终筹码' });
  }

  db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.get('SELECT * FROM players WHERE nickname=?', [nickname], (err, player) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!player) {
        return res.status(404).json({ error: '未找到匹配的玩家，请检查昵称' });
      }
      if (device_id && player.device_id && player.device_id !== device_id) {
        return res.status(403).json({ error: '设备不匹配，无法代他人提交' });
      }
      
      db.run('UPDATE players SET final_chips=? WHERE id=?', [final_chips, player.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        const chip_net = final_chips - player.initial_chips;
        const money_net = chip_net * settings.chip_rate;
        const total_settlement = player.initial_chips * settings.chip_rate;
        
        res.json({
          id: player.id,
          name: player.name,
          nickname: player.nickname,
          initial_chips: player.initial_chips,
          final_chips: final_chips,
          chip_net,
          money_net,
          chip_rate: settings.chip_rate,
          total_settlement
        });
      });
    });
  });
});

// 获取提交进度和临时排名
router.get('/settle/progress', (req, res) => {
  db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all('SELECT * FROM players ORDER BY created_at', (err, players) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const submitted = [];
      const pending = [];
      
      for (const p of players) {
        const hasFinal = p.final_chips !== null;
        if (hasFinal) {
          const chip_net = p.final_chips - p.initial_chips;
          const money_net = chip_net * settings.chip_rate;
          const total_settlement = p.initial_chips * settings.chip_rate;
          submitted.push({ ...p, chip_net, money_net, total_settlement });
        } else {
          pending.push(p);
        }
      }
      
      // 按 money_net 降序排名
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

// 执行清算
router.post('/settle', (req, res) => {
  db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all('SELECT * FROM players', (err, players) => {
      if (err) return res.status(500).json({ error: err.message });

      let completed = 0;
      const total = players.length;
      
      if (total === 0) {
        db.run("UPDATE settings SET status='completed' WHERE id=1", (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ rankings: [] });
        });
        return;
      }

      for (const player of players) {
        const final = player.final_chips !== null ? player.final_chips : 0;
        const net_profit = (final - player.initial_chips) * settings.chip_rate;
        const total_settlement = player.initial_chips * settings.chip_rate;
        db.run('UPDATE players SET final_chips=?, net_profit=? WHERE id=?', [final, net_profit, player.id], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          completed++;
          if (completed === total) {
            db.run("UPDATE settings SET status='completed' WHERE id=1", (err) => {
              if (err) return res.status(500).json({ error: err.message });
              db.all('SELECT id, name, nickname, initial_chips, final_chips, net_profit FROM players ORDER BY net_profit DESC', (err, rankings) => {
                const enriched = (rankings || []).map(r => ({
                  ...r,
                  total_settlement: r.initial_chips * settings.chip_rate
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
  db.all('SELECT id, name, nickname, initial_chips, final_chips, net_profit FROM players ORDER BY net_profit DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
      if (err) return res.status(500).json({ error: err.message });
      const enriched = (rows || []).map(r => ({
        ...r,
        total_settlement: r.initial_chips * (settings?.chip_rate || 10)
      }));
      res.json({ rankings: enriched });
    });
  });
});

module.exports = router;