import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  addRoomChips,
  adminAddRoomPlayer,
  deleteRoom,
  endRoom,
  getDeviceId,
  getNetworkInfo,
  getRoom,
  getRoomPlayers,
  getRoomRankings,
  getRoomSettleProgress,
  joinRoom,
  resetRoom,
  settleRoom,
  startRoom,
  submitRoomFinal
} from '../api';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import InviteQRCode from '../components/InviteQRCode';
import Input from '../components/Input';
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

  const isHost = room?.host_device_id === getDeviceId();
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
  };

  useEffect(() => {
    refresh().catch(err => setMessage(err.message));
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
    if (!window.confirm('确定要解散这个房间吗？房间会从大厅隐藏。')) return;
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

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center">
        <Card className="p-6 text-slate-500">{message || '加载房间中...'}</Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link to="/rooms" className="text-sm text-blue-600 underline">返回房间大厅</Link>
            <h1 className="text-3xl font-extrabold text-slate-800 mt-2">{sanitizeText(room.name)}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <StatusBadge status={room.status} />
              <span className="text-sm text-slate-500">房间码 {room.id}</span>
              <span className="text-sm text-slate-500">1 筹码 = {room.chip_rate}</span>
              {isHost && <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">本设备是房主</span>}
            </div>
          </div>
          <Card className="p-4 max-w-md">
            <div className="text-sm font-semibold text-slate-700 mb-1">邀请链接</div>
            <a className="text-sm text-blue-600 underline break-all" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
            <div className="mt-3">
              <InviteQRCode value={shareUrl} label="扫码进入房间" size={132} />
            </div>
          </Card>
        </div>

        {message && <Card className="p-4 text-sm text-slate-700">{message}</Card>}

        {isHost && (
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">房主控制</h2>
            <div className="flex flex-wrap gap-3">
              {room.status === 'pending' && <Button variant="success" onClick={() => runAction(() => startRoom(roomId))}>开始比赛</Button>}
              {room.status === 'running' && <Button variant="warning" onClick={() => runAction(() => endRoom(roomId))}>结束比赛</Button>}
              {room.status === 'settling' && <Button variant="primary" onClick={() => runAction(() => settleRoom(roomId))}>执行清算</Button>}
              {room.status === 'completed' && <Button variant="success" onClick={() => runAction(() => resetRoom(roomId))}>重置房间</Button>}
              <Button variant="ghost" onClick={() => refresh().catch(err => setMessage(err.message))}>刷新</Button>
              <Button variant="danger" onClick={handleDeleteRoom}>解散房间</Button>
            </div>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800">玩家列表 ({players.length})</h2>
                <Button variant="ghost" size="sm" onClick={() => refresh().catch(err => setMessage(err.message))}>刷新</Button>
              </div>
              {players.length === 0 ? (
                <div className="text-center text-slate-400 py-8">暂无玩家。</div>
              ) : (
                <div className="space-y-3">
                  {players.map(player => (
                    <div key={player.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar nickname={player.nickname} src={player.avatar} size="md" />
                          <div>
                            <div className="font-bold text-slate-800">{sanitizeText(player.nickname)}</div>
                            <div className="text-xs text-slate-500">入场 {player.initial_chips} 筹码{player.left_at ? ` · 已离场 ${player.final_chips}` : ''}</div>
                          </div>
                        </div>
                        {isHost && room.status === 'running' && !player.left_at && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              placeholder="补筹码"
                              className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                              value={chipAdds[player.id] || ''}
                              onChange={e => setChipAdds({ ...chipAdds, [player.id]: e.target.value })}
                            />
                            <Button size="sm" variant="ghost" onClick={() => runAction(() => addRoomChips(roomId, player.id, Number(chipAdds[player.id])))}>补筹码</Button>
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
                <h2 className="text-lg font-bold text-slate-800 mb-3">提交进度 ({progress.submitted_count}/{progress.total})</h2>
                <div className="space-y-2">
                  {progress.pending.map(player => (
                    <div key={player.id} className="p-3 rounded-lg bg-amber-50 text-amber-700">{sanitizeText(player.nickname)} 等待提交</div>
                  ))}
                  {progress.submitted.map(player => (
                    <div key={player.id} className="p-3 rounded-lg bg-emerald-50 flex justify-between">
                      <span>{sanitizeText(player.nickname)}</span>
                      <ProfitDisplay value={player.money_net} />
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {rankings && (
              <Card className="p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-4">最终排名</h2>
                <div className="space-y-3">
                  {rankings.map((player, index) => (
                    <div key={player.id} className="p-4 rounded-xl bg-slate-50 flex items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-slate-400 mr-3">#{index + 1}</span>
                        <span className="font-bold text-slate-800">{sanitizeText(player.nickname)}</span>
                      </div>
                      <ProfitDisplay value={player.net_profit} />
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {room.status === 'running' && (
              <Card>
                <div className="p-5 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                  <h2 className="font-bold">玩家报名</h2>
                </div>
                <form onSubmit={handleJoin} className="p-5 space-y-4">
                  <Input label="昵称" value={joinForm.nickname} onChange={e => setJoinForm({ ...joinForm, nickname: e.target.value })} required />
                  <Input label="入场筹码" type="number" value={joinForm.initial_chips} onChange={e => setJoinForm({ ...joinForm, initial_chips: e.target.value })} required />
                  <Button type="submit" variant="primary" size="lg">提交报名</Button>
                </form>
              </Card>
            )}

            {isHost && ['pending', 'running', 'settling'].includes(room.status) && (
              <Card>
                <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
                  <h2 className="font-bold">房主加人</h2>
                </div>
                <form onSubmit={handleAdminAdd} className="p-5 space-y-4">
                  <Input label="昵称" value={adminForm.nickname} onChange={e => setAdminForm({ ...adminForm, nickname: e.target.value })} required />
                  <Input label="入场筹码" type="number" value={adminForm.initial_chips} onChange={e => setAdminForm({ ...adminForm, initial_chips: e.target.value })} required />
                  <Button type="submit" variant="success" size="lg">添加玩家</Button>
                </form>
              </Card>
            )}

            {room.status === 'settling' && (
              <Card>
                <div className="p-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  <h2 className="font-bold">提交最终筹码</h2>
                </div>
                <form onSubmit={handleSubmitFinal} className="p-5 space-y-4">
                  <Input label="昵称" value={finalForm.nickname} onChange={e => setFinalForm({ ...finalForm, nickname: e.target.value })} required />
                  <Input label="最终筹码" type="number" value={finalForm.final_chips} onChange={e => setFinalForm({ ...finalForm, final_chips: e.target.value })} required />
                  <Button type="submit" variant="warning" size="lg">提交</Button>
                </form>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
