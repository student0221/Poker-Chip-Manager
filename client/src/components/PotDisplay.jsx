export default function PotDisplay({ totalPot, pots = [] }) {
  if (!totalPot && (!pots || pots.length === 0)) return null;

  return (
    <div className="text-center">
      <div className="inline-flex flex-col items-center rounded-2xl border border-amber-300/30 bg-black/30 px-4 py-2 backdrop-blur-sm">
        <div className="mb-1 text-[11px] font-semibold tracking-wide text-amber-100/80">底池</div>
        <div className="text-2xl font-black text-amber-300 drop-shadow sm:text-3xl">{totalPot}</div>
        {pots.length > 1 && (
          <div className="mt-2 space-y-1">
            {pots.map((pot, i) => (
              <div key={pot.id || i} className="text-[11px] text-amber-50/80">
                {i === 0 ? '主池' : `边池 ${i}`} · {pot.amount}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
