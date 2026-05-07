const API_BASE = '';

// 获取或生成设备唯一标识
function getDeviceId() {
  let did = localStorage.getItem('poker_device_id');
  if (!did) {
    did = 'd_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('poker_device_id', did);
  }
  return did;
}

export async function getStatus() {
  const res = await fetch(`${API_BASE}/api/status`);
  return res.json();
}

export async function submitPlayer(data) {
  const res = await fetch(`${API_BASE}/api/players/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, device_id: getDeviceId() })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminAddPlayer(data) {
  const res = await fetch(`${API_BASE}/api/players/admin-add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
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
