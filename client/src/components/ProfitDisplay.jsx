export default function ProfitDisplay({ value }) {
  const isProfit = value >= 0;
  return (
    <span className={`font-bold ${isProfit ? 'text-emerald-600' : 'text-red-500'}`}>
      {isProfit ? '+' : ''}{value.toFixed(2)}
    </span>
  );
}
