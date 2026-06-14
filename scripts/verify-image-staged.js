// STAGED injection probe: can we reproduce the official TUI behaviour where an
// image and free text live in ONE user message as [image block + text block]?
//
// Why: single-line "path + text" works but goes through Read (1 turn). Pure bare
// path gets a true 0-Read multimodal attach but then there is no room for the
// user's own (often multi-line) request -- and ANY newline in a bracketed paste
// makes the TUI swallow the path line, losing the image entirely. The official
// TUI solves this by turning a pasted image PATH into an attachment "chip" while
// you keep typing, so the final submit carries image+text together.
//
// This probe drives the TUI in stages WITHOUT submitting between them:
//   1. bracketed-paste the bare ABSOLUTE image path   (NO Enter)
//   2. observe the input box -> did a chip / "[Image #N]" placeholder appear?
//   3. bracketed-paste the user's text request         (NO Enter)
//   4. press Enter ONCE to submit the combined message
//   5. read transcript: is the user message [image + text], answered 0-Read?
//
// Usage:  node verify-image-staged.js [exe|cmd] [variant]
//   variant: 'paste' (default) bracketed-paste path | 'type' raw-type path |
//            'path-enter-text' submit path first, then text (2 turns control)
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'exe' ? 'exe' : 'cmd';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;
const VARIANT = process.argv[3] || 'paste';

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

const WORDS = ['WOMBAT', 'ZEPHYR', 'QUARTZ', 'NIMBUS', 'COBALT', 'FALCON'];
const SECRET = `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${Math.floor(1000 + Math.random() * 8999)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
function generateImage(imgPath) {
  const ps = `Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(760,240)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Consolas',64,[System.Drawing.FontStyle]::Bold)
$g.DrawString('${SECRET}', $font, [System.Drawing.Brushes]::Black, 24, 80)
$bmp.Save('${imgPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { stdio: 'ignore' });
}

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-staged-'));
const IMG = path.join(cwd, 'secret-card.png');

let buffer = '';
let trustHandled = false;
let ptyProc = null;
function spawnClaude() {
  const env = { ...process.env };
  const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];
  ptyProc = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd, env, useConpty: false });
  ptyProc.onData((d) => {
    buffer = (buffer + d).slice(-20000);
    if (!trustHandled) {
      const c = compact(buffer);
      if (c.includes('yesitrustthisfolder') && c.includes('noexit')) { trustHandled = true; ptyProc.write('\r'); }
      else if (c.includes('yesiaccept') && c.includes('noexit')) { trustHandled = true; ptyProc.write('\x1b[B'); setTimeout(() => ptyProc.write('\r'), 200); }
    }
  });
}
const bpaste = (text) => ptyProc.write(`\x1b[200~${text}\x1b[201~`);
const screen = () => stripAnsi(buffer).slice(-700);
function dumpScreen(tag) {
  console.log(`${stamp()} --- input box ${tag} ---`);
  console.log(screen().split('\n').map((l) => '      | ' + l).join('\n'));
}

function analyze() {
  const lines = allLines(cwd);
  let answered = false, readCalls = 0, userImageBlock = false, userText = '', deniedFirst = false, seenText = false;
  for (const obj of lines) {
    if (obj.type === 'user') {
      const c = obj?.message?.content;
      if (Array.isArray(c)) for (const b of c) { if (b.type === 'image') userImageBlock = true; if (b.type === 'text') userText += b.text; }
      else if (typeof c === 'string') userText += c;
    } else if (obj.type === 'assistant') {
      const c = obj?.message?.content; if (!Array.isArray(c)) continue;
      for (const b of c) {
        if (b.type === 'tool_use' && /read|view|image/i.test(b.name || '')) readCalls++;
        if (b.type === 'text') {
          if (!seenText && /can'?t see|cannot see|don'?t see|no image|provide the image|share the image/i.test(b.text || '')) deniedFirst = true;
          seenText = true;
          if ((b.text || '').toUpperCase().includes(SECRET.toUpperCase())) answered = true;
        }
      }
    }
  }
  return { answered, readCalls, userImageBlock, userText: userText.slice(0, 120), deniedFirst };
}

(async () => {
  generateImage(IMG);
  console.log(`${stamp()} variant=${VARIANT} secret=${SECRET} cwd=${cwd}`);
  console.log(`${stamp()} img=${IMG}`);
  spawnClaude();

  // wait for prompt ready
  { const dl = Date.now() + 30000; while (Date.now() < dl) { if (trustHandled && /[>│].*/.test(screen())) break; await sleep(400); } }
  await sleep(1500);
  dumpScreen('before any input');

  // For *-ml variants use a deliberately MULTI-LINE request: the realistic case
  // where the user types a paragraph with embedded newlines alongside the image.
  const ask = VARIANT.includes('ml')
    ? 'I am sharing a screenshot with you.\nPlease look carefully at it.\nReply ONLY with the exact code/text printed in the image, nothing else.'
    : 'What is the exact code/text printed in this image? Reply ONLY with that code.';

  if (VARIANT === 'path-enter-text') {
    // CONTROL: submit the bare path (turn 1), then submit text (turn 2).
    bpaste(IMG); await sleep(400); ptyProc.write('\r');
    await sleep(6000); dumpScreen('after path submit (turn1)');
    bpaste(ask); await sleep(400); ptyProc.write('\r');
  } else {
    // STAGED: path first (no enter) -> chip? -> text (no enter) -> single submit.
    if (VARIANT === 'type') {
      // raw-type the path char by char (no bracketed paste)
      ptyProc.write(IMG);
    } else {
      bpaste(IMG);
    }
    await sleep(2500);
    dumpScreen('after path paste (NO enter)');
    const afterPath = screen();
    const chip = /image\s*#?\d|\[image|pasted image|\battached\b|📎|🖼/i.test(stripAnsi(buffer));
    console.log(`${stamp()} chipDetected=${chip}`);
    // add a space then the text
    ptyProc.write(' ');
    await sleep(300);
    bpaste(ask);
    await sleep(800);
    dumpScreen('after text paste (NO enter)');
    ptyProc.write('\r');
  }

  // wait for assistant + settle
  { const dl = Date.now() + 90000; while (Date.now() < dl) { if (allLines(cwd).some((o) => o.type === 'assistant')) break; await sleep(500); } }
  { let last = transcriptSize(cwd), lc = Date.now(); const dl = Date.now() + 60000;
    while (Date.now() < dl) { await sleep(400); const n = transcriptSize(cwd); if (n !== last) { last = n; lc = Date.now(); } else if (Date.now() - lc >= 4000) break; } }

  const r = analyze();
  try { ptyProc.kill(); } catch {}
  console.log(`${stamp()} ===== RESULT (${VARIANT}) =====`);
  console.log(`${stamp()}   secret          = ${SECRET}`);
  console.log(`${stamp()}   userImageBlock  = ${r.userImageBlock}   <- TRUE means image+text in one user message`);
  console.log(`${stamp()}   userText        = ${JSON.stringify(r.userText)}`);
  console.log(`${stamp()}   answered        = ${r.answered}`);
  console.log(`${stamp()}   readCalls       = ${r.readCalls}`);
  console.log(`${stamp()}   deniedFirst     = ${r.deniedFirst}`);
  console.log(`${stamp()}   ZERO_READ_ATTACH= ${r.answered && r.userImageBlock && r.readCalls === 0}`);
  process.exit(0);
})();
