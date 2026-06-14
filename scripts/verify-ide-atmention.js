// DECISIVE probe for PRD v13 (§5.1 / §5.2): does Claude Code's IDE WebSocket
// MCP protocol let us push an IMAGE file as an `at_mentioned` context that the
// model SEES on the very first turn (true vision), instead of treating the path
// as plain text and only later deciding to Read it?
//
// This is fully self-contained. It hand-rolls a minimal RFC6455 WebSocket
// server on Node built-ins (http + crypto) so it needs NO `ws` dependency, then:
//   1. generate a test PNG containing a random secret token (PowerShell/.NET
//      System.Drawing) so a correct answer is decisive proof of vision
//   2. start the WS server on 127.0.0.1:<randomPort>
//   3. write ~/.claude/ide/<port>.lock mirroring the REAL Windows format
//      observed on this machine: UUID authToken + runningInWindows:true
//   4. spawn interactive claude (node-pty) with env CLAUDE_CODE_SSE_PORT +
//      ENABLE_IDE_INTEGRATION=true, answer the trust prompt
//   5. answer the MCP handshake the CLI drives: initialize -> serverInfo/caps,
//      notifications/initialized, tools/list -> [] (WITHOUT this the at_mention
//      is silently dropped -- the gap PRD §3.6 understated)
//   6. broadcast `at_mentioned` { filePath:<abs png>, lineStart:null, lineEnd:null }
//   7. inject a PTY prompt asking ONLY for the code written in the image
//   8. read the transcript: did the assistant answer the secret token, and did
//      it do so via first-turn vision or by falling back to the Read tool?
//
// RESULT:
//   visionFirstTurn = token answered AND no Read tool_use preceded the answer
//   readFallback    = token answered but a Read tool_use appears
//   fail            = token never answered (path treated as plain text / "can't see")
//
// Usage:  node verify-ide-atmention.js [exe|cmd]
const pty = require('../node_modules/node-pty');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'cmd' ? 'cmd' : 'exe';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;
// MODE: 'img' (default) at-mentions a PNG; 'txt' at-mentions a .txt holding the
// secret -> a control to tell "at_mention channel dead" from "image link broken".
const MODE = process.argv[3] === 'txt' ? 'txt' : 'img';

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ide-atmention-'));

// A random secret token rendered into the image. Made of an uncommon word +
// digits so the model cannot guess it from training data; answering it is proof
// the pixels were actually seen.
const WORDS = ['WOMBAT', 'ZEPHYR', 'QUARTZ', 'NIMBUS', 'COBALT', 'FALCON'];
const SECRET = `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${Math.floor(1000 + Math.random() * 8999)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
const IMG = path.join(CWD, 'secret-card.png');
const TXT = path.join(CWD, 'secret-note.txt');
const TARGET = MODE === 'txt' ? TXT : IMG;

function generateText() {
  fs.writeFileSync(TXT, `The secret access code is: ${SECRET}\n`, 'utf8');
  console.log(`${stamp()} generated text ${TXT} secret="${SECRET}"`);
}

function generateImage() {
  // Use .NET System.Drawing via PowerShell to render the token onto a PNG.
  const ps = `Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(760,240)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Consolas',64,[System.Drawing.FontStyle]::Bold)
$g.DrawString('${SECRET}', $font, [System.Drawing.Brushes]::Black, 24, 80)
$bmp.Save('${IMG.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()`;
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  execFileSync('powershell', ['-NoProfile', '-EncodedCommand', encoded], { stdio: 'ignore' });
  const size = fs.statSync(IMG).size;
  console.log(`${stamp()} generated image ${IMG} (${size} bytes) secret="${SECRET}"`);
}

// ---- transcript helpers (same project-slug scheme as other probes) ----
function projectDir(cwd) { return path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-')); }
function allLines() {
  const dir = projectDir(CWD);
  const out = [];
  try {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
      let txt = '';
      try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
      for (const line of txt.split('\n')) {
        if (!line.trim()) continue;
        try { out.push({ file: f, obj: JSON.parse(line), raw: line }); } catch { /* partial */ }
      }
    }
  } catch { /* none yet */ }
  return out;
}
function transcriptSize() {
  const dir = projectDir(CWD);
  let total = 0;
  try { for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) { try { total += fs.statSync(path.join(dir, f)).size; } catch {} } } catch {}
  return total;
}

// =====================================================================
// Minimal RFC6455 WebSocket server (hand-rolled, no `ws` dependency)
// =====================================================================
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
let wsClient = null;          // the single connected socket
let rpcSeen = { initialize: false, initialized: false, toolsList: false };

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

