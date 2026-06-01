import { useMemo, useState } from 'react';
import Avatar from './Avatar';
import CommunityCards from './CommunityCards';
import HandResult from './HandResult';
import HoleCards from './HoleCards';
import ActionPanel from './ActionPanel';
import PotDisplay from './PotDisplay';

const ROUND_NAMES = {
  preflop: '翻牌前',
  flop: '翻牌圈',
  turn: '转牌圈',
  river: '河牌圈',
  showdown: '摊牌'
};

/**
 * Calculate seat positions on an ellipse.
 * The player's own seat is always at the bottom center.
 */
function getSeatLayout(mySeat, totalSeats) {
  if (totalSeats <= 0) return [];

  // Angle step between seats
  const angleStep = 360 / totalSeats;
  // Offset so mySeat is at bottom (90 degrees)
  const offsetDeg = 90 - mySeat * angleStep;

  // Adjust ellipse radius based on seat count
  // More seats = slightly larger radius but capped
  const rx = Math.min(46, 38 + totalSeats * 1.2);
  const ry = Math.min(44, 36 + totalSeats * 1.0);

  return Array.from({ length: totalSeats }, (_, i) => {
    const angleDeg = offsetDeg + i * angleStep;
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      left: `${50 + rx * Math.cos(angleRad)}%`,
      top: `${50 + ry * Math.sin(angleRad)}%`
    };
  });
}

