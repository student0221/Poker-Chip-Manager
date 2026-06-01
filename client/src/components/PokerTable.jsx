import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from './Avatar';
import CommunityCards from './CommunityCards';
import HandResult from './HandResult';
import HoleCards from './HoleCards';
import ActionPanel from './ActionPanel';
import ActionTimer from './ActionTimer';
import PotDisplay from './PotDisplay';

const ROUND_NAMES = {
  preflop: '翻牌前',
  flop: '翻牌圈',
  turn: '转牌圈',
  river: '河牌圈',
  showdown: '摊牌'
};

const POSITION_BADGES = {
  dealer: {
    label: '庄',
    shortLabel: 'D',
    className: 'bg-white text-slate-900 border-amber-400'
  },
  smallBlind: {
    label: '小盲',
    shortLabel: 'SB',
    className: 'bg-sky-100 text-sky-900 border-sky-400'
  },
  bigBlind: {
    label: '大盲',
    shortLabel: 'BB',
    className: 'bg-amber-100 text-amber-900 border-amber-500'
  }
};

function getPositionBadges(hand, seatIndex) {
  if (!hand) return [];
  const badges = [];
  if (hand.dealer_seat === seatIndex) badges.push(POSITION_BADGES.dealer);
  if (hand.small_blind_seat === seatIndex) badges.push(POSITION_BADGES.smallBlind);
  if (hand.big_blind_seat === seatIndex) badges.push(POSITION_BADGES.bigBlind);
  return badges;
}

function getSeatLayout(mySeat, totalSeats, isMobile) {
  if (totalSeats <= 0) return [];
  const angleStep = 360 / totalSeats;
  const offsetDeg = 90 - mySeat * angleStep;
  // Mobile: much tighter layout
  const rx = isMobile ? Math.min(36, 28 + totalSeats) : Math.min(46, 38 + totalSeats * 1.2);
  const ry = isMobile ? Math.min(34, 26 + totalSeats) : Math.min(44, 36 + totalSeats * 1.0);

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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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
  const isCrowdedMobile = isMobile && totalSeats >= 7;
  const seatLayouts = useMemo(() => getSeatLayout(mySeat, totalSeats, isMobile), [mySeat, totalSeats, isMobile]);
  const centerTopClass = isMobile ? 'top-[51%]' : 'top-[44%]';
  const getPlayerAtSeat = (seat) => handPlayers?.find(p => p.seat === seat);
  const handKey = hand?.id || 'none';

  if (!hand) {
    return (
      <div className="flex flex-col items-center justify-center py-6 sm:py-12 space-y-3 sm:space-y-4">
        <div className="text-slate-400 text-xs sm:text-sm">暂无进行中的牌局</div>
        {isHost && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onStartHand}
            className="px-4 sm:px-5 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition shadow-lg text-xs sm:text-sm"
          >
            开始新一手
          </motion.button>
        )}
      </div>
    );
  }

  const actionPanel = (
    <ActionPanel
      currentBet={Math.max(...(handPlayers?.map(p => p.current_bet) || [0]))}
      myBet={myPlayer?.current_bet}
      myChips={myPlayer?.current_chips}
      bigBlind={hand.big_blind_amount}
      onAction={onAction}
    />
  );

  return (
    <>
    <div className={`relative w-full mx-auto ${isMobile ? 'max-w-[420px]' : 'max-w-4xl'}`}
      style={isMobile ? { height: 'clamp(360px, 105vw, 440px)' } : { minHeight: '420px' }}>
      {/* Felt table */}
      <div className="absolute inset-[1%] sm:inset-[2%] rounded-[45%] shadow-2xl"
        style={{
          background: 'radial-gradient(ellipse at center, #1a5c3a 0%, #0f3d26 60%, #0a2e1c 100%)',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 10px 40px rgba(0,0,0,0.4)'
        }}
      />
      {/* Wood border */}
      <div className="absolute inset-0 rounded-[48%] pointer-events-none"
        style={{
          border: isMobile ? '6px solid transparent' : '12px solid transparent',
          background: 'linear-gradient(#8B5E3C, #5C3A1E) border-box',
          WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          opacity: 0.95
        }}
      />

      {/* Center: pot + community cards */}
      <div className={`absolute left-1/2 ${centerTopClass} -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 sm:gap-2 z-10`}>
        <AnimatePresence mode="popLayout">
          <motion.div
            key={totalPot}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <PotDisplay totalPot={totalPot} pots={pots || []} />
          </motion.div>
        </AnimatePresence>
        <CommunityCards cards={communityCards} size={isMobile ? 'sm' : 'lg'} />
        {hand.current_round && (
          <div className="text-[9px] sm:text-xs text-emerald-100/70 bg-black/40 px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full backdrop-blur-sm">
            {ROUND_NAMES[hand.current_round] || hand.current_round}
          </div>
        )}
      </div>

      {/* Player seats */}
      <AnimatePresence>
        {seatLayouts.map((pos, seatIndex) => {
          const player = getPlayerAtSeat(seatIndex);
          if (!player) return null;

          const isCurrent = hand.current_seat === seatIndex;
          const isFolded = !!player.is_folded;
          const isAllIn = !!player.is_all_in;
          const isMe = player.player_id === myPlayerId;
          const positionBadges = getPositionBadges(hand, seatIndex);

          let statusBadge = null;
          if (isFolded) statusBadge = <span className="text-[8px] sm:text-[10px] text-slate-400 font-medium">弃牌</span>;
          else if (isAllIn) statusBadge = <span className="text-[8px] sm:text-[10px] text-amber-400 font-bold">全下</span>;
          else if (isCurrent) statusBadge = <span className="text-[8px] sm:text-[10px] text-emerald-300 font-bold animate-pulse">行动</span>;

          const holeCards = (() => {
            try {
              const cards = JSON.parse(player.hole_cards || '[]');
              return isMe || isHost ? cards : [];
            } catch {
              return [];
            }
          })();

          return (
            <motion.div
              key={`${handKey}-${seatIndex}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 20, delay: seatIndex * 0.05 }}
              className="absolute z-20"
              style={{ left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)' }}
            >
              {isCurrent && !isFolded && (
                <motion.div
                  className="absolute inset-[-3px] sm:inset-[-6px] rounded-lg sm:rounded-2xl border-2 border-amber-400/60 pointer-events-none"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}

              {positionBadges.length > 0 && (
                <div className="absolute -top-4 sm:-top-6 left-1/2 z-30 flex -translate-x-1/2 items-center justify-center gap-0.5 whitespace-nowrap">
                  {positionBadges.map((badge) => (
                    <div
                      key={badge.shortLabel}
                      className={`rounded-full border px-1.5 py-0.5 text-[8px] font-black leading-none shadow-md sm:px-2 sm:text-[10px] ${badge.className}`}
                      title={`${badge.label} (${badge.shortLabel})`}
                    >
                      <span className="hidden sm:inline">{badge.label}</span>
                      <span className="sm:hidden">{badge.shortLabel}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className={`flex flex-col items-center gap-0.5 px-0.5 sm:px-1.5 py-0.5 sm:py-1 rounded-md sm:rounded-xl transition-all ${isCrowdedMobile ? 'min-w-[36px]' : 'min-w-[44px]'} sm:min-w-[64px] ${
                isCurrent ? 'bg-white/15 scale-105' : 'bg-black/40'
              } ${isFolded ? 'opacity-45' : ''} backdrop-blur-sm`}>

                <AnimatePresence>
                  {player.current_bet > 0 && (
                    <motion.div
                      key={`bet-${player.current_bet}`}
                      initial={{ y: -10, opacity: 0, scale: 0.5 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: -10, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      className={`absolute left-1/2 -translate-x-1/2 ${positionBadges.length > 0 ? '-top-8 sm:-top-11' : '-top-3.5 sm:-top-5'}`}
                    >
                      <div className="text-[8px] sm:text-[10px] font-bold text-amber-300 bg-black/60 px-1 sm:px-2 py-0.5 rounded-full whitespace-nowrap border border-amber-500/30">
                        {player.current_bet}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center gap-0.5 sm:gap-1">
                  <Avatar nickname={player.nickname || '?'} src={player.avatar} size={isMobile ? 'xs' : 'sm'} />
                  <div className="text-center leading-tight">
                    <div className="text-[8px] sm:text-[10px] font-bold text-white truncate max-w-[28px] sm:max-w-[50px]">
                      {player.nickname || '?'}
                    </div>
                    <div className="text-[8px] sm:text-[10px] text-emerald-300 font-mono">{player.current_chips}</div>
                    {statusBadge}
                  </div>
                </div>

                <div className="flex gap-0.5 mt-0.5">
                  {(isMe || isHost) ? (
                    <HoleCards cards={holeCards} size={isCrowdedMobile ? 'xs' : 'sm'} animate />
                  ) : (
                    <motion.div
                      className="flex gap-0.5"
                      initial={{ rotateY: 180 }}
                      animate={{ rotateY: 0 }}
                      transition={{ duration: 0.5, delay: 0.3 }}
                    >
                      <div className="w-3 h-4 sm:w-5 sm:h-7 rounded bg-gradient-to-br from-blue-700 to-blue-900 border border-white/10" />
                      <div className="w-3 h-4 sm:w-5 sm:h-7 rounded bg-gradient-to-br from-blue-700 to-blue-900 border border-white/10" />
                    </motion.div>
                  )}
                </div>
              </div>

              {isCurrent && !isFolded && (
                <div className="absolute -bottom-4 sm:-bottom-5 left-1/2 -translate-x-1/2 w-12 sm:w-20">
                  <ActionTimer
                    isActive={true}
                    timeoutSeconds={hand.action_timeout_seconds}
                    startedAt={hand.action_started_at}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Action panel */}
      <AnimatePresence>
        {isMyTurn && myPlayer && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="absolute bottom-0 left-1/2 hidden w-full max-w-sm -translate-x-1/2 px-2 sm:block z-30"
          >
            {actionPanel}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start new hand button */}
      <AnimatePresence>
        {isHost && (hand.status === 'completed' || hand.status === 'showdown') && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute bottom-1.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-30"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setShowResult(false); onStartHand(); }}
              className="px-3 sm:px-6 py-1.5 sm:py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-full transition shadow-lg text-[10px] sm:text-sm"
            >
              开始新一手
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hand result overlay */}
      <AnimatePresence>
        {(hand.status === 'completed' || hand.status === 'showdown') && showResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <HandResult handState={handState} onClose={() => setShowResult(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Show result button */}
      <AnimatePresence>
        {(hand.status === 'completed' || hand.status === 'showdown') && !showResult && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute top-1.5 sm:top-3 right-1.5 sm:right-3 z-30"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowResult(true)}
              className="px-1.5 sm:px-3 py-0.5 sm:py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[9px] sm:text-xs font-semibold rounded-full transition shadow"
            >
              结果
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    <AnimatePresence>
      {isMyTurn && myPlayer && (
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 12, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="mt-2 px-1 sm:hidden"
        >
          {actionPanel}
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
