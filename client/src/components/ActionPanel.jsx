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
    <div className="bg-slate-800 rounded-xl p-3 sm:p-4 space-y-2 sm:space-y-3">
      <div className="flex items-center justify-between text-xs sm:text-sm text-slate-300">
        <span>Bet: <span className="text-white font-semibold">{currentBet}</span></span>
        <span>Chips: <span className="text-emerald-400 font-semibold">{myChips}</span></span>
      </div>

      <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-2">
        <Button variant="danger" size="sm" disabled={disabled} onClick={() => onAction('fold')}>
          Fold
        </Button>

        {canCheck ? (
          <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onAction('check')}>
            Check
          </Button>
        ) : canCall ? (
          <Button variant="primary" size="sm" disabled={disabled} onClick={() => onAction('call', toCall)}>
            Call {toCall}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={true}>
            -
          </Button>
        )}

        <Button variant="success" size="sm" disabled={disabled || myChips <= 0} onClick={handleAllIn}>
          All-in
        </Button>

        {canRaise && (
          <div className="col-span-3 flex items-center gap-1.5 sm:gap-2 mt-1">
            <input
              type="number"
              placeholder={`Raise ${minRaise}-${maxRaise}`}
              className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs sm:text-sm"
              value={raiseAmount}
              onChange={e => setRaiseAmount(e.target.value)}
              min={minRaise}
              max={maxRaise}
            />
            <Button variant="warning" size="sm" disabled={disabled} onClick={handleRaise}>
              Raise
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
