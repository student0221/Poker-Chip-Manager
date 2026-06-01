import PokerCard from './PokerCard';

export default function CommunityCards({ cards = [] }) {
  // Always show 5 slots
  const slots = [0, 1, 2, 3, 4];

  return (
    <div className="flex items-center justify-center gap-2">
      {slots.map((i) => (
        <PokerCard
          key={i}
          card={cards[i] || null}
          faceDown={!cards[i]}
          size="lg"
        />
      ))}
    </div>
  );
}
