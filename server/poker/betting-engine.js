/**
 * Betting engine for Texas Hold'em.
 * Handles: action validation, round completion detection, side pot calculation.
 */

function getMinRaise(currentBet, lastRaiseAmount, bigBlind) {
  // Minimum raise = current bet + last raise amount (or big blind if no raise yet)
  const minRaiseAmt = lastRaiseAmount || bigBlind;
  return currentBet + minRaiseAmt;
}

function validateAction(player, action, amount, tableState) {
  const {
    currentBet,
    lastRaiseAmount,
    bigBlind,
    activePlayers // array of { id, currentBet, current_chips, is_folded, is_all_in }
  } = tableState;

  if (player.is_folded) {
    return { valid: false, error: 'Player has folded' };
  }
  if (player.is_all_in) {
    return { valid: false, error: 'Player is all-in' };
  }

  const toCall = currentBet - player.current_bet;
  const contributionToRaise = amount - player.current_bet;

  switch (action) {
    case 'fold':
      return { valid: true };

    case 'check':
      if (toCall > 0) {
        return { valid: false, error: `Cannot check, need to call ${toCall}` };
      }
      return { valid: true };

    case 'call':
      if (toCall <= 0) {
        return { valid: false, error: 'Nothing to call, you can check' };
      }
      if (amount !== toCall) {
        return { valid: false, error: `Call amount must be ${toCall}` };
      }
      if (player.current_chips < toCall) {
        return { valid: false, error: 'Not enough chips to call' };
      }
      return { valid: true };

    case 'raise':
      if (toCall > 0 && amount <= toCall) {
        return { valid: false, error: `Raise must be greater than call amount ${toCall}` };
      }
      if (toCall === 0 && amount < bigBlind) {
        return { valid: false, error: `Raise must be at least big blind ${bigBlind}` };
      }
      const minRaise = getMinRaise(currentBet, lastRaiseAmount, bigBlind);
      if (amount < minRaise) {
        return { valid: false, error: `Minimum raise is ${minRaise}` };
      }
      if (contributionToRaise <= 0) {
        return { valid: false, error: 'Raise must increase your bet' };
      }
      if (player.current_chips < contributionToRaise) {
        return { valid: false, error: 'Not enough chips for this raise' };
      }
      return { valid: true };

    case 'all-in':
      return { valid: true };

    default:
      return { valid: false, error: `Unknown action: ${action}` };
  }
}

function isRoundComplete(activePlayers, currentBet, lastActorId) {
  // activePlayers: those who haven't folded
  // Round is complete when:
  // 1. All non-folded players have matched the current bet OR are all-in
  // 2. At least one action has been taken (not just blinds)
  // 3. The action has returned to the last raiser (or to the last person who needs to act)

  const contenders = activePlayers.filter(p => !p.is_folded);
  if (contenders.length <= 1) return true;

  // Everyone must have acted at least once in this round
  const notActed = contenders.filter(p => !p.has_acted_this_round);
  if (notActed.length > 0) return false;

  // All active (not all-in) players must have matched current bet
  for (const p of contenders) {
    if (!p.is_all_in && p.current_bet !== currentBet) {
      return false;
    }
  }

  return true;
}

function getNextSeat(seats, currentSeat, handPlayers) {
  // seats: sorted array of occupied seat numbers
  // Find next seat after currentSeat that has an active player
  const n = seats.length;
  if (n === 0) return null;

  const idx = seats.indexOf(currentSeat);
  for (let i = 1; i <= n; i++) {
    const s = seats[(idx + i) % n];
    const hp = handPlayers.find(p => p.seat === s);
    if (hp && !hp.is_folded && !hp.is_all_in && hp.is_active) {
      return s;
    }
  }
  return null;
}

function calculatePots(handPlayers) {
  // handPlayers: array of { player_id, total_bet, is_folded }
  // Folded players still contribute chips to the pot, but they are not eligible to win it.
  const contributors = handPlayers.filter(p => p.total_bet > 0);
  if (contributors.length === 0) return [];

  const sorted = contributors.slice().sort((a, b) => a.total_bet - b.total_bet);

  const pots = [];
  let prevBet = 0;

  for (let i = 0; i < sorted.length; i++) {
    const bet = sorted[i].total_bet;
    if (bet === prevBet) continue;

    const remaining = sorted.slice(i);
    const eligible = remaining.filter(p => !p.is_folded).map(p => p.player_id);
    const amount = (bet - prevBet) * remaining.length;
    if (eligible.length === 0) {
      prevBet = bet;
      continue;
    }
    pots.push({
      amount,
      eligible_players: eligible,
      is_side_pot: pots.length > 0 ? 1 : 0
    });
    prevBet = bet;
  }

  return pots;
}

function distributePots(pots, evaluatedHands) {
  // pots: array of { amount, eligible_players: [playerIds] }
  // evaluatedHands: sorted array from compareHands (strongest first)
  // Returns: array of { player_id, amount }

  const winnings = {};
  for (const pot of pots) {
    const eligible = pot.eligible_players;
    // Find best hand among eligible players
    const eligibleEvals = evaluatedHands.filter(h => eligible.includes(h.playerId));
    if (eligibleEvals.length === 0) continue;

    const bestRank = eligibleEvals[0]; // Already sorted strongest first
    // Find all players tied for best
    const { compareEval } = require('./hand-evaluator');
    const winners = eligibleEvals.filter(h => compareEval(h, bestRank) === 0);

    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;

    for (let i = 0; i < winners.length; i++) {
      const pid = winners[i].playerId;
      winnings[pid] = (winnings[pid] || 0) + share + (i < remainder ? 1 : 0);
    }
  }

  return Object.entries(winnings).map(([player_id, amount]) => ({ player_id: parseInt(player_id, 10), amount }));
}

module.exports = {
  getMinRaise,
  validateAction,
  isRoundComplete,
  getNextSeat,
  calculatePots,
  distributePots
};
