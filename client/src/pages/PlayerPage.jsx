import { useState, useEffect } from 'react';
import { getStatus, submitPlayer, submitFinal, getSettleProgress, getRankings, leavePlayer, getPlayers } from '../api';
import Card from '../components/Card';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import ProfitDisplay from '../components/ProfitDisplay';
import Input from '../components/Input';
import Medal from '../components/Medal';
import { sanitizeText } from '../utils/safeRender';

// 本地存储当前玩家报名状态
function getMyPlayer() {
  try {
    const raw = localStorage.getItem('my_player');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setMyPlayer(data) {
  localStorage.setItem('my_player', JSON.stringify(data));
}
function clearMyPlayer() {
  localStorage.removeItem('my_player');
}

export default function PlayerPage() {
  const [status, setStatus] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [joinForm, setJoinForm] = useState({ nickname: '', initial_chips: '' });
  const [finalForm, setFinalForm] = useState({ nickname: '', final_chips: '' });
  const [leaveForm, setLeaveForm] = useState({ final_chips: '' });
  const [joinMsg, setJoinMsg] = useState('');
  const [finalMsg, setFinalMsg] = useState('');
  const [leaveMsg, setLeaveMsg] = useState('');
  const [finalResult, setFinalResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [rankings, setRankings] = useState(null);

  const myPlayer = getMyPlayer();

  const refreshStatus = async () => {
    const s = await getStatus();
    setStatus(s);
    if (s.status === 'settling') {
      const p = await getSettleProgress();
      setProgress(p);
    }
    if (s.status === 'completed') {
      const r = await getRankings();
      setRankings(r.rankings);
    }
    // running 状态下拉取玩家列表，确认自己是否还在场
    if (s.status === 'running') {
      const players = await getPlayers();
      setAllPlayers(players);
      const cached = getMyPlayer();
      if (cached) {
        const stillThere = players.find(p => p.id === cached.id && !p.left_at);
        if (!stillThere) {
          clearMyPlayer();
        }
      }
    }
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleJoin = async (e) => {
    e.preventDefault();
    try {
      const result = await submitPlayer({
        name: joinForm.nickname,
        nickname: joinForm.nickname,
        initial_chips: parseInt(joinForm.initial_chips)
      });
      setMyPlayer({ id: result.id, nickname: result.nickname });
      setJoinMsg('报名成功！');
      setJoinForm({ nickname: '', initial_chips: '' });
      refreshStatus();
    } catch (err) {
      setJoinMsg('❌ ' + err.message);
    }
  };

  const handleLeave = async (e) => {
    e.preventDefault();
    if (!myPlayer) {
      setLeaveMsg('❌ 未检测到报名记录');
      return;
    }
    try {
      const result = await leavePlayer(myPlayer.id, parseInt(leaveForm.final_chips));
      clearMyPlayer();
      setLeaveMsg('✅ ' + (result.message || '离场成功'));
      setLeaveForm({ final_chips: '' });
      refreshStatus();
    } catch (err) {
      setLeaveMsg('❌ ' + err.message);
    }
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await submitFinal({
        nickname: finalForm.nickname,
        final_chips: parseInt(finalForm.final_chips)
      });
      setFinalResult(result);
      setFinalMsg('✅ 提交成功！');
      setFinalForm({ name: '', nickname: '', final_chips: '' });
      getSettleProgress().then(p => setProgress(p));
    } catch (err) {
      setFinalMsg('❌ ' + err.message);
    }
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
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800 mb-2">🃏 德州扑克</h1>
          <p className="text-slate-500">筹码管理系统</p>
          <div className="mt-4">
            <StatusBadge status={status.status} />
          </div>
        </div>

        {/* PENDING */}
        {status.status === 'pending' && (
          <Card className="p-8 text-center">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-xl font-bold text-slate-700 mb-2">比赛即将开始</h2>
            <p className="text-slate-500">请稍候，管理员正在准备比赛...</p>
          </Card>
        )}

        {/* RUNNING - Join or Leave */}
        {status.status === 'running' && (
          <div className="space-y-6">
            {!myPlayer ? (
              /* 未报名：显示入场表单 */
              <Card>
                <div className="p-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                  <h2 className="text-xl font-bold">📝 报名参加比赛</h2>
                  <p className="text-blue-100 text-sm mt-1">1筹码 = {status.chip_rate}元</p>
                </div>
                <form onSubmit={handleJoin} className="p-6 space-y-4">
                  <Input
                    label="昵称"
                    placeholder="请输入游戏昵称"
                    value={joinForm.nickname}
                    onChange={e => setJoinForm({...joinForm, nickname: e.target.value})}
                    required
                  />
                  <Input
                    label="入场筹码"
                    type="number"
                    placeholder="0"
                    value={joinForm.initial_chips}
                    onChange={e => setJoinForm({...joinForm, initial_chips: e.target.value})}
                    required
                  />
                  <Button type="submit" variant="primary">提交报名</Button>
                  {joinMsg && (
                    <div className={`text-sm text-center mt-2 p-3 rounded-lg ${joinMsg.includes('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {joinMsg}
                    </div>
                  )}
                </form>
              </Card>
            ) : (
              /* 已报名：显示离场表单 */
              <Card>
                <div className="p-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  <h2 className="text-xl font-bold">🚪 离场结算</h2>
                  <p className="text-amber-100 text-sm mt-1">你当前以「{sanitizeText(myPlayer.nickname)}」身份参赛</p>
                  <p className="text-amber-100 text-xs mt-0.5">1筹码 = {status.chip_rate}元</p>
                </div>
                <form onSubmit={handleLeave} className="p-6 space-y-4">
                  <Input
                    label="当前剩余筹码"
                    type="number"
                    placeholder="输入离场时的筹码数量"
                    value={leaveForm.final_chips}
                    onChange={e => setLeaveForm({...leaveForm, final_chips: e.target.value})}
                    required
                  />
                  <Button type="submit" variant="warning">确认离场</Button>
                  {leaveMsg && (
                    <div className={`text-sm text-center mt-2 p-3 rounded-lg ${leaveMsg.includes('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {leaveMsg}
                    </div>
                  )}
                </form>
              </Card>
            )}

            {/* 当前在场玩家列表 */}
            {allPlayers.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-700 mb-4">👥 当前在场玩家</h3>
                <div className="space-y-2">
                  {allPlayers.filter(p => !p.left_at).map(p => (
                    <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl ${p.id === myPlayer?.id ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm">
                          {p.nickname.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">
                            {sanitizeText(p.nickname)}
                            {p.id === myPlayer?.id && <span className="ml-1 text-xs text-blue-500">(你)</span>}
                          </div>
                          <div className="text-xs text-slate-500">入场 {p.initial_chips} 筹码</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {allPlayers.filter(p => p.left_at).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <h4 className="text-xs font-semibold text-slate-400 mb-2">已离场</h4>
                      {allPlayers.filter(p => p.left_at).map(p => (
                        <div key={p.id} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg text-sm">
                          <span className="text-amber-700">{sanitizeText(p.nickname)}</span>
                          <span className="text-amber-600">剩余 {p.final_chips} 筹码</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* SETTLING - Submit final chips */}
        {status.status === 'settling' && (
          <div className="space-y-6">
            {/* 如果当前设备有报名记录但还没提交，优先提示；否则任何人都可以按昵称提交 */}
            <Card>
              <div className="p-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                <h2 className="text-xl font-bold">📊 提交最终筹码</h2>
                <p className="text-amber-100 text-sm mt-1">1筹码 = {status.chip_rate}元</p>
              </div>
              <form onSubmit={handleFinalSubmit} className="p-6 space-y-4">
                <Input
                  label="昵称"
                  placeholder="报名时填写的昵称"
                  value={finalForm.nickname}
                  onChange={e => setFinalForm({...finalForm, nickname: e.target.value})}
                  required
                />
                <Input
                  label="剩余筹码"
                  type="number"
                  placeholder="0"
                  value={finalForm.final_chips}
                  onChange={e => setFinalForm({...finalForm, final_chips: e.target.value})}
                  required
                />
                <Button type="submit" variant="success">提交并查看结果</Button>
                {finalMsg && (
                  <div className={`text-sm text-center mt-2 p-3 rounded-lg ${finalMsg.includes('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {finalMsg}
                  </div>
                )}
              </form>
            </Card>

            {/* Personal Result */}
            {finalResult && (
              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-700 mb-4">🎯 你的成绩</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl text-center">
                    <div className="text-sm text-slate-500">入场筹码</div>
                    <div className="text-xl font-bold text-slate-700">{finalResult.initial_chips}</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl text-center">
                    <div className="text-sm text-slate-500">剩余筹码</div>
                    <div className="text-xl font-bold text-slate-700">{finalResult.final_chips}</div>
                  </div>
                  <div className={`p-4 rounded-xl text-center ${finalResult.chip_net >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <div className="text-sm text-slate-500">筹码净值</div>
                    <div className={`text-xl font-bold ${finalResult.chip_net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {finalResult.chip_net >= 0 ? '+' : ''}{finalResult.chip_net}
                    </div>
                  </div>
                  <div className={`p-4 rounded-xl text-center ${finalResult.money_net >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <div className="text-sm text-slate-500">盈亏金额</div>
                    <div className={`text-xl font-bold ${finalResult.money_net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {finalResult.money_net >= 0 ? '+' : ''}{finalResult.money_net.toFixed(2)} 元
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-center text-sm text-slate-400">
                  筹码净值 {finalResult.chip_net} × 1筹码={finalResult.chip_rate}元 = {finalResult.money_net.toFixed(2)} 元
                </div>
                {finalResult.total_settlement > 0 && (
                  <div className="mt-2 text-center text-sm text-slate-400">
                    结算总金额（入场）: {finalResult.total_settlement.toFixed(2)} 元
                  </div>
                )}
              </Card>
            )}

            {/* Progress */}
            {progress && (
              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-700 mb-3">
                  📋 提交进度 ({progress.submitted_count}/{progress.total})
                </h3>
                <div className="w-full bg-slate-100 rounded-full h-3 mb-4">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all"
                    style={{ width: `${progress.total > 0 ? (progress.submitted_count / progress.total) * 100 : 0}%` }}
                  ></div>
                </div>
                
                {progress.submitted.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-600">已提交</h4>
                    {progress.submitted.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Medal rank={i + 1} />
                          <span className="font-medium">{sanitizeText(p.nickname)}</span>
                          <span className="text-xs text-slate-400">结算 {(p.total_settlement ?? 0).toFixed(2)} 元</span>
                        </div>
                        <ProfitDisplay value={p.money_net} />
                      </div>
                    ))}
                  </div>
                )}
                
                {progress.pending.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <h4 className="text-sm font-semibold text-slate-600">待提交</h4>
                    {progress.pending.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                        <span className="font-medium text-amber-700">{sanitizeText(p.nickname)}</span>
                        <span className="text-sm text-amber-600">等待中...</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* COMPLETED - Rankings */}
        {status.status === 'completed' && rankings && (
          <div className="space-y-6">
            <Card className="p-6 text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white">
              <h2 className="text-2xl font-bold">🏆 比赛结果</h2>
              <p className="text-blue-100 mt-1">1筹码 = {status.chip_rate}元</p>
            </Card>

            <Card>
              <div className="p-4">
                {rankings.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-4 p-4 rounded-xl mb-3 transition-all ${
                      i === 0 ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border border-amber-200' :
                      i === 1 ? 'bg-gradient-to-r from-slate-50 to-gray-50 border border-gray-200' :
                      i === 2 ? 'bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200' :
                      'bg-slate-50'
                    }`}
                  >
                    <div className="flex-shrink-0 w-12 text-center">
                      <Medal rank={i + 1} />
                    </div>
                    <div className="flex-grow">
                      <div className="font-bold text-slate-800">{sanitizeText(p.nickname)}</div>
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
            </Card>

            {/* Stats Summary */}
            {rankings.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-700 mb-4">📊 统计摘要</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-emerald-50 rounded-xl">
                    <div className="text-sm text-slate-500">总盈利</div>
                    <div className="text-xl font-bold text-emerald-600">
                      +{rankings.filter(r => r.net_profit > 0).reduce((a, r) => a + r.net_profit, 0).toFixed(2)} 元
                    </div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-xl">
                    <div className="text-sm text-slate-500">总亏损</div>
                    <div className="text-xl font-bold text-red-500">
                      {rankings.filter(r => r.net_profit < 0).reduce((a, r) => a + r.net_profit, 0).toFixed(2)} 元
                    </div>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-xl">
                    <div className="text-sm text-slate-500">参与人数</div>
                    <div className="text-xl font-bold text-blue-600">{rankings.length} 人</div>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-xl">
                    <div className="text-sm text-slate-500">平均盈亏</div>
                    <div className="text-xl font-bold text-purple-600">
                      {(rankings.reduce((a, r) => a + r.net_profit, 0) / rankings.length).toFixed(2)} 元
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
