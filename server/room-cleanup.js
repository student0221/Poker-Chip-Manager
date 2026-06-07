const db = require('./db');
const { clearHandTimeout } = require('./poker/timeout-manager');

function cleanupRoomData(roomId, roomUpdates = {}, callback) {
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (beginErr) => {
      if (beginErr) return callback(beginErr);

      db.all('SELECT id FROM hands WHERE room_id=?', [roomId], (handsErr, hands) => {
        if (handsErr) return rollback(handsErr);

        const handIds = (hands || []).map((hand) => hand.id);
        handIds.forEach((handId) => clearHandTimeout(handId));

        deleteHands((deleteErr) => {
          if (deleteErr) return rollback(deleteErr);

          db.run('DELETE FROM players WHERE room_id=?', [roomId], (playersErr) => {
            if (playersErr) return rollback(playersErr);

            updateRoom((updateErr) => {
              if (updateErr) return rollback(updateErr);
              db.run('COMMIT', (commitErr) => {
                if (commitErr) return rollback(commitErr);
                callback(null);
              });
            });
          });
        });
      });
    });
  });

  function deleteHands(done) {
    db.all('SELECT id FROM hands WHERE room_id=?', [roomId], (handsErr, hands) => {
      if (handsErr) return done(handsErr);
      const handIds = (hands || []).map((hand) => hand.id);
      if (handIds.length === 0) return done(null);

      const placeholders = handIds.map(() => '?').join(',');
      db.run(`DELETE FROM pots WHERE hand_id IN (${placeholders})`, handIds, (potsErr) => {
        if (potsErr) return done(potsErr);
        db.run(`DELETE FROM hand_actions WHERE hand_id IN (${placeholders})`, handIds, (actionsErr) => {
          if (actionsErr) return done(actionsErr);
          db.run(`DELETE FROM hand_players WHERE hand_id IN (${placeholders})`, handIds, (handPlayersErr) => {
            if (handPlayersErr) return done(handPlayersErr);
            db.run('DELETE FROM hands WHERE room_id=?', [roomId], (deleteHandsErr) => {
              if (deleteHandsErr) return done(deleteHandsErr);
              done(null);
            });
          });
        });
      });
    });
  }

  function updateRoom(done) {
    const updates = ['current_hand_id=NULL', 'updated_at=?'];
    const values = [Date.now()];

    if (roomUpdates.status !== undefined) {
      updates.unshift('status=?');
      values.unshift(roomUpdates.status);
    }
    if (roomUpdates.chip_rate !== undefined) {
      updates.splice(updates.length - 1, 0, 'chip_rate=?');
      values.splice(values.length - 1, 0, roomUpdates.chip_rate);
    }
    if (roomUpdates.deleted_at !== undefined) {
      updates.splice(updates.length - 1, 0, 'deleted_at=?');
      values.splice(values.length - 1, 0, roomUpdates.deleted_at);
    }

    values.push(roomId);
    db.run(`UPDATE rooms SET ${updates.join(', ')} WHERE id=?`, values, done);
  }

  function rollback(error) {
    db.run('ROLLBACK', () => callback(error));
  }
}

module.exports = {
  cleanupRoomData
};
