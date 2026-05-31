import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createRoom, getDeviceId, getNetworkInfo, getRooms } from '../api';
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';
import StatusBadge from '../components/StatusBadge';

function roomUrl(baseUrl, roomId) {
  if (!baseUrl) return `/#/room/${roomId}`;
  return baseUrl.replace(/\/#\/?$/, `/#/room/${roomId}`);
}

export default function RoomsPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [form, setForm] = useState({ name: '', chip_rate: '0.05' });
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const [roomRows, info] = await Promise.all([
      getRooms(),
      getNetworkInfo().catch(() => null)
    ]);
    setRooms(roomRows.filter(room => room.id !== 'default'));
    setNetworkInfo(info);
  };

  useEffect(() => {
    refresh().catch(err => setMessage(err.message));
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      const room = await createRoom({
        name: form.name || 'Poker Room',
        chip_rate: Number(form.chip_rate)
      });
      navigate(`/room/${room.id}`);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleJoin = (event) => {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/room/${code}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center">
          <p className="text-sm font-semibold text-blue-600 mb-2">LAN Poker Rooms</p>
          <h1 className="text-3xl font-extrabold text-slate-800">局域网房间大厅</h1>
          <p className="text-slate-500 mt-2">原单局入口仍在 <Link className="text-blue-600 underline" to="/">玩家页</Link> 和 <Link className="text-blue-600 underline" to="/admin">管理页</Link>。</p>
        </div>

        {message && <Card className="p-4 text-sm text-red-600">{message}</Card>}

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <div className="p-6 bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
              <h2 className="text-xl font-bold">创建新房间</h2>
              <p className="text-blue-100 text-sm mt-1">当前设备 ID：{getDeviceId()}</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <Input
                label="房间名称"
                placeholder="今晚的德州扑克"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
              <Input
                label="筹码倍率"
                type="number"
                step="0.01"
                min="0.01"
                value={form.chip_rate}
                onChange={e => setForm({ ...form, chip_rate: e.target.value })}
                required
              />
              <Button type="submit" variant="primary" size="lg">创建并进入</Button>
            </form>
          </Card>

          <Card>
            <div className="p-6 bg-gradient-to-r from-slate-700 to-slate-900 text-white">
              <h2 className="text-xl font-bold">输入房间码</h2>
              <p className="text-slate-300 text-sm mt-1">适合从朋友手机上看到房间码后手动加入。</p>
            </div>
            <form onSubmit={handleJoin} className="p-6 space-y-4">
              <Input
                label="房间码"
                placeholder="A3B9K2"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                required
              />
              <Button type="submit" variant="ghost" size="lg">进入房间</Button>
            </form>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800">本机房间</h2>
              <p className="text-sm text-slate-500">同一 WiFi 下可通过房间链接访问。</p>
            </div>
            <Button variant="ghost" onClick={() => refresh().catch(err => setMessage(err.message))}>刷新</Button>
          </div>

          {rooms.length === 0 ? (
            <div className="text-center text-slate-400 py-8">还没有创建房间。</div>
          ) : (
            <div className="space-y-3">
              {rooms.map(room => (
                <div key={room.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-800">{room.name}</h3>
                        <StatusBadge status={room.status} />
                      </div>
                      <div className="text-sm text-slate-500 mt-1">房间码 {room.id} · 1 筹码 = {room.chip_rate}</div>
                      {networkInfo?.url && (
                        <div className="text-xs text-slate-400 mt-1 break-all">{roomUrl(networkInfo.url, room.id)}</div>
                      )}
                    </div>
                    <Link to={`/room/${room.id}`}>
                      <Button variant="primary">进入</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