// Encode an unmasked server->client text frame.
function encodeFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function sendJson(sock, obj) {
  if (!sock || sock.destroyed) return;
  sock.write(encodeFrame(JSON.stringify(obj)));
}

// Decode masked client->server frames out of a rolling buffer. Returns array of
// {opcode, payload} and leaves the remainder on the socket buffer.
function makeFrameParser(onMessage, onClose, onPing) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const b0 = buf[0];
      const opcode = b0 & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2); offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2)); offset = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + len) return; // wait for more
      let payload = Buffer.alloc(0);
      if (len > 0) {
        const maskKey = masked ? buf.slice(offset, offset + 4) : null;
        const data = buf.slice(offset + maskLen, offset + maskLen + len);
        payload = Buffer.from(data);
        if (masked) { for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4]; }
      }
      buf = buf.slice(offset + maskLen + len);
      if (opcode === 0x8) { onClose(); return; }
      else if (opcode === 0x9) { onPing(payload); }
      else if (opcode === 0x1 || opcode === 0x0) { onMessage(payload.toString('utf8')); }
    }
  };
}

function startServer(authToken) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => { res.writeHead(426); res.end('Upgrade Required'); });
    server.on('upgrade', (req, socket) => {
      const got = req.headers['x-claude-code-ide-authorization'];
      if (got !== authToken) {
        console.log(`${stamp()} WS upgrade REJECTED (bad/missing auth header: ${got})`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return;
      }
      const key = req.headers['sec-websocket-key'];
      const accept = wsAccept(key);
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
      wsClient = socket;
      console.log(`${stamp()} WS client CONNECTED + authenticated`);
      const parse = makeFrameParser(
        (msg) => handleRpc(socket, msg),
        () => { console.log(`${stamp()} WS client closed`); },
        (p) => { socket.write(Buffer.concat([Buffer.from([0x8a, p.length]), p])); } // pong
      );
      socket.on('data', parse);
      socket.on('error', () => {});
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`${stamp()} WS server listening on 127.0.0.1:${port}`);
      resolve(port);
    });
  });
}

// Answer the MCP lifecycle the CLI drives. Without initialize/tools/list
// responses the session never becomes usable and at_mentioned is dropped.
function handleRpc(sock, msg) {
  let rpc;
  try { rpc = JSON.parse(msg); } catch { console.log(`${stamp()} <- non-JSON: ${msg.slice(0, 120)}`); return; }
  const method = rpc.method;
  // Full inbound dump (truncated) so we can see exactly what the CLI asks for,
  // especially the reverse tools/call it fires after at_mentioned.
  console.log(`${stamp()} <- RAW ${msg.slice(0, 500)}`);
  if (method === 'initialize') {
    rpcSeen.initialize = true;
    sendJson(sock, {
      jsonrpc: '2.0', id: rpc.id,
      result: {
        protocolVersion: rpc.params?.protocolVersion || '2025-03-26',
        capabilities: { tools: { listChanged: true }, prompts: { listChanged: true }, logging: {} },
        serverInfo: { name: 'claude-code-chatui-probe', version: '0.0.1' }
      }
    });
  } else if (method === 'notifications/initialized') {
    rpcSeen.initialized = true;
  } else if (method === 'tools/list') {
    rpcSeen.toolsList = true;
    sendJson(sock, { jsonrpc: '2.0', id: rpc.id, result: { tools: [] } });
  } else if (method === 'prompts/list') {
    sendJson(sock, { jsonrpc: '2.0', id: rpc.id, result: { prompts: [] } });
  } else if (method === 'resources/list') {
    sendJson(sock, { jsonrpc: '2.0', id: rpc.id, result: { resources: [] } });
  } else if (method === 'tools/call' && rpc.id !== undefined) {
    const name = rpc.params?.name;
    const args = rpc.params?.arguments || {};
    console.log(`${stamp()}    tools/call name=${name} args=${JSON.stringify(args).slice(0, 200)}`);
    let result;
    if (name === 'getWorkspaceFolders') {
      result = { content: [{ type: 'text', text: JSON.stringify({ success: true, folders: [{ name: 'probe', uri: 'file:///' + CWD.replace(/\\/g, '/'), path: CWD }], rootPath: CWD }) }] };
    } else if (name === 'getOpenEditors') {
      result = { content: [{ type: 'text', text: JSON.stringify({ tabs: [] }) }] };
    } else if (name === 'getCurrentSelection' || name === 'getLatestSelection') {
      result = { content: [{ type: 'text', text: JSON.stringify({ success: false, message: 'No selection available' }) }] };
    } else if (name === 'getDiagnostics') {
      result = { content: [{ type: 'text', text: '[]' }] };
    } else {
      result = { content: [{ type: 'text', text: '{}' }] };
    }
    sendJson(sock, { jsonrpc: '2.0', id: rpc.id, result });
  } else if (rpc.id !== undefined && method) {
    sendJson(sock, { jsonrpc: '2.0', id: rpc.id, result: {} });
  }
}

