// EDGE-CASE staged injection probe. Builds on verify-image-staged.js (proven
// flow: paste bare path -> [Image #N] chip -> paste text -> single Enter).
//
// This probe stresses the two real-world cases the plugin must survive:
//   1. paths that contain CJK characters and spaces (a Windows user's
//      "图片 文件夹" inside a workspace), and
//   2. MULTIPLE images in one message (chip must increment #1 -> #2, and the
//      final user message must carry N separate image blocks).
//
// Each image renders its OWN random secret, so a correct answer that names
// BOTH secrets proves the model saw both attachments on the first turn.
//
// Usage:  node verify-image-staged-edge.js [exe|cmd] [count]
//   exe -> WinGet claude.exe (2.1.119) | cmd -> npm claude.cmd (2.1.85, default)
//   count -> number of images to attach (default 2)
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'exe' ? 'exe' : 'cmd';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;
const COUNT = Math.max(1, parseInt(process.argv[3] || '2', 10));

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function projectDir(cwd) { return path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-')); }
function transcriptSize(cwd) {
  const dir = projectDir(cwd); let total = 0;
  try { for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) { try { total += fs.statSync(path.join(dir, f)).size; } catch {} } } catch {}
  return total;
}
function allLines(cwd) {
  const dir = projectDir(cwd); const out = [];
  try { for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) { if (line.trim()) { try { out.push(JSON.parse(line)); } catch {} } }
  } } catch {}
  return out;
}

