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

function getSeatPosition(seatIndex, totalSeats) {
  const angleDeg = 90 + seatIndex * (360 / totalSeats);
  const angleRad = (angleDeg * Math.PI) / 180;
  const rx = 42;
  const ry = 40;
  return {
    left: `${50 + rx * Math.cos(angleRad)}%`,
    top: `${50 + ry * Math.sin(angleRad)}%`
  };
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

  const getPlayerAtSeat = (seat) => handPlayers?.find(p => p.seat === seat);

  if (!hand) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-slate-400">暂无进行中的手牌</div>
        {isHost && (
          <button
            onClick={onStartHand}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition"
          >
            开始新一手
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[4/3] max-w-3xl mx-auto">
      {/* Table background */}
      <div className="absolute inset-0 rounded-[50%] bg-gradient-to-b from-emerald-700 to-emerald-900 shadow-2xl border-8 border-emerald-950" />

      {/* Community cards and pot - center */}
      <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-10">
        <PotDisplay totalPot={totalPot} pots={pots || []} />
        <CommunityCards cards={communityCards} />
        {hand.current_round && (
          <div className="text-xs text-emerald-200/80 bg-black/30 px-3 py-1 rounded-full">
            {ROUND_NAMES[hand.current_round] || hand.current_round}
          </div>
        )}
      </div>

      {/* Player seats */}
      {Array.from({ length: totalSeats }, (_, i) => {
        const pos = getSeatPosition(i, totalSeats);
        const player = getPlayerAtSeat(i);
        if (!player) return null;

        const isCurrent = hand.current_seat === i;
        const isFolded = !!player.is_folded;
        const isAllIn = !!player.is_all_in;
        const isMe = player.player_id === myPlayerId;

        let statusBadge = null;
        if (isFolded) statusBadge = <span className="text-xs text-slate-400">弃牌</span>;
        else if (isAllIn) statusBadge = <span className="text-xs text-amber-400 font-bold">All-in</span>;
        else if (isCurrent) statusBadge = <span className="text-xs text-emerald-300 font-bold animate-pulse">行动中</span>;

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
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
            style={{ left: pos.left, top: pos.top }}
          >
            <div className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
              isCurrent ? 'bg-white/20 scale-110' : 'bg-black/30'
            } ${isFolded ? 'opacity-50' : ''}`}>
              {player.current_bet > 0 && (
                <div className="text-xs font-bold text-amber-300 bg-black/50 px-2 py-0.5 rounded-full">
                  {player.current_bet}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Avatar nickname={player.nickname || '?'} src={player.avatar} size="sm" />
                <div className="text-center">
                  <div className="text-xs font-bold text-white truncate max-w-[80px]">
                    {player.nickname || '?'}{isMe ? ' (你)' : ''}
                  </div>
                  <div className="text-xs text-emerald-200">{player.current_chips}</div>
                  {statusBadge}
                </div>
              </div>
              <HoleCards cards={holeCards} />
            </div>
          </div>
        );
      })}

      {/* Action panel at bottom */}
      {isMyTurn && myPlayer && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-full max-w-md z-30">
          <ActionPanel
            currentBet={Math.max(...(handPlayers?.map(p => p.current_bet) || [0]))}
            myBet={myPlayer.current_bet}
            myChips={myPlayer.current_chips}
            bigBlind={hand.big_blind_amount}
            onAction={onAction}
          />
        </div>
      )}

      {/* Start new hand button for host when no active hand */}
      {isHost && (hand.status === 'completed' || hand.status === 'showdown') && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => { setShowResult(false); onStartHand(); }}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition shadow-lg"
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
        <div className="absolute top-2 right-2 z-30">
          <button
            onClick={() => setShowResult(true)}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition shadow"
          >
            查看结果
          </button>
        </div>
      )}
    </div>
  );
}
