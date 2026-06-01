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
    <div className="bg-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between text-sm text-slate-300">
        <span>当前下注: <span className="text-white font-semibold">{currentBet}</span></span>
        <span>你的筹码: <span className="text-emerald-400 font-semibold">{myChips}</span></span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="danger" size="lg" disabled={disabled} onClick={() => onAction('fold')}>
          弃牌
        </Button>

        {canCheck ? (
          <Button variant="secondary" size="lg" disabled={disabled} onClick={() => onAction('check')}>
            过牌
          </Button>
        ) : canCall ? (
          <Button variant="primary" size="lg" disabled={disabled} onClick={() => onAction('call', toCall)}>
            跟注 {toCall}
          </Button>
        ) : (
          <Button variant="ghost" size="lg" disabled={true}>
            无法跟注
          </Button>
        )}

        {canRaise && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder={`加注 (${minRaise}-${maxRaise})`}
              className="w-28 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
              value={raiseAmount}
              onChange={e => setRaiseAmount(e.target.value)}
              min={minRaise}
              max={maxRaise}
            />
            <Button variant="warning" size="lg" disabled={disabled} onClick={handleRaise}>
              加注
            </Button>
          </div>
        )}

        <Button variant="success" size="lg" disabled={disabled || myChips <= 0} onClick={handleAllIn}>
          全下 {myChips}
        </Button>
      </div>
    </div>
  );
}
