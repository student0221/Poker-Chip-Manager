const SUIT_SYMBOLS = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠'
};

const SUIT_COLORS = {
  h: 'text-red-600',
  d: 'text-red-600',
  c: 'text-slate-800',
  s: 'text-slate-800'
};

export default function PokerCard({ card, faceDown = false, size = 'md' }) {
  const sizeClasses = {
    sm: 'w-8 h-12 text-sm',
    md: 'w-12 h-18 text-base',
    lg: 'w-16 h-24 text-lg'
  };

  if (faceDown || !card) {
    return (
      <div className={`${sizeClasses[size] || sizeClasses.md} rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-white/20 shadow-md flex items-center justify-center`}>
        <div className="w-3/4 h-3/4 rounded border border-white/10 bg-white/5" />
      </div>
    );
  }

  const rank = card[0];
  const suit = card[1];
  const symbol = SUIT_SYMBOLS[suit] || suit;
  const colorClass = SUIT_COLORS[suit] || 'text-slate-800';

  return (
    <div className={`${sizeClasses[size] || sizeClasses.md} rounded-lg bg-white border border-slate-200 shadow-md flex flex-col items-center justify-center select-none`}>
      <span className={`font-bold ${colorClass} leading-none`}>{rank}</span>
      <span className={`${colorClass} leading-none`}>{symbol}</span>
    </div>
  );
}
