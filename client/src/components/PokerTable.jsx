import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Avatar from './Avatar';
import CommunityCards from './CommunityCards';
import HandResult from './HandResult';
import HoleCards from './HoleCards';
import ActionPanel from './ActionPanel';
import ActionTimer from './ActionTimer';
import PotDisplay from './PotDisplay';
import PokerCard from './PokerCard';

const ROUND_NAMES = {
  preflop: '翻牌前',
  flop: '翻牌圈',
  turn: '转牌圈',
  river: '河牌圈',
  showdown: '摊牌',
  completed: '已结束'
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

function getSeatLayout(mySeat, totalSeats, isMobile, isFullRingMobile) {
  if (totalSeats <= 0) return [];
  const angleStep = 360 / totalSeats;
  const offsetDeg = 90 - mySeat * angleStep;
  const rx = isFullRingMobile ? 41 : isMobile ? Math.min(39, 30 + totalSeats) : Math.min(46, 38 + totalSeats * 1.2);
  const ry = isFullRingMobile ? 38 : isMobile ? Math.min(37, 28 + totalSeats) : Math.min(44, 36 + totalSeats);

  return Array.from({ length: totalSeats }, (_, i) => {
    const angleDeg = offsetDeg + i * angleStep;
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      left: `${50 + rx * Math.cos(angleRad)}%`,
      top: `${50 + ry * Math.sin(angleRad)}%`
    };
  });
}

function getShortName(name = '') {
  if (!name) return '?';
  return name.length <= 2 ? name : name.slice(0, 2);
}

function parseCards(value) {
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
}

