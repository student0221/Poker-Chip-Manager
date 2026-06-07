import { useMemo, useState } from 'react';
import Button from './Button';

export default function ActionPanel({
  currentBet = 0,
  myBet = 0,
  myChips = 0,
  bigBlind = 2,
  onAction,
  disabled = false,
  compact = false
}) {
  const [raiseAmount, setRaiseAmount] = useState('');
  const [raiseOpen, setRaiseOpen] = useState(false);

  const toCall = Math.max(0, currentBet - myBet);
  const canCheck = toCall <= 0;
  const canCall = toCall > 0 && myChips >= toCall;
  const canRaise = myChips > toCall;
  const minRaise = Math.max(currentBet + bigBlind, toCall + bigBlind);
  const maxRaise = myChips + myBet;

  const quickRaiseOptions = useMemo(() => {
    if (!canRaise) return [];
    const candidates = [minRaise, currentBet + bigBlind * 2, currentBet + bigBlind * 4, maxRaise];
    return [...new Set(candidates.filter((value) => value >= minRaise && value <= maxRaise))].slice(0, 4);
  }, [bigBlind, canRaise, currentBet, maxRaise, minRaise]);

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
    setRaiseOpen(false);
  };

  const handleAllIn = () => {
    onAction('all-in', myChips);
  };

  const callButton = canCheck ? (
    <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onAction('check')} className="w-full">
      过牌
    </Button>
  ) : canCall ? (
    <Button variant="primary" size="sm" disabled={disabled} onClick={() => onAction('call', toCall)} className="w-full">
      跟注 {toCall}
    </Button>
  ) : (
    <Button variant="ghost" size="sm" disabled className="w-full">
      无法跟注
    </Button>
  );

  const raiseControls = canRaise && (
    <div className={`${compact ? 'mt-2' : 'col-span-3'} space-y-2 rounded-xl border border-slate-700 bg-slate-800/80 p-2.5 sm:p-3`}>
      <div className="flex items-center justify-between text-[11px] text-slate-300 sm:text-xs">
        <span>加注到</span>
        <span>范围 {minRaise} - {maxRaise}</span>
      </div>

      {quickRaiseOptions.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {quickRaiseOptions.map((value) => (
            <Button
              key={value}
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="w-full px-1 text-xs"
              onClick={() => setRaiseAmount(String(value))}
            >
              到 {value}
            </Button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder={`${minRaise}`}
          className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          value={raiseAmount}
          onChange={(e) => setRaiseAmount(e.target.value)}
          min={minRaise}
          max={maxRaise}
        />
        <Button variant="warning" size="sm" disabled={disabled} onClick={handleRaise} className="shrink-0">
          确认
        </Button>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="sticky bottom-2 z-40 rounded-2xl border border-slate-700 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px] text-slate-300">
          <span>当前下注 <b className="text-white">{currentBet}</b></span>
          <span>剩余 <b className="text-emerald-300">{myChips}</b></span>
          {!canCheck && <span>需跟 <b className="text-white">{toCall}</b></span>}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <Button variant="danger" size="sm" disabled={disabled} onClick={() => onAction('fold')} className="w-full px-1">
            弃牌
          </Button>
          {callButton}
          <Button
            variant="warning"
            size="sm"
            disabled={disabled || !canRaise}
            onClick={() => setRaiseOpen((value) => !value)}
            className="w-full px-1"
          >
            加注
          </Button>
          <Button variant="success" size="sm" disabled={disabled || myChips <= 0} onClick={handleAllIn} className="w-full px-1">
            全下
          </Button>
        </div>
        {raiseOpen && raiseControls}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-sm sm:p-4">
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
          <span>你当前可以过牌，等待其他玩家决定下一步。</span>
        ) : (
          <span>
            跟注需要 <span className="font-semibold text-white">{toCall}</span>，你当前已下注{' '}
            <span className="font-semibold text-white">{myBet}</span>。
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="danger" size="sm" disabled={disabled} onClick={() => onAction('fold')} className="w-full">
          弃牌
        </Button>
        {callButton}
        <Button variant="success" size="sm" disabled={disabled || myChips <= 0} onClick={handleAllIn} className="w-full">
          全下
        </Button>
        {raiseControls}
      </div>
    </div>
  );
}
