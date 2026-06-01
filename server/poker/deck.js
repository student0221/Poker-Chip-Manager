const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['c', 'd', 'h', 's']; // clubs, diamonds, hearts, spades
const RANK_VALUE = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ card: rank + suit, rank, suit, value: RANK_VALUE[rank] });
    }
  }
  return deck;
}

function shuffle(deck) {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function deal(deck, count) {
  return deck.splice(0, count);
}

function cardFromString(str) {
  if (!str || str.length !== 2) return null;
  const rank = str[0].toUpperCase();
  const suit = str[1].toLowerCase();
  if (!RANK_VALUE[rank] || !SUITS.includes(suit)) return null;
  return { card: rank + suit, rank, suit, value: RANK_VALUE[rank] };
}

function cardsFromStrings(arr) {
  return arr.map(cardFromString).filter(Boolean);
}

module.exports = {
  RANKS,
  SUITS,
  RANK_VALUE,
  createDeck,
  shuffle,
  deal,
  cardFromString,
  cardsFromStrings
};
