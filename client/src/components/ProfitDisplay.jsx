export default function ProfitDisplay({ value, className = '' }) {
  const isProfit = value >= 0;
  return (
    <span className={`font-bold ${isProfit ? 'text-emerald-600' : 'text-red-500'} ${className}`}>
      {isProfit ? '+' : ''}{value.toFixed(2)}
    </span>
  );
}
