import { motion } from 'framer-motion';

const SUIT_SYMBOLS = {
  h: '\u2665',
  d: '\u2666',
  c: '\u2663',
  s: '\u2660'
};

const SUIT_NAMES = {
  h: '红桃',
  d: '方块',
  c: '梅花',
  s: '黑桃'
};

const SIZE_CLASSES = {
  xs: {
    box: 'h-8 w-5 rounded-[4px]',
    corner: 'text-[7px]',
    center: 'text-sm',
    inset: 'inset-[3px]'
  },
  sm: {
    box: 'h-12 w-8 rounded-md',
    corner: 'text-[9px]',
    center: 'text-xl',
    inset: 'inset-1'
  },
  md: {
    box: 'h-16 w-11 rounded-lg',
    corner: 'text-[11px]',
    center: 'text-2xl',
    inset: 'inset-1.5'
  },
  lg: {
    box: 'h-20 w-14 rounded-xl',
    corner: 'text-xs',
    center: 'text-3xl',
    inset: 'inset-2'
  }
};

function parseCard(card) {
  if (!card || typeof card !== 'string') {
    return { rank: '', suit: '' };
  }

  const normalized = card.trim();
  if (normalized.length < 2) {
    return { rank: '', suit: '' };
  }

  const suit = normalized.slice(-1).toLowerCase();
  const rawRank = normalized.slice(0, -1).toUpperCase();
  const rank = rawRank === 'T' ? '10' : rawRank;

  return { rank, suit };
}

export default function PokerCard({ card, faceDown = false, size = 'md', animate = false }) {
  const sizing = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const { rank, suit } = parseCard(card);
  const symbol = SUIT_SYMBOLS[suit] || suit;
  const isRed = suit === 'h' || suit === 'd';
  const colorClass = isRed ? 'text-red-600' : 'text-slate-950';
  const label = rank && symbol ? `${rank}${SUIT_NAMES[suit] || symbol}` : '空牌';

  return (
    <div className={`relative ${sizing.box}`} style={{ perspective: '700px' }} title={faceDown ? '暗牌' : label}>
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={animate ? { rotateY: 180 } : false}
        animate={{ rotateY: faceDown ? 180 : 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <div
          className="absolute inset-0 select-none overflow-hidden border border-slate-300 bg-white shadow-md"
          style={{ backfaceVisibility: 'hidden', borderRadius: 'inherit' }}
        >
          <div className={`absolute left-[10%] top-[7%] flex flex-col items-center font-black leading-none ${sizing.corner} ${colorClass}`}>
            <span>{rank}</span>
            <span>{symbol}</span>
          </div>
          <div className={`absolute bottom-[7%] right-[10%] flex rotate-180 flex-col items-center font-black leading-none ${sizing.corner} ${colorClass}`}>
            <span>{rank}</span>
            <span>{symbol}</span>
          </div>
          <div className={`absolute ${sizing.inset} rounded-[inherit] border border-slate-100`} />
          <div className={`absolute inset-0 flex items-center justify-center font-serif font-black leading-none ${sizing.center} ${colorClass}`}>
            {symbol}
          </div>
        </div>

        <div
          className="absolute inset-0 flex items-center justify-center overflow-hidden border border-blue-950/40 bg-blue-800 shadow-md"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: 'inherit' }}
        >
          <div className="absolute inset-0 opacity-40" style={{
            backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.22) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.22) 75%), linear-gradient(45deg, rgba(255,255,255,.22) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.22) 75%)',
            backgroundPosition: '0 0, 6px 6px',
            backgroundSize: '12px 12px'
          }} />
          <div className="relative h-[72%] w-[68%] rounded-[inherit] border border-white/45 bg-blue-900/35" />
        </div>
      </motion.div>
    </div>
  );
}
