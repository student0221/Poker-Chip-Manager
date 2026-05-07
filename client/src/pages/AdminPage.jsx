import { useState, useEffect } from 'react';
import { getStatus, getPlayers, deletePlayer } from '../api';
import StatusBadge from '../components/StatusBadge';

export default function AdminPage() {
  const [status, setStatus] = useState(null);
  const [players, setPlayers] = useState([]);
  const [rate, setRate] = useState('');
  const [rankings, setRankings] = useState(null);
  const [finalChips, setFinalChips] = useState({});

  const refresh = async () => {
    const [s, p] = await Promise.all([getStatus(), getPlayers()]);
    setStatus(s);
    setPlayers(p);
    setRate(s.chip_rate);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    await fetch('/api/start', { method: 'POST' });
    refresh();
  };

  const handleEnd = async () => {
    await fetch('/api/end', { method: 'POST' });
    refresh();
  };

  const handleRateUpdate = async () => {
    await fetch('/api/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chip_rate: parseFloat(rate) })
    });
    refresh();
  };

  const handleDelete = async (id) => {
    await deletePlayer(id);
    refresh();
  };

  const handleSettle = async () => {
    const updates = players.map(p => ({
      id: p.id,
      final_chips: parseInt(finalChips[p.id] || 0)
    }));
    for (const u of updates) {
      await fetch(`/api/players/${u.id}/final`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_chips: u.final_chips })
      });
    }
    const res = await fetch('/api/settle', { method: 'POST' });
    const data = await res.json();
    setRankings(data.rankings);
    refresh();
  };

  if (!status) return <div className="p-4">加载中...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">比赛管理后台</h1>
      
      <div className="mb-4 flex items-center gap-3">
        状态: <StatusBadge status={status.status} />
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2">
          <label>筹码比例:</label>
          <input
            type="number"
            className="border p-1 rounded w-20"
            value={rate}
            onChange={e => setRate(e.target.value)}
          />
          <span>元/筹码</span>
          <button onClick={handleRateUpdate} className="bg-gray-500 text-white px-2 py-1 rounded text-sm">
            更新
          </button>
        </div>

        {status.status === 'pending' && (
          <button onClick={handleStart} className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
            开始比赛
          </button>
        )}

        {status.status === 'running' && (
          <button onClick={handleEnd} className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600">
            结束比赛
          </button>
        )}
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-bold mb-2">参与者 ({players.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2">
              <th className="text-left">姓名</th>
              <th className="text-left">昵称</th>
              <th className="text-right">入场筹码</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
              <tr key={p.id} className="border-b">
                <td>{p.name}</td>
                <td>{p.nickname}</td>
                <td className="text-right">{p.initial_chips}</td>
                <td className="text-right">
                  <button 
                    onClick={() => handleDelete(p.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status.status === 'settling' && (
        <div className="space-y-3">
          <h3 className="font-bold">输入最终筹码</h3>
          {players.map(p => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="w-20">{p.nickname}</span>
              <input
                type="number"
                className="border p-1 rounded w-24"
                placeholder="剩余筹码"
                value={finalChips[p.id] || ''}
                onChange={e => setFinalChips({...finalChips, [p.id]: e.target.value})}
              />
            </div>
          ))}
          <button 
            onClick={handleSettle}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            执行清算
          </button>
        </div>
      )}

      {rankings && (
        <div className="mt-4">
          <h2 className="text-lg font-bold mb-2">清算结果</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2">
                <th className="text-left">排名</th>
                <th className="text-left">昵称</th>
                <th className="text-right">入场</th>
                <th className="text-right">剩余</th>
                <th className="text-right">净盈亏</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((p, i) => (
                <tr key={p.id} className="border-b">
                  <td>{i + 1}</td>
                  <td>{p.nickname}</td>
                  <td className="text-right">{p.initial_chips}</td>
                  <td className="text-right">{p.final_chips}</td>
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
