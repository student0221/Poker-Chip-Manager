export default function StatusBadge({ status }) {
  const colors = {
    pending: 'bg-gray-200 text-gray-700',
    running: 'bg-green-200 text-green-700',
    settling: 'bg-yellow-200 text-yellow-700',
    completed: 'bg-blue-200 text-blue-700'
  };
  const labels = {
    pending: '等待开始',
    running: '进行中',
    settling: '清算中',
    completed: '已结束'
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status] || colors.pending}`}>
      {labels[status] || status}
    </span>
  );
}