function broadcastAtMention(filePath) {
  console.log(`${stamp()} -> at_mentioned filePath=${filePath}`);
  sendJson(wsClient, {
    jsonrpc: '2.0',
    method: 'at_mentioned',
    params: { filePath, lineStart: null, lineEnd: null }
  });
}

// =====================================================================
// Lock file (mirror the REAL Windows format observed on this machine)
// =====================================================================
let lockPath = null;
function writeLock(port, authToken) {
  const ideDir = path.join(os.homedir(), '.claude', 'ide');
  fs.mkdirSync(ideDir, { recursive: true });
  lockPath = path.join(ideDir, `${port}.lock`);
  const lock = {
    pid: process.pid,
    workspaceFolders: [CWD],
    ideName: 'ChatUI-Probe',
    transport: 'ws',
    runningInWindows: true,
    authToken
  };
  fs.writeFileSync(lockPath, JSON.stringify(lock), 'utf8');
  console.log(`${stamp()} wrote lock ${lockPath}`);
}
function cleanupLock() { try { if (lockPath) fs.unlinkSync(lockPath); } catch {} }

// =====================================================================
// PTY spawn + trust handling
// =====================================================================
let buffer = '';
let trustHandled = false;
let exited = false;
let lastDataAt = Date.now();
let ptyProc = null;

function spawnClaude(port, authToken) {
  const env = { ...process.env, CLAUDE_CODE_SSE_PORT: String(port), ENABLE_IDE_INTEGRATION: 'true' };
  const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];
  ptyProc = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: CWD, env, useConpty: false });
  ptyProc.onExit(() => { exited = true; });
  console.log(`${stamp()} spawned claude (${which}) pid=${ptyProc.pid} cwd=${CWD}`);
  ptyProc.onData((d) => {
    lastDataAt = Date.now();
    buffer = (buffer + d).slice(-16000);
    if (!trustHandled) {
      const c = compact(buffer);
      if (c.includes('yesitrustthisfolder') && c.includes('noexit')) { trustHandled = true; ptyProc.write('\r'); }
      else if (c.includes('yesiaccept') && c.includes('noexit')) { trustHandled = true; ptyProc.write('\x1b[B'); setTimeout(() => ptyProc.write('\r'), 200); }
    }
  });
}

function injectPrompt(text) {
  ptyProc.write(`\x1b[200~${text}\x1b[201~`);
  return sleep(250).then(() => ptyProc.write('\r'));
}

async function waitForConnect(budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (wsClient) return true;
    await sleep(200);
  }
  return false;
}

async function waitForHandshake(budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (rpcSeen.initialize) return true;
    await sleep(200);
  }
  return false;
}

async function waitQuiescent(quietMs, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let last = transcriptSize();
  let lastChange = Date.now();
  while (Date.now() < deadline) {
    await sleep(400);
    const now = transcriptSize();
    if (now !== last) { last = now; lastChange = Date.now(); }
    else if (Date.now() - lastChange >= quietMs) return true;
  }
  return false;
}

// =====================================================================
// Analysis: did the assistant SEE the image on the first turn?
// =====================================================================
function analyze() {
  const lines = allLines();
  let answered = false;
  let readBeforeAnswer = false;
  let sawRead = false;
  const transcript = [];
  for (const { obj } of lines) {
    if (obj.type === 'assistant') {
      const content = obj?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type === 'tool_use') {
          sawRead = sawRead || /read|view|image/i.test(block.name || '');
          transcript.push(`[tool_use ${block.name}] ${JSON.stringify(block.input || {}).slice(0, 120)}`);
        } else if (block.type === 'text') {
          transcript.push(`[text] ${(block.text || '').slice(0, 200)}`);
          if ((block.text || '').toUpperCase().includes(SECRET.toUpperCase())) {
            answered = true;
            if (sawRead) readBeforeAnswer = true;
          }
        }
      }
    } else if (obj.type === 'user') {
      const content = obj?.message?.content;
      if (typeof content === 'string') transcript.push(`[user] ${content.slice(0, 120)}`);
      else if (Array.isArray(content)) {
        for (const b of content) {
          if (b.type === 'tool_result') transcript.push(`[tool_result] ${JSON.stringify(b.content || '').slice(0, 100)}`);
          else if (b.type === 'text') transcript.push(`[user] ${(b.text || '').slice(0, 120)}`);
        }
      }
    }
  }
  return { answered, readBeforeAnswer, sawRead, transcript };
}

