import { useState } from 'react';
import Button from './Button';

export default function ActionPanel({ currentBet = 0, myBet = 0, myChips = 0, bigBlind = 20, onAction, disabled = false }) {
  const [raiseAmount, setRaiseAmount] = useState('');

  const toCall = currentBet - myBet;
  const canCheck = toCall <= 0;
  const canCall = toCall > 0 && myChips >= toCall;
  const canRaise = myChips > toCall;
  const minRaise = Math.max(currentBet + bigBlind, toCall + bigBlind);
  const maxRaise = myChips + myBet;

  const handleRaise = () => {
    const amount = parseInt(raiseAmount, 10);
    if (!amount || amount < minRaise) {
      alert(`最小加注额为 ${minRaise}`);
      return;
    }
    if (amount > maxRaise) {
      alert(`最大加注额为 ${maxRaise}`);
      return;
    }
    onAction('raise', amount);
    setRaiseAmount('');
  };

  const handleAllIn = () => {
    onAction('all-in', myChips);
  };

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/95 p-3 sm:p-4 shadow-2xl backdrop-blur-sm space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
        <div className="rounded-xl bg-slate-800 px-3 py-2 text-slate-300">
          当前下注
          <div className="mt-1 text-base font-semibold text-white sm:text-lg">{currentBet}</div>
        </div>
        <div className="rounded-xl bg-slate-800 px-3 py-2 text-slate-300">
          剩余筹码
          <div className="mt-1 text-base font-semibold text-emerald-400 sm:text-lg">{myChips}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-slate-300 sm:text-sm">
        {canCheck ? (
          <span>你当前可以过牌。</span>
        ) : (
          <span>跟注需要 <span className="font-semibold text-white">{toCall}</span>，当前已下注 <span className="font-semibold text-white">{myBet}</span>。</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="danger" size="sm" disabled={disabled} onClick={() => onAction('fold')} className="w-full">
          弃牌
        </Button>

        {canCheck ? (
          <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onAction('check')} className="w-full">
            过牌
          </Button>
        ) : canCall ? (
          <Button variant="primary" size="sm" disabled={disabled} onClick={() => onAction('call', toCall)} className="w-full">
            跟注 {toCall}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={true} className="w-full">
            无法跟注
          </Button>
        )}

        <Button variant="success" size="sm" disabled={disabled || myChips <= 0} onClick={handleAllIn} className="w-full">
          全下
        </Button>

        {canRaise && (
          <div className="col-span-3 rounded-xl border border-slate-700 bg-slate-800/80 p-2.5 sm:p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-300 sm:text-xs">
              <span>加注到</span>
              <span>范围 {minRaise} - {maxRaise}</span>
            </div>
            <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder={`${minRaise}`}
              className="flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={raiseAmount}
              onChange={e => setRaiseAmount(e.target.value)}
              min={minRaise}
              max={maxRaise}
            />
            <Button variant="warning" size="sm" disabled={disabled} onClick={handleRaise}>
              确认加注
            </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
