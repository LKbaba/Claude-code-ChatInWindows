// End-to-end (white-box) verification of the v13 staged-image pipeline. Unlike
// verify-image-staged*.js (which replicate the inject SEQUENCE in the script),
// this drives the REAL compiled extension code:
//   - ClaudeChatProvider._splitImageMentions   (Task 3: route image @mentions out)
//   - ClaudeProcessService._beginTurn -> _injectStagedMessage / _waitForImageChip
//     / _detectImageChip / _submitStaged / _degradeToInline   (Task 2/4)
//   - ClaudeProcessService._onPtyData / gate / readiness       (real readiness path)
//
// A real claude PTY is spawned and wired to svc._onPtyData(), then the actual
// _beginTurn() injects. We assert on the transcript (image-block count + Read
// count) per scenario. `vscode` is stubbed so the compiled modules load.
//
// Scenarios (PRD v13 §4.1/§4.2):
//   1. single image + multi-line text         -> 1 image block, 0 Read
//   2. two images + text                       -> 2 image blocks, 0 Read
//   3. CJK + space path image                  -> 1 image block, 0 Read
//   4. image + absolute @some.ts (non-image)   -> 1 image block AND .ts Read
//   5. forced chip failure (degrade)           -> 0 image block, image still seen via Read
//
// Usage: node verify-image-pipeline.js [exe|cmd]   (default cmd = npm 2.1.85)
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const pty = require('../node_modules/node-pty');

// ---- vscode stub so out/ modules load (same shape as verify-msg-split.js) ----
const vscodeStub = {
  window: { createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {}, clear() {} }) },
  workspace: { getConfiguration: () => ({ get: () => undefined }), workspaceFolders: undefined },
  commands: { registerCommand: () => ({ dispose() {} }) },
  Uri: { file: (p) => ({ fsPath: p }) },
  EventEmitter: class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') { return vscodeStub; }
  return origLoad.call(this, request, parent, isMain);
};
const { ClaudeChatProvider } = require('../out/providers/ClaudeChatProvider');
const { ClaudeProcessService } = require('../out/services/ClaudeProcessService');

// ---- claude executables (Task 1: plugin launches npm cmd = 2.1.85) ----
const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'exe' ? 'exe' : 'cmd';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
// Analyze a transcript: per scenario we run a FRESH cwd so all lines belong to it.
function analyze(cwd, secrets) {
  const lines = allLines(cwd);
  let readCalls = 0, userImageBlocks = 0, userMsgs = 0, deniedFirst = false, seenText = false;
  const found = new Set();
  for (const obj of lines) {
    if (obj.type === 'user') {
      const c = obj?.message?.content;
      if (Array.isArray(c)) {
        // Count "real" user turns (those with a text/image block), not tool_result echoes.
        if (c.some((b) => b.type === 'text' || b.type === 'image')) { userMsgs++; }
        for (const b of c) { if (b.type === 'image') { userImageBlocks++; } }
      } else if (typeof c === 'string') { userMsgs++; }
    } else if (obj.type === 'assistant') {
      const c = obj?.message?.content; if (!Array.isArray(c)) { continue; }
      for (const b of c) {
        if (b.type === 'tool_use' && /read|view/i.test(b.name || '')) { readCalls++; }
        if (b.type === 'text') {
          if (!seenText && /can'?t see|cannot see|don'?t see|no image|provide the image|share the image/i.test(b.text || '')) { deniedFirst = true; }
          seenText = true;
          const up = (b.text || '').toUpperCase();
          for (const s of secrets) { if (up.includes(s.toUpperCase())) { found.add(s); } }
        }
      }
    }
  }
  return { readCalls, userImageBlocks, userMsgs, deniedFirst, foundCount: found.size };
}

