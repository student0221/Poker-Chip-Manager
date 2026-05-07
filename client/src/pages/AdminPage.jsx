import { useState, useEffect } from 'react';
import { getStatus, getPlayers, deletePlayer, getSettleProgress } from '../api';

function StatusBadge({ status }) {
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

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-red-200',
    ghost: 'bg-slate-100 hover:bg-slate-200 text-slate-700'
  };
  return (
    <button
      className={`px-4 py-2 rounded-xl font-semibold shadow-md transition-all active:scale-95 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function ProfitDisplay({ value }) {
  const isProfit = value >= 0;
  return (
    <span className={`font-bold ${isProfit ? 'text-emerald-600' : 'text-red-500'}`}>
      {isProfit ? '+' : ''}{value.toFixed(2)}
    </span>
  );
}

export default function AdminPage() {
  const [status, setStatus] = useState(null);
  const [players, setPlayers] = useState([]);
  const [rateInput, setRateInput] = useState('');
  const [rateCommitted, setRateCommitted] = useState('');
  const [rankings, setRankings] = useState(null);
  const [progress, setProgress] = useState(null);
  const [manualFinal, setManualFinal] = useState({});
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const [s, p] = await Promise.all([getStatus(), getPlayers()]);
    setStatus(s);
    setPlayers(p);
    const rateStr = String(s.chip_rate ?? '');
    setRateInput(rateStr);
    setRateCommitted(rateStr);
    
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
    await fetch('/api/start', { method: 'POST' });
    refresh();
  };

  const handleEnd = async () => {
    await fetch('/api/end', { method: 'POST' });
    refresh();
  };

  const handleRateChange = (e) => {
    // 允许空值、数字、小数点，不做即时格式化，避免光标乱跳
    const raw = e.target.value;
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
      setRateInput(raw);
    }
  };

  const handleRateBlur = () => {
    const num = parseFloat(rateInput);
    if (!isNaN(num) && num > 0) {
      const formatted = num.toFixed(2);
      setRateInput(formatted);
      setRateCommitted(formatted);
    } else {
      setRateInput(rateCommitted);
    }
  };

  const handleRateUpdate = async () => {
    const val = parseFloat(rateInput);
    if (!val || val <= 0) {
      setMessage('❌ 请输入有效的筹码比例（支持两位小数）');
      return;
    }
    await fetch('/api/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chip_rate: val })
    });
    setRateCommitted(String(val));
    setMessage('✅ 筹码比例已更新');
    refresh();
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除该玩家？')) return;
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
    if (!confirm('确定执行清算？未提交的玩家将按 0 筹码计算。')) return;
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
                type="text"
                inputMode="decimal"
                className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={rateInput}
                onChange={handleRateChange}
                onBlur={handleRateBlur}
                placeholder="0.00"
              />
              <span className="text-slate-500">元</span>
              <Button variant="ghost" onClick={handleRateUpdate}>更新</Button>
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
                {players.map(p => {
                  const totalSettlement = p.initial_chips * (status.chip_rate || 10);
                  const isLeft = !!p.left_at;
                  return (
                    <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl ${isLeft ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                          {p.nickname.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">
                            {p.nickname}
                            {isLeft && <span className="ml-2 text-xs text-amber-600 font-normal">(已离场)</span>}
                          </div>
                          <div className="text-xs text-slate-500">
                            {p.name !== p.nickname ? p.name + ' · ' : ''}
                            入场 {p.initial_chips} 筹码 · 结算 {totalSettlement.toFixed(2)} 元
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.final_chips !== null && (
                          <span className="text-sm text-slate-500">剩余 {p.final_chips}</span>
                        )}
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="text-red-400 hover:text-red-600 px-2"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
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
                        placeholder="补录筹码"
                        className="flex-1 px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm"
                        value={manualFinal[p.id] || ''}
                        onChange={e => setManualFinal({ ...manualFinal, [p.id]: e.target.value })}
                      />
                      <Button
                        variant="warning"
                        className="px-3 py-1 text-sm"
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
                        <span className="text-xs text-slate-400">结算 {(p.total_settlement ?? 0).toFixed(2)} 元</span>
                      </div>
                      <ProfitDisplay value={p.money_net} />
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
                        入场 {p.initial_chips} 筹码 · 结算 {(p.total_settlement ?? 0).toFixed(2)} 元
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
