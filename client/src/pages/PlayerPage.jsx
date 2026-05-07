import { useState, useEffect } from 'react';
import { getStatus, submitPlayer, getRankings } from '../api';
import StatusBadge from '../components/StatusBadge';

export default function PlayerPage() {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ name: '', nickname: '', initial_chips: '' });
  const [message, setMessage] = useState('');
  const [rankings, setRankings] = useState(null);

  useEffect(() => {
    getStatus().then(s => setStatus(s));
    const interval = setInterval(() => {
      getStatus().then(s => setStatus(s));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status?.status === 'completed') {
      getRankings().then(r => setRankings(r.rankings));
    }
  }, [status]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await submitPlayer({
        ...form,
        initial_chips: parseInt(form.initial_chips)
      });
      setMessage('提交成功！');
      setForm({ name: '', nickname: '', initial_chips: '' });
    } catch (err) {
      setMessage('提交失败: ' + err.message);
    }
  };

  if (!status) return <div className="p-4">加载中...</div>;

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">德州扑克筹码提交</h1>
      <div className="mb-4">状态: <StatusBadge status={status.status} /></div>
      
      {status.status === 'pending' && (
        <div className="text-gray-500">比赛尚未开始，请稍候...</div>
      )}

      {status.status === 'running' && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="w-full border p-2 rounded"
            placeholder="姓名"
            value={form.name}
            onChange={e => setForm({...form, name: e.target.value})}
            required
          />
          <input
            className="w-full border p-2 rounded"
            placeholder="昵称"
            value={form.nickname}
            onChange={e => setForm({...form, nickname: e.target.value})}
            required
          />
          <input
            className="w-full border p-2 rounded"
            type="number"
            placeholder="入场筹码"
            value={form.initial_chips}
            onChange={e => setForm({...form, initial_chips: e.target.value})}
            required
          />
          <button className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
            提交
          </button>
          {message && <div className="text-sm text-green-600">{message}</div>}
        </form>
      )}

      {(status.status === 'settling' || status.status === 'completed') && rankings && (
        <div>
          <h2 className="text-xl font-bold mb-2">比赛结果</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left">排名</th>
                <th className="text-left">昵称</th>
                <th className="text-right">净盈亏</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((p, i) => (
                <tr key={p.id} className="border-b">
                  <td>{i + 1}</td>
                  <td>{p.nickname}</td>
                  <td className={`text-right ${p.net_profit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {p.net_profit >= 0 ? '+' : ''}{p.net_profit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
