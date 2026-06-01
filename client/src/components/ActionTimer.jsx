import { useEffect, useState } from 'react';

const TURN_TIME_SECONDS = 30;

export default function ActionTimer({ isActive }) {
  const [timeLeft, setTimeLeft] = useState(TURN_TIME_SECONDS);

  useEffect(() => {
    if (!isActive) {
      setTimeLeft(TURN_TIME_SECONDS);
      return;
    }
    setTimeLeft(TURN_TIME_SECONDS);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0.1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  const percentage = (timeLeft / TURN_TIME_SECONDS) * 100;
  const isUrgent = timeLeft <= 10;

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