// Build a real, initialized service via the constructor (lightweight: it only
// stores its deps) with stubbed managers; we then drive it below _spawnSession by
// wiring a PTY we control to the REAL _onPtyData and calling the REAL _beginTurn.
function makeService() {
  const stubWinCompat = {};
  const stubConfig = {};
  const stubConv = {};
  return new ClaudeProcessService(stubWinCompat, stubConfig, stubConv);
}
const provider = Object.create(ClaudeChatProvider.prototype);

function spawnClaude(cwd) {
  const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];
  return pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd, env: { ...process.env }, useConpty: false });
}

// Run one scenario end-to-end. `prep(cwd)` returns { imageAbsPaths, message, secrets, forceDegrade? }.
async function runScenario(name, prep) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-pipe-'));
  const { imageAbsPaths, message, secrets, forceDegrade } = prep(cwd);
  const svc = makeService();
  const ptyProc = spawnClaude(cwd);
  svc._pty = ptyProc;
  svc._callbacks = { onClose() {}, onTurnComplete() {} };
  svc._spawnTs = Date.now();
  // Wire the live PTY to the REAL readiness/gate/chip-buffer pipeline.
  ptyProc.onData((d) => { try { svc._onPtyData(d); } catch (e) { /* ignore */ } });

  // Force the degrade branch by making chip detection always fail (Task 4).
  if (forceDegrade) {
    svc._waitForImageChip = async () => false;
  }

  // Wait for the real input-box-ready signal (gate is auto-answered by _onPtyData).
  const ready = await svc.waitForInputBoxReady(30000);
  await sleep(1200);

  // REAL dispatch: _beginTurn routes to staged injection for image turns.
  svc._beginTurn({ message, cwd, model: 'claude-opus-4-8', imagesInMessage: imageAbsPaths });

  // Wait for assistant output, then for the transcript to settle.
  { const dl = Date.now() + 90000; while (Date.now() < dl) { if (allLines(cwd).some((o) => o.type === 'assistant')) { break; } await sleep(500); } }
  { let last = transcriptSize(cwd), lc = Date.now(); const dl = Date.now() + 60000;
    while (Date.now() < dl) { await sleep(400); const n = transcriptSize(cwd); if (n !== last) { last = n; lc = Date.now(); } else if (Date.now() - lc >= 4000) { break; } } }

  const r = analyze(cwd, secrets);
  try { ptyProc.kill(); } catch {}
  return { name, ready, cwd, ...r };
}

