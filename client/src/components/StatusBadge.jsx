export default function StatusBadge({ status }) {
  const configs = {
    pending: { bg: 'bg-slate-500', text: 'text-white', label: '等待开始' },
    running: { bg: 'bg-emerald-500', text: 'text-white', label: '进行中' },
    settling: { bg: 'bg-amber-500', text: 'text-white', label: '结算中' },
    completed: { bg: 'bg-blue-500', text: 'text-white', label: '已结束' }
  };
  const c = configs[status] || configs.pending;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full mr-2 ${c.bg === 'bg-slate-500' ? 'bg-white/60' : 'bg-white'}`}></span>
      {c.label}
    </span>
  );
}
