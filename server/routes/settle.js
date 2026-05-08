const express = require('express');
const router = express.Router();
const db = require('../db');

// 管理员直接更新某个玩家的最终筹码
router.post('/players/:id/final', (req, res) => {
  const { final_chips } = req.body;
  const id = req.params.id;

  db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.run('UPDATE players SET final_chips=?, updated_at=? WHERE id=?', [final_chips, Date.now(), id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM players WHERE id=?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const chip_net = row.final_chips - row.initial_chips;
        const money_net = chip_net * settings.chip_rate;
        res.json({
          ...row,
          chip_net,
          money_net,
          chip_rate: settings.chip_rate
        });
      });
    });
  });
});

// 玩家自己提交最终筹码（通过 device_id 或 nickname 匹配）
router.post('/submit-final', (req, res) => {
  const { nickname, final_chips, device_id } = req.body;
  
  if (final_chips === undefined) {
    return res.status(400).json({ error: '请提供最终筹码' });
  }

  db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const lookupSql = device_id 
      ? 'SELECT * FROM players WHERE device_id=? AND status="active"'
      : 'SELECT * FROM players WHERE nickname=? AND status="active"';
    const lookupParams = device_id ? [device_id] : [nickname];
    
    db.get(lookupSql, lookupParams, (err, player) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!player) {
        return res.status(404).json({ error: '未找到匹配的玩家' });
      }
      
      // 防止重复提交
      if (player.final_chips !== null) {
        return res.status(409).json({ error: '您已提交过最终筹码，如需修改请联系管理员' });
      }
      
      db.run('UPDATE players SET final_chips=?, updated_at=? WHERE id=?', [final_chips, Date.now(), player.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        const chip_net = final_chips - player.initial_chips;
        const money_net = chip_net * settings.chip_rate;
        
        res.json({
          id: player.id,
          name: player.name,
          nickname: player.nickname,
          initial_chips: player.initial_chips,
          final_chips: final_chips,
          chip_net,
          money_net,
          chip_rate: settings.chip_rate
        });
      });
    });
  });
});

// 获取提交进度和临时排名
router.get('/settle/progress', (req, res) => {
  db.get('SELECT chip_rate FROM settings WHERE id=1', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all('SELECT * FROM players WHERE status="active" ORDER BY created_at', (err, players) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const submitted = [];
      const pending = [];
      
      for (const p of players) {
        if (p.final_chips !== null) {
          const chip_net = p.final_chips - p.initial_chips;
          const money_net = chip_net * settings.chip_rate;
          submitted.push({ ...p, chip_net, money_net });
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
    
    db.all('SELECT * FROM players WHERE status="active"', (err, players) => {
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
        db.run('UPDATE players SET final_chips=?, net_profit=?, updated_at=? WHERE id=?', [final, net_profit, Date.now(), player.id], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          completed++;
          if (completed === total) {
            db.run("UPDATE settings SET status='completed' WHERE id=1", (err) => {
              if (err) return res.status(500).json({ error: err.message });
              db.all('SELECT id, name, nickname, initial_chips, final_chips, net_profit FROM players WHERE status="active" ORDER BY net_profit DESC', (err, rankings) => {
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
  db.all('SELECT id, name, nickname, initial_chips, final_chips, net_profit FROM players WHERE status="active" ORDER BY net_profit DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ rankings: rows || [] });
  });
});

module.exports = router;