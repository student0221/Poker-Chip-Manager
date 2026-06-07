const db = require('../db');
const { createDeck, shuffle, deal } = require('./deck');
const { evaluate7, compareHands } = require('./hand-evaluator');
const { validateAction, isRoundComplete, getNextSeat, calculatePots, distributePots } = require('./betting-engine');

const ROUNDS = ['preflop', 'flop', 'turn', 'river'];
const SHOWDOWN_DISPLAY_MS = 30 * 1000;

function getRunoutCards(currentRound, deckCards) {
  if (currentRound === 'preflop') return deckCards.splice(0, 5);
  if (currentRound === 'flop') return deckCards.splice(0, 2);
  if (currentRound === 'turn') return deckCards.splice(0, 1);
  return [];
}

function getFirstActiveSeatAfterDealer(hand, handPlayers) {
  const activeSeats = handPlayers
    .filter(p => !p.is_folded && !p.is_all_in)
    .map(p => p.seat)
    .sort((a, b) => a - b);
  return getNextSeat(activeSeats, hand.dealer_seat, handPlayers) ?? activeSeats[0] ?? null;
}

function rollbackAndCallback(callback, error) {
  db.run('ROLLBACK', () => callback(error));
}

function commitAndCallback(callback, payload) {
  db.run('COMMIT', (commitErr) => {
    if (commitErr) return rollbackAndCallback(callback, commitErr);
    callback(null, payload);
  });
}

function clearRoomCurrentHand(roomId, callback) {
  db.run('UPDATE rooms SET current_hand_id=NULL WHERE id=?', [roomId], (err) => {
    if (err) return callback(err);
    callback(null);
  });
}

function getShowdownUntil(now = Date.now()) {
  return now + SHOWDOWN_DISPLAY_MS;
}

