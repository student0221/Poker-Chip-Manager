import PokerCard from './PokerCard';

export default function HoleCards({ cards = [], label }) {
  const cardList = Array.isArray(cards) ? cards : [];

  return (
    <div className="flex flex-col items-center gap-1">
      {label && <div className="text-xs text-slate-400">{label}</div>}
      <div className="flex items-center gap-1.5">
        <PokerCard card={cardList[0] || null} faceDown={!cardList[0]} size="md" />
        <PokerCard card={cardList[1] || null} faceDown={!cardList[1]} size="md" />
      </div>
    </div>
  );
}