// =====================================================================
// Main
// =====================================================================
(async () => {
  const authToken = crypto.randomUUID();
  if (MODE === 'txt') generateText(); else generateImage();
  console.log(`${stamp()} MODE=${MODE} target=${TARGET}`);
  const port = await startServer(authToken);
  writeLock(port, authToken);
  spawnClaude(port, authToken);

  const connected = await waitForConnect(40000);
  console.log(`${stamp()} CLI connected to WS: ${connected}`);
  if (!connected) {
    console.log(`${stamp()} === RESULT: CLI never connected. IDE integration not engaged (check env/lock/version). ===`);
    finish(2);
    return;
  }

  const handshook = await waitForHandshake(15000);
  console.log(`${stamp()} MCP handshake (initialize seen): ${handshook}  rpcSeen=${JSON.stringify(rpcSeen)}`);
  await sleep(1500); // let initialized / tools/list settle

  // Push the image as explicit context. Then OBSERVE the TUI input box: does the
  // CLI surface the at-mention (e.g. inserts "@secret-card.png" or an image
  // chip)? Dump the rendered screen so we can see what at_mentioned actually did.
  const screenBefore = stripAnsi(buffer).slice(-800);
  broadcastAtMention(TARGET);
  for (let i = 0; i < 5; i++) {
    await sleep(1000);
    const screen = stripAnsi(buffer).slice(-800);
    console.log(`${stamp()} --- TUI screen tail @${i + 1}s after at_mention ---`);
    console.log(screen.split('\n').map((l) => '      | ' + l).join('\n'));
  }
  const screenChanged = stripAnsi(buffer).slice(-800) !== screenBefore;
  const mentionVisible = /secret-card|secret-note|@.*\.(png|txt)|image/i.test(stripAnsi(buffer));
  console.log(`${stamp()} screenChangedAfterAtMention=${screenChanged} mentionVisibleInTui=${mentionVisible}`);

  const ask = MODE === 'txt'
    ? `What is the exact secret access code in the file I shared with you as context? Reply with ONLY that code, nothing else.`
    : `What is the exact code/text printed in the image I shared with you as context? Reply with ONLY that code, nothing else.`;
  await injectPrompt(ask);

  console.log(`${stamp()} waiting for the answer turn...`);
  // Wait until an assistant block actually lands (avoid first-token race), then settle.
  {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (allLines().some(({ obj }) => obj.type === 'assistant')) break;
      await sleep(500);
    }
  }
  await waitQuiescent(4000, 60000);

  const r = analyze();
  console.log(`${stamp()} ===== TRANSCRIPT (${r.transcript.length} blocks) =====`);
  for (const t of r.transcript) console.log(`${stamp()}   ${t.replace(/\n/g, ' ')}`);

  const visionFirstTurn = r.answered && !r.readBeforeAnswer && !r.sawRead;
  const readFallback = r.answered && r.sawRead;
  console.log(`${stamp()} ===== RESULT =====`);
  console.log(`${stamp()}   secret           = ${SECRET}`);
  console.log(`${stamp()}   connected        = ${connected}`);
  console.log(`${stamp()}   handshake        = ${handshook} (${JSON.stringify(rpcSeen)})`);
  console.log(`${stamp()}   answeredToken    = ${r.answered}`);
  console.log(`${stamp()}   usedReadTool     = ${r.sawRead}`);
  console.log(`${stamp()}   VISION_FIRSTTURN = ${visionFirstTurn}`);
  console.log(`${stamp()}   READ_FALLBACK    = ${readFallback}`);
  console.log(`${stamp()}   transcript preserved at: ${projectDir(CWD)}`);
  console.log(`${stamp()}   image preserved at:      ${IMG}`);
  finish(r.answered ? 0 : 1);
})();

function finish(code) {
  try { if (ptyProc) ptyProc.kill(); } catch {}
  cleanupLock();
  setTimeout(() => process.exit(code), 600);
}

process.on('SIGINT', () => finish(130));
