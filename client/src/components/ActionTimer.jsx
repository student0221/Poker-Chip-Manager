import { useEffect, useState } from 'react';

export default function ActionTimer({ isActive, timeoutSeconds = 30, startedAt }) {
  const duration = Math.max(1, Number(timeoutSeconds) || 30);
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    const getRemaining = () => {
      if (!startedAt) return duration;
      return Math.max(0, duration - (Date.now() - Number(startedAt)) / 1000);
    };

    if (!isActive) {
      setTimeLeft(duration);
      return;
    }
    setTimeLeft(getRemaining());
    const interval = setInterval(() => {
      const remaining = getRemaining();
      setTimeLeft(remaining);
      if (remaining <= 0.1) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [duration, isActive, startedAt]);

  if (!isActive) return null;

  const percentage = (timeLeft / duration) * 100;
  const isUrgent = timeLeft <= Math.min(10, duration / 3);

  return (
    <div className="w-full mt-1">
      <div className="h-1 w-full bg-slate-700/50 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-100 ease-linear rounded-full ${
            isUrgent ? 'bg-red-500' : 'bg-emerald-400'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className={`text-[10px] text-center mt-0.5 font-mono ${isUrgent ? 'text-red-400' : 'text-slate-400'}`}>
        {Math.ceil(timeLeft)}s
      </div>
    </div>
  );
}
