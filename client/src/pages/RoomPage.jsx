import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  addRoomChips,
  adminAddRoomPlayer,
  deleteRoom,
  endRoom,
  getCurrentHand,
  getHandHistory,
  getDeviceId,
  getNetworkInfo,
  getRoom,
  getRoomPlayers,
  getRoomRankings,
  getRoomSettleProgress,
  joinRoom,
  postAction,
  resetRoom,
  setRoomMode,
  settleRoom,
  startHand,
  startRoom,
  submitRoomFinal
} from '../api';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import InviteQRCode from '../components/InviteQRCode';
import Input from '../components/Input';
import HandHistory from '../components/HandHistory';
import PokerTable from '../components/PokerTable';
import ProfitDisplay from '../components/ProfitDisplay';
import StatusBadge from '../components/StatusBadge';
import { sanitizeText } from '../utils/safeRender';

function inviteUrl(baseUrl, roomId) {
  if (!baseUrl) return `/#/room/${roomId}`;
  return baseUrl.replace(/\/#\/?$/, `/#/room/${roomId}`);
}

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [joinForm, setJoinForm] = useState({ nickname: '', initial_chips: '' });
  const [adminForm, setAdminForm] = useState({ nickname: '', initial_chips: '' });
  const [finalForm, setFinalForm] = useState({ nickname: '', final_chips: '' });
  const [chipAdds, setChipAdds] = useState({});
  const [rankings, setRankings] = useState(null);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState('');
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [handState, setHandState] = useState(null);
  const [handHistory, setHandHistory] = useState([]);

  const isHost = room?.host_device_id === getDeviceId();
  const isCashMode = room?.game_mode === 'cash';
  const shareUrl = useMemo(() => inviteUrl(networkInfo?.url, roomId), [networkInfo?.url, roomId]);

  const refresh = async () => {
    const [nextRoom, nextPlayers, info] = await Promise.all([
      getRoom(roomId),
      getRoomPlayers(roomId),
      getNetworkInfo().catch(() => null)
    ]);

    setRoom(nextRoom);
    setPlayers(nextPlayers);
    setNetworkInfo(info);

    const deviceId = getDeviceId();
    const me = nextPlayers.find((p) => p.device_id === deviceId);
    setMyPlayerId(me?.id || null);

    if (nextRoom.status === 'settling') {
      setProgress(await getRoomSettleProgress(roomId));
    } else {
      setProgress(null);
    }

    if (nextRoom.status === 'completed') {
      const data = await getRoomRankings(roomId);
      setRankings(data.rankings);
    } else {
      setRankings(null);
    }

    if (nextRoom.game_mode === 'cash') {
      try {
        const history = await getHandHistory(roomId);
        setHandHistory(history.hands || []);
      } catch {
        setHandHistory([]);
      }

      if (nextRoom.current_hand_id) {
        try {
          const currentHand = await getCurrentHand(roomId);
          setHandState(currentHand?.hand ? currentHand : null);
        } catch {
          setHandState(null);
        }
      } else {
        setHandState(null);
      }
    } else {
      setHandState(null);
      setHandHistory([]);
    }
  };

  useEffect(() => {
    refresh().catch((err) => setMessage(err.message));
    const interval = setInterval(() => refresh().catch(() => {}), 8000);
    return () => clearInterval(interval);
  }, [roomId]);

  useEffect(() => {
    const socket = io('/', {
      transports: ['websocket', 'polling']
    });

    const refreshSilently = () => refresh().catch(() => {});
    const subscribeAndRefresh = () => {
      socket.emit('room:subscribe', { roomId, deviceId: getDeviceId() });
      refreshSilently();
    };

    socket.on('connect', subscribeAndRefresh);
    socket.on('room:state', refreshSilently);
    socket.on('players:changed', refreshSilently);
    socket.on('chips:added', refreshSilently);
    socket.on('settle:progress', refreshSilently);
    socket.on('game:settled', refreshSilently);
    socket.on('hand:started', refreshSilently);
    socket.on('hand:updated', refreshSilently);
    socket.on('hand:action', refreshSilently);
    socket.on('hand:timeout', refreshSilently);
    socket.on('hand:turn', refreshSilently);
    socket.on('hand:ended', refreshSilently);
    socket.on('room:deleted', () => {
      setMessage('房间已解散');
      navigate('/rooms');
    });

    return () => {
      socket.emit('room:unsubscribe', { roomId });
      socket.disconnect();
    };
  }, [roomId]);

  const runAction = async (action) => {
    setMessage('');
    try {
      await action();
      await refresh();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleDeleteRoom = () => {
    if (!window.confirm('确定要解散这个房间吗？房间会从大厅中隐藏。')) return;
    runAction(async () => {
      await deleteRoom(roomId);
      navigate('/rooms');
    });
  };

  const handleJoin = (event) => {
    event.preventDefault();
    runAction(async () => {
      await joinRoom(roomId, {
        name: joinForm.nickname,
        nickname: joinForm.nickname,
        initial_chips: Number(joinForm.initial_chips)
      });
      setJoinForm({ nickname: '', initial_chips: '' });
      setMessage('报名成功');
    });
  };

  const handleAdminAdd = (event) => {
    event.preventDefault();
    runAction(async () => {
      await adminAddRoomPlayer(roomId, {
        name: adminForm.nickname,
        nickname: adminForm.nickname,
        initial_chips: Number(adminForm.initial_chips)
      });
      setAdminForm({ nickname: '', initial_chips: '' });
      setMessage('已添加玩家');
    });
  };

  const handleSubmitFinal = (event) => {
    event.preventDefault();
    runAction(async () => {
      await submitRoomFinal(roomId, {
        nickname: finalForm.nickname,
        final_chips: Number(finalForm.final_chips)
      });
      setFinalForm({ nickname: '', final_chips: '' });
      setMessage('最终筹码已提交');
    });
  };

  const handleStartHand = () => {
    runAction(async () => {
      await startHand(roomId, {
        sb: room.sb_amount,
        bb: room.bb_amount,
        action_timeout_seconds: room.action_timeout_seconds
      });
      setMessage('新一手已开始');
    });
  };

  const handleAction = async (action, amount) => {
    setMessage('');
    try {
      if (!handState?.hand?.id) throw new Error('当前没有进行中的牌局');
      await postAction(roomId, handState.hand.id, action, amount, myPlayerId);
      await refresh();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleSetMode = (mode) => {
    runAction(async () => {
      await setRoomMode(roomId, mode);
      setMessage(`已切换为${mode === 'cash' ? '现金局' : '锦标赛'}模式`);
    });
  };

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50">
        <Card className="p-6 text-slate-500">{message || '正在加载房间...'}</Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Link to="/rooms" className="text-sm text-blue-600 underline underline-offset-2">
              返回房间大厅
            </Link>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-800">{sanitizeText(room.name)}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <StatusBadge status={room.status} />
                <span className="text-sm text-slate-500">房间码 {room.id}</span>
                <span className="text-sm text-slate-500">1 筹码 = {room.chip_rate}</span>
                {isHost && (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                    当前设备是房主
                  </span>
                )}
              </div>
            </div>
          </div>

          <Card className="max-w-md border-slate-200 p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-700">邀请链接</div>
            <a className="mt-1 block break-all text-sm text-blue-600 underline" href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
            </a>
            <div className="mt-3 flex items-center gap-4">
              <InviteQRCode value={shareUrl} label="扫码进入房间" size={132} />
              <div className="text-xs leading-6 text-slate-500">
                <div>适合局间快速加入</div>
                <div>同桌玩家扫码即可进入</div>
              </div>
            </div>
          </Card>
        </div>

        {message && (
          <Card className="border-blue-100 bg-blue-50/80 p-4 text-sm text-slate-700 shadow-sm">
            {message}
          </Card>
        )}

        {isHost && (
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">房主管理</h2>
                <p className="mt-1 text-sm text-slate-500">控制房间状态、切换模式，并维护牌桌节奏。</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {room.status === 'pending' && (
                  <Button variant="success" onClick={() => runAction(() => startRoom(roomId))}>
                    开始比赛
                  </Button>
                )}
                {room.status === 'running' && (
                  <Button variant="warning" onClick={() => runAction(() => endRoom(roomId))}>
                    结束比赛
                  </Button>
                )}
                {room.status === 'settling' && (
                  <Button variant="primary" onClick={() => runAction(() => settleRoom(roomId))}>
                    执行结算
                  </Button>
                )}
                {room.status === 'completed' && (
                  <Button variant="success" onClick={() => runAction(() => resetRoom(roomId))}>
                    重置房间
                  </Button>
                )}
                <Button variant="ghost" onClick={() => refresh().catch((err) => setMessage(err.message))}>
                  刷新
                </Button>
                <Button variant="danger" onClick={handleDeleteRoom}>
                  解散房间
                </Button>
              </div>
            </div>

            {room.status === 'pending' && (
              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="mb-2 text-sm font-semibold text-slate-700">游戏模式</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={room.game_mode === 'tournament' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => handleSetMode('tournament')}
                  >
                    锦标赛
                  </Button>
                  <Button
                    variant={room.game_mode === 'cash' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => handleSetMode('cash')}
                  >
                    现金局
                  </Button>
                </div>
                {room.game_mode === 'cash' && (
                  <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    小盲 {room.sb_amount} / 大盲 {room.bb_amount} / 行动倒计时 {room.action_timeout_seconds || 30} 秒
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-3 sm:gap-6">
          <div className="space-y-4 lg:col-span-2 sm:space-y-6">
            {room.status === 'running' && isCashMode && (
              <>
                <Card className="overflow-visible border-slate-200 p-1 sm:p-4">
                  <PokerTable
                    handState={handState}
                    myPlayerId={myPlayerId}
                    isHost={isHost}
                    onAction={handleAction}
                    onStartHand={handleStartHand}
                  />
                </Card>
                {handState?.actions?.length > 0 && (
                  <Card className="p-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-700">动作历史</h3>
                    <HandHistory actions={handState.actions} />
                  </Card>
                )}
              </>
            )}

            <Card className="p-3 sm:p-6">
              <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-800 sm:text-lg">玩家列表 ({players.length})</h2>
                  <p className="mt-1 text-xs text-slate-500">当前房间中的所有玩家与筹码情况。</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => refresh().catch((err) => setMessage(err.message))}>
                  刷新
                </Button>
              </div>

              {players.length === 0 ? (
                <div className="py-8 text-center text-slate-400">暂无玩家。</div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {players.map((player) => (
                    <div key={player.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar nickname={player.nickname} src={player.avatar} size="sm" />
                          <div>
                            <div className="text-sm font-bold text-slate-800 sm:text-base">{sanitizeText(player.nickname)}</div>
                            <div className="text-[11px] text-slate-500 sm:text-xs">
                              买入 {player.initial_chips} 筹码
                              {player.left_at ? ` · 已离场 ${player.final_chips}` : ''}
                            </div>
                          </div>
                        </div>

                        {isHost && room.status === 'running' && !player.left_at && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              placeholder="补筹码"
                              className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              value={chipAdds[player.id] || ''}
                              onChange={(e) => setChipAdds({ ...chipAdds, [player.id]: e.target.value })}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => runAction(() => addRoomChips(roomId, player.id, Number(chipAdds[player.id])))}
                            >
                              补筹码
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {progress && (
              <Card className="p-6">
                <h2 className="mb-3 text-lg font-bold text-slate-800">
                  提交进度 ({progress.submitted_count}/{progress.total})
                </h2>
                <div className="space-y-2">
                  {progress.pending.map((player) => (
                    <div key={player.id} className="rounded-lg bg-amber-50 p-3 text-amber-700">
                      {sanitizeText(player.nickname)} 等待提交
                    </div>
                  ))}
                  {progress.submitted.map((player) => (
                    <div key={player.id} className="flex justify-between rounded-lg bg-emerald-50 p-3">
                      <span>{sanitizeText(player.nickname)}</span>
                      <ProfitDisplay value={player.money_net} />
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {rankings && (
              <Card className="p-6">
                <h2 className="mb-4 text-lg font-bold text-slate-800">最终排名</h2>
                <div className="space-y-3">
                  {rankings.map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
                      <div>
                        <span className="mr-3 font-bold text-slate-400">#{index + 1}</span>
                        <span className="font-bold text-slate-800">{sanitizeText(player.nickname)}</span>
                      </div>
                      <ProfitDisplay value={player.net_profit} />
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4 sm:space-y-6">
            {room.status === 'running' && (
              <Card>
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white sm:p-5">
                  <h2 className="font-bold text-sm sm:text-base">玩家报名</h2>
                  <p className="mt-1 text-xs text-blue-100">输入昵称和筹码后即可加入当前牌桌。</p>
                </div>
                <form onSubmit={handleJoin} className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                  <Input
                    label="昵称"
                    value={joinForm.nickname}
                    onChange={(e) => setJoinForm({ ...joinForm, nickname: e.target.value })}
                    required
                  />
                  <Input
                    label="买入筹码"
                    type="number"
                    value={joinForm.initial_chips}
                    onChange={(e) => setJoinForm({ ...joinForm, initial_chips: e.target.value })}
                    required
                  />
                  <Button type="submit" variant="primary" size="lg">
                    提交报名
                  </Button>
                </form>
              </Card>
            )}

            {isHost && ['pending', 'running', 'settling'].includes(room.status) && (
              <Card>
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 text-white sm:p-5">
                  <h2 className="font-bold text-sm sm:text-base">房主添加玩家</h2>
                  <p className="mt-1 text-xs text-emerald-100">适合代报名、线下登记或补录玩家。</p>
                </div>
                <form onSubmit={handleAdminAdd} className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                  <Input
                    label="昵称"
                    value={adminForm.nickname}
                    onChange={(e) => setAdminForm({ ...adminForm, nickname: e.target.value })}
                    required
                  />
                  <Input
                    label="买入筹码"
                    type="number"
                    value={adminForm.initial_chips}
                    onChange={(e) => setAdminForm({ ...adminForm, initial_chips: e.target.value })}
                    required
                  />
                  <Button type="submit" variant="success" size="lg">
                    添加玩家
                  </Button>
                </form>
              </Card>
            )}

            {room.status === 'settling' && (
              <Card>
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white sm:p-5">
                  <h2 className="font-bold text-sm sm:text-base">提交最终筹码</h2>
                  <p className="mt-1 text-xs text-amber-100">用于锦标赛或线下结算核对。</p>
                </div>
                <form onSubmit={handleSubmitFinal} className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                  <Input
                    label="昵称"
                    value={finalForm.nickname}
                    onChange={(e) => setFinalForm({ ...finalForm, nickname: e.target.value })}
                    required
                  />
                  <Input
                    label="最终筹码"
                    type="number"
                    value={finalForm.final_chips}
                    onChange={(e) => setFinalForm({ ...finalForm, final_chips: e.target.value })}
                    required
                  />
                  <Button type="submit" variant="warning" size="lg">
                    提交
                  </Button>
                </form>
              </Card>
            )}

            {isCashMode && handHistory.length > 0 && (
              <Card className="p-3 sm:p-4">
                <h2 className="mb-3 text-sm font-bold text-slate-800">历史手牌</h2>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {handHistory.map((h, idx) => (
                    <div key={h.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <div>
                        <span className="font-medium text-slate-700">#{handHistory.length - idx}</span>
                        <span className="ml-2 text-slate-400">{h.status === 'showdown' ? '摊牌结束' : '提前结束'}</span>
                      </div>
                      <div className="text-slate-500">底池 {h.total_pot}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
