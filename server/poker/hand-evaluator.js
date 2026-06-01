const { RANK_VALUE, SUITS } = require('./deck');

const HAND_RANKS = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

const HAND_NAMES = {
  [HAND_RANKS.HIGH_CARD]: '高牌',
  [HAND_RANKS.ONE_PAIR]: '一对',
  [HAND_RANKS.TWO_PAIR]: '两对',
  [HAND_RANKS.THREE_OF_A_KIND]: '三条',
  [HAND_RANKS.STRAIGHT]: '顺子',
  [HAND_RANKS.FLUSH]: '同花',
  [HAND_RANKS.FULL_HOUSE]: '葫芦',
  [HAND_RANKS.FOUR_OF_A_KIND]: '四条',
  [HAND_RANKS.STRAIGHT_FLUSH]: '同花顺',
  [HAND_RANKS.ROYAL_FLUSH]: '皇家同花顺'
};

function cardFromString(str) {
  if (!str || str.length !== 2) return null;
  const rank = str[0].toUpperCase();
  const suit = str[1].toLowerCase();
  const value = RANK_VALUE[rank];
  if (!value || !SUITS.includes(suit)) return null;
  return { card: str, rank, suit, value };
}

function evaluate5(cards) {
  // cards: array of { value, suit }
  const values = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  // Check straight (including A-2-3-4-5 wheel)
  let isStraight = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] - values[i] !== 1) {
      isStraight = false;
      break;
    }
  }
  let straightHigh = values[0];
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5; // A-2-3-4-5 wheel
  }

  if (isFlush && isStraight) {
    const rank = straightHigh === 14 ? HAND_RANKS.ROYAL_FLUSH : HAND_RANKS.STRAIGHT_FLUSH;
    return { rank, name: HAND_NAMES[rank], kickers: [straightHigh] };
  }

  // Count frequencies
  const freq = {};
  for (const v of values) {
    freq[v] = (freq[v] || 0) + 1;
  }
  const entries = Object.entries(freq).map(([v, c]) => ({ value: parseInt(v, 10), count: c }));
  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.value - a.value;
  });

  const counts = entries.map(e => e.count);
  const sortedValues = entries.map(e => e.value);

  if (counts[0] === 4) {
    return { rank: HAND_RANKS.FOUR_OF_A_KIND, name: HAND_NAMES[HAND_RANKS.FOUR_OF_A_KIND], kickers: sortedValues };
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return { rank: HAND_RANKS.FULL_HOUSE, name: HAND_NAMES[HAND_RANKS.FULL_HOUSE], kickers: sortedValues };
  }
  if (isFlush) {
    return { rank: HAND_RANKS.FLUSH, name: HAND_NAMES[HAND_RANKS.FLUSH], kickers: values };
  }
  if (isStraight) {
    return { rank: HAND_RANKS.STRAIGHT, name: HAND_NAMES[HAND_RANKS.STRAIGHT], kickers: [straightHigh] };
  }
  if (counts[0] === 3) {
    return { rank: HAND_RANKS.THREE_OF_A_KIND, name: HAND_NAMES[HAND_RANKS.THREE_OF_A_KIND], kickers: sortedValues };
  }
  if (counts[0] === 2 && counts[1] === 2) {
    return { rank: HAND_RANKS.TWO_PAIR, name: HAND_NAMES[HAND_RANKS.TWO_PAIR], kickers: sortedValues };
  }
  if (counts[0] === 2) {
    return { rank: HAND_RANKS.ONE_PAIR, name: HAND_NAMES[HAND_RANKS.ONE_PAIR], kickers: sortedValues };
  }
  return { rank: HAND_RANKS.HIGH_CARD, name: HAND_NAMES[HAND_RANKS.HIGH_CARD], kickers: values };
}

function evaluate7(cardStrings) {
  // Convert strings to card objects
  const cards = cardStrings.map(cardFromString).filter(Boolean);
  if (cards.length < 5) return null;

  // Generate all C(n,5) combinations and find the best
  let best = null;
  const n = cards.length;

  function combo5(start, chosen) {
    if (chosen.length === 5) {
      const result = evaluate5(chosen);
      if (!best || compareEval(result, best) > 0) {
        best = result;
      }
      return;
    }
    for (let i = start; i < n; i++) {
      chosen.push(cards[i]);
      combo5(i + 1, chosen);
      chosen.pop();
    }
  }

  combo5(0, []);
  return best;
}

function compareEval(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
    const av = a.kickers[i] || 0;
    const bv = b.kickers[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function compareHands(hands) {
  // hands: array of { playerId, cardStrings }
  // Returns array of { playerId, eval, won } sorted by strength desc
  const evaluated = hands.map(h => ({
    playerId: h.playerId,
    eval: evaluate7(h.cardStrings),
    cardStrings: h.cardStrings
  })).filter(h => h.eval);

  evaluated.sort((a, b) => compareEval(b.eval, a.eval));

  // Group by equal strength
  const groups = [];
  for (const ev of evaluated) {
    if (groups.length === 0 || compareEval(groups[groups.length - 1][0].eval, ev.eval) !== 0) {
      groups.push([ev]);
    } else {
      groups[groups.length - 1].push(ev);
    }
  }

  const result = [];
  for (const group of groups) {
    for (const ev of group) {
      result.push({
        playerId: ev.playerId,
        rank: ev.eval.rank,
        name: ev.eval.name,
        kickers: ev.eval.kickers,
        cardStrings: ev.cardStrings
      });
    }
  }
  return result;
}

module.exports = {
  HAND_RANKS,
  HAND_NAMES,
  evaluate5,
  evaluate7,
  compareEval,
  compareHands,
  cardFromString
};
