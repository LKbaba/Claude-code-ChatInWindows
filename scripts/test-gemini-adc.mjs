// Standalone test: spawns Gemini-mcp with ADC env and performs a full
// MCP handshake + a real tools/call to prove whether ADC auth actually works.
// Bypasses all MCP registries (Claude CLI / plugin) to isolate the auth chain.

import { spawn } from 'node:child_process';

const SERVER = 'E:/Github/Gemini-mcp/dist/server.js';

const env = {
  ...process.env, // keep APPDATA, HOME, PATH so google-auth can locate ADC
  GOOGLE_GENAI_USE_VERTEXAI: 'true',
  GOOGLE_CLOUD_PROJECT: 'lk-sandbox-2026',
};

// Strip any leftover key that would confuse @google/genai SDK
delete env.GEMINI_API_KEY;
delete env.GOOGLE_API_KEY;

console.log('[test] spawning node', SERVER);
console.log('[test] env snapshot:', {
  GOOGLE_GENAI_USE_VERTEXAI: env.GOOGLE_GENAI_USE_VERTEXAI,
  GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT,
  GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS || '(not set)',
  APPDATA: env.APPDATA,
  HTTPS_PROXY: env.HTTPS_PROXY || env.https_proxy || '(none)',
});

const proc = spawn('node', [SERVER], {
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
const pending = new Map(); // id -> resolve

proc.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      console.log('[stdout] <-', JSON.stringify(msg).slice(0, 400));
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      console.log('[stdout] (non-JSON)', line);
    }
  }
});

proc.stderr.on('data', (chunk) => {
  process.stderr.write('[stderr] ' + chunk.toString('utf8'));
});

proc.on('exit', (code, sig) => {
  console.log(`[test] server exited code=${code} signal=${sig}`);
});

function send(obj) {
  const line = JSON.stringify(obj) + '\n';
  console.log('[stdin] ->', JSON.stringify(obj).slice(0, 200));
  proc.stdin.write(line);
}

function request(method, params) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 30000);
  });
}

function notify(method, params) {
  send({ jsonrpc: '2.0', method, params });
}

async function main() {
  // Step 1: initialize handshake
  const init = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'adc-test-client', version: '1.0.0' },
  });
  console.log('[test] initialize OK, serverInfo:', init.result?.serverInfo);

  notify('notifications/initialized', {});

  // Step 2: list tools (this part already works in production — baseline check)
  const list = await request('tools/list', {});
  console.log('[test] tools/list OK, tool count:', list.result?.tools?.length);

  // Step 3: the real test — actually invoke a tool that hits Vertex AI
  console.log('\n[test] === calling gemini_search (this is where ADC auth fires) ===');
  const call = await request('tools/call', {
    name: 'gemini_search',
    arguments: {
      query: 'What is 2+2?',
      thinkingLevel: 'low',
      model: 'gemini-3-flash-preview', // Explicitly use Gemini 3 Flash
    },
  });
  console.log('[test] tools/call result:');
  console.log(JSON.stringify(call, null, 2));

  proc.stdin.end();
}

main().catch((err) => {
  console.error('[test] FAILED:', err.message);
  proc.kill();
  process.exit(1);
});
