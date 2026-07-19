/**
 * Dev-only benchmark: old main-thread jsonl parsing vs new StatsWorkerPool.
 *
 * Usage: node scripts/bench-stats.js
 * Requires `npm run compile` first (loads compiled out/services/*.js).
 *
 * Verifies Task 7 acceptance criteria (PLAN updatePRDv18):
 *  - cold parse of all files < 4s
 *  - deduped entry count identical to the legacy implementation
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const { StatsWorkerPool } = require('../out/services/StatsWorkerPool');

function collectJsonlFiles(dir) {
    const out = [];
    const walk = (d) => {
        let items;
        try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const it of items) {
            const p = path.join(d, it.name);
            if (it.isDirectory()) { walk(p); }
            else if (it.name.endsWith('.jsonl')) { out.push(p); }
        }
    };
    walk(dir);
    return out;
}

// --- Legacy implementation (replicates pre-Task-7 _loadStatistics parsing) ---
function legacyParseFile(file, processedHashes) {
    const entries = [];
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    const parsed = [];
    const warmupUuids = new Set();
    for (const line of lines) {
        try {
            const entry = JSON.parse(line);
            parsed.push(entry);
            if (entry.type === 'user' && entry.message?.content === 'Warmup' && entry.uuid) {
                warmupUuids.add(entry.uuid);
            }
        } catch { /* skip */ }
    }
    for (const entry of parsed) {
        if (entry.type === 'user' && entry.message?.content === 'Warmup') { continue; }
        if (entry.parentUuid && warmupUuids.has(entry.parentUuid)) {
            if (entry.uuid) { warmupUuids.add(entry.uuid); }
            continue;
        }
        const messageId = entry.message?.id || '';
        const requestId = entry.requestId || '';
        const hash = (!messageId && !requestId)
            ? `${entry.timestamp || ''}_${entry.message?.usage?.input_tokens}_${entry.message?.usage?.output_tokens}`
            : `${messageId}_${requestId}`;
        if (processedHashes.has(hash)) { continue; }
        processedHashes.add(hash);
        if (entry.message?.usage) {
            entries.push({ timestamp: entry.timestamp, model: entry.message.model });
        }
    }
    return entries;
}

async function main() {
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');
    const files = collectJsonlFiles(claudeDir);
    const totalBytes = files.reduce((s, f) => { try { return s + fs.statSync(f).size; } catch { return s; } }, 0);
    console.log(`Files: ${files.length}, total size: ${(totalBytes / 1024 / 1024).toFixed(1)} MB, cpus: ${os.cpus().length}`);

    // Legacy (sequential main-thread, deterministic dedup order = file order)
    const t0 = Date.now();
    const legacyHashes = new Set();
    let legacyCount = 0;
    for (const f of files) {
        try { legacyCount += legacyParseFile(f, legacyHashes).length; } catch { /* skip */ }
    }
    const legacyMs = Date.now() - t0;
    console.log(`Legacy main-thread parse: ${legacyMs}ms, deduped entries: ${legacyCount}`);

    // New worker pool (raw parse) + same main-thread dedup
    const t1 = Date.now();
    const pool = new StatsWorkerPool((m) => { /* silent */ });
    const results = await pool.parseFiles(files);
    const parseMs = Date.now() - t1;

    const rawCount = results.reduce((s, r) => s + r.entries.length, 0);
    // Deterministic dedup in original file order (results order == LPT batch order,
    // so re-sort by file path list order for a fair comparison)
    const orderIndex = new Map(files.map((f, i) => [f, i]));
    results.sort((a, b) => (orderIndex.get(a.file) ?? 0) - (orderIndex.get(b.file) ?? 0));
    const newHashes = new Set();
    let newCount = 0;
    for (const r of results) {
        for (const e of r.entries) {
            const hash = (e.messageId || e.requestId)
                ? `${e.messageId}_${e.requestId}`
                : `${e.timestamp}_${e.usage.input_tokens}_${e.usage.output_tokens}`;
            if (newHashes.has(hash)) { continue; }
            newHashes.add(hash);
            newCount++;
        }
    }
    const totalMs = Date.now() - t1;
    console.log(`Worker pool parse: ${parseMs}ms (raw entries: ${rawCount}), +dedup total: ${totalMs}ms, deduped entries: ${newCount}`);

    console.log(`\nSpeedup: ${(legacyMs / parseMs).toFixed(1)}x`);
    console.log(`Count match: ${legacyCount === newCount ? 'PASS' : `FAIL (legacy=${legacyCount}, new=${newCount})`}`);
    console.log(`< 4s target: ${parseMs < 4000 ? 'PASS' : 'FAIL'}`);

    // --- Task 8: two-phase pipeline determinism (3 runs, ccusage-aligned dedup) ---
    // Replicates ClaudeChatProvider._dedupeEntries semantics:
    // key=(messageId,requestId); keyless bypass; collision keeps larger token total
    const ccusageDedup = (fileResults) => {
        fileResults.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
        const byKey = new Map();
        const keyless = [];
        for (const fr of fileResults) {
            for (const e of fr.entries) {
                const tokens = (e.usage.input_tokens || 0) + (e.usage.output_tokens || 0) +
                    (e.usage.cache_creation_input_tokens || 0) + (e.usage.cache_read_input_tokens || 0);
                if (!e.messageId && !e.requestId) { keyless.push(e); continue; }
                const key = `${e.messageId}_${e.requestId}`;
                const existing = byKey.get(key);
                if (!existing || tokens > existing.tokens) { byKey.set(key, { e, tokens }); }
            }
        }
        let count = byKey.size + keyless.length;
        let tokenSum = 0;
        for (const v of byKey.values()) { tokenSum += v.tokens; }
        for (const e of keyless) {
            tokenSum += (e.usage.input_tokens || 0) + (e.usage.output_tokens || 0) +
                (e.usage.cache_creation_input_tokens || 0) + (e.usage.cache_read_input_tokens || 0);
        }
        return { count, tokenSum };
    };

    console.log('\n--- Task 8 determinism (3 pipeline runs) ---');
    const runs = [];
    for (let i = 0; i < 3; i++) {
        const p = new StatsWorkerPool();
        const res = await p.parseFiles(files);
        runs.push(ccusageDedup(res));
        console.log(`Run ${i + 1}: deduped=${runs[i].count}, tokenSum=${runs[i].tokenSum}`);
    }
    const allSame = runs.every(r => r.count === runs[0].count && r.tokenSum === runs[0].tokenSum);
    console.log(`Determinism (3 runs identical): ${allSame ? 'PASS' : 'FAIL'}`);
}

main().catch(e => { console.error(e); process.exit(1); });
