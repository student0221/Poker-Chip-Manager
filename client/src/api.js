const API_BASE = '';

// 获取或生成设备唯一标识
export function getDeviceId() {
  let did = localStorage.getItem('poker_device_id');
  if (!did) {
    did = 'd_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('poker_device_id', did);
  }
  return did;
}

async function parseJsonResponse(res) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || data?.message || 'Request failed');
  }
  return data;
}

export async function getStatus() {
  const res = await fetch(`${API_BASE}/api/status`);
  return res.json();
}

export async function getNetworkInfo() {
  const res = await fetch(`${API_BASE}/api/network-info`);
  return parseJsonResponse(res);
}

export async function getRooms() {
  const res = await fetch(`${API_BASE}/api/rooms`);
  return parseJsonResponse(res);
}

export async function getRoom(roomId) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}`);
  return parseJsonResponse(res);
}

export async function createRoom(data) {
  const res = await fetch(`${API_BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, device_id: getDeviceId() })
  });
  return parseJsonResponse(res);
}

export async function getRoomStatus(roomId) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/status`);
  return parseJsonResponse(res);
}

export async function getRoomPlayers(roomId) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/players`);
  return parseJsonResponse(res);
}

export async function startRoom(roomId) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: getDeviceId() })
  });
  return parseJsonResponse(res);
}

export async function endRoom(roomId) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: getDeviceId() })
  });
  return parseJsonResponse(res);
}

export async function settleRoom(roomId) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: getDeviceId() })
  });
  return parseJsonResponse(res);
}

export async function resetRoom(roomId) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: getDeviceId() })
  });
  return parseJsonResponse(res);
}

export async function joinRoom(roomId, data) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/players/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, device_id: getDeviceId() })
  });
  return parseJsonResponse(res);
}

export async function adminAddRoomPlayer(roomId, data) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/players/admin-add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, device_id: getDeviceId() })
  });
  return parseJsonResponse(res);
}

export async function addRoomChips(roomId, playerId, amount) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/players/${playerId}/add-chips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, device_id: getDeviceId() })
  });
  return parseJsonResponse(res);
}

export async function submitRoomFinal(roomId, data) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/submit-final`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, device_id: getDeviceId() })
  });
  return parseJsonResponse(res);
}

export async function getRoomSettleProgress(roomId) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/settle/progress`);
  return parseJsonResponse(res);
}

export async function getRoomRankings(roomId) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/rankings`);
  return parseJsonResponse(res);
}

export async function submitPlayer(data) {
  let body;
  let headers = {};
  if (data.avatarFile) {
    const formData = new FormData();
    formData.append('name', data.name || data.nickname);
    formData.append('nickname', data.nickname);
    formData.append('initial_chips', data.initial_chips);
    formData.append('device_id', getDeviceId());
    formData.append('avatar', data.avatarFile);
    body = formData;
  } else {
    headers = { 'Content-Type': 'application/json' };
    body = JSON.stringify({ ...data, device_id: getDeviceId() });
  }
  const res = await fetch(`${API_BASE}/api/players/join`, {
    method: 'POST',
    headers,
    body
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminAddPlayer(data) {
  let body;
  let headers = {};
  if (data.avatarFile) {
    const formData = new FormData();
    formData.append('name', data.name || data.nickname);
    formData.append('nickname', data.nickname);
    formData.append('initial_chips', data.initial_chips);
    formData.append('avatar', data.avatarFile);
    body = formData;
  } else {
    headers = { 'Content-Type': 'application/json' };
    body = JSON.stringify(data);
  }
  const res = await fetch(`${API_BASE}/api/players/admin-add`, {
    method: 'POST',
    headers,
    body
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function submitFinal(data) {
  const res = await fetch(`${API_BASE}/api/submit-final`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, device_id: getDeviceId() })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function leavePlayer(id, final_chips) {
  const res = await fetch(`${API_BASE}/api/players/${id}/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ final_chips, device_id: getDeviceId() })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPlayers() {
  const res = await fetch(`${API_BASE}/api/players`);
  return res.json();
}

export async function getSettleProgress() {
  const res = await fetch(`${API_BASE}/api/settle/progress`);
  return res.json();
}

export async function deletePlayer(id) {
  const res = await fetch(`${API_BASE}/api/players/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function resetGame() {
  const res = await fetch(`${API_BASE}/api/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'RESET_ALL_PLAYERS' })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRankings() {
  const res = await fetch(`${API_BASE}/api/rankings`);
  return res.json();
}
