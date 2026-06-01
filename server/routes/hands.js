const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');
const { emitRoomEvent } = require('../socket');
const { startHand, processAction, getHandState, getCurrentHandForRoom, getHandHistory } = require('../poker/game-controller');
const { clearHandTimeout, scheduleHandTimeout } = require('../poker/timeout-manager');

function getDeviceId(req) {
  return req.body?.device_id || req.get('x-device-id') || null;
}

function requireHost(req, res, room, callback) {
  const deviceId = getDeviceId(req);
  if (!deviceId || deviceId !== room.host_device_id) {
    return res.status(403).json({ error: 'Only the room host can perform this action' });
  }
  callback();
}

function requireRoom(req, res, callback) {
  db.get('SELECT * FROM rooms WHERE id=? AND deleted_at IS NULL', [req.params.roomId], (err, room) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    callback(room);
  });
}

// Start a new hand
router.post('/', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      if (room.game_mode !== 'cash') {
        return res.status(409).json({ error: 'Room is not in cash game mode', game_mode: room.game_mode });
      }
      if (room.status !== 'running') {
        return res.status(409).json({ error: 'Room must be running to start a hand', currentStatus: room.status });
      }

      const { sb, bb, dealer_seat, action_timeout_seconds } = req.body || {};
      startHand(room.id, {
        sb: sb ?? room.sb_amount,
        bb: bb ?? room.bb_amount,
        dealerSeat: dealer_seat,
        actionTimeoutSeconds: action_timeout_seconds ?? room.action_timeout_seconds
      }, (err, result) => {
        if (err) return res.status(400).json({ error: err.message });
        getHandState(result.handId, (stateErr, state) => {
          if (!stateErr) scheduleHandTimeout(room.id, state);
          emitRoomEvent(room.id, 'hand:started', { handId: result.handId, status: result.status, currentSeat: result.currentSeat });
          res.status(201).json(result);
        });
      });
    });
  });
});

// Get current hand
router.get('/current', (req, res) => {
  requireRoom(req, res, (room) => {
    if (!room.current_hand_id) {
      return res.json({ hand: null });
    }
    getHandState(room.current_hand_id, (err, state) => {
      if (err) return res.status(500).json({ error: err.message });
      const deviceId = getDeviceId(req);
      db.all('SELECT id, device_id FROM players WHERE room_id=? AND deleted_at IS NULL', [room.id], (pErr, players) => {
        if (pErr) return res.status(500).json({ error: pErr.message });
        const hiddenState = hideHoleCards(state, deviceId, room, players);
        res.json(hiddenState);
      });
    });
  });
});

// Get hand history
router.get('/', (req, res) => {
  requireRoom(req, res, (room) => {
    getHandHistory(room.id, (err, hands) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ hands: hands || [] });
    });
  });
});

// Get single hand details
router.get('/:handId', (req, res) => {
  requireRoom(req, res, (room) => {
    getHandState(req.params.handId, (err, state) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!state || state.hand.room_id !== room.id) {
        return res.status(404).json({ error: 'Hand not found in this room' });
      }
      const deviceId = getDeviceId(req);
      db.all('SELECT id, device_id FROM players WHERE room_id=? AND deleted_at IS NULL', [room.id], (pErr, players) => {
        if (pErr) return res.status(500).json({ error: pErr.message });
        const hiddenState = hideHoleCards(state, deviceId, room, players);
        res.json(hiddenState);
      });
    });
  });
});

// Player action
router.post('/:handId/actions', (req, res) => {
  const { action, amount, device_id } = req.body;
  if (!action) {
    return res.status(400).json({ error: 'Action is required' });
  }

  requireRoom(req, res, (room) => {
    getHandState(req.params.handId, (err, state) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!state) return res.status(404).json({ error: 'Hand not found' });
      if (state.hand.room_id !== room.id) {
        return res.status(404).json({ error: 'Hand not found in this room' });
      }

      // Find player by device_id
      const deviceId = device_id || req.get('x-device-id');
      let playerId = null;

      // If host is acting on behalf of a player
      const isHost = deviceId === room.host_device_id;
      const targetPlayerId = req.body.player_id;

      if (isHost && targetPlayerId) {
        playerId = targetPlayerId;
      } else if (deviceId) {
        const hp = state.players.find(p => {
          // Need to look up player's device_id from players table
          return false; // Will fetch from DB below
        });
      }

      // Fetch player_id from players table using device_id
      db.all('SELECT id, device_id FROM players WHERE room_id=? AND deleted_at IS NULL AND left_at IS NULL', [room.id], (pErr, players) => {
        if (pErr) return res.status(500).json({ error: pErr.message });

        if (isHost && targetPlayerId) {
          playerId = targetPlayerId;
        } else {
          const player = players.find(p => p.device_id === deviceId);
          if (!player) {
            return res.status(403).json({ error: 'You are not a player in this room' });
          }
          playerId = player.id;
        }

        const hp = state.players.find(p => p.player_id === playerId);
        if (!hp) {
          return res.status(403).json({ error: 'You are not in this hand' });
        }
        if (hp.seat !== state.hand.current_seat) {
          return res.status(403).json({ error: 'It is not your turn' });
        }

        processAction(state.hand.id, playerId, action, amount || 0, (procErr, result) => {
          if (procErr) return res.status(400).json({ error: procErr.message });

          // Broadcast updates
          emitRoomEvent(room.id, 'hand:action', {
            handId: state.hand.id,
            playerId,
            action,
            amount: amount || 0,
            round: state.hand.current_round
          });

          if (result.ended || result.showdown) {
            clearHandTimeout(state.hand.id);
            emitRoomEvent(room.id, 'hand:ended', {
              handId: state.hand.id,
              result: result.result || result
            });
          } else if (result.advanced) {
            emitRoomEvent(room.id, 'hand:updated', {
              handId: state.hand.id,
              newRound: result.newRound,
              communityCards: result.communityCards
            });
          } else {
            emitRoomEvent(room.id, 'hand:turn', {
              handId: state.hand.id,
              nextSeat: result.nextSeat,
              currentBet: result.currentBet
            });
          }

          getHandState(state.hand.id, (nextErr, nextState) => {
            if (!nextErr) scheduleHandTimeout(room.id, nextState);
          });

          res.json(result);
        });
      });
    });
  });
});