const WORDS = ['WOMBAT', 'ZEPHYR', 'QUARTZ', 'NIMBUS', 'COBALT', 'FALCON', 'JASPER', 'ONYX'];
function newSecret() {
  return `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${Math.floor(1000 + Math.random() * 8999)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
}
function generateImage(imgPath, secret) {
  const ps = `Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(760,240)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Consolas',64,[System.Drawing.FontStyle]::Bold)
$g.DrawString('${secret}', $font, [System.Drawing.Brushes]::Black, 24, 80)
$bmp.Save('${imgPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { stdio: 'ignore' });
}

// Workspace lives under a CJK + space directory to exercise non-ASCII paths.
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-edge-'));
const IMG_DIR = path.join(cwd, '图片 文件夹');
fs.mkdirSync(IMG_DIR, { recursive: true });
const SECRETS = [];
const IMGS = [];
for (let i = 0; i < COUNT; i++) {
  const s = newSecret();
  // Filenames also carry CJK + spaces.
  const p = path.join(IMG_DIR, `密码卡片 ${i + 1}.png`);
  generateImage(p, s);
  SECRETS.push(s); IMGS.push(p);
}

let buffer = '';
let trustHandled = false;
let ptyProc = null;
function spawnClaude() {
  const env = { ...process.env };
  const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];
  ptyProc = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd, env, useConpty: false });
  ptyProc.onData((d) => {
    buffer = (buffer + d).slice(-30000);
    if (!trustHandled) {
      const c = compact(buffer);
      if (c.includes('yesitrustthisfolder') && c.includes('noexit')) { trustHandled = true; ptyProc.write('\r'); }
      else if (c.includes('yesiaccept') && c.includes('noexit')) { trustHandled = true; ptyProc.write('\x1b[B'); setTimeout(() => ptyProc.write('\r'), 200); }
    }
  });
}
const bpaste = (text) => ptyProc.write(`\x1b[200~${text}\x1b[201~`);
const screen = () => stripAnsi(buffer).slice(-900);
function dumpScreen(tag) {
  console.log(`${stamp()} --- input box ${tag} ---`);
  console.log(screen().split('\n').map((l) => '      | ' + l).join('\n'));
}
// Detect that at least N image chips are present: TUI prints "[Image #1]" etc.
function chipCount() {
  const s = stripAnsi(buffer);
  const m = s.match(/image\s*#?\s*\d+/gi) || [];
  // de-dupe by trailing number
  const nums = new Set(m.map((x) => (x.match(/\d+/) || ['0'])[0]));
  return nums.size;
}

function analyze() {
  const lines = allLines(cwd);
  let readCalls = 0, userImageBlocks = 0, userText = '', deniedFirst = false, seenText = false;
  const found = new Set();
  for (const obj of lines) {
    if (obj.type === 'user') {
      const c = obj?.message?.content;
      if (Array.isArray(c)) for (const b of c) { if (b.type === 'image') userImageBlocks++; if (b.type === 'text') userText += b.text; }
      else if (typeof c === 'string') userText += c;
    } else if (obj.type === 'assistant') {
      const c = obj?.message?.content; if (!Array.isArray(c)) continue;
      for (const b of c) {
        if (b.type === 'tool_use' && /read|view|image/i.test(b.name || '')) readCalls++;
        if (b.type === 'text') {
          if (!seenText && /can'?t see|cannot see|don'?t see|no image|provide the image|share the image/i.test(b.text || '')) deniedFirst = true;
          seenText = true;
          const up = (b.text || '').toUpperCase();
          for (const s of SECRETS) if (up.includes(s.toUpperCase())) found.add(s);
        }
      }
    }
  }
  return { readCalls, userImageBlocks, userText: userText.slice(0, 160), deniedFirst, foundCount: found.size };
}

(async () => {
  console.log(`${stamp()} which=${which} count=${COUNT} cwd=${cwd}`);
  for (let i = 0; i < COUNT; i++) console.log(`${stamp()}   img[${i + 1}] secret=${SECRETS[i]} path=${IMGS[i]}`);
  spawnClaude();

  // wait for prompt ready
  { const dl = Date.now() + 30000; while (Date.now() < dl) { if (trustHandled && /[>│].*/.test(screen())) break; await sleep(400); } }
  await sleep(1500);
  dumpScreen('before any input');

  // STAGED multi-image: paste each bare path alone, wait for its chip, then text.
  for (let i = 0; i < COUNT; i++) {
    bpaste(IMGS[i]);
    await sleep(2500);
    const c = chipCount();
    console.log(`${stamp()} after path[${i + 1}] paste -> chipCount=${c} (want >=${i + 1})`);
    dumpScreen(`after path[${i + 1}] paste`);
    ptyProc.write(' ');
    await sleep(250);
  }

  const ask = COUNT > 1
    ? `These ${COUNT} images each show a secret code.\nList EVERY code you can read, one per line, nothing else.`
    : 'Reply ONLY with the exact code/text printed in this image, nothing else.';
  bpaste(ask);
  await sleep(800);
  dumpScreen('after text paste (NO enter)');
  ptyProc.write('\r');

  // wait for assistant + settle
  { const dl = Date.now() + 90000; while (Date.now() < dl) { if (allLines(cwd).some((o) => o.type === 'assistant')) break; await sleep(500); } }
  { let last = transcriptSize(cwd), lc = Date.now(); const dl = Date.now() + 60000;
    while (Date.now() < dl) { await sleep(400); const n = transcriptSize(cwd); if (n !== last) { last = n; lc = Date.now(); } else if (Date.now() - lc >= 4000) break; } }

  const r = analyze();
  try { ptyProc.kill(); } catch {}
  console.log(`${stamp()} ===== RESULT (which=${which} count=${COUNT}) =====`);
  console.log(`${stamp()}   secrets         = ${SECRETS.join(', ')}`);
  console.log(`${stamp()}   userImageBlocks = ${r.userImageBlocks}   <- want ${COUNT}`);
  console.log(`${stamp()}   foundCount      = ${r.foundCount}   <- want ${COUNT}`);
  console.log(`${stamp()}   userText        = ${JSON.stringify(r.userText)}`);
  console.log(`${stamp()}   readCalls       = ${r.readCalls}`);
  console.log(`${stamp()}   deniedFirst     = ${r.deniedFirst}`);
  console.log(`${stamp()}   ZERO_READ_ALL   = ${r.foundCount === COUNT && r.userImageBlocks === COUNT && r.readCalls === 0}`);
  process.exit(0);
})();
