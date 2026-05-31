import { useState, useEffect, useRef } from 'react';
import { getStatus, getPlayers, deletePlayer, getSettleProgress, adminAddPlayer } from '../api';
import Card from '../components/Card';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import ProfitDisplay from '../components/ProfitDisplay';
import { sanitizeText } from '../utils/safeRender';
import Avatar from '../components/Avatar';
import RankingAnimation from '../components/RankingAnimation';

export default function AdminPage() {
  const [status, setStatus] = useState(null);
  const [players, setPlayers] = useState([]);
  const [rateInput, setRateInput] = useState('');
  const [rateCommitted, setRateCommitted] = useState('');
  const [rankings, setRankings] = useState(null);
  const [progress, setProgress] = useState(null);
  const [addForm, setAddForm] = useState({ nickname: '', initial_chips: '', avatarFile: null });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const hasAutoPlayed = useRef(false);
  const [addMsg, setAddMsg] = useState('');
  const [manualFinal, setManualFinal] = useState({});
  const [chipAdds, setChipAdds] = useState({});
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
    } else {
      setProgress(null);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, []);

  // 执行清算后自动播放颁奖动画
  useEffect(() => {
    if (rankings?.length > 0 && !hasAutoPlayed.current) {
      hasAutoPlayed.current = true;
      setShowAnimation(true);
    }
  }, [rankings]);

  const handleStart = async () => {
    await fetch('/api/start', { method: 'POST' });
    refresh();
  };

  const handleEnd = async () => {
    await fetch('/api/end', { method: 'POST' });
    refresh();
  };

  const handleRateChange = (e) => {
    const raw = e.target.value;
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
      setRateInput(raw);
    }
  };

  const handleRateBlur = () => {
    const num = parseFloat(rateInput);
    if (!isNaN(num) && num > 0) {
      const formatted = parseFloat(num.toFixed(2));
      setRateInput(formatted.toFixed(2));
      setRateCommitted(formatted.toFixed(2));
    } else {
      setRateInput(rateCommitted);
    }
  };

  const handleRateUpdate = async () => {
    if (status?.status !== 'pending') {
      setMessage('❌ 只有在比赛未开始时才能修改筹码比例');
      return;
    }
    const num = parseFloat(rateInput);
    if (isNaN(num) || num <= 0) {
      setMessage('❌ 请输入有效的筹码比例（支持两位小数）');
      return;
    }
    const formatted = parseFloat(num.toFixed(2));
    const res = await fetch('/api/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chip_rate: formatted })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setMessage(err?.error || '❌ 更新筹码比例失败');
      return;
    }
    setRateInput(formatted.toFixed(2));
    setRateCommitted(formatted.toFixed(2));
    setMessage('✅ 筹码比例已更新');
    refresh();
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除该玩家？')) return;
    try {
      const res = await deletePlayer(id);
      setMessage(res.message || '已删除');
      refresh();
    } catch {
      setMessage('删除失败');
    }
  };

  const handleReset = async () => {
    if (!confirm('确定重置？这将清空所有玩家数据，不可恢复。')) return;
    const res = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'RESET_ALL_PLAYERS' })
    });
    if (res.ok) {
      setMessage('已重置，可以开始新比赛');
      setRankings(null);
      hasAutoPlayed.current = false;
      refresh();
    } else {
      setMessage('重置失败');
    }
  };

  const handleAddPlayer = async (e) => {
    e.preventDefault();
    try {
      await adminAddPlayer({
        name: addForm.nickname,
        nickname: addForm.nickname,
        initial_chips: parseInt(addForm.initial_chips, 10),
        avatarFile: addForm.avatarFile
      });
      setAddMsg('添加成功');
      setAddForm({ nickname: '', initial_chips: '', avatarFile: null });
      setAvatarPreview(null);
      refresh();
    } catch (err) {
      setAddMsg(err.message);
    }
  };

  const handleAddChips = async (id) => {
    const amount = parseInt(chipAdds[id], 10);
    if (isNaN(amount) || amount <= 0) {
      setMessage('请输入有效的补筹码数量');
      return;
    }

    const res = await fetch(`/api/players/${id}/add-chips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setMessage(err?.error || 'Failed to add chips.');
      return;
    }

    setChipAdds({ ...chipAdds, [id]: '' });
    setMessage('补筹码成功');
    refresh();
  };

  const handleManualFinal = async (id) => {
    const chips = parseInt(manualFinal[id], 10);
    if (isNaN(chips)) return;
    const res = await fetch(`/api/players/${id}/final`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_chips: chips })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setMessage(err?.error || 'Failed to update final chips.');
      return;
    }
    setManualFinal({ ...manualFinal, [id]: '' });
    setMessage('补录成功');
    refresh();
  };

  const handleSettle = async () => {
    if (!confirm('确定执行清算？未提交的玩家将按 0 筹码计算。')) return;
    const res = await fetch('/api/settle', { method: 'POST' });
    const data = await res.json();
    setRankings(data.rankings);
    hasAutoPlayed.current = false;
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
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800 mb-2">比赛管理后台</h1>
          <div className="mt-4">
            <StatusBadge status={status.status} />
          </div>
        </div>

        <Card className="p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-700 mb-4">比赛控制</h2>

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
                disabled={status.status !== 'pending'}
              />
              <span className="text-slate-500">元</span>
              <Button variant="ghost" onClick={handleRateUpdate} disabled={status.status !== 'pending'}>更新</Button>
            </div>

            {message && (
              <div className="text-sm p-3 bg-blue-50 text-blue-700 rounded-lg">{message}</div>
            )}

            <div className="flex gap-3">
              {status.status === 'pending' && (
                <Button variant="success" onClick={handleStart} className="flex-1">开始比赛</Button>
              )}
              {status.status === 'running' && (
                <Button variant="warning" onClick={handleEnd} className="flex-1">结束比赛</Button>
              )}
              {status.status === 'settling' && (
                <Button variant="primary" onClick={handleSettle} className="flex-1">执行清算</Button>
              )}
              {status.status === 'completed' && (
                <Button variant="success" onClick={handleReset} className="flex-1">开始新比赛</Button>
              )}
            </div>
          </div>
        </Card>

        {(status.status === 'pending' || status.status === 'running' || status.status === 'settling') && (
          <Card className="p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-4">
              {status.status === 'settling' ? '补录玩家' : '添加玩家'}
            </h2>
            <form onSubmit={handleAddPlayer} className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-sm font-medium text-slate-600 mb-1">昵称</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="玩家昵称"
                  value={addForm.nickname}
                  onChange={e => setAddForm({ ...addForm, nickname: e.target.value })}
                  required
                />
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-slate-600 mb-1">入场筹码</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                  value={addForm.initial_chips}
                  onChange={e => setAddForm({ ...addForm, initial_chips: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">头像</label>
                <div className="flex items-center gap-2">
                  {avatarPreview && (
                    <img src={avatarPreview} alt="预览" className="w-8 h-8 rounded-full object-cover border border-slate-200" />
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={e => {
                      const file = e.target.files[0];
                      if (file) {
                        setAddForm({ ...addForm, avatarFile: file });
                        setAvatarPreview(URL.createObjectURL(file));
                      }
                    }}
                    className="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
                  />
                </div>
              </div>
              <Button variant="success" type="submit" className="mb-0">添加</Button>
            </form>
            {addMsg && (
              <div className={`text-sm mt-3 p-3 rounded-lg ${addMsg.includes('成功') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {addMsg}
              </div>
            )}
          </Card>
        )}

        {players.length > 0 && (
          <Card className="p-6 mb-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-sm text-slate-500">在场玩家</div>
                <div className="text-xl font-bold text-blue-600">{players.filter(p => !p.left_at).length}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">总入场筹码</div>
                <div className="text-xl font-bold text-emerald-600">{players.reduce((sum, p) => sum + p.initial_chips, 0)}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">已离场</div>
                <div className="text-xl font-bold text-amber-600">{players.filter(p => p.left_at).length}</div>
              </div>
            </div>
          </Card>
        )}

        <Card className="mb-6">
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-700 mb-4">参与者 ({players.length})</h2>

            {players.length === 0 ? (
              <div className="text-center text-slate-400 py-8">暂无参与者</div>
            ) : (
              <div className="space-y-2">
                {players.map(p => {
                  const totalSettlement = p.initial_chips * (status.chip_rate || 0.05);
                  const isLeft = !!p.left_at;
                  return (
                    <div key={p.id} className={`p-3 rounded-xl ${isLeft ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar nickname={p.nickname} src={p.avatar} size="md" />
                          <div>
                            <div className="font-medium text-slate-800">
                              {sanitizeText(p.nickname)}
                              {isLeft && <span className="ml-2 text-xs text-amber-600 font-normal">(已离场)</span>}
                            </div>
                            <div className="text-xs text-slate-500">
                              {p.name !== p.nickname ? sanitizeText(p.name) + ' · ' : ''}
                              入场 {p.initial_chips} 筹码 · 结算 {totalSettlement.toFixed(2)} 元
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.final_chips !== null && (
                            <span className="text-sm text-slate-500">剩余 {p.final_chips}</span>
                          )}
                          {status.status === 'settling' && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="补录筹码"
                                className="w-24 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                                value={manualFinal[p.id] || ''}
                                onChange={e => setManualFinal({ ...manualFinal, [p.id]: e.target.value })}
                              />
                              <button
                                onClick={() => handleManualFinal(p.id)}
                                className="text-blue-500 hover:text-blue-700 text-sm font-medium px-2"
                              >
                                补录
                              </button>
                            </div>
                          )}
                          <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600 px-2">
                            删除
                          </button>
                        </div>
                      </div>

                      {status.status === 'running' && !isLeft && (
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="补筹码"
                            className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                            value={chipAdds[p.id] || ''}
                            onChange={e => setChipAdds({ ...chipAdds, [p.id]: e.target.value })}
                          />
                          <Button variant="ghost" size="sm" onClick={() => handleAddChips(p.id)}>添加筹码</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {status.status === 'settling' && progress && (
          <Card className="mb-6">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-700 mb-4">提交进度 ({progress.submitted_count}/{progress.total})</h2>

              <div className="w-full bg-slate-100 rounded-full h-3 mb-4">
                <div
                  className="bg-blue-500 h-3 rounded-full transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.submitted_count / progress.total) * 100 : 0}%` }}
                />
              </div>

              {progress.pending.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-600">待提交（可直接补录）</h3>
                  {progress.pending.map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl">
                      <span className="font-medium text-amber-700">{sanitizeText(p.nickname)}</span>
                      <input
                        type="number"
                        placeholder="补录筹码"
                        className="flex-1 px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm"
                        value={manualFinal[p.id] || ''}
                        onChange={e => setManualFinal({ ...manualFinal, [p.id]: e.target.value })}
                      />
                      <Button variant="warning" className="px-3 py-1 text-sm" onClick={() => handleManualFinal(p.id)}>
                        补录
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {progress.submitted.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold text-slate-600">已提交</h3>
                  {progress.submitted.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-slate-400">#{i + 1}</span>
                        <Avatar nickname={p.nickname} src={p.avatar} size="sm" />
                        <span className="font-medium">{sanitizeText(p.nickname)}</span>
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

        {rankings && (
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-700">最终排名</h2>
                <button
                  onClick={() => setShowAnimation(true)}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full text-sm transition-colors"
                >
                  🎬 播放颁奖动画
                </button>
              </div>
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
                    <div className="flex-shrink-0">
                      <Avatar nickname={p.nickname} src={p.avatar} size="md" />
                    </div>
                    <div className="flex-grow">
                      <div className="font-bold text-slate-800">{sanitizeText(p.nickname)}</div>
                      <div className="text-xs text-slate-500">
                        入场 {p.initial_chips} 筹码 · 离场 {p.final_chips ?? 0} 筹码 · 离场价值 {(p.final_settlement ?? 0).toFixed(2)} 元
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

        {/* 颁奖动画 */}
        {showAnimation && rankings && (
          <RankingAnimation
            rankings={rankings}
            onClose={() => setShowAnimation(false)}
          />
        )}
      </div>
    </div>
  );
}
