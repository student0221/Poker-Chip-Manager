const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/status', (req, res) => {
  db.get('SELECT status, chip_rate FROM settings WHERE id=1', (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { status: 'pending', chip_rate: 10 });
  });
});

router.post('/start', (req, res) => {
  db.run("UPDATE settings SET status='running', updated_at=? WHERE id=1", [Date.now()], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT status, chip_rate FROM settings WHERE id=1', (err, row) => {
      res.json(row);
    });
  });
});

router.post('/end', (req, res) => {
  db.run("UPDATE settings SET status='settling', updated_at=? WHERE id=1", [Date.now()], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT status, chip_rate FROM settings WHERE id=1', (err, row) => {
      res.json(row);
    });
  });
});

router.post('/rate', (req, res) => {
  const { chip_rate } = req.body;
  if (!chip_rate || chip_rate <= 0) {
    return res.status(400).json({ error: 'Invalid chip_rate' });
  }
  db.run('UPDATE settings SET chip_rate=?, updated_at=? WHERE id=1', [chip_rate, Date.now()], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT status, chip_rate FROM settings WHERE id=1', (err, row) => {
      res.json(row);
    });
  });
});

module.exports = router;
