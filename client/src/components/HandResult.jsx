import PokerCard from './PokerCard';

export default function HandResult({ handState, onClose }) {
  if (!handState?.hand) return null;

  const { hand, players, pots } = handState;
  const isEnded = ['completed', 'showdown'].includes(hand.status);
  if (!isEnded) return null;

  const communityCards = (() => {
    try { return JSON.parse(hand.community_cards || '[]'); }
    catch { return []; }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800">手牌结果</h2>
            {onClose && (
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            )}
          </div>

          <div className="flex items-center justify-center gap-2">
            {communityCards.map((card, i) => (
              <PokerCard key={i} card={card} size="md" />
            ))}
          </div>

          <div className="space-y-2">
            {players
              ?.filter(p => !p.is_folded)
              ?.map(player => {
                const holeCards = (() => {
                  try { return JSON.parse(player.hole_cards || '[]'); }
                  catch { return []; }
                })();
                const isWinner = player.result > 0;
                return (
                  <div
                    key={player.player_id}
                    className={`p-3 rounded-xl flex items-center justify-between ${
                      isWinner ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <PokerCard card={holeCards[0]} size="sm" />
                        <PokerCard card={holeCards[1]} size="sm" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-800">{player.nickname}</div>
                        <div className="text-xs text-slate-500">{player.hand_rank || '未知牌型'}</div>
                      </div>
                    </div>
                    <div className={`font-bold ${isWinner ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {isWinner ? `+${player.result}` : player.result || 0}
                    </div>
                  </div>
                );
              })}
          </div>

          {pots && pots.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-sm font-semibold text-slate-700 mb-1">底池</div>
              <div className="space-y-1">
                {pots.map((pot, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-500">{i === 0 ? '主池' : `边池 ${i}`}</span>
                    <span className="font-semibold">{pot.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
