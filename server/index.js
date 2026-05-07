const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/players'));
app.use('/api', require('./routes/settle'));

app.use(express.static(path.join(__dirname, '../client/dist')));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  }
});

const port = 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});

module.exports = app;