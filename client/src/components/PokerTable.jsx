import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
    label: '庄位',
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
  const rx = isMobile ? Math.min(36, 28 + totalSeats) : Math.min(46, 38 + totalSeats * 1.2);
  const ry = isMobile ? Math.min(34, 26 + totalSeats) : Math.min(44, 36 + totalSeats);

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
  const { hand, players: handPlayers, pots } = handState || {};
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
    const me = handPlayers.find((p) => p.player_id === myPlayerId);
    return me && me.seat === hand.current_seat && !me.is_folded && !me.is_all_in;
  }, [hand, handPlayers, myPlayerId]);

  const myPlayer = useMemo(() => handPlayers?.find((p) => p.player_id === myPlayerId), [handPlayers, myPlayerId]);

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
  const getPlayerAtSeat = (seat) => handPlayers?.find((p) => p.seat === seat);
  const handKey = hand?.id || 'none';

  if (!hand) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8 sm:py-12">
        <div className="text-xs text-slate-400 sm:text-sm">暂无进行中的牌局</div>
        {isHost && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onStartHand}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-emerald-700 sm:px-5 sm:py-2.5 sm:text-sm"
          >
            开始新一手
          </motion.button>
        )}
      </div>
    );
  }

  const actionPanel = (
    <ActionPanel
      currentBet={Math.max(...(handPlayers?.map((p) => p.current_bet) || [0]))}
      myBet={myPlayer?.current_bet}
      myChips={myPlayer?.current_chips}
      bigBlind={hand.big_blind_amount}
      onAction={onAction}
    />
  );

  return (
    <>
      <div
        className={`relative mx-auto w-full ${isMobile ? 'max-w-[420px]' : 'max-w-4xl'}`}
        style={isMobile ? { height: 'clamp(360px, 105vw, 440px)' } : { minHeight: '420px' }}
      >
        <div
          className="absolute inset-[1%] rounded-[45%] shadow-2xl sm:inset-[2%]"
          style={{
            background: 'radial-gradient(ellipse at center, #1a5c3a 0%, #0f3d26 60%, #0a2e1c 100%)',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 10px 40px rgba(0,0,0,0.4)'
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-[48%]"
          style={{
            border: isMobile ? '6px solid transparent' : '12px solid transparent',
            background: 'linear-gradient(#8B5E3C, #5C3A1E) border-box',
            WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            opacity: 0.95
          }}
        />

        <div className={`absolute left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 sm:gap-2 ${centerTopClass}`}>
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
            <div className="rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] text-emerald-100/70 backdrop-blur-sm sm:px-3 sm:py-1 sm:text-xs">
              {ROUND_NAMES[hand.current_round] || hand.current_round}
            </div>
          )}
        </div>

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
            if (isFolded) statusBadge = <span className="text-[8px] font-medium text-slate-400 sm:text-[10px]">弃牌</span>;
            else if (isAllIn) statusBadge = <span className="text-[8px] font-bold text-amber-400 sm:text-[10px]">全下</span>;
            else if (isCurrent) statusBadge = <span className="animate-pulse text-[8px] font-bold text-emerald-300 sm:text-[10px]">行动中</span>;

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
                    className="pointer-events-none absolute inset-[-3px] rounded-lg border-2 border-amber-400/60 sm:inset-[-6px] sm:rounded-2xl"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}

                {positionBadges.length > 0 && (
                  <div className="absolute left-1/2 top-[-16px] z-30 flex -translate-x-1/2 items-center justify-center gap-0.5 whitespace-nowrap sm:top-[-24px]">
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

                <div
                  className={`flex flex-col items-center gap-0.5 rounded-md px-0.5 py-0.5 transition-all backdrop-blur-sm sm:min-w-[64px] sm:rounded-xl sm:px-1.5 sm:py-1 ${
                    isCrowdedMobile ? 'min-w-[36px]' : 'min-w-[44px]'
                  } ${isCurrent ? 'scale-105 bg-white/15' : 'bg-black/40'} ${isFolded ? 'opacity-45' : ''}`}
                >
                  <AnimatePresence>
                    {player.current_bet > 0 && (
                      <motion.div
                        key={`bet-${player.current_bet}`}
                        initial={{ y: -10, opacity: 0, scale: 0.5 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -10, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        className={`absolute left-1/2 -translate-x-1/2 ${
                          positionBadges.length > 0 ? '-top-8 sm:-top-11' : '-top-3.5 sm:-top-5'
                        }`}
                      >
                        <div className="rounded-full border border-amber-500/30 bg-black/60 px-1 py-0.5 text-[8px] font-bold whitespace-nowrap text-amber-300 sm:px-2 sm:text-[10px]">
                          {player.current_bet}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex items-center gap-0.5 sm:gap-1">
                    <Avatar nickname={player.nickname || '?'} src={player.avatar} size={isMobile ? 'xs' : 'sm'} />
                    <div className="text-center leading-tight">
                      <div className="max-w-[28px] truncate text-[8px] font-bold text-white sm:max-w-[50px] sm:text-[10px]">
                        {player.nickname || '?'}
                      </div>
                      <div className="font-mono text-[8px] text-emerald-300 sm:text-[10px]">{player.current_chips}</div>
                      {statusBadge}
                    </div>
                  </div>

                  <div className="mt-0.5 flex gap-0.5">
                    {isMe || isHost ? (
                      <HoleCards cards={holeCards} size={isCrowdedMobile ? 'xs' : 'sm'} animate />
                    ) : (
                      <motion.div
                        className="flex gap-0.5"
                        initial={{ rotateY: 180 }}
                        animate={{ rotateY: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                      >
                        <div className="h-4 w-3 rounded border border-white/10 bg-gradient-to-br from-blue-700 to-blue-900 sm:h-7 sm:w-5" />
                        <div className="h-4 w-3 rounded border border-white/10 bg-gradient-to-br from-blue-700 to-blue-900 sm:h-7 sm:w-5" />
                      </motion.div>
                    )}
                  </div>
                </div>

                {isCurrent && !isFolded && (
                  <div className="absolute left-1/2 -bottom-4 w-12 -translate-x-1/2 sm:-bottom-5 sm:w-20">
                    <ActionTimer isActive={true} timeoutSeconds={hand.action_timeout_seconds} startedAt={hand.action_started_at} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        <AnimatePresence>
          {isMyTurn && myPlayer && (
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute bottom-0 left-1/2 z-30 hidden w-full max-w-sm -translate-x-1/2 px-2 sm:block"
            >
              {actionPanel}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isHost && (hand.status === 'completed' || hand.status === 'showdown') && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute bottom-1.5 left-1/2 z-30 -translate-x-1/2 sm:bottom-3"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setShowResult(false);
                  onStartHand();
                }}
                className="rounded-full bg-emerald-500 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg transition hover:bg-emerald-600 sm:px-6 sm:py-2.5 sm:text-sm"
              >
                开始新一手
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(hand.status === 'completed' || hand.status === 'showdown') && showResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <HandResult handState={handState} onClose={() => setShowResult(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(hand.status === 'completed' || hand.status === 'showdown') && !showResult && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute right-1.5 top-1.5 z-30 sm:right-3 sm:top-3"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowResult(true)}
                className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow transition hover:bg-amber-600 sm:px-3 sm:py-1.5 sm:text-xs"
              >
                查看结果
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
