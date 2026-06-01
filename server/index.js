const express = require('express');
const http = require('http');
const path = require('path');
const { startDiscovery } = require('./discovery');
const { attachSocketServer } = require('./socket');
const app = express();

app.use(express.json());

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/rooms'));
app.use('/api/rooms/:roomId/hands', require('./routes/hands'));
app.use('/api', require('./routes/players'));
app.use('/api', require('./routes/settle'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  }
});

const port = process.env.PORT || 3000;

if (require.main === module) {
  const server = http.createServer(app);
  attachSocketServer(server);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
    startDiscovery(port);
  });
}

module.exports = app;
