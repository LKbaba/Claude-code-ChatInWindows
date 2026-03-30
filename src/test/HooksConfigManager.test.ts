/**
 * Unit tests for HooksConfigManager
 *
 * These tests verify the hooks configuration read/write logic
 * without requiring VS Code Extension Host.
 *
 * Run: npm run test:hooks
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock vscode module before importing anything that depends on it
// DebugLogger imports vscode but never uses any vscode.* API
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id: string) {
    if (id === 'vscode') {
        return {}; // empty stub — DebugLogger imports but never calls vscode.*
    }
    return originalRequire.apply(this, arguments);
};

import { HooksConfigManager, ConfiguredHook, HookTemplate } from '../services/HooksConfigManager';

// ── Test Helpers ──────────────────────────────────────────

let testCounter = 0;

async function createTempSettings(
    scope: 'global' | 'project',
    content: Record<string, any>
): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), `hooks-test-${Date.now()}-${testCounter++}`);
    const claudeDir = path.join(tmpDir, '.claude');
    await fsp.mkdir(claudeDir, { recursive: true });
    await fsp.writeFile(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify(content, null, 2)
    );
    return tmpDir;
}

async function readBackSettings(dirPath: string): Promise<Record<string, any>> {
    const filePath = path.join(dirPath, '.claude', 'settings.json');
    const content = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

async function cleanupTempDir(dirPath: string): Promise<void> {
    try {
        await fsp.rm(dirPath, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
}

// ── Helpers to access HooksConfigManager internals ──────

function getManagerInstance(): HooksConfigManager {
    // Reset singleton for test isolation
    (HooksConfigManager as any).instance = null;
    return HooksConfigManager.getInstance();
}

// Helper: filter project-scope hooks only (to ignore user's global hooks)
function projectHooks(hooks: ConfiguredHook[]): ConfiguredHook[] {
    return hooks.filter(h => h.scope === 'project');
}

// ── Test Suites ─────────────────────────────────────────

describe('HooksConfigManager', function() {

    it('should instantiate', function() {
        const manager = getManagerInstance();
        assert.ok(manager);
    });

    // ── T1 — Lossless round-trip ─────────────────────────

    describe('T1 — Lossless round-trip', function() {
        let tmpDir: string;
        let manager: HooksConfigManager;

        beforeEach(async function() {
            manager = getManagerInstance();
        });

        afterEach(async function() {
            if (tmpDir) { await cleanupTempDir(tmpDir); }
        });

        it('should preserve "if" field after toggle', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: {
                    PreToolUse: [{
                        matcher: 'Bash',
                        hooks: [{ type: 'command', command: 'echo test', if: 'Bash(git *)' }]
                    }]
                }
            });
            manager.setWorkspacePath(tmpDir);

            let hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks.length, 1);

            // Toggle disable then re-enable (reload between toggles since cache clears)
            await manager.toggleHookState(hooks[0].id);
            hooks = projectHooks(await manager.loadConfiguredHooks(true));
            const disabledHook = hooks.find(h => h.command === 'echo test')!;
            await manager.toggleHookState(disabledHook.id);

            // Read back from disk
            const settings = await readBackSettings(tmpDir);
            const hookEntry = settings.hooks.PreToolUse[0].hooks[0];
            assert.strictEqual(hookEntry.if, 'Bash(git *)');
        });

        it('should preserve timeout and async fields after toggle', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: {
                    Stop: [{
                        matcher: '',
                        hooks: [{ type: 'command', command: 'notify.sh', timeout: 30, async: true }]
                    }]
                }
            });
            manager.setWorkspacePath(tmpDir);

            let hooks = projectHooks(await manager.loadConfiguredHooks(true));
            await manager.toggleHookState(hooks[0].id); // disable
            hooks = projectHooks(await manager.loadConfiguredHooks(true));
            const disabledHook = hooks.find(h => h.command === 'notify.sh')!;
            await manager.toggleHookState(disabledHook.id); // re-enable

            const settings = await readBackSettings(tmpDir);
            const hookEntry = settings.hooks.Stop[0].hooks[0];
            assert.strictEqual(hookEntry.timeout, 30);
            assert.strictEqual(hookEntry.async, true);
        });

        it('should preserve shell field after toggle', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: {
                    Stop: [{
                        matcher: '',
                        hooks: [{ type: 'command', command: 'echo done', shell: 'powershell' }]
                    }]
                }
            });
            manager.setWorkspacePath(tmpDir);

            let hooks = projectHooks(await manager.loadConfiguredHooks(true));
            await manager.toggleHookState(hooks[0].id);
            hooks = projectHooks(await manager.loadConfiguredHooks(true));
            const disabledHook = hooks.find(h => h.command === 'echo done')!;
            await manager.toggleHookState(disabledHook.id);

            const settings = await readBackSettings(tmpDir);
            const hookEntry = settings.hooks.Stop[0].hooks[0];
            assert.strictEqual(hookEntry.shell, 'powershell');
        });

        it('should preserve unknown/future fields via index signature', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: {
                    Stop: [{
                        matcher: '',
                        hooks: [{ type: 'command', command: 'echo x', futureField: 'xyz', anotherField: 42 }]
                    }]
                }
            });
            manager.setWorkspacePath(tmpDir);

            let hooks = projectHooks(await manager.loadConfiguredHooks(true));
            await manager.toggleHookState(hooks[0].id);
            hooks = projectHooks(await manager.loadConfiguredHooks(true));
            const disabledHook = hooks.find(h => h.command === 'echo x')!;
            await manager.toggleHookState(disabledHook.id);

            const settings = await readBackSettings(tmpDir);
            const hookEntry = settings.hooks.Stop[0].hooks[0];
            assert.strictEqual(hookEntry.futureField, 'xyz');
            assert.strictEqual(hookEntry.anotherField, 42);
        });

        it('should not lose sibling hook fields when removing one hook from group', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: {
                    PostToolUse: [{
                        matcher: 'Bash',
                        hooks: [
                            { type: 'command', command: 'hook-a.sh', if: 'Bash(npm *)' },
                            { type: 'command', command: 'hook-b.sh', timeout: 60 }
                        ]
                    }]
                }
            });
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            const hookA = hooks.find(h => h.command === 'hook-a.sh')!;
            await manager.removeHook(hookA.id);

            const settings = await readBackSettings(tmpDir);
            const remaining = settings.hooks.PostToolUse[0].hooks;
            assert.strictEqual(remaining.length, 1);
            assert.strictEqual(remaining[0].command, 'hook-b.sh');
            assert.strictEqual(remaining[0].timeout, 60);
        });
    });

    // ── T2 — All 26 events ──────────────────────────────

    describe('T2 — All 26 events', function() {
        let tmpDir: string;
        let manager: HooksConfigManager;

        afterEach(async function() {
            if (tmpDir) { await cleanupTempDir(tmpDir); }
        });

        it('should read hooks from all 26 event types', async function() {
            const allEvents = [
                'SessionStart', 'SessionEnd', 'InstructionsLoaded',
                'UserPromptSubmit', 'PreToolUse', 'PermissionRequest',
                'PostToolUse', 'PostToolUseFailure',
                'Notification', 'Stop', 'StopFailure',
                'SubagentStart', 'SubagentStop',
                'TaskCreated', 'TaskCompleted', 'TeammateIdle',
                'ConfigChange', 'CwdChanged', 'FileChanged',
                'WorktreeCreate', 'WorktreeRemove',
                'PreCompact', 'PostCompact',
                'Elicitation', 'ElicitationResult'
            ];

            const hooksSection: Record<string, any[]> = {};
            for (const event of allEvents) {
                hooksSection[event] = [{
                    matcher: '',
                    hooks: [{ type: 'command', command: `echo ${event}` }]
                }];
            }

            tmpDir = await createTempSettings('project', { hooks: hooksSection });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks.length, allEvents.length);

            for (const event of allEvents) {
                const found = hooks.find(h => h.event === event);
                assert.ok(found, `Event ${event} should be loaded`);
            }
        });

        it('should not crash on unknown event keys', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: {
                    FutureEvent: [{
                        matcher: '',
                        hooks: [{ type: 'command', command: 'echo future' }]
                    }],
                    Stop: [{
                        matcher: '',
                        hooks: [{ type: 'command', command: 'echo stop' }]
                    }]
                }
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.ok(hooks.length >= 1); // At least Stop should load
        });

        it('should skip empty event arrays gracefully', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: {
                    Stop: [],
                    PreToolUse: [{
                        matcher: '',
                        hooks: [{ type: 'command', command: 'echo test' }]
                    }]
                }
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks.length, 1);
            assert.strictEqual(hooks[0].event, 'PreToolUse');
        });
    });

    // ── T3 — Four hook types ────────────────────────────

    describe('T3 — Four hook types', function() {
        let tmpDir: string;
        let manager: HooksConfigManager;

        afterEach(async function() {
            if (tmpDir) { await cleanupTempDir(tmpDir); }
        });

        it('should read command type correctly', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] }] }
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks[0].type, 'command');
            assert.strictEqual(hooks[0].command, 'echo hi');
        });

        it('should read http type correctly', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [
                    { type: 'http', url: 'https://example.com/hook', headers: { 'X-Token': 'abc' } }
                ] }] }
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks[0].type, 'http');
            assert.strictEqual(hooks[0].url, 'https://example.com/hook');
            assert.deepStrictEqual(hooks[0].headers, { 'X-Token': 'abc' });
        });

        it('should read prompt type correctly', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [
                    { type: 'prompt', prompt: 'Is this edit safe?' }
                ] }] }
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks[0].type, 'prompt');
            assert.strictEqual(hooks[0].prompt, 'Is this edit safe?');
        });

        it('should read agent type with model correctly', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: { Stop: [{ matcher: '', hooks: [
                    { type: 'agent', prompt: 'Review changes', model: 'claude-haiku-4-5-20251001' }
                ] }] }
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks[0].type, 'agent');
            assert.strictEqual(hooks[0].prompt, 'Review changes');
            assert.strictEqual(hooks[0].model, 'claude-haiku-4-5-20251001');
        });

        it('should default to command type when type field is missing', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: { Stop: [{ matcher: '', hooks: [{ command: 'echo hi' }] }] }
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks[0].type, 'command');
        });

        it('should preserve http type and fields after toggle', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: { PostToolUse: [{ matcher: '', hooks: [
                    { type: 'http', url: 'https://example.com/hook', headers: { 'Authorization': 'Bearer $TOKEN' }, timeout: 15 }
                ] }] }
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            let hooks = projectHooks(await manager.loadConfiguredHooks(true));
            await manager.toggleHookState(hooks[0].id); // disable
            hooks = projectHooks(await manager.loadConfiguredHooks(true));
            const disabledHook = hooks.find(h => h.url === 'https://example.com/hook')!;
            await manager.toggleHookState(disabledHook.id); // re-enable

            const settings = await readBackSettings(tmpDir);
            const hookEntry = settings.hooks.PostToolUse[0].hooks[0];
            assert.strictEqual(hookEntry.type, 'http');
            assert.strictEqual(hookEntry.url, 'https://example.com/hook');
            assert.deepStrictEqual(hookEntry.headers, { 'Authorization': 'Bearer $TOKEN' });
            assert.strictEqual(hookEntry.timeout, 15);
        });
    });

    // ── T4 — DisabledHook backward compatibility ────────

    describe('T4 — DisabledHook backward compatibility', function() {
        let tmpDir: string;
        let manager: HooksConfigManager;

        afterEach(async function() {
            if (tmpDir) { await cleanupTempDir(tmpDir); }
        });

        it('should load disabled hooks from old format (_disabledHooks with command only)', async function() {
            tmpDir = await createTempSettings('project', {
                _disabledHooks: [
                    { event: 'Stop', matcher: '', command: 'echo old' }
                ]
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks.length, 1);
            assert.strictEqual(hooks[0].enabled, false);
            assert.strictEqual(hooks[0].command, 'echo old');
        });

        it('should load disabled hooks from new format (with type and url)', async function() {
            tmpDir = await createTempSettings('project', {
                _disabledHooks: [
                    { event: 'PostToolUse', matcher: '', type: 'http', url: 'https://example.com' }
                ]
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks.length, 1);
            assert.strictEqual(hooks[0].enabled, false);
            assert.strictEqual(hooks[0].type, 'http');
        });

        it('should handle mixed old and new disabled format', async function() {
            tmpDir = await createTempSettings('project', {
                hooks: {
                    Stop: [{ matcher: '', hooks: [
                        { type: 'command', command: 'echo active' }
                    ] }]
                },
                _disabledHooks: [
                    { event: 'Stop', matcher: '', command: 'echo old-disabled' },
                    { event: 'PreToolUse', matcher: 'Edit', type: 'prompt', prompt: 'Safe?' }
                ]
            });
            manager = getManagerInstance();
            manager.setWorkspacePath(tmpDir);

            const hooks = projectHooks(await manager.loadConfiguredHooks(true));
            assert.strictEqual(hooks.length, 3);

            const active = hooks.find(h => h.command === 'echo active');
            assert.ok(active);
            assert.strictEqual(active!.enabled, true);

            const oldDisabled = hooks.find(h => h.command === 'echo old-disabled');
            assert.ok(oldDisabled);
            assert.strictEqual(oldDisabled!.enabled, false);

            const newDisabled = hooks.find(h => h.prompt === 'Safe?');
            assert.ok(newDisabled);
            assert.strictEqual(newDisabled!.enabled, false);
            assert.strictEqual(newDisabled!.type, 'prompt');
        });
    });

    // ── T5 — Templates ──────────────────────────────────

    describe('T5 — Templates', function() {
        it('should return 5 templates', function() {
            const manager = getManagerInstance();
            const templates = manager.getTemplates();
            assert.strictEqual(templates.length, 5);
        });

        it('should have type field on all templates', function() {
            const manager = getManagerInstance();
            const templates = manager.getTemplates();
            for (const t of templates) {
                assert.ok(t.type, `Template "${t.name}" should have type field`);
                assert.strictEqual(t.type, 'command');
            }
        });

        it('should include Completion Notification template', function() {
            const manager = getManagerInstance();
            const templates = manager.getTemplates();
            const notify = templates.find(t => t.name === 'Completion Notification');
            assert.ok(notify);
            assert.strictEqual(notify!.event, 'Stop');
        });

        it('should include Auto-Commit Guard template', function() {
            const manager = getManagerInstance();
            const templates = manager.getTemplates();
            const guard = templates.find(t => t.name === 'Auto-Commit Guard');
            assert.ok(guard);
            assert.strictEqual(guard!.event, 'Stop');
            assert.ok(guard!.command!.includes('stop_hook_active'), 'Should include anti-loop check');
        });
    });

});
