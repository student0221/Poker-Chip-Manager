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
      return undefined;
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
    <div className="mt-1 w-full">
      <div className="overflow-hidden rounded-full bg-slate-700/60 shadow-inner">
        <div
          className={`h-1.5 rounded-full transition-all duration-100 ease-linear ${isUrgent ? 'bg-red-500' : 'bg-emerald-400'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className={`mt-1 text-center font-mono text-[10px] ${isUrgent ? 'text-red-300' : 'text-slate-300'}`}>
        {Math.ceil(timeLeft)} 秒
      </div>
    </div>
  );
}
