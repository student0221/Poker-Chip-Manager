import { useMemo } from 'react';

const ACTION_NAMES = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  raise: '加注',
  'all-in': '全下',
  small_blind: '小盲',
  big_blind: '大盲'
};

const ROUND_NAMES = {
  preflop: '翻牌前',
  flop: '翻牌圈',
  turn: '转牌圈',
  river: '河牌圈'
};

export default function HandHistory({ actions = [] }) {
  const grouped = useMemo(() => {
    const groups = {};
    for (const action of actions) {
      const round = action.round || 'unknown';
      if (!groups[round]) groups[round] = [];
      groups[round].push(action);
    }
    return groups;
  }, [actions]);

  const rounds = Object.keys(grouped);
  if (rounds.length === 0) {
    return <div className="py-3 text-center text-xs text-slate-400">暂无动作记录</div>;
  }

  return (
    <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
      {rounds.map((round) => (
        <div key={round} className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
          <div className="mb-2 text-[11px] font-bold tracking-wide text-slate-500">
            {ROUND_NAMES[round] || round}
          </div>
          <div className="space-y-1.5">
            {grouped[round].map((action, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-xs shadow-sm">
                <span className="font-medium text-slate-700">{action.nickname || `玩家 ${action.seat}`}</span>
                <span className="text-slate-500">
                  {ACTION_NAMES[action.action_type] || action.action_type}
                  {action.amount > 0 && ` ${action.amount}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