export default function PokerTable({ handState, myPlayerId, isHost, onAction, onStartHand }) {
  const { hand, players: handPlayers, actions, pots } = handState || {};
  const [showResult, setShowResult] = useState(false);

  const isMyTurn = useMemo(() => {
    if (!hand || !handPlayers) return false;
    const me = handPlayers.find(p => p.player_id === myPlayerId);
    return me && me.seat === hand.current_seat && !me.is_folded && !me.is_all_in;
  }, [hand, handPlayers, myPlayerId]);

  const myPlayer = useMemo(() => {
    return handPlayers?.find(p => p.player_id === myPlayerId);
  }, [handPlayers, myPlayerId]);

  const totalPot = hand?.total_pot || 0;
  const communityCards = useMemo(() => {
    try {
      return JSON.parse(hand?.community_cards || '[]');
    } catch {
      return [];
    }
  }, [hand?.community_cards]);

  const totalSeats = handPlayers?.length || 0;
  const mySeat = myPlayer?.seat ?? 0;
  const seatLayouts = useMemo(() => getSeatLayout(mySeat, totalSeats), [mySeat, totalSeats]);
  const getPlayerAtSeat = (seat) => handPlayers?.find(p => p.seat === seat);

  if (!hand) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-slate-400">暂无进行中的手牌</div>
        {isHost && (
          <button
            onClick={onStartHand}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition shadow-lg"
          >
            开始新一手
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-4xl mx-auto" style={{ aspectRatio: '16/10' }}>
      {/* Felt table with wood rail */}
      <div className="absolute inset-[2%] rounded-[45%] shadow-2xl"
        style={{
          background: 'radial-gradient(ellipse at center, #1a5c3a 0%, #0f3d26 60%, #0a2e1c 100%)',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 10px 40px rgba(0,0,0,0.4)'
        }}
      />
      {/* Wood border */}
      <div className="absolute inset-0 rounded-[48%] pointer-events-none"
        style={{
          border: '12px solid transparent',
          background: 'linear-gradient(#8B5E3C, #5C3A1E) border-box',
          WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          opacity: 0.95
        }}
      />
      {/* Inner felt line */}
      <div className="absolute inset-[5%] rounded-[42%] border-2 border-white/10 pointer-events-none" />

      {/* Community cards and pot - center */}
      <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
        <PotDisplay totalPot={totalPot} pots={pots || []} />
        <CommunityCards cards={communityCards} />
        {hand.current_round && (
          <div className="text-xs text-emerald-100/70 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
            {ROUND_NAMES[hand.current_round] || hand.current_round}
          </div>
        )}
      </div>

      {/* Dealer button indicator */}
      <div
        className="absolute z-10 w-7 h-7 rounded-full bg-white text-slate-800 text-[10px] font-bold flex items-center justify-center shadow-lg border-2 border-amber-400"
        style={{
          left: seatLayouts[hand.dealer_seat]?.left,
          top: seatLayouts[hand.dealer_seat]?.top,
          transform: 'translate(-50%, -50%) translateY(-28px)'
        }}
      >
        D
      </div>

      {/* Player seats */}
      {seatLayouts.map((pos, seatIndex) => {
        const player = getPlayerAtSeat(seatIndex);
        if (!player) return null;

        const isCurrent = hand.current_seat === seatIndex;
        const isFolded = !!player.is_folded;
        const isAllIn = !!player.is_all_in;
        const isMe = player.player_id === myPlayerId;

        let statusBadge = null;
        if (isFolded) statusBadge = <span className="text-[10px] text-slate-400 font-medium">弃牌</span>;
        else if (isAllIn) statusBadge = <span className="text-[10px] text-amber-400 font-bold">All-in</span>;
        else if (isCurrent) statusBadge = <span className="text-[10px] text-emerald-300 font-bold animate-pulse">行动中</span>;

        const holeCards = (() => {
          try {
            const cards = JSON.parse(player.hole_cards || '[]');
            return isMe || isHost ? cards : [];
          } catch {
            return [];
          }
        })();

        return (
          <div
            key={seatIndex}
            className="absolute z-20"
            style={{ left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)' }}
          >
            {/* Current turn glow ring */}
            {isCurrent && !isFolded && (
              <div className="absolute inset-[-6px] rounded-2xl border-2 border-amber-400/60 animate-pulse pointer-events-none" />
            )}

            <div className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[72px] ${
              isCurrent ? 'bg-white/15 scale-105' : 'bg-black/40'
            } ${isFolded ? 'opacity-45' : ''} backdrop-blur-sm`}>

              {/* Bet chip above player */}
              {player.current_bet > 0 && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                  <div className="text-[10px] font-bold text-amber-300 bg-black/60 px-2 py-0.5 rounded-full whitespace-nowrap border border-amber-500/30">
                    {player.current_bet}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <Avatar nickname={player.nickname || '?'} src={player.avatar} size="sm" />
                <div className="text-center leading-tight">
                  <div className="text-[11px] font-bold text-white truncate max-w-[60px]">
                    {player.nickname || '?'}{isMe ? '' : ''}
                  </div>
                  <div className="text-[10px] text-emerald-300 font-mono">{player.current_chips}</div>
                  {statusBadge}
                </div>
              </div>

              {/* Hole cards - smaller for non-me players */}
              <div className="flex gap-0.5 mt-0.5">
                {(isMe || isHost) ? (
                  <HoleCards cards={holeCards} />
                ) : (
                  <div className="flex gap-0.5">
                    <div className="w-5 h-7 rounded bg-gradient-to-br from-blue-700 to-blue-900 border border-white/10" />
                    <div className="w-5 h-7 rounded bg-gradient-to-br from-blue-700 to-blue-900 border border-white/10" />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Action panel at bottom */}
      {isMyTurn && myPlayer && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-full max-w-sm z-30 px-2">
          <ActionPanel
            currentBet={Math.max(...(handPlayers?.map(p => p.current_bet) || [0]))}
            myBet={myPlayer.current_bet}
            myChips={myPlayer.current_chips}
            bigBlind={hand.big_blind_amount}
            onAction={onAction}
          />
        </div>
      )}

      {/* Start new hand button for host when hand ended */}
      {isHost && (hand.status === 'completed' || hand.status === 'showdown') && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => { setShowResult(false); onStartHand(); }}
            className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-full transition shadow-lg text-sm"
          >
            开始新一手
          </button>
        </div>
      )}

      {/* Hand result overlay */}
      {(hand.status === 'completed' || hand.status === 'showdown') && showResult && (
        <HandResult handState={handState} onClose={() => setShowResult(false)} />
      )}

      {/* Show result button */}
      {(hand.status === 'completed' || hand.status === 'showdown') && !showResult && (
        <div className="absolute top-3 right-3 z-30">
          <button
            onClick={() => setShowResult(true)}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-full transition shadow"
          >
            查看结果
          </button>
        </div>
      )}
    </div>
  );
}
