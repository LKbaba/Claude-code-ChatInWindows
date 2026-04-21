// Compare how Grok-mcp vs Gemini-mcp handle the `notifications/initialized`
// JSON-RPC notification. Per MCP spec, this is a notification (no id) and
// servers MUST NOT respond. Violating this may cause Claude CLI to mis-classify
// the session state.

import { spawn } from 'node:child_process';

const SERVERS = [
  {
    name: 'Grok-mcp',
    script: 'E:/Github/Grok-mcp/dist/index.js',
    env: {
      // Grok needs an API key to start; read from secrets service or use a dummy
      // (we only test handshake, not real API calls)
      XAI_API_KEY: process.env.XAI_API_KEY || 'xai-dummy-for-handshake-only',
    },
  },
  {
    name: 'Gemini-mcp',
    script: 'E:/Github/Gemini-mcp/dist/server.js',
    env: {
      GOOGLE_GENAI_USE_VERTEXAI: 'true',
      GOOGLE_CLOUD_PROJECT: 'lk-sandbox-2026',
    },
  },
];

async function probeServer({ name, script, env }) {
  console.log(`\n========== Testing ${name} ==========`);
  console.log(`[probe] spawning: node ${script}`);

  const proc = spawn('node', [script], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdoutMessages = [];
  const stderrLines = [];
  let buf = '';

  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        stdoutMessages.push(JSON.parse(line));
      } catch {
        stdoutMessages.push({ __raw: line });
      }
    }
  });

  proc.stderr.on('data', (chunk) => {
    stderrLines.push(chunk.toString('utf8'));
  });

  const send = (obj) => proc.stdin.write(JSON.stringify(obj) + '\n');

  // 1. initialize (a proper request, expects response)
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'initialized-probe', version: '1.0.0' },
    },
  });

  // Wait for initialize response
  await new Promise((r) => setTimeout(r, 1500));

  // 2. notifications/initialized — THE critical test.
  // No id field → this is a notification, server MUST NOT respond.
  console.log('[probe] sending notifications/initialized (no id field)');
  send({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  });

  // Wait to see if server violates spec and responds
  await new Promise((r) => setTimeout(r, 1000));

  // 3. tools/list — verify server still works after the notification
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  await new Promise((r) => setTimeout(r, 1500));

  // Shutdown
  proc.stdin.end();
  await new Promise((r) => setTimeout(r, 300));
  try { proc.kill(); } catch {}

  // Analyze
  console.log(`\n--- ${name} stdout messages (${stdoutMessages.length} total) ---`);
  stdoutMessages.forEach((m, i) => {
    const summary = JSON.stringify(m).slice(0, 200);
    console.log(`  [${i}] ${summary}`);
  });

  const notifResponse = stdoutMessages.find(
    (m) => m.error?.message?.includes('notifications/initialized') ||
           m.error?.message?.includes('Method not found') && stdoutMessages.indexOf(m) === 1
  );

  const violatesSpec = stdoutMessages.some(
    (m) => m.error && m.error.code === -32601 &&
           (m.error.message || '').toLowerCase().includes('notifications/initialized')
  );

  console.log(`\n--- ${name} VERDICT ---`);
  if (violatesSpec) {
    console.log(`  ❌ SPEC VIOLATION: responded to notifications/initialized with error ${JSON.stringify(notifResponse)}`);
  } else {
    console.log(`  ✅ Correctly silent on notifications/initialized`);
  }

  return { name, stdoutMessages, stderrLines, violatesSpec };
}

for (const server of SERVERS) {
  try {
    await probeServer(server);
  } catch (e) {
    console.error(`[probe] ${server.name} failed:`, e.message);
  }
}

console.log('\n========== Done ==========');
