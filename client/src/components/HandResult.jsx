import { useEffect, useMemo, useState } from 'react';
import Button from './Button';
import PokerCard from './PokerCard';

function parseCards(value) {
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
}

function formatChoice(choice) {
  if (choice === 'continue') return '继续';
  if (choice === 'exit') return '退出';
  return '未选择';
}

export default function HandResult({
  handState,
  myPlayerId,
  isHost,
  onShowCards,
  onNextChoice,
  onFinishShowdown,
  onClose
}) {
  const { hand, players = [], pots = [] } = handState || {};
  const isEnded = hand && ['completed', 'showdown'].includes(hand.status);
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    if (!isEnded) return undefined;
    const getRemaining = () => {
      const until = Number(hand.showdown_until) || Number(hand.ended_at || Date.now()) + 30000;
      return Math.max(0, Math.ceil((until - Date.now()) / 1000));
    };
    setTimeLeft(getRemaining());
    const timer = setInterval(() => setTimeLeft(getRemaining()), 500);
    return () => clearInterval(timer);
  }, [hand?.ended_at, hand?.showdown_until, isEnded]);

  const communityCards = useMemo(() => parseCards(hand?.community_cards), [hand?.community_cards]);
  const activePlayers = players.filter((player) => !player.is_folded);
  const winners = activePlayers.filter((player) => Number(player.result) > 0);
  const myPlayer = players.find((player) => player.player_id === myPlayerId);
  const allChosen = players.length > 0 && players.every((player) => !!player.next_choice);
  const canFinish = allChosen || timeLeft <= 0;

  if (!isEnded) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="space-y-5 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-800">本手展示</h2>
              <p className="mt-1 text-sm text-slate-500">
                {timeLeft > 0 ? `倒计时 ${timeLeft} 秒，未选择继续的玩家将默认退出。` : '展示倒计时已结束。'}
              </p>
            </div>
            {onClose && (
              <button onClick={onClose} className="text-2xl leading-none text-slate-400 transition hover:text-slate-600">
                &times;
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="mb-2 text-sm font-semibold text-emerald-900">获胜说明</div>
            {winners.length > 0 ? (
              <div className="space-y-1 text-sm text-emerald-900">
                {winners.map((winner) => (
                  <div key={winner.player_id}>
                    <span className="font-bold">{winner.nickname}</span>
                    {winner.hand_rank ? ` 以 ${winner.hand_rank} ` : ' '}
                    赢得 <span className="font-bold">{winner.result}</span> 筹码
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">本手没有产生可展示的赢家结果。</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-3 text-center text-sm font-semibold text-slate-600">公共牌</div>
            <div className="flex items-center justify-center gap-2">
              {communityCards.length > 0 ? (
                communityCards.map((card, i) => <PokerCard key={`${card}-${i}`} card={card} size="md" />)
              ) : (
                <div className="text-sm text-slate-400">本手未发出公共牌</div>
              )}
            </div>
          </div>

          {pots.length > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <div className="mb-2 text-sm font-semibold text-amber-900">奖池分布</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {pots.map((pot, i) => (
                  <div key={pot.id || i} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
                    <div className="font-semibold text-slate-700">{i === 0 ? '主池' : `边池 ${i}`}</div>
                    <div className="mt-1 text-lg font-black text-amber-600">{pot.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myPlayer && (
            <div className="grid gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-3 sm:grid-cols-2">
              <Button variant={myPlayer.show_cards ? 'success' : 'ghost'} size="sm" onClick={() => onShowCards?.(!myPlayer.show_cards)}>
                {myPlayer.show_cards ? '已选择展示手牌' : '展示我的手牌'}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={myPlayer.next_choice === 'continue' ? 'success' : 'ghost'} size="sm" onClick={() => onNextChoice?.('continue')}>
                  继续下一局
                </Button>
                <Button variant={myPlayer.next_choice === 'exit' ? 'danger' : 'ghost'} size="sm" onClick={() => onNextChoice?.('exit')}>
                  退出
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {players.map((player) => {
              const holeCards = parseCards(player.hole_cards);
              const isWinner = Number(player.result) > 0;
              const hasShownCards = holeCards.length > 0;

              return (
                <div
                  key={player.player_id}
                  className={`rounded-2xl border p-3 sm:p-4 ${
                    isWinner ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'
                  } ${player.is_folded ? 'opacity-70' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <PokerCard card={holeCards[0]} faceDown={!hasShownCards} size="sm" />
                        <PokerCard card={holeCards[1]} faceDown={!hasShownCards} size="sm" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-800">{player.nickname}</div>
                        <div className="text-xs text-slate-500">
                          {player.is_folded ? '已弃牌' : player.hand_rank || '未公开牌型'}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {player.show_cards ? '已选择展示' : '未展示'} · {formatChoice(player.next_choice)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-xl font-black ${isWinner ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {isWinner ? `+${player.result}` : player.result || 0}
                      </div>
                      <div className="text-[11px] text-slate-400">{isWinner ? '本手盈利' : '本手结果'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {isHost && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <span className="mr-auto text-xs text-slate-500">
                {allChosen ? '所有玩家已选择。' : canFinish ? '倒计时结束，可结算未选择玩家。' : '等待玩家选择继续或退出。'}
              </span>
              <Button variant="success" size="sm" disabled={!canFinish} onClick={() => onFinishShowdown?.({ startNext: true })}>
                继续下一局
              </Button>
              <Button variant="ghost" size="sm" disabled={!canFinish} onClick={() => onFinishShowdown?.({ startNext: false })}>
                只结束展示
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
