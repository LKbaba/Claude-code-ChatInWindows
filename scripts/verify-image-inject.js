// FOCUSED probe: what PTY injection makes interactive Claude (the version the
// maintainer actually daily-drives, npm claude.cmd 2.1.85) SEE an image on the
// FIRST turn -- i.e. answer a secret rendered into the PNG -- WITHOUT the wasted
// "I don't see an image" round, and WITHOUT any IDE WebSocket / at_mentioned.
//
// Premise (from CLAUDE.md + Read-tool docs): the OFFICIAL image-vision channel
// is the Read tool, which renders PNG/JPG visually. So vision already works; the
// only defect is the UX where turn 1 says "I can't see it" and turn 2 Reads it.
// Hypothesis: a prompt that explicitly tells Claude to Read the absolute path
// collapses this to a single Read -> answer, version-independently.
//
// We A/B three injection strategies and, for each, measure:
//   answered        : did the assistant emit the secret token?
//   readCalls       : how many Read tool_use calls preceded the answer
//   deniedFirst     : did it first claim it couldn't see / asked for the image?
//   ONE_SHOT_VISION : answered with exactly one Read and no denial
//
// Usage:  node verify-image-inject.js [exe|cmd] [strategyIndex|all]
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'exe' ? 'exe' : 'cmd'; // default to the daily-driver 2.1.85
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function projectDir(cwd) { return path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-')); }
function transcriptSize(cwd) {
  const dir = projectDir(cwd);
  let total = 0;
  try { for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) { try { total += fs.statSync(path.join(dir, f)).size; } catch {} } } catch {}
  return total;
}
function allLines(cwd) {
  const dir = projectDir(cwd);
  const out = [];
  try {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
      let txt = '';
      try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
      for (const line of txt.split('\n')) { if (line.trim()) { try { out.push(JSON.parse(line)); } catch {} } }
    }
  } catch {}
  return out;
}

const WORDS = ['WOMBAT', 'ZEPHYR', 'QUARTZ', 'NIMBUS', 'COBALT', 'FALCON'];
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
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  execFileSync('powershell', ['-NoProfile', '-EncodedCommand', encoded], { stdio: 'ignore' });
}

// The strategies under test. {label, build(absPath)->promptText}
const STRATEGIES = [
  { label: 'bare-path', build: (p) => p },
  { label: 'at-path', build: (p) => `@${p}` },
  { label: 'explicit-read', build: (p) => `Read the image file at ${p} using the Read tool, then tell me ONLY the exact code/text printed in it.` },
  // The REALISTIC plugin case: bare abs path embedded mid-sentence (what
  // _expandFileMentions currently produces from "@relative.png").
  { label: 'path-in-sentence', build: (p) => `Look at this image ${p} and tell me ONLY the exact code/text printed in it.` },
  // path-in-sentence but trailing-space after path (UI appends a space).
  { label: 'path-trailing-sp', build: (p) => `What code is in ${p} ?` },
  // Does giving the path its OWN line (with text around it) still trigger the
  // TUI's native 0-Read image attach? These decide the product layout:
  // whether to emit the expanded image path on a standalone line.
  { label: 'path-own-line-first', build: (p) => `${p}\nWhat code is printed in this image? Reply ONLY the code.` },
  { label: 'path-own-line-last', build: (p) => `What code is printed in this image? Reply ONLY the code.\n${p}` },
];

function spawnClaude(cwd) {
  const env = { ...process.env };
  const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];
  const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd, env, useConpty: false });
  return p;
}

function analyze(cwd, secret) {
  const lines = allLines(cwd);
  let answered = false, readCalls = 0, deniedFirst = false, answeredAfterReads = 0;
  let seenAnyText = false;
  for (const obj of lines) {
    if (obj.type !== 'assistant') continue;
    const content = obj?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_use') {
        if (/read|view|image/i.test(block.name || '')) readCalls++;
      } else if (block.type === 'text') {
        const txt = block.text || '';
        if (!seenAnyText && /can'?t see|cannot see|don'?t see|do not see|no image|didn'?t (?:receive|get)|unable to see|provide the image|share the image|attach/i.test(txt)) {
          deniedFirst = true;
        }
        seenAnyText = true;
        if (txt.toUpperCase().includes(secret.toUpperCase())) {
          answered = true;
          answeredAfterReads = readCalls;
        }
      }
    }
  }
  return { answered, readCalls, deniedFirst, answeredAfterReads };
}

async function runStrategy(strat) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-imginj-'));
  const secret = newSecret();
  const img = path.join(cwd, 'secret-card.png');
  generateImage(img, secret);
  console.log(`\n${stamp()} ===== STRATEGY '${strat.label}'  secret=${secret}  cwd=${cwd} =====`);

  let buffer = '';
  let trustHandled = false;
  const p = spawnClaude(cwd);
  p.onData((d) => {
    buffer = (buffer + d).slice(-16000);
    if (!trustHandled) {
      const c = compact(buffer);
      if (c.includes('yesitrustthisfolder') && c.includes('noexit')) { trustHandled = true; p.write('\r'); }
      else if (c.includes('yesiaccept') && c.includes('noexit')) { trustHandled = true; p.write('\x1b[B'); setTimeout(() => p.write('\r'), 200); }
    }
  });

  // wait for the prompt box to be ready
  {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (trustHandled && /[>│].*$/.test(stripAnsi(buffer).slice(-200))) break;
      await sleep(400);
    }
  }
  await sleep(1500);

  const prompt = strat.build(img);
  console.log(`${stamp()} inject: ${prompt.slice(0, 140)}`);
  p.write(`\x1b[200~${prompt}\x1b[201~`);
  await sleep(300);
  p.write('\r');

  // wait for first assistant block, then settle
  {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (allLines(cwd).some((o) => o.type === 'assistant')) break;
      await sleep(500);
    }
  }
  // settle until transcript stops growing for 4s
  {
    let last = transcriptSize(cwd), lastChange = Date.now();
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      await sleep(400);
      const now = transcriptSize(cwd);
      if (now !== last) { last = now; lastChange = Date.now(); }
      else if (Date.now() - lastChange >= 4000) break;
    }
  }

  const r = analyze(cwd, secret);
  try { p.kill(); } catch {}
  const oneShot = r.answered && r.answeredAfterReads <= 1 && !r.deniedFirst;
  console.log(`${stamp()} RESULT '${strat.label}': answered=${r.answered} readCalls=${r.readCalls} answeredAfterReads=${r.answeredAfterReads} deniedFirst=${r.deniedFirst} => ONE_SHOT_VISION=${oneShot}`);
  return { label: strat.label, ...r, oneShot };
}

(async () => {
  console.log(`${stamp()} claude=${which} file=${FILE}`);
  const sel = process.argv[3];
  let toRun = STRATEGIES;
  if (sel && sel !== 'all') {
    const idx = parseInt(sel, 10);
    if (!Number.isNaN(idx) && STRATEGIES[idx]) toRun = [STRATEGIES[idx]];
  }
  const results = [];
  for (const s of toRun) results.push(await runStrategy(s));
  console.log(`\n${stamp()} ================ SUMMARY (${which}) ================`);
  for (const r of results) {
    console.log(`${stamp()}  ${r.label.padEnd(14)} answered=${r.answered} reads=${r.readCalls} denied1st=${r.deniedFirst} ONE_SHOT=${r.oneShot}`);
  }
  process.exit(0);
})();
