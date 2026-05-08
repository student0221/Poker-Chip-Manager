import { useState, useEffect, useRef } from 'react';
import { getStatus, getPlayers, deletePlayer, getSettleProgress } from '../api';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';
import Button from '../components/Button';
import ProfitDisplay from '../components/ProfitDisplay';

export default function AdminPage() {
  const [status, setStatus] = useState(null);
  const [players, setPlayers] = useState([]);
  const [rate, setRate] = useState('');
  const [rankings, setRankings] = useState(null);
  const [progress, setProgress] = useState(null);
  const [manualFinal, setManualFinal] = useState({});
  const [message, setMessage] = useState('');
  const isEditingRate = useRef(false);

  const refresh = async () => {
    const [s, p] = await Promise.all([getStatus(), getPlayers()]);
    setStatus(s);
    setPlayers(p);
    if (!isEditingRate.current) {
      setRate(s.chip_rate);
    }
    
    if (s.status === 'settling') {
      const prog = await getSettleProgress();
      setProgress(prog);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    if (!confirm('确定开始比赛？开始后玩家可以报名入场。')) return;
    await fetch('/api/start', { method: 'POST' });
    refresh();
  };

  const handleEnd = async () => {
    if (!confirm('确定结束比赛？结束后进入结算阶段。')) return;
    await fetch('/api/end', { method: 'POST' });
    refresh();
  };

  const handleRateUpdate = async () => {
    const val = parseFloat(rate);
    if (!val || val <= 0) {
      setMessage('❌ 请输入有效的筹码比例（支持两位小数）');
      return;
    }
    await fetch('/api/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chip_rate: val })
    });
    setMessage('✅ 筹码比例已更新');
    isEditingRate.current = false;
    refresh();
  };

  const handleDelete = async (id, nickname) => {
    if (!confirm(`确定删除玩家「${nickname}」？此操作不可恢复。`)) return;
    await deletePlayer(id);
    refresh();
  };

  const handleManualFinal = async (id) => {
    const chips = parseInt(manualFinal[id]);
    if (isNaN(chips)) return;
    await fetch(`/api/players/${id}/final`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_chips: chips })
    });
    setManualFinal({ ...manualFinal, [id]: '' });
    refresh();
  };

  const handleSettle = async () => {
    const pendingCount = progress?.pending?.length || 0;
    let msg = '确定执行清算？';
    if (pendingCount > 0) {
      msg += ` 未提交的 ${pendingCount} 位玩家将按 0 筹码计算。`;
    }
    if (!confirm(msg)) return;
    const res = await fetch('/api/settle', { method: 'POST' });
    const data = await res.json();
    setRankings(data.rankings);
    refresh();
  };

  if (!status) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center">
        <div className="text-slate-400 text-lg">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800 mb-2">🎰 比赛管理后台</h1>
          <div className="mt-4">
            <StatusBadge status={status.status} />
          </div>
        </div>

        {/* Controls */}
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-700 mb-4">⚙️ 比赛控制</h2>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium text-slate-600">筹码比例:</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={rate}
                onFocus={() => isEditingRate.current = true}
                onBlur={() => isEditingRate.current = false}
                onChange={e => setRate(e.target.value)}
              />
              <span className="text-slate-500">元</span>
              <Button variant="ghost" size="sm" onClick={handleRateUpdate}>更新</Button>
            </div>

            {message && (
              <div className="text-sm p-3 bg-blue-50 text-blue-700 rounded-lg">{message}</div>
            )}

            <div className="flex gap-3">
              {status.status === 'pending' && (
                <Button variant="success" onClick={handleStart} className="flex-1">
                  🚀 开始比赛
                </Button>
              )}
              {status.status === 'running' && (
                <Button variant="warning" onClick={handleEnd} className="flex-1">
                  ⏹️ 结束比赛
                </Button>
              )}
              {status.status === 'settling' && (
                <Button variant="primary" onClick={handleSettle} className="flex-1">
                  💰 执行清算
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Players List */}
        <Card className="mb-6">
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-700 mb-4">
              👥 参与者 ({players.length})
            </h2>
            
            {players.length === 0 ? (
              <div className="text-center text-slate-400 py-8">暂无参与者</div>
            ) : (
              <div className="space-y-2">
                {players.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                        {p.nickname.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{p.nickname}</div>
                        <div className="text-xs text-slate-500">
                          {p.name !== p.nickname ? p.name + ' · ' : ''}入场 {p.initial_chips} 筹码
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.final_chips !== null && (
                        <span className="text-sm text-slate-500">剩余 {p.final_chips}</span>
                      )}
                      <button
                        onClick={() => handleDelete(p.id, p.nickname)}
                        className="text-red-400 hover:text-red-600 px-2"
                        title="删除玩家"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Settling Progress */}
        {status.status === 'settling' && progress && (
          <Card className="mb-6">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-700 mb-4">
                📊 提交进度 ({progress.submitted_count}/{progress.total})
              </h2>
              
              <div className="w-full bg-slate-100 rounded-full h-3 mb-4">
                <div
                  className="bg-blue-500 h-3 rounded-full transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.submitted_count / progress.total) * 100 : 0}%` }}
                ></div>
              </div>

              {progress.pending.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-600">⚠️ 待提交（管理员可补录）</h3>
                  {progress.pending.map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl">
                      <span className="font-medium text-amber-700">{p.nickname}</span>
                      <input
                        type="number"
                        placeholder={`默认 ${p.initial_chips}`}
                        className="flex-1 px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm"
                        value={manualFinal[p.id] || ''}
                        onChange={e => setManualFinal({ ...manualFinal, [p.id]: e.target.value })}
                      />
                      <Button
                        variant="warning"
                        size="sm"
                        onClick={() => handleManualFinal(p.id)}
                      >
                        补录
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {progress.submitted.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold text-slate-600">✅ 已提交</h3>
                  {progress.submitted.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-slate-400">#{i + 1}</span>
                        <span className="font-medium">{p.nickname}</span>
                      </div>
                      <div className="text-right">
                        <ProfitDisplay value={p.money_net} />
                        <div className="text-xs text-slate-400">
                          总额 {(p.final_chips * p.chip_rate).toFixed(2)} 元
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Rankings */}
        {rankings && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-700 mb-4">🏆 最终排名</h2>
              <div className="space-y-2">
                {rankings.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-4 p-4 rounded-xl ${
                      i === 0 ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border border-amber-200' :
                      i === 1 ? 'bg-gradient-to-r from-slate-50 to-gray-50 border border-gray-200' :
                      i === 2 ? 'bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200' :
                      'bg-slate-50'
                    }`}
                  >
                    <div className="flex-shrink-0 w-12 text-center">
                      {i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="text-lg font-bold text-slate-400">{i + 1}</span>}
                    </div>
                    <div className="flex-grow">
                      <div className="font-bold text-slate-800">{p.nickname}</div>
                      <div className="text-xs text-slate-500">
                        {p.initial_chips} → {p.final_chips} 筹码
                        <span className="ml-2 text-blue-500">
                          总额 {(p.final_chips * status.chip_rate).toFixed(2)} 元
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">
                        <ProfitDisplay value={p.net_profit} />
                      </div>
                      <div className="text-xs text-slate-400">元</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
