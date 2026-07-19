#!/usr/bin/env node
/**
 * Probe: verify auto-compact behavior of Claude CLI 2.1.85 in -p stream-json mode.
 * Dev-only script (not shipped in VSIX). See specs/updatePRDv18.md §3.
 *
 * P1: API accepts "claude-fable-5[1m]" model suffix (window forced to 1M by CLI).
 * P2: CLAUDE_CODE_AUTO_COMPACT_WINDOW clamps the window DOWN in -p mode
 *     (with WINDOW=60000, compact_boundary must fire far below the 165K baseline).
 * P3: [1m] + WINDOW=400000 removes the 165K ceiling
 *     (context pushed past ~175K with NO compact_boundary).
 *
 * Usage: node scripts/probe-autocompact.js p1|p2|p3
 */

'use strict';

const { spawn } = require('child_process');
const readline = require('readline');

const TURN_TIMEOUT_MS = 300000; // 5 min per turn (large prompts are slow to ingest)

/**
 * Generate natural-language filler text of roughly `tokens` tokens.
 * NOTE: random word-salad triggered a Usage Policy refusal on turn 2 (2026-07-19 run),
 * so the filler must read as benign coherent prose.
 */
function filler(tokens, seed) {
	const topics = ['the harbor lighthouse', 'a mountain railway', 'the botanical garden',
		'an old printing press', 'the city aqueduct', 'a wooden sailing ship',
		'the observatory dome', 'a terraced vineyard', 'the clock tower', 'a river ferry'];
	const facts = [
		'was carefully maintained by generations of local craftsmen who documented every repair in leather-bound journals',
		'attracted visitors from neighboring towns, especially during the mild weeks of early autumn',
		'required a surprising amount of seasonal upkeep, from repainting woodwork to replacing worn iron fittings',
		'appeared in several regional paintings and was often described in travel diaries of the period',
		'stood as a quiet reminder of how much patience early engineers invested in public works',
		'was eventually restored with community funding and reopened to the public after two years of work',
	];
	const out = [];
	let i = 0;
	let approxTokens = 0;
	while (approxTokens < tokens) {
		const t = topics[(seed + i) % topics.length];
		const f = facts[(seed + i * 7) % facts.length];
		const sentence = `Paragraph ${i + 1} of the synthetic corpus: in the year ${1850 + ((seed + i) % 150)}, ${t} ${f}. `;
		out.push(sentence);
		approxTokens += Math.round(sentence.split(' ').length * 1.33);
		i++;
	}
	return out.join('');
}

function ts() { return new Date().toISOString().slice(11, 19); }

/**
 * Run one -p stream-json session and drive it turn by turn.
 * Resolves with { compactEvents, maxContext, timeline, errors }.
 */
function runSession({ label, model, extraEnv, turns }) {
	return new Promise((resolve, reject) => {
		const args = [
			'-p',
			'--model', model,
			'--input-format', 'stream-json',
			'--output-format', 'stream-json',
			'--verbose',
			'--strict-mcp-config', // no MCP servers: keep system prompt lean and cost low
		];
		console.log(`\n=== [${label}] claude ${args.join(' ')}`);
		console.log(`=== [${label}] extraEnv: ${JSON.stringify(extraEnv)}`);

		const child = spawn('claude', args, {
			shell: true, // Windows: claude is a .cmd shim
			env: { ...process.env, ...extraEnv },
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		const result = { compactEvents: [], maxContext: 0, timeline: [], errors: [] };
		let turnIdx = 0;
		let timer = null;

		const armTimer = () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				result.errors.push(`turn ${turnIdx} timed out after ${TURN_TIMEOUT_MS}ms`);
				child.kill();
			}, TURN_TIMEOUT_MS);
		};

		const sendTurn = () => {
			const t = turns[turnIdx];
			const msg = {
				type: 'user',
				message: { role: 'user', content: [{ type: 'text', text: t }] },
			};
			child.stdin.write(JSON.stringify(msg) + '\n');
			console.log(`[${ts()}] [${label}] >> turn ${turnIdx + 1}/${turns.length} sent (${t.length} chars)`);
			armTimer();
		};

		const rl = readline.createInterface({ input: child.stdout });
		rl.on('line', (line) => {
			line = line.trim();
			if (!line) return;
			let obj;
			try { obj = JSON.parse(line); } catch { return; }

			if (obj.type === 'system' && obj.subtype === 'compact_boundary') {
				const meta = obj.compact_metadata || obj.compactMetadata || {};
				result.compactEvents.push({ turn: turnIdx + 1, meta });
				console.log(`[${ts()}] [${label}] !! COMPACT_BOUNDARY turn=${turnIdx + 1} meta=${JSON.stringify(meta)}`);
			} else if (obj.type === 'assistant' && obj.message && obj.message.usage) {
				const u = obj.message.usage;
				const ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
				if (ctx > result.maxContext) result.maxContext = ctx;
				result.timeline.push({ turn: turnIdx + 1, ctx });
				console.log(`[${ts()}] [${label}] << assistant usage: in=${u.input_tokens} cc=${u.cache_creation_input_tokens} cr=${u.cache_read_input_tokens} CTX=${ctx}`);
			} else if (obj.type === 'result') {
				clearTimeout(timer);
				if (obj.is_error) {
					result.errors.push(`turn ${turnIdx + 1} result error: ${JSON.stringify(obj).slice(0, 500)}`);
					console.log(`[${ts()}] [${label}] << RESULT ERROR: ${JSON.stringify(obj).slice(0, 300)}`);
					child.stdin.end();
					return;
				}
				console.log(`[${ts()}] [${label}] << result ok (turn ${turnIdx + 1}) cost=$${obj.total_cost_usd ?? '?'}`);
				turnIdx++;
				if (turnIdx < turns.length) {
					sendTurn();
				} else {
					child.stdin.end();
				}
			}
		});

		let stderrBuf = '';
		child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

		child.on('close', (code) => {
			clearTimeout(timer);
			if (code !== 0 && stderrBuf) result.errors.push(`exit=${code} stderr: ${stderrBuf.slice(0, 800)}`);
			resolve(result);
		});
		child.on('error', reject);

		sendTurn();
	});
}

