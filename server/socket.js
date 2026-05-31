const { Server } = require('socket.io');

let io = null;

function attachSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*'
    }
  });

  io.on('connection', (socket) => {
    socket.on('room:subscribe', ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId);
      socket.emit('room:subscribed', { roomId });
    });

    socket.on('room:unsubscribe', ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId);
    });
  });

  return io;
}

function emitRoomEvent(roomId, event, payload = {}) {
  if (!io || !roomId) return;
  io.to(roomId).emit(event, { roomId, ...payload });
}

module.exports = {
  attachSocketServer,
  emitRoomEvent
};
