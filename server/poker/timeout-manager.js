const { emitRoomEvent } = require('../socket');

const timers = new Map();

function clearHandTimeout(handId) {
  const timer = timers.get(handId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(handId);
  }
}

function scheduleHandTimeout(roomId, handState) {
  if (process.env.NODE_ENV === 'test') return;

  const hand = handState?.hand || handState;
  if (!hand?.id || ['completed', 'showdown'].includes(hand.status)) {
    if (hand?.id) clearHandTimeout(hand.id);
    return;
  }

  const seconds = Number(hand.action_timeout_seconds || 30);
  const startedAt = Number(hand.action_started_at || Date.now());
  if (!Number.isFinite(seconds) || seconds <= 0 || hand.current_seat === null || hand.current_seat === undefined) return;

  clearHandTimeout(hand.id);

  const delay = Math.max(0, startedAt + seconds * 1000 - Date.now());
  const timer = setTimeout(() => {
    const { getHandState, processTimeoutAction } = require('./game-controller');

    getHandState(hand.id, (stateErr, latestState) => {
      if (stateErr || !latestState?.hand || ['completed', 'showdown'].includes(latestState.hand.status)) {
        clearHandTimeout(hand.id);
        return;
      }

      if (
        latestState.hand.current_seat !== hand.current_seat ||
        Number(latestState.hand.action_started_at || 0) !== startedAt
      ) {
        scheduleHandTimeout(roomId, latestState);
        return;
      }

      processTimeoutAction(hand.id, (actionErr, result) => {
        if (actionErr || result?.skipped) {
          clearHandTimeout(hand.id);
          return;
        }

        emitRoomEvent(roomId, 'hand:timeout', {
          handId: hand.id,
          playerId: result.playerId,
          seat: result.seat,
          action: result.action
        });
        emitRoomEvent(roomId, 'hand:action', {
          handId: hand.id,
          playerId: result.playerId,
          action: result.action,
          amount: 0,
          timedOut: true
        });

        if (result.ended || result.showdown) {
          clearHandTimeout(hand.id);
          emitRoomEvent(roomId, 'hand:ended', { handId: hand.id, result: result.result || result });
          return;
        }

        getHandState(hand.id, (nextErr, nextState) => {
          if (!nextErr && nextState?.hand) scheduleHandTimeout(roomId, nextState);
          emitRoomEvent(roomId, result.advanced ? 'hand:updated' : 'hand:turn', {
            handId: hand.id,
            newRound: result.newRound,
            nextSeat: result.nextSeat,
            currentBet: result.currentBet
          });
        });
      });
    });
  }, delay);
  timer.unref?.();

  timers.set(hand.id, timer);
}

module.exports = {
  clearHandTimeout,
  scheduleHandTimeout
};
