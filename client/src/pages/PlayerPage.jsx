import { useState, useEffect } from 'react';
import { getStatus, submitPlayer, submitFinal, getSettleProgress, getRankings, leaveGame } from '../api';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import Medal from '../components/Medal';
import ProfitDisplay from '../components/ProfitDisplay';

export default function PlayerPage() {
  const [status, setStatus] = useState(null);
  const [joinForm, setJoinForm] = useState({ nickname: '', initial_chips: '' });
  const [finalForm, setFinalForm] = useState({ nickname: '', final_chips: '' });
  const [joinMsg, setJoinMsg] = useState('');
  const [joinResult, setJoinResult] = useState(null);
  const [finalMsg, setFinalMsg] = useState('');
  const [finalResult, setFinalResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [rankings, setRankings] = useState(null);

  useEffect(() => {
    getStatus().then(s => setStatus(s));
    const interval = setInterval(() => {
      getStatus().then(s => {
        setStatus(s);
        if (s.status === 'settling') {
          getSettleProgress().then(p => setProgress(p));
        }
        if (s.status === 'completed') {
          getRankings().then(r => setRankings(r.rankings));
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status?.status === 'settling') {
      getSettleProgress().then(p => setProgress(p));
    }
    if (status?.status === 'completed') {
      getRankings().then(r => setRankings(r.rankings));
    }
  }, [status]);

  const handleJoin = async (e) => {
    e.preventDefault();
    try {
      const result = await submitPlayer({
        ...joinForm,
        initial_chips: parseInt(joinForm.initial_chips)
      });
      setJoinResult(result);
      setJoinMsg('✅ 报名成功！');
      setJoinForm({ nickname: '', initial_chips: '' });
    } catch (err) {
      setJoinMsg('❌ ' + (err.message || '报名失败'));
    }
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await submitFinal({
        ...finalForm,
        final_chips: parseInt(finalForm.final_chips)
      });
      setFinalResult(result);
      setFinalMsg('✅ 提交成功！');
      setFinalForm({ nickname: '', final_chips: '' });
      getSettleProgress().then(p => setProgress(p));
    } catch (err) {
      setFinalMsg('❌ ' + (err.message || '提交失败'));
    }
  };

  const handleLeave = async () => {
    if (!confirm('确定退出比赛？退出后你的记录将被保留但不参与结算。')) return;
    try {
      const result = await leaveGame(joinResult?.id);
      setJoinMsg('ℹ️ 已退出比赛');
      setJoinResult(null);
    } catch (err) {
      setJoinMsg('❌ 退出失败：' + (err.message || '未知错误'));
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
          {status.status === 'pending' && (
            <p className="mt-2 text-sm text-slate-400">
              1筹码 = {status.chip_rate}元 · 请等候管理员开始比赛
            </p>
          )}
          {status.status === 'running' && (
            <p className="mt-2 text-sm text-emerald-600">
              1筹码 = {status.chip_rate}元 · 比赛进行中，欢迎报名
            </p>
          )}
        </div>

        {/* PENDING */}
        {status.status === 'pending' && (
          <Card className="p-8 text-center">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-xl font-bold text-slate-700 mb-2">比赛即将开始</h2>
            <p className="text-slate-500">请稍候，管理员正在准备比赛...</p>
            <div className="mt-4 text-sm text-slate-400">
              筹码比例：{status.chip_rate} 元/筹码
            </div>
          </Card>
        )}

        {/* RUNNING - Join */}
        {status.status === 'running' && (
          <div className="space-y-4">
            {!joinResult && (
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
            )}

            {joinResult && (
              <Card className="p-6">
                <div className="text-center">
                  <div className="text-4xl mb-2">🎫</div>
                  <h3 className="text-lg font-bold text-slate-800">报名成功</h3>
                  <p className="text-slate-500 mt-1">序号 #{joinResult.id} · {joinResult.nickname}</p>
                  <p className="text-sm text-slate-400 mt-1">入场筹码：{joinResult.initial_chips}</p>
                  <p className="text-xs text-slate-300 mt-2">请截图保存此凭证</p>
                </div>
                <Button variant="danger" size="lg" className="mt-4" onClick={handleLeave}>
                  退出比赛
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* SETTLING - Submit final chips */}
        {status.status === 'settling' && (
          <div className="space-y-6">
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
                
                {progress.pending.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <h4 className="text-sm font-semibold text-slate-600">待提交</h4>
                    {progress.pending.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                        <span className="font-medium text-amber-700">{p.nickname}</span>
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