const OK_PROMPT = 'This is an automated context-window stress test of our CLI tooling. The text below is synthetic filler used only to grow the context; it needs no analysis. Reply with exactly: ok. Nothing else. Do not use any tools.';

async function p1() {
	const r = await runSession({
		label: 'P1',
		model: 'claude-fable-5[1m]',
		extraEnv: {},
		turns: [OK_PROMPT],
	});
	const pass = r.errors.length === 0 && r.maxContext > 0;
	console.log(`\n### P1 ${pass ? 'PASS' : 'FAIL'} — [1m] suffix ${pass ? 'accepted by API' : 'REJECTED'}; ctx=${r.maxContext}; errors=${JSON.stringify(r.errors)}`);
	return pass;
}

async function p2() {
	// Attempt 1 (WINDOW=60000) finding: system prompt + first message (~61K) overshot the
	// clamped window in ONE jump -> turn 2 hard-errored "Prompt is too long" (no compact).
	// => env var IS enforced, but the window must stay well above system-prompt size.
	// Attempt 2: WINDOW=100000. First turn ~61K sits below threshold (~67-82K); each
	// +8K turn crosses it smoothly -> expect graceful compact_boundary far below 165K.
	const turns = [];
	for (let i = 0; i < 8; i++) {
		turns.push(`${OK_PROMPT}\n\nIgnore the following noise data:\n${filler(8000, 1234 + i)}`);
	}
	const r = await runSession({
		label: 'P2',
		model: 'claude-fable-5[1m]',
		extraEnv: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000' },
		turns,
	});
	const fired = r.compactEvents.length > 0;
	const firedLow = fired && r.timeline.length > 0 && r.maxContext < 120000;
	console.log(`\n### P2 ${firedLow ? 'PASS' : 'FAIL'} — compactEvents=${r.compactEvents.length}, maxCtx=${r.maxContext} (expect compact fired && maxCtx << 165K); errors=${JSON.stringify(r.errors)}`);
	return firedLow;
}

async function p3() {
	// 12 filler turns * ~15K tokens => context pushed past ~175K.
	// With [1m] + WINDOW=400000 there must be NO compact below the old 165K ceiling.
	const turns = [];
	for (let i = 0; i < 12; i++) {
		turns.push(`${OK_PROMPT}\n\nIgnore the following noise data:\n${filler(15000, 9876 + i)}`);
	}
	const r = await runSession({
		label: 'P3',
		model: 'claude-sonnet-5[1m]', // cheaper than fable-5; [1m] semantics identical (qD/Iv path)
		extraEnv: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '400000' },
		turns,
	});
	const pass = r.compactEvents.length === 0 && r.maxContext > 170000 && r.errors.length === 0;
	console.log(`\n### P3 ${pass ? 'PASS' : 'FAIL'} — compactEvents=${r.compactEvents.length}, maxCtx=${r.maxContext} (expect 0 compacts && maxCtx > 170K); errors=${JSON.stringify(r.errors)}`);
	return pass;
}

(async () => {
	const mode = (process.argv[2] || '').toLowerCase();
	if (mode === 'p1') process.exitCode = (await p1()) ? 0 : 1;
	else if (mode === 'p2') process.exitCode = (await p2()) ? 0 : 1;
	else if (mode === 'p3') process.exitCode = (await p3()) ? 0 : 1;
	else { console.error('Usage: node scripts/probe-autocompact.js p1|p2|p3'); process.exitCode = 2; }
})().catch((e) => { console.error('probe crashed:', e); process.exitCode = 1; });