function startHand(roomId, options, callback) {
  const { sb = 1, bb = 2, dealerSeat, actionTimeoutSeconds = 30 } = options || {};

  db.get('SELECT * FROM rooms WHERE id=? AND deleted_at IS NULL', [roomId], (err, room) => {
    if (err) return callback(err);
    if (!room) return callback(new Error('Room not found'));
    if (room.status !== 'running') return callback(new Error('Room is not running'));
    if (room.game_mode !== 'cash') return callback(new Error('Room is not in cash game mode'));
    if (room.current_hand_id) return callback(new Error('A hand is already in progress'));

    db.all(
      'SELECT * FROM players WHERE room_id=? AND deleted_at IS NULL AND left_at IS NULL AND initial_chips > 0 ORDER BY created_at',
      [roomId],
      (playersErr, players) => {
        if (playersErr) return callback(playersErr);
        if (players.length < 2) return callback(new Error('Need at least 2 players with chips'));

        const seats = players.map((_, i) => i);
        const numPlayers = players.length;
        const prevDealer = dealerSeat !== undefined ? dealerSeat : -1;
        const nextDealer = (prevDealer + 1) % numPlayers;

        const deck = shuffle(createDeck());
        const deckCards = deck.map(c => c.card);

        // Deal hole cards: 2 per player
        const playerCards = [];
        const used = [];
        for (let i = 0; i < numPlayers; i++) {
          const c1 = deckCards.shift();
          const c2 = deckCards.shift();
          playerCards.push([c1, c2]);
          used.push(c1, c2);
        }

        const sbSeat = numPlayers === 2 ? nextDealer : (nextDealer + 1) % numPlayers;
        const bbSeat = numPlayers === 2 ? (nextDealer + 1) % 2 : (nextDealer + 2) % numPlayers;
        let actionSeat = numPlayers === 2 ? nextDealer : (bbSeat + 1) % numPlayers;

        const now = Date.now();

        db.serialize(() => {
          db.run('BEGIN TRANSACTION');

          db.run(
            `INSERT INTO hands (room_id, status, dealer_seat, small_blind_seat, big_blind_seat,
              small_blind_amount, big_blind_amount, community_cards, deck_snapshot,
              current_round, current_seat, current_min_raise, total_pot, action_timeout_seconds, action_started_at, started_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [roomId, 'preflop', nextDealer, sbSeat, bbSeat, sb, bb, '[]', JSON.stringify(deckCards), 'preflop', actionSeat, bb, 0, actionTimeoutSeconds, now, now],
            function(handErr) {
              if (handErr) {
                db.run('ROLLBACK');
                return callback(handErr);
              }
              const handId = this.lastID;

              // Insert hand_players and deduct blinds
              let completed = 0;
              let hasError = null;

              const finish = () => {
                if (hasError) {
                  db.run('ROLLBACK');
                  return callback(hasError);
                }
                if (completed < numPlayers) return;

                // Post blind actions
                const sbPlayer = players[sbSeat];
                const bbPlayer = players[bbSeat];
                const sbAmount = Math.min(sb, sbPlayer.initial_chips);
                const bbAmount = Math.min(bb, bbPlayer.initial_chips);

                const postBlinds = (type, pid, seat, amount) => {
                  return new Promise((resolve, reject) => {
                    db.run(
                      'UPDATE hand_players SET current_bet=?, total_bet=?, current_chips=?, is_all_in=? WHERE hand_id=? AND player_id=?',
                      [amount, amount, Math.max(0, (type === 'small_blind' ? sbPlayer.initial_chips : bbPlayer.initial_chips) - amount),
                       amount === (type === 'small_blind' ? sbPlayer.initial_chips : bbPlayer.initial_chips) && amount < (type === 'small_blind' ? sb : bb) ? 1 : 0,
                       handId, pid],
                      (updErr) => {
                        if (updErr) return reject(updErr);
                        db.run(
                          'INSERT INTO hand_actions (hand_id, player_id, action_type, amount, round, seat) VALUES (?, ?, ?, ?, ?, ?)',
                          [handId, pid, type, amount, 'preflop', seat],
                          (actErr) => {
                            if (actErr) return reject(actErr);
                            resolve();
                          }
                        );
                      }
                    );
                  });
                };

                Promise.all([
                  postBlinds('small_blind', sbPlayer.id, sbSeat, sbAmount),
                  postBlinds('big_blind', bbPlayer.id, bbSeat, bbAmount)
                ]).then(() => {
                  const currentBet = bbAmount;
                  const totalPot = sbAmount + bbAmount;

                  // Update players table chip amounts
                  db.run('UPDATE players SET initial_chips = initial_chips - ? WHERE id = ?', [sbAmount, sbPlayer.id], (e1) => {
                    if (e1) { db.run('ROLLBACK'); return callback(e1); }
                    db.run('UPDATE players SET initial_chips = initial_chips - ? WHERE id = ?', [bbAmount, bbPlayer.id], (e2) => {
                      if (e2) { db.run('ROLLBACK'); return callback(e2); }

                      // If SB or BB is all-in short, we may need to adjust action seat
                      db.all('SELECT * FROM hand_players WHERE hand_id=?', [handId], (hpErr, hps) => {
                        if (hpErr) { db.run('ROLLBACK'); return callback(hpErr); }

                        let nextAction = actionSeat;
                        const activeSeats = hps.filter(p => !p.is_folded && !p.is_all_in).map(p => p.seat).sort((a, b) => a - b);
                        if (!activeSeats.includes(nextAction)) {
                          nextAction = getNextSeat(activeSeats, actionSeat, hps) || activeSeats[0];
                        }

                        db.run('UPDATE hands SET current_seat=?, current_bet=?, total_pot=? WHERE id=?',
                          [nextAction, currentBet, totalPot, handId], (updErr) => {
                            if (updErr) { db.run('ROLLBACK'); return callback(updErr); }
                            db.run('UPDATE rooms SET current_hand_id=? WHERE id=?',
                              [handId, roomId], (roomErr) => {
                                if (roomErr) return rollbackAndCallback(callback, roomErr);
                                commitAndCallback(callback, { handId, status: 'preflop', currentSeat: nextAction });
                              });
                          });
                      });
                    });
                  });
                }).catch(blindErr => {
                  db.run('ROLLBACK');
                  callback(blindErr);
                });
              };

              for (let i = 0; i < numPlayers; i++) {
                const p = players[i];
                db.run(
                  'INSERT INTO hand_players (hand_id, player_id, seat, hole_cards, current_chips, is_active) VALUES (?, ?, ?, ?, ?, ?)',
                  [handId, p.id, i, JSON.stringify(playerCards[i]), p.initial_chips, 1],
                  (insertErr) => {
                    if (insertErr && !hasError) hasError = insertErr;
                    completed++;
                    finish();
                  }
                );
              }
            }
          );
        });
      }
    );
  });
}

function getHandState(handId, callback) {
  db.get('SELECT * FROM hands WHERE id=?', [handId], (err, hand) => {
    if (err) return callback(err);
    if (!hand) return callback(new Error('Hand not found'));
    db.all(`
      SELECT hp.*, p.nickname, p.avatar
      FROM hand_players hp
      JOIN players p ON hp.player_id = p.id
      WHERE hp.hand_id=?
    `, [handId], (hpErr, handPlayers) => {
      if (hpErr) return callback(hpErr);
      db.all('SELECT * FROM hand_actions WHERE hand_id=? ORDER BY created_at', [handId], (haErr, actions) => {
        if (haErr) return callback(haErr);
        db.all('SELECT * FROM pots WHERE hand_id=?', [handId], (potErr, pots) => {
          if (potErr) return callback(potErr);
          callback(null, {
            hand,
            players: handPlayers,
            actions,
            pots
          });
        });
      });
    });
  });
}

function processAction(handId, playerId, action, amount, callback) {
  getHandState(handId, (err, state) => {
    if (err) return callback(err);
    const { hand, players: handPlayers } = state;

    if (['completed', 'showdown'].includes(hand.status)) {
      return callback(new Error('Hand is already over'));
    }

    const hp = handPlayers.find(p => p.player_id === playerId);
    if (!hp) return callback(new Error('Player not in this hand'));
    if (hp.seat !== hand.current_seat) return callback(new Error('Not your turn'));

    const roomId = hand.room_id;
    const currentBet = Math.max(...handPlayers.map(p => p.current_bet));
    const lastRaise = hand.current_min_raise || hand.big_blind_amount;

    const validation = validateAction(
      { ...hp, current_bet: hp.current_bet },
      action,
      amount,
      {
        currentBet,
        lastRaiseAmount: lastRaise,
        bigBlind: hand.big_blind_amount,
        activePlayers: handPlayers.map(p => ({
          id: p.player_id,
          currentBet: p.current_bet,
          current_chips: p.current_chips,
          is_folded: !!p.is_folded,
          is_all_in: !!p.is_all_in
        }))
      }
    );

    if (!validation.valid) {
      return callback(new Error(validation.error));
    }

    // Resolve actual amount
    let actualAmount = 0;
    let isAllIn = false;
    const toCall = currentBet - hp.current_bet;

    if (action === 'fold') {
      // No amount
    } else if (action === 'check') {
      // No amount
    } else if (action === 'call') {
      actualAmount = Math.min(toCall, hp.current_chips);
      if (actualAmount < toCall) isAllIn = true;
    } else if (action === 'raise') {
      actualAmount = Math.min(amount - hp.current_bet, hp.current_chips);
      if (actualAmount < amount - hp.current_bet) isAllIn = true;
    } else if (action === 'all-in') {
      actualAmount = hp.current_chips;
      isAllIn = true;
      if (actualAmount <= toCall) {
        action = 'all-in';
      } else if (actualAmount > toCall && actualAmount + hp.current_bet <= currentBet) {
        // all-in but less than min raise: treated as call all-in
        action = 'all-in';
      } else {
        action = 'all-in';
      }
    }

    const newBet = hp.current_bet + actualAmount;
    const newChips = hp.current_chips - actualAmount;
    const newTotalBet = hp.total_bet + actualAmount;
    if (action !== 'fold' && action !== 'check' && newChips === 0) {
      isAllIn = true;
    }

    if (action !== 'fold' && newChips < 0) {
      return callback(new Error('Insufficient chips'));
    }

    const now = Date.now();

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // Update hand_player
      const foldVal = action === 'fold' ? 1 : hp.is_folded;
      const allInVal = isAllIn ? 1 : hp.is_all_in;
      db.run(
        'UPDATE hand_players SET current_bet=?, total_bet=?, current_chips=?, is_folded=?, is_all_in=? WHERE hand_id=? AND player_id=?',
        [newBet, newTotalBet, newChips, foldVal, allInVal, handId, playerId],
        (updErr) => {
          if (updErr) { db.run('ROLLBACK'); return callback(updErr); }

          // Record action
          db.run(
            'INSERT INTO hand_actions (hand_id, player_id, action_type, amount, round, seat) VALUES (?, ?, ?, ?, ?, ?)',
            [handId, playerId, action, actualAmount, hand.current_round, hp.seat],
            (actErr) => {
              if (actErr) { db.run('ROLLBACK'); return callback(actErr); }

              // Update players table chips
              if (actualAmount > 0) {
                db.run('UPDATE players SET initial_chips = initial_chips - ? WHERE id = ?', [actualAmount, playerId], (chipErr) => {
                  if (chipErr) { db.run('ROLLBACK'); return callback(chipErr); }
                  afterAction();
                });
              } else {
                afterAction();
              }
            }
          );
        }
      );

      function afterAction() {
        // Re-fetch hand players to compute new state
        db.all('SELECT * FROM hand_players WHERE hand_id=?', [handId], (hpErr2, newHps) => {
          if (hpErr2) { db.run('ROLLBACK'); return callback(hpErr2); }

          const activeHps = newHps.filter(p => !p.is_folded);
          const notFoldedNotAllIn = activeHps.filter(p => !p.is_all_in);
          const newCurrentBet = Math.max(...newHps.map(p => p.current_bet));

          // Check if hand should end (only 1 player left)
          if (activeHps.length <= 1) {
            // End hand immediately, last player wins
            db.run(
              'UPDATE hands SET status=?, current_seat=NULL, action_started_at=NULL, ended_at=?, showdown_until=? WHERE id=?',
              ['completed', now, getShowdownUntil(now), handId],
              (endErr) => {
              if (endErr) { db.run('ROLLBACK'); return callback(endErr); }
              settleHand(handId, newHps, [], (settleErr, result) => {
                if (settleErr) return rollbackAndCallback(callback, settleErr);
                commitAndCallback(callback, { action: 'fold', ended: true, winner: activeHps[0]?.player_id, result });
              });
            });
            return;
          }

          // Check if round is complete
          const actionsInRound = state.actions.filter(a =>
            a.round === hand.current_round &&
            !['small_blind', 'big_blind'].includes(a.action_type)
          );
          const hasActed = new Set(actionsInRound.map(a => a.seat));
          // Also include the current action
          hasActed.add(hp.seat);

          // Build activePlayers for isRoundComplete
          const roundComplete = notFoldedNotAllIn.every(p => {
            if (p.seat === hp.seat) return true; // just acted
            return p.current_bet === newCurrentBet || p.is_all_in;
          }) && notFoldedNotAllIn.every(p => hasActed.has(p.seat));

          // Also need to consider: did everyone have a chance to act?
          // Simplification: if roundComplete, advance. Otherwise find next seat.

          if (roundComplete && notFoldedNotAllIn.length === 0) {
            const deckCards = JSON.parse(hand.deck_snapshot || '[]');
            const existingCards = JSON.parse(hand.community_cards || '[]');
            const runoutCards = getRunoutCards(hand.current_round, deckCards);
            const allCommunity = [...existingCards, ...runoutCards];

            db.run(
              'UPDATE hands SET status=?, current_round=?, community_cards=?, deck_snapshot=?, current_seat=NULL, action_started_at=NULL, total_pot=total_pot+?, ended_at=?, showdown_until=? WHERE id=?',
              ['showdown', 'river', JSON.stringify(allCommunity), JSON.stringify(deckCards), actualAmount, now, getShowdownUntil(now), handId],
              (sdErr) => {
                if (sdErr) return rollbackAndCallback(callback, sdErr);
                settleHand(handId, newHps, allCommunity, (settleErr, result) => {
                  if (settleErr) return rollbackAndCallback(callback, settleErr);
                  commitAndCallback(callback, { action, showdown: true, autoRunout: true, communityCards: allCommunity, result });
                });
              }
            );
          } else if (roundComplete && notFoldedNotAllIn.length > 0) {
            // Advance to next round or showdown
            const roundIdx = ROUNDS.indexOf(hand.current_round);
            if (roundIdx < ROUNDS.length - 1) {
              const nextRound = ROUNDS[roundIdx + 1];
              // Deal community cards
              const deckCards = JSON.parse(hand.deck_snapshot || '[]');
              let newCards = [];
              if (nextRound === 'flop') newCards = deckCards.splice(0, 3);
              else if (nextRound === 'turn' || nextRound === 'river') newCards = deckCards.splice(0, 1);

              const existingCards = JSON.parse(hand.community_cards || '[]');
              const allCommunity = [...existingCards, ...newCards];

              // Reset current_bet for all players in new round
              const nextSeat = getFirstActiveSeatAfterDealer(hand, notFoldedNotAllIn);

              db.run(
              'UPDATE hands SET status=?, current_round=?, community_cards=?, deck_snapshot=?, current_seat=?, current_bet=0, current_min_raise=?, total_pot=?, action_started_at=? WHERE id=?',
                [nextRound, nextRound, JSON.stringify(allCommunity), JSON.stringify(deckCards), nextSeat, hand.big_blind_amount, hand.total_pot + actualAmount, now, handId],
                (advErr) => {
                  if (advErr) return rollbackAndCallback(callback, advErr);
                  db.run('UPDATE hand_players SET current_bet=0 WHERE hand_id=?', [handId], (resetErr) => {
                    if (resetErr) return rollbackAndCallback(callback, resetErr);
                    commitAndCallback(callback, { action, advanced: true, newRound: nextRound, communityCards: allCommunity });
                  });
                }
              );
            } else {
              // Showdown
              db.run(
                'UPDATE hands SET status=?, current_seat=NULL, action_started_at=NULL, ended_at=?, showdown_until=?, total_pot=total_pot+? WHERE id=?',
                ['showdown', now, getShowdownUntil(now), actualAmount, handId],
                (sdErr) => {
                if (sdErr) return rollbackAndCallback(callback, sdErr);
                settleHand(handId, newHps, JSON.parse(hand.community_cards || '[]'), (settleErr, result) => {
                  if (settleErr) return rollbackAndCallback(callback, settleErr);
                  commitAndCallback(callback, { action, showdown: true, result });
                });
              });
            }
          } else {
            // Find next active seat
            const activeSeats = notFoldedNotAllIn.map(p => p.seat).sort((a, b) => a - b);
            const nextSeat = getNextSeat(activeSeats, hp.seat, newHps);
            const raiseAmount = action === 'raise' ? newBet - currentBet : 0;
            const newMinRaise = raiseAmount > 0 ? raiseAmount : hand.current_min_raise;

            db.run(
              'UPDATE hands SET current_seat=?, current_bet=?, current_min_raise=?, total_pot=total_pot+?, action_started_at=? WHERE id=?',
              [nextSeat, newCurrentBet, newMinRaise, actualAmount, now, handId],
              (nextErr) => {
                if (nextErr) return rollbackAndCallback(callback, nextErr);
                commitAndCallback(callback, { action, nextSeat, currentBet: newCurrentBet });
              }
            );
          }
        });
      }
    });
  });
}

function calculateLastRaise(actions, round) {
  const roundActions = actions.filter(a => a.round === round && ['raise', 'all-in', 'big_blind'].includes(a.action_type));
  if (roundActions.length === 0) return 0;
  // Simple: last raise amount is the largest amount in this round
  return Math.max(...roundActions.map(a => a.amount));
}

function processTimeoutAction(handId, callback) {
  getHandState(handId, (err, state) => {
    if (err) return callback(err);
    const { hand, players } = state;
    if (!hand || ['completed', 'showdown'].includes(hand.status)) {
      return callback(null, { skipped: true });
    }

    const player = players.find(p => p.seat === hand.current_seat && !p.is_folded && !p.is_all_in);
    if (!player) return callback(null, { skipped: true });

    const currentBet = Math.max(...players.map(p => p.current_bet));
    const toCall = currentBet - player.current_bet;
    const action = toCall > 0 ? 'fold' : 'check';

    processAction(handId, player.player_id, action, 0, (actionErr, result) => {
      if (actionErr) return callback(actionErr);
      callback(null, {
        ...result,
        timedOut: true,
        playerId: player.player_id,
        seat: player.seat,
        action
      });
    });
  });
}

function settleHand(handId, handPlayers, communityCards, callback) {
  const pots = calculatePots(handPlayers);

  // Save pots
  let potDone = 0;
  let potError = null;
  if (pots.length === 0) {
    return finishSettle();
  }

  for (const pot of pots) {
    db.run(
      'INSERT INTO pots (hand_id, amount, eligible_players, is_side_pot) VALUES (?, ?, ?, ?)',
      [handId, pot.amount, JSON.stringify(pot.eligible_players), pot.is_side_pot],
      (potErr) => {
        if (potErr && !potError) potError = potErr;
        potDone++;
        if (potDone === pots.length) {
          if (potError) return callback(potError);
          finishSettle();
        }
      }
    );
  }

  function finishSettle() {
    // If only 1 player not folded, they win everything
    const active = handPlayers.filter(p => !p.is_folded);
    if (active.length === 1) {
      const winner = active[0];
      const totalPot = pots.reduce((s, p) => s + p.amount, 0);
      db.run('UPDATE hand_players SET result=? WHERE hand_id=? AND player_id=?', [totalPot, handId, winner.player_id], (updErr) => {
        if (updErr) return callback(updErr);
        db.run('UPDATE players SET initial_chips = initial_chips + ? WHERE id = ?', [totalPot, winner.player_id], (chipErr) => {
          if (chipErr) return callback(chipErr);
          callback(null, { winners: [{ player_id: winner.player_id, amount: totalPot, handName: '其他玩家弃牌' }] });
        });
      });
      return;
    }

    // Evaluate hands
    const handsToEval = active.map(p => ({
      playerId: p.player_id,
      cardStrings: [...JSON.parse(p.hole_cards || '[]'), ...communityCards]
    }));

    const evaluated = compareHands(handsToEval);

    // Save hand ranks
    let rankDone = 0;
    let rankErr = null;
    for (const ev of evaluated) {
      db.run('UPDATE hand_players SET hand_rank=? WHERE hand_id=? AND player_id=?', [ev.name, handId, ev.playerId], (re) => {
        if (re && !rankErr) rankErr = re;
        rankDone++;
        if (rankDone === evaluated.length) {
          if (rankErr) return callback(rankErr);
          distributeAndSave();
        }
      });
    }

    function distributeAndSave() {
      const dbPots = pots.map(p => ({
        amount: p.amount,
        eligible_players: p.eligible_players
      }));
      const winnings = distributePots(dbPots, evaluated);

      let winDone = 0;
      let winErr = null;
      const totalWinnings = {};

      for (const w of winnings) {
        totalWinnings[w.player_id] = (totalWinnings[w.player_id] || 0) + w.amount;
        db.run('UPDATE hand_players SET result = result + ? WHERE hand_id=? AND player_id=?', [w.amount, handId, w.player_id], (we) => {
          if (we && !winErr) winErr = we;
          winDone++;
          if (winDone === winnings.length) {
            if (winErr) return callback(winErr);
            // Update player chips
            let chipDone = 0;
            let chipErr = null;
            const entries = Object.entries(totalWinnings);
            if (entries.length === 0) return callback(null, { winners: [] });
            for (const [pid, amt] of entries) {
              db.run('UPDATE players SET initial_chips = initial_chips + ? WHERE id = ?', [amt, pid], (ce) => {
                if (ce && !chipErr) chipErr = ce;
                chipDone++;
                if (chipDone === entries.length) {
                  if (chipErr) return callback(chipErr);
                  const resultWinners = winnings.map(w => {
                    const ev = evaluated.find(e => e.playerId === w.player_id);
                    return { player_id: w.player_id, amount: w.amount, handName: ev?.name || '' };
                  });
                  callback(null, { winners: resultWinners, pots });
                }
              });
            }
          }
        });
      }
    }
  }
}

function getCurrentHandForRoom(roomId, callback) {
  db.get('SELECT current_hand_id FROM rooms WHERE id=?', [roomId], (err, room) => {
    if (err) return callback(err);
    if (!room || !room.current_hand_id) return callback(null, null);
    getHandState(room.current_hand_id, callback);
  });
}

function getHandHistory(roomId, callback) {
  db.all('SELECT * FROM hands WHERE room_id=? ORDER BY created_at DESC', [roomId], (err, hands) => {
    if (err) return callback(err);
    callback(null, hands);
  });
}

function getPlayerForDevice(roomId, deviceId, callback) {
  if (!deviceId) return callback(new Error('Device id is required'));
  db.get(
    'SELECT id FROM players WHERE room_id=? AND device_id=? AND deleted_at IS NULL',
    [roomId, deviceId],
    (err, player) => {
      if (err) return callback(err);
      if (!player) return callback(new Error('You are not a player in this room'));
      callback(null, player);
    }
  );
}

function assertShowdownHand(roomId, handId, callback) {
  getHandState(handId, (err, state) => {
    if (err) return callback(err);
    if (!state || state.hand.room_id !== roomId) return callback(new Error('Hand not found in this room'));
    if (!['completed', 'showdown'].includes(state.hand.status)) return callback(new Error('Hand is not in showdown display'));
    callback(null, state);
  });
}

function setShowCards(roomId, handId, deviceId, showCards, callback) {
  assertShowdownHand(roomId, handId, (err, state) => {
    if (err) return callback(err);
    getPlayerForDevice(roomId, deviceId, (playerErr, player) => {
      if (playerErr) return callback(playerErr);
      const handPlayer = state.players.find(p => p.player_id === player.id);
      if (!handPlayer) return callback(new Error('You are not in this hand'));

      db.run(
        'UPDATE hand_players SET show_cards=? WHERE hand_id=? AND player_id=?',
        [showCards ? 1 : 0, handId, player.id],
        (updateErr) => {
          if (updateErr) return callback(updateErr);
          getHandState(handId, callback);
        }
      );
    });
  });
}

function setNextChoice(roomId, handId, deviceId, choice, callback) {
  if (!['continue', 'exit'].includes(choice)) {
    return callback(new Error('Choice must be continue or exit'));
  }

  assertShowdownHand(roomId, handId, (err, state) => {
    if (err) return callback(err);
    getPlayerForDevice(roomId, deviceId, (playerErr, player) => {
      if (playerErr) return callback(playerErr);
      const handPlayer = state.players.find(p => p.player_id === player.id);
      if (!handPlayer) return callback(new Error('You are not in this hand'));

      db.run(
        'UPDATE hand_players SET next_choice=?, next_choice_at=? WHERE hand_id=? AND player_id=?',
        [choice, Date.now(), handId, player.id],
        (updateErr) => {
          if (updateErr) return callback(updateErr);
          getHandState(handId, callback);
        }
      );
    });
  });
}

function finishShowdownDisplay(roomId, handId, callback) {
  assertShowdownHand(roomId, handId, (err, state) => {
    if (err) return callback(err);

    const now = Date.now();
    const showdownUntil = Number(state.hand.showdown_until) || Number(state.hand.ended_at) + SHOWDOWN_DISPLAY_MS;
    const allChosen = state.players.every(p => !!p.next_choice);
    if (!allChosen && now < showdownUntil) {
      return callback(new Error('Showdown display is still waiting for player choices'));
    }

    const exitingIds = state.players
      .filter(p => p.next_choice !== 'continue')
      .map(p => p.player_id);

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      db.run(
        'UPDATE rooms SET current_hand_id=NULL, updated_at=? WHERE id=? AND current_hand_id=?',
        [now, roomId, handId],
        (clearErr) => {
          if (clearErr) return rollbackAndCallback(callback, clearErr);

          const finish = () => {
            db.get(
              'SELECT COUNT(*) AS count FROM players WHERE room_id=? AND deleted_at IS NULL AND left_at IS NULL AND initial_chips > 0',
              [roomId],
              (countErr, row) => {
                if (countErr) return rollbackAndCallback(callback, countErr);
                commitAndCallback(callback, {
                  finished: true,
                  exitedPlayerIds: exitingIds,
                  activePlayerCount: row?.count || 0,
                  canStartNextHand: (row?.count || 0) >= 2
                });
              }
            );
          };

          if (exitingIds.length === 0) return finish();
          const placeholders = exitingIds.map(() => '?').join(',');
          db.run(
            `UPDATE players SET left_at=?, final_chips=initial_chips WHERE room_id=? AND id IN (${placeholders}) AND left_at IS NULL`,
            [now, roomId, ...exitingIds],
            (exitErr) => {
              if (exitErr) return rollbackAndCallback(callback, exitErr);
              finish();
            }
          );
        }
      );
    });
  });
}

module.exports = {
  startHand,
  processAction,
  getHandState,
  getCurrentHandForRoom,
  getHandHistory,
  settleHand,
  processTimeoutAction,
  setShowCards,
  setNextChoice,
  finishShowdownDisplay,
  SHOWDOWN_DISPLAY_MS
};