export default function PokerTable({
  handState,
  myPlayerId,
  isHost,
  onAction,
  onStartHand,
  onShowCards,
  onNextChoice,
  onFinishShowdown
}) {
  const { hand, players: handPlayers, pots } = handState || {};
  const [showResult, setShowResult] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);
  const [mobileZoom, setMobileZoom] = useState(1);

  const isEnded = !!hand && ['completed', 'showdown'].includes(hand.status);

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const phoneLike = Math.min(width, height) < 640;
      setIsMobile(phoneLike);
      setIsLandscapeMobile(phoneLike && width > height);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (isEnded) setShowResult(true);
  }, [hand?.id, isEnded]);

  const myPlayer = useMemo(() => handPlayers?.find((p) => p.player_id === myPlayerId), [handPlayers, myPlayerId]);

  const isMyTurn = useMemo(() => {
    if (!hand || !myPlayer || isEnded) return false;
    return myPlayer.seat === hand.current_seat && !myPlayer.is_folded && !myPlayer.is_all_in;
  }, [hand, isEnded, myPlayer]);

  const totalPot = hand?.total_pot || 0;
  const communityCards = useMemo(() => parseCards(hand?.community_cards), [hand?.community_cards]);
  const totalSeats = handPlayers?.length || 0;
  const mySeat = myPlayer?.seat ?? 0;
  const isCrowdedMobile = isMobile && totalSeats >= 7;
  const isFullRingMobile = isMobile && totalSeats >= 9;
  const seatLayouts = useMemo(
    () => getSeatLayout(mySeat, totalSeats, isMobile, isFullRingMobile),
    [mySeat, totalSeats, isMobile, isFullRingMobile]
  );
  const centerTopClass = isMobile ? 'top-[45%]' : 'top-[44%]';
  const getPlayerAtSeat = (seat) => handPlayers?.find((p) => p.seat === seat);
  const handKey = hand?.id || 'none';
  const maxCurrentBet = Math.max(...(handPlayers?.map((p) => p.current_bet) || [0]));
  const tableMaxWidthClass = isMobile ? (isLandscapeMobile ? 'max-w-[760px]' : 'max-w-[420px]') : 'max-w-4xl';
  const tableHeightStyle = isMobile
    ? isLandscapeMobile
      ? { height: 'min(92vh, 430px)' }
      : { height: isFullRingMobile ? 'clamp(420px, 118vw, 500px)' : 'clamp(390px, 112vw, 468px)' }
    : { minHeight: '420px' };
  const zoomOptions = [
    { label: '100%', value: 1 },
    { label: '90%', value: 0.9 },
    { label: '80%', value: 0.8 }
  ];

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

  const desktopActionPanel = (
    <ActionPanel
      currentBet={maxCurrentBet}
      myBet={myPlayer?.current_bet || 0}
      myChips={myPlayer?.current_chips || 0}
      bigBlind={hand.big_blind_amount}
      onAction={onAction}
    />
  );

  const mobileActionPanel = (
    <ActionPanel
      compact
      currentBet={maxCurrentBet}
      myBet={myPlayer?.current_bet || 0}
      myChips={myPlayer?.current_chips || 0}
      bigBlind={hand.big_blind_amount}
      onAction={onAction}
    />
  );

  return (
    <>
      {isMobile && !isLandscapeMobile && (
        <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-800">
          建议横屏查看牌桌，公共牌和手牌会更清楚。
        </div>
      )}
      {isMobile && (
        <div className="mb-2 flex items-center justify-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500">牌桌缩放</span>
          {zoomOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setMobileZoom(option.value)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                mobileZoom === option.value
                  ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <div
        className={`relative mx-auto w-full ${tableMaxWidthClass}`}
        style={{
          ...tableHeightStyle,
          transform: isMobile ? `scale(${mobileZoom})` : undefined,
          transformOrigin: 'top center',
          marginBottom: isMobile ? `-${Math.round((1 - mobileZoom) * 120)}px` : undefined
        }}
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
          <CommunityCards cards={communityCards} size={isCrowdedMobile ? 'xs' : isMobile ? 'sm' : 'lg'} />
          {hand.current_round && (
            <div className="rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] text-emerald-100/80 backdrop-blur-sm sm:px-3 sm:py-1 sm:text-xs">
              {ROUND_NAMES[hand.status] || ROUND_NAMES[hand.current_round] || hand.current_round}
            </div>
          )}
        </div>

        <AnimatePresence>
          {seatLayouts.map((pos, seatIndex) => {
            const player = getPlayerAtSeat(seatIndex);
            if (!player) return null;

            const isCurrent = !isEnded && hand.current_seat === seatIndex;
            const isFolded = !!player.is_folded;
            const isAllIn = !!player.is_all_in;
            const isMe = player.player_id === myPlayerId;
            const positionBadges = getPositionBadges(hand, seatIndex);
            const compactSeat = isFullRingMobile && !isCurrent && !isMe;
            const emphasizeSeat = isCurrent || isMe;

            let statusBadge = null;
            if (isFolded) statusBadge = <span className="text-[8px] font-medium text-slate-400 sm:text-[10px]">弃牌</span>;
            else if (isAllIn) statusBadge = <span className="text-[8px] font-bold text-amber-400 sm:text-[10px]">全下</span>;
            else if (isCurrent) statusBadge = <span className="animate-pulse text-[8px] font-bold text-emerald-300 sm:text-[10px]">行动中</span>;

            const holeCards = parseCards(player.hole_cards);
            const shouldShowHoleCards = holeCards.length > 0;
            const betLabel = isCurrent ? '当前注' : '注';
            const bubbleClasses = isCurrent
              ? 'border-red-300/90 bg-red-50 px-2.5 py-1.5 text-[10px] text-red-900 shadow-xl shadow-black/35 sm:px-3 sm:text-[13px]'
              : isFullRingMobile
                ? 'border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-[8px] text-amber-900 shadow-lg shadow-black/25'
                : 'border-amber-300/70 bg-amber-50 px-2 py-1 text-[9px] text-amber-900 shadow-lg shadow-black/30 sm:px-2.5 sm:text-[11px]';
            const bubbleTagClasses = isCurrent
              ? 'bg-red-500 px-1.5 py-0.5 text-[8px] sm:text-[10px]'
              : 'bg-amber-500 px-1.5 py-0.5 text-[8px] sm:text-[9px]';

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
                    className="pointer-events-none absolute inset-[-4px] rounded-xl border-2 border-red-400/80 sm:inset-[-6px] sm:rounded-2xl"
                    animate={{ opacity: [0.45, 1, 0.45] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                )}

                {positionBadges.length > 0 && (
                  <div className={`absolute left-1/2 z-30 flex -translate-x-1/2 items-center justify-center gap-0.5 whitespace-nowrap ${isFullRingMobile ? '-top-3.5' : 'top-[-16px] sm:top-[-24px]'}`}>
                    {positionBadges.map((badge) => (
                      <div
                        key={badge.shortLabel}
                        className={`rounded-full border px-1 py-0.5 text-[7px] font-black leading-none shadow-md sm:px-2 sm:text-[10px] ${badge.className}`}
                        title={`${badge.label} (${badge.shortLabel})`}
                      >
                        <span className={isFullRingMobile ? '' : 'hidden sm:inline'}>{isFullRingMobile ? badge.shortLabel : badge.label}</span>
                        {!isFullRingMobile && <span className="sm:hidden">{badge.shortLabel}</span>}
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className={`flex flex-col items-center rounded-md transition-all backdrop-blur-sm ${
                    compactSeat ? 'min-w-[30px] gap-0 bg-black/35 px-0.5 py-0.5' : isCrowdedMobile ? 'min-w-[38px] gap-0.5 bg-black/40 px-0.5 py-0.5' : 'min-w-[46px] gap-0.5 bg-black/40 px-1 py-1 sm:min-w-[64px] sm:rounded-xl sm:px-1.5'
                  } ${emphasizeSeat ? 'scale-105' : ''} ${isCurrent ? 'bg-white/15' : ''} ${isFolded ? 'opacity-45' : ''}`}
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
                          isCurrent
                            ? positionBadges.length > 0 ? '-top-10 sm:-top-12' : '-top-7 sm:-top-8'
                            : positionBadges.length > 0 ? '-top-7 sm:-top-11' : '-top-4 sm:-top-5'
                        }`}
                      >
                        <div className={`flex items-center gap-1 whitespace-nowrap rounded-full border font-black ${bubbleClasses}`}>
                          <span className={`rounded-full leading-none text-white ${bubbleTagClasses}`}>{betLabel}</span>
                          <span>{player.current_bet}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className={`flex items-center ${compactSeat ? 'gap-0' : 'gap-0.5 sm:gap-1'}`}>
                    <Avatar nickname={player.nickname || '?'} src={player.avatar} size={compactSeat ? 'xs' : isMobile ? 'xs' : 'sm'} />
                    {!compactSeat && (
                      <div className="text-center leading-tight">
                        <div className={`font-bold text-white ${isFullRingMobile ? 'max-w-[34px] text-[8px]' : 'max-w-[28px] text-[8px] sm:max-w-[50px] sm:text-[10px]'} truncate`}>
                          {player.nickname || '?'}
                        </div>
                        <div className={`font-mono text-emerald-300 ${isFullRingMobile ? 'text-[8px]' : 'text-[8px] sm:text-[10px]'}`}>
                          {player.current_chips}
                        </div>
                        {statusBadge}
                      </div>
                    )}
                  </div>

                  {compactSeat && (
                    <div className="mt-0.5 text-center leading-none">
                      <div className="max-w-[28px] truncate text-[7px] font-bold text-white/90">
                        {getShortName(player.nickname)}
                      </div>
                      {(isAllIn || isFolded || isCurrent) && <div className="mt-0.5">{statusBadge}</div>}
                    </div>
                  )}

                  <div className={`mt-0.5 flex gap-0.5 ${compactSeat ? 'scale-90' : ''}`}>
                    {shouldShowHoleCards ? (
                      <HoleCards cards={holeCards} size={isCrowdedMobile ? 'xs' : 'sm'} animate />
                    ) : (
                      <motion.div
                        className="flex gap-0.5"
                        initial={{ rotateY: 180 }}
                        animate={{ rotateY: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                      >
                        <PokerCard faceDown size={isCrowdedMobile ? 'xs' : 'sm'} />
                        <PokerCard faceDown size={isCrowdedMobile ? 'xs' : 'sm'} />
                      </motion.div>
                    )}
                  </div>
                </div>

                {isCurrent && !isFolded && (
                  <div className={`absolute left-1/2 -translate-x-1/2 ${isFullRingMobile ? '-bottom-5 w-16' : '-bottom-4 w-12 sm:-bottom-5 sm:w-20'}`}>
                    <ActionTimer isActive={true} timeoutSeconds={hand.action_timeout_seconds} startedAt={hand.action_started_at} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        <AnimatePresence>
          {!isMobile && isMyTurn && myPlayer && (
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute bottom-0 left-1/2 z-30 hidden w-full max-w-sm -translate-x-1/2 px-2 sm:block"
            >
              {desktopActionPanel}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isEnded && !showResult && (
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
                className="rounded-full bg-amber-500 px-2 py-1 text-[10px] font-semibold text-white shadow transition hover:bg-amber-600 sm:px-3 sm:py-1.5 sm:text-xs"
              >
                查看展示
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isMobile && isMyTurn && myPlayer && (
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="mt-2 px-1"
          >
            {mobileActionPanel}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEnded && showResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <HandResult
              handState={handState}
              myPlayerId={myPlayerId}
              isHost={isHost}
              onShowCards={onShowCards}
              onNextChoice={onNextChoice}
              onFinishShowdown={onFinishShowdown}
              onClose={() => setShowResult(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
