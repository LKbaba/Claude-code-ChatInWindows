/**
 * Dev-only verification for Task 9 (StatisticsCache disk persistence).
 *
 * Usage: node scripts/bench-diskcache.js
 * Requires `npm run compile` first. Uses a temp storage dir — does NOT touch
 * the real extension globalStorage.
 *
 * Verifies:
 *  1. cold run → disk cache written
 *  2. simulated reload (fresh cache instance) → all disk hits, < 1s
 *  3. touch one jsonl (mtime change) → only that file re-parsed
 *  4. delete stats-cache.json → full rebuild without errors
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const { StatsWorkerPool } = require('../out/services/StatsWorkerPool');
const { StatisticsCache } = require('../out/services/StatisticsCache');

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

// Mirrors the three-layer dispatch in ClaudeChatProvider._loadStatistics
async function runStatistics(cache, pool, files) {
    const fileResults = [];
    const filesToParse = [];
    let memHits = 0, diskHits = 0;
    await Promise.all(files.map(async (file) => {
        let stat;
        try { stat = await fs.promises.stat(file); } catch { return; }
        const mem = cache.getValidCachedEntries(file, stat.mtimeMs);
        if (mem) { fileResults.push({ file, entries: mem }); memHits++; return; }
        const disk = cache.getDiskEntries(file, stat.mtimeMs, stat.size);
        if (disk) {
            cache.updateCache(file, disk, stat.mtimeMs);
            fileResults.push({ file, entries: disk });
            diskHits++;
            return;
        }
        filesToParse.push(file);
    }));
    const results = await pool.parseFiles(filesToParse);
    for (const r of results) {
        cache.updateCache(r.file, r.entries, r.mtimeMs);
        cache.updateDiskEntry(r.file, r.mtimeMs, r.size, r.entries);
        fileResults.push({ file: r.file, entries: r.entries });
    }
    await cache.flushDiskCache(new Set(files));
    const total = fileResults.reduce((s, r) => s + r.entries.length, 0);
    return { memHits, diskHits, parsed: filesToParse.length, totalEntries: total };
}

async function main() {
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');
    const files = collectJsonlFiles(claudeDir);
    const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-cache-test-'));
    const cachePath = path.join(storageDir, 'stats-cache.json');
    console.log(`Files: ${files.length}, temp storage: ${storageDir}`);

    // 1. Cold run
    let cache = new StatisticsCache();
    await cache.initDiskCache(storageDir);
    const pool = new StatsWorkerPool();
    let t = Date.now();
    let r = await runStatistics(cache, pool, files);
    console.log(`\n[1] Cold run: ${Date.now() - t}ms, parsed=${r.parsed}, entries=${r.totalEntries}`);
    const cacheSize = fs.statSync(cachePath).size;
    console.log(`    Disk cache written: ${(cacheSize / 1024 / 1024).toFixed(1)} MB — ${fs.existsSync(cachePath) ? 'PASS' : 'FAIL'}`);
    const coldEntries = r.totalEntries;

    // 2. Simulated reload: fresh cache instance, read from disk
    cache = new StatisticsCache();
    t = Date.now();
    await cache.initDiskCache(storageDir);
    r = await runStatistics(cache, pool, files);
    const reloadMs = Date.now() - t;
    console.log(`\n[2] Reload (warm): ${reloadMs}ms, diskHits=${r.diskHits}, parsed=${r.parsed}, entries=${r.totalEntries}`);
    console.log(`    < 1s target: ${reloadMs < 1000 ? 'PASS' : 'FAIL'}`);
    console.log(`    Entries match cold run: ${r.totalEntries === coldEntries ? 'PASS' : 'FAIL'}`);

    // 3. Touch one file → only that file re-parsed
    const touched = files[0];
    const now = new Date();
    fs.utimesSync(touched, now, now);
    cache = new StatisticsCache();
    await cache.initDiskCache(storageDir);
    r = await runStatistics(cache, pool, files);
    console.log(`\n[3] After touch of 1 file: parsed=${r.parsed}, diskHits=${r.diskHits}`);
    console.log(`    Only touched file re-parsed: ${r.parsed === 1 ? 'PASS' : 'FAIL'}`);

    // 4. Delete cache file → full rebuild, no error
    fs.rmSync(cachePath);
    cache = new StatisticsCache();
    await cache.initDiskCache(storageDir);
    r = await runStatistics(cache, pool, files);
    console.log(`\n[4] After cache deletion: parsed=${r.parsed}, entries=${r.totalEntries}`);
    console.log(`    Full rebuild: ${r.parsed === files.length && r.totalEntries === coldEntries ? 'PASS' : 'FAIL'}`);

    fs.rmSync(storageDir, { recursive: true, force: true });
    console.log('\nTemp storage cleaned up.');
}

main().catch(e => { console.error(e); process.exit(1); });
