const { spawn } = require('child_process');

const PORT = Number(process.env.LAN_SMOKE_PORT || 3104);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error || data?.message || response.statusText;
    throw new Error(`${response.status} ${message} (${url})`);
  }
  return data;
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      return await requestJson(`${BASE_URL}/api/status`);
    } catch (error) {
      await delay(250);
    }
  }
  throw new Error(`Server did not become ready at ${BASE_URL}`);
}

function apiUrlFromHashUrl(hashUrl, path) {
  return hashUrl.replace(/\/#\/?$/, path);
}

async function main() {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TEST_DB: process.env.LAN_SMOKE_REAL_DB ? process.env.TEST_DB : '1',
      PORT: String(PORT)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();

    const network = await requestJson(`${BASE_URL}/api/network-info`);
    if (!network.url || !network.url.includes(`:${PORT}/#/`)) {
      throw new Error(`Unexpected network URL: ${network.url}`);
    }

    const lanStatus = await requestJson(apiUrlFromHashUrl(network.url, '/api/status'));
    const room = await requestJson(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'LAN Smoke Table',
        chip_rate: 1,
        device_id: 'lan-smoke-host'
      })
    });
    const started = await requestJson(`${BASE_URL}/api/rooms/${room.id}/start`, {
      method: 'POST',
      body: JSON.stringify({ device_id: 'lan-smoke-host' })
    });

    console.log(JSON.stringify({
      ok: true,
      networkUrl: network.url,
      lanStatus: lanStatus.status,
      roomId: room.id,
      roomStatus: started.status
    }, null, 2));
  } finally {
    child.kill();
    await new Promise(resolve => {
      child.once('exit', resolve);
      setTimeout(resolve, 1000);
    });
  }

  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  if (process.env.LAN_SMOKE_DEBUG && stdout.trim()) {
    console.log(stdout.trim());
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
