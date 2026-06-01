import { motion } from 'framer-motion';

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

export default function PokerCard({ card, faceDown = false, size = 'md', animate = false }) {
  const sizeClasses = {
    sm: 'w-8 h-12 text-sm',
    md: 'w-10 h-14 text-base',
    lg: 'w-12 h-18 text-lg'
  };

  const rank = card ? card[0] : '';
  const suit = card ? card[1] : '';
  const symbol = SUIT_SYMBOLS[suit] || suit;
  const colorClass = SUIT_COLORS[suit] || 'text-slate-800';

  return (
    <div className={`relative ${sizeClasses[size] || sizeClasses.md}`} style={{ perspective: '600px' }}>
      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: 'preserve-3d' }}
        initial={animate ? { rotateY: 180 } : false}
        animate={{ rotateY: faceDown ? 180 : 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Front face */}
        <div
          className="absolute inset-0 rounded-lg bg-white border border-slate-200 shadow-md flex flex-col items-center justify-center select-none"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <span className={`font-bold ${colorClass} leading-none`}>{rank}</span>
          <span className={`${colorClass} leading-none`}>{symbol}</span>
        </div>

        {/* Back face */}
        <div
          className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-white/20 shadow-md flex items-center justify-center"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="w-3/4 h-3/4 rounded border border-white/10 bg-white/5" />
        </div>
      </motion.div>
    </div>
  );
}
