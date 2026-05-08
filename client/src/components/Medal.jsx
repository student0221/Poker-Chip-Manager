export default function Medal({ rank }) {
  const medals = ['🥇', '🥈', '🥉'];
  if (rank <= 3) return <span className="text-2xl">{medals[rank - 1]}</span>;
  return <span className="text-lg font-bold text-slate-400">{rank}</span>;
}