// Force advance (host only, for edge cases)
router.post('/:handId/advance', (req, res) => {
  requireRoom(req, res, (room) => {
    requireHost(req, res, room, () => {
      getHandState(req.params.handId, (err, state) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!state) return res.status(404).json({ error: 'Hand not found' });

        const { processAction, settleHand } = require('../poker/game-controller');
        const { calculatePots } = require('../poker/betting-engine');
        const hand = state.hand;
        const now = Date.now();

        if (hand.status === 'showdown' || hand.status === 'completed') {
          return res.status(409).json({ error: 'Hand already ended' });
        }

        // If only one player left, end immediately
        const active = state.players.filter(p => !p.is_folded);
        if (active.length <= 1) {
          db.run('UPDATE hands SET status=?, ended_at=? WHERE id=?', ['completed', now, hand.id], (endErr) => {
            if (endErr) return res.status(500).json({ error: endErr.message });
            settleHand(hand.id, state.players, JSON.parse(hand.community_cards || '[]'), (settleErr, result) => {
              if (settleErr) return res.status(500).json({ error: settleErr.message });
              db.run('UPDATE rooms SET current_hand_id=NULL WHERE id=?', [room.id]);
              clearHandTimeout(hand.id);
              emitRoomEvent(room.id, 'hand:ended', { handId: hand.id, result });
              res.json({ ended: true, result });
            });
          });
          return;
        }

        // Otherwise deal next community cards
        const ROUNDS = ['preflop', 'flop', 'turn', 'river'];
        const roundIdx = ROUNDS.indexOf(hand.current_round);
        if (roundIdx >= ROUNDS.length - 1) {
          // Go to showdown
          db.run('UPDATE hands SET status=?, ended_at=? WHERE id=?', ['showdown', now, hand.id], (sdErr) => {
            if (sdErr) return res.status(500).json({ error: sdErr.message });
            settleHand(hand.id, state.players, JSON.parse(hand.community_cards || '[]'), (settleErr, result) => {
              if (settleErr) return res.status(500).json({ error: settleErr.message });
              db.run('UPDATE rooms SET current_hand_id=NULL WHERE id=?', [room.id]);
              clearHandTimeout(hand.id);
              emitRoomEvent(room.id, 'hand:ended', { handId: hand.id, result });
              res.json({ showdown: true, result });
            });
          });
          return;
        }

        const nextRound = ROUNDS[roundIdx + 1];
        const deckCards = JSON.parse(hand.deck_snapshot || '[]');
        let newCards = [];
        if (nextRound === 'flop') newCards = deckCards.splice(0, 3);
        else newCards = deckCards.splice(0, 1);
        const allCommunity = [...JSON.parse(hand.community_cards || '[]'), ...newCards];
        const notFoldedNotAllIn = state.players.filter(p => !p.is_folded && !p.is_all_in);
        const activeSeats = notFoldedNotAllIn.map(p => p.seat).sort((a, b) => a - b);
        const nextSeat = activeSeats[0] || 0;

        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          db.run(
            'UPDATE hands SET status=?, current_round=?, community_cards=?, deck_snapshot=?, current_seat=?, current_bet=0, action_started_at=? WHERE id=?',
            [nextRound, nextRound, JSON.stringify(allCommunity), JSON.stringify(deckCards), nextSeat, Date.now(), hand.id],
            (advErr) => {
              if (advErr) { db.run('ROLLBACK'); return res.status(500).json({ error: advErr.message }); }
              db.run('UPDATE hand_players SET current_bet=0 WHERE hand_id=?', [hand.id], (resetErr) => {
                if (resetErr) { db.run('ROLLBACK'); return res.status(500).json({ error: resetErr.message }); }
                db.run('COMMIT');
                scheduleHandTimeout(room.id, { hand: { ...hand, id: hand.id, status: nextRound, current_seat: nextSeat, action_timeout_seconds: hand.action_timeout_seconds, action_started_at: Date.now() } });
                emitRoomEvent(room.id, 'hand:updated', {
                  handId: hand.id,
                  newRound,
                  communityCards: allCommunity
                });
                res.json({ advanced: true, newRound, communityCards: allCommunity });
              });
            }
          );
        });
      });
    });
  });
});

function hideHoleCards(state, deviceId, room, roomPlayers) {
  if (!state || !state.players) return state;
  const isHost = deviceId === room.host_device_id;
  const deviceToPlayer = new Map((roomPlayers || []).map(p => [p.device_id, p.id]));
  const myPlayerId = deviceToPlayer.get(deviceId);

  const hidden = {
    ...state,
    players: state.players.map(p => {
      // Show hole cards to the owner or host
      const showCards = isHost || p.player_id === myPlayerId;
      return {
        ...p,
        hole_cards: showCards ? p.hole_cards : '[]'
      };
    })
  };
  return hidden;
}

module.exports = router;
