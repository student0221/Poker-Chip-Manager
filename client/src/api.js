const API_BASE = '';

export async function getStatus() {
  const res = await fetch(`${API_BASE}/api/status`);
  return res.json();
}

export async function submitPlayer(data) {
  const res = await fetch(`${API_BASE}/api/players`, {
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
    body: JSON.stringify(data)
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
  await fetch(`${API_BASE}/api/players/${id}`, { method: 'DELETE' });
}

export async function getRankings() {
  const res = await fetch(`${API_BASE}/api/rankings`);
  return res.json();
}
