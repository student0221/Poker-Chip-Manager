export default function PotDisplay({ totalPot, pots = [] }) {
  if (!totalPot && (!pots || pots.length === 0)) return null;

  return (
    <div className="text-center">
      <div className="inline-flex flex-col items-center">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">底池</div>
        <div className="text-2xl font-bold text-amber-400 drop-shadow">{totalPot}</div>
        {pots.length > 1 && (
          <div className="mt-1 space-y-0.5">
            {pots.map((pot, i) => (
              <div key={i} className="text-xs text-slate-400">
                {i === 0 ? '主池' : `边池 ${i}`}: {pot.amount}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