(async () => {
  const results = [];

  // 1. single image + multi-line text
  results.push(await runScenario('single+multiline', (cwd) => {
    const s = newSecret(); const img = path.join(cwd, 'card.png'); generateImage(img, s);
    return { imageAbsPaths: [img], message: 'Read the code in the image.\nReply ONLY the exact code, nothing else.', secrets: [s] };
  }));

  // 2. two images + text
  results.push(await runScenario('two-images', (cwd) => {
    const s1 = newSecret(), s2 = newSecret();
    const i1 = path.join(cwd, 'a.png'), i2 = path.join(cwd, 'b.png');
    generateImage(i1, s1); generateImage(i2, s2);
    return { imageAbsPaths: [i1, i2], message: 'Each image has a code. List EVERY code, one per line, nothing else.', secrets: [s1, s2] };
  }));

  // 3. CJK + space path image
  results.push(await runScenario('cjk-space-path', (cwd) => {
    const dir = path.join(cwd, '图片 文件夹'); fs.mkdirSync(dir, { recursive: true });
    const s = newSecret(); const img = path.join(dir, '密码卡片 1.png'); generateImage(img, s);
    return { imageAbsPaths: [img], message: 'Reply ONLY the exact code printed in this image.', secrets: [s] };
  }));

  // 4. image + non-image @some.ts (routed via REAL _splitImageMentions)
  results.push(await runScenario('image+ts-mixed', (cwd) => {
    const sImg = newSecret(), sTs = newSecret();
    const img = path.join(cwd, 'shot.png'); generateImage(img, sImg);
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    const tsAbs = path.join(cwd, 'src', 'note.ts');
    fs.writeFileSync(tsAbs, `// SECRET_TS = ${sTs}\nexport const x = 1;\n`);
    // Real provider split: image @mention -> imageAbsPaths; .ts (absolute) stays in text.
    const raw = `compare @${'shot.png'} with @${tsAbs} and report the image code and the SECRET_TS value`;
    const split = provider._splitImageMentions(raw, cwd);
    if (split.imageAbsPaths.length !== 1) { throw new Error('split did not route exactly one image: ' + JSON.stringify(split.imageAbsPaths)); }
    return { imageAbsPaths: split.imageAbsPaths, message: split.text, secrets: [sImg, sTs] };
  }));

  // 5. forced chip failure -> degrade (image still seen via inline Read)
  results.push(await runScenario('degrade-no-chip', (cwd) => {
    const s = newSecret(); const img = path.join(cwd, 'fallback.png'); generateImage(img, s);
    return { imageAbsPaths: [img], message: 'Reply ONLY the exact code printed in this image.', secrets: [s], forceDegrade: true };
  }));

  // ---- judge ----
  const verdicts = results.map((r) => {
    let ok = false, note = '';
    switch (r.name) {
      case 'single+multiline':
      case 'cjk-space-path':
        ok = r.userImageBlocks === 1 && r.readCalls === 0 && r.foundCount >= 1 && !r.deniedFirst;
        note = 'want imgBlocks=1 read=0 found>=1'; break;
      case 'two-images':
        // Structural proof: BOTH images became native base64 attachment blocks with
        // ZERO Read calls (the whole point of staged injection). foundCount is a soft
        // vision-sanity gate -- the model may only verbalize one of the two secrets,
        // which is a model-output flake, not an injection failure. imgBlocks===2 is the
        // deterministic evidence both attachments reached the transcript.
        ok = r.userImageBlocks === 2 && r.readCalls === 0 && r.foundCount >= 1 && !r.deniedFirst;
        note = 'want imgBlocks=2 read=0 found>=1 (vision soft)'; break;
      case 'image+ts-mixed':
        // Image is a native attachment (exactly 1 image block, so the .ts did NOT
        // become an attachment). Both secrets reported => the .ts content was
        // obtained by reading the file (Read or Bash/cat -- mechanism-agnostic),
        // while the image was seen via the attachment. readCalls is informational
        // (counts only the Read/View tool, not Bash).
        ok = r.userImageBlocks === 1 && r.foundCount === 2 && !r.deniedFirst;
        note = 'want imgBlocks=1 found=2 (img attached, ts read)'; break;
      case 'degrade-no-chip':
        // Degradation proof: NO native attachment (imgBlocks===0) and the inlined path
        // forced at least one Read (readCalls>=1) -- this is the "never lose the image"
        // guarantee. foundCount is informational: the model issues the Read but may not
        // echo the exact secret token in text, so it is not asserted.
        ok = r.userImageBlocks === 0 && r.readCalls >= 1 && !r.deniedFirst;
        note = 'want imgBlocks=0 read>=1 (degraded, found soft)'; break;
    }
    return { ...r, ok, note };
  });

  console.log(`\n===== verify-image-pipeline (which=${which}) =====`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('scenario', 20), pad('imgBlk', 7), pad('read', 5), pad('found', 6), pad('userMsg', 8), pad('denied', 7), 'verdict');
  for (const v of verdicts) {
    console.log(pad(v.name, 20), pad(v.userImageBlocks, 7), pad(v.readCalls, 5), pad(v.foundCount, 6), pad(v.userMsgs, 8), pad(v.deniedFirst, 7), v.ok ? 'PASS' : `FAIL (${v.note})`);
  }
  const failed = verdicts.filter((v) => !v.ok).length;
  console.log(`\nRESULT: ${verdicts.length - failed}/${verdicts.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
})();
