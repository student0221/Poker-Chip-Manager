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
      alert(`Min raise: ${minRaise}`);
      return;
    }
    if (amount > maxRaise) {
      alert(`Max raise: ${maxRaise}`);
      return;
    }
    onAction('raise', amount);
    setRaiseAmount('');
  };

  const handleAllIn = () => {
    onAction('all-in', myChips);
  };

  return (
    <div className="bg-slate-800 rounded-xl p-2 sm:p-4 space-y-1.5 sm:space-y-3">
      <div className="flex items-center justify-between text-[10px] sm:text-sm text-slate-300">
        <span>Bet: <span className="text-white font-semibold">{currentBet}</span></span>
        <span>Chips: <span className="text-emerald-400 font-semibold">{myChips}</span></span>
      </div>

      <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1 sm:gap-2">
        <Button variant="danger" size="sm" disabled={disabled} onClick={() => onAction('fold')}>
          <span className="text-[10px] sm:text-sm">Fold</span>
        </Button>

        {canCheck ? (
          <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onAction('check')}>
            <span className="text-[10px] sm:text-sm">Check</span>
          </Button>
        ) : canCall ? (
          <Button variant="primary" size="sm" disabled={disabled} onClick={() => onAction('call', toCall)}>
            <span className="text-[10px] sm:text-sm">Call {toCall}</span>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={true}>
            <span className="text-[10px] sm:text-sm">-</span>
          </Button>
        )}

        <Button variant="success" size="sm" disabled={disabled || myChips <= 0} onClick={handleAllIn}>
          <span className="text-[10px] sm:text-sm">All-in</span>
        </Button>

        {canRaise && (
          <div className="col-span-3 flex items-center gap-1 sm:gap-2 mt-0.5 sm:mt-1">
            <input
              type="number"
              placeholder={`${minRaise}-${maxRaise}`}
              className="flex-1 px-1.5 sm:px-3 py-1 sm:py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-[10px] sm:text-sm"
              value={raiseAmount}
              onChange={e => setRaiseAmount(e.target.value)}
              min={minRaise}
              max={maxRaise}
            />
            <Button variant="warning" size="sm" disabled={disabled} onClick={handleRaise}>
              <span className="text-[10px] sm:text-sm">Raise</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
