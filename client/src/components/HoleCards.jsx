import { motion } from 'framer-motion';
import PokerCard from './PokerCard';

export default function HoleCards({ cards = [], label, animate = false, size = 'sm' }) {
  const cardList = Array.isArray(cards) ? cards : [];

  return (
    <div className="flex flex-col items-center gap-0.5">
      {label && <div className="text-[10px] text-slate-400">{label}</div>}
      <motion.div
        className="flex items-center gap-1"
        initial={animate ? { scale: 0.5, opacity: 0, y: -20 } : false}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
      >
        <PokerCard card={cardList[0] || null} faceDown={!cardList[0]} size={size} />
        <PokerCard card={cardList[1] || null} faceDown={!cardList[1]} size={size} />
      </motion.div>
    </div>
  );
}
