import { useEffect, useRef } from 'react';
import PokerCard from './PokerCard';

export default function CommunityCards({ cards = [] }) {
  // Always show 5 slots
  const slots = [0, 1, 2, 3, 4];
  const prevCountRef = useRef(0);

  useEffect(() => {
    prevCountRef.current = cards.length;
  }, [cards.length]);

  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
      {slots.map((i) => {
        const hasCard = !!cards[i];
        const isNew = hasCard && i >= prevCountRef.current;
        return (
          <PokerCard
            key={i}
            card={cards[i] || null}
            faceDown={!hasCard}
            size="lg"
            animate={isNew}
          />
        );
      })}
    </div>
  );
}
