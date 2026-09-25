import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import * as util from 'util';
import { debugLog, debugError } from '../services/DebugLogger';

const execFile = util.promisify(cp.execFile);

/**
 * Workspace files never included in backup snapshots. The debug log lives in the
 * workspace root, changes on every message (bloating the repo) and may contain secrets.
 */
const BACKUP_EXCLUDES = ['debug_log.txt', 'debug_log.bak'];

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
const GITLINK_MODE = '160000';
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

export interface CommitInfo {
    id: string;
    sha: string;
    message: string;
    timestamp: string;
}

export interface RestorePreview {
    commit: CommitInfo;
    /** Files written back from the checkpoint (modified, or deleted since) */
    overwrite: string[];
    /** Non-ignored files created after the checkpoint; deleted on restore */
    remove: string[];
    /** In the checkpoint but ignored now and still on disk; left untouched */
    skipped: string[];
}

export interface RestoreResult {
    success: boolean;
    message: string;
    commit?: CommitInfo;
    /** Snapshot taken right before this restore; restoring it undoes the restore */
    undoSha?: string;
    overwritten?: number;
    removed?: number;
}

export class BackupManager {
    private _backupRepoPath: string | undefined;
    private _commits: CommitInfo[] = [];

    constructor(private readonly _context: vscode.ExtensionContext) {}

    get commits(): CommitInfo[] {
        return this._commits;
    }

    async initializeBackupRepo(): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {return;}

            const storagePath = this._context.storageUri?.fsPath;
            if (!storagePath) {
                debugError('BackupManager', 'No workspace storage available');
                return;
            }
            debugLog('BackupManager', `Workspace storage path: ${storagePath}`);
            this._backupRepoPath = path.join(storagePath, 'backups', '.git');
            debugLog('BackupManager', `Backup repo path: ${this._backupRepoPath}`);

            // Create backup git directory if it doesn't exist
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(this._backupRepoPath));
                debugLog('BackupManager', 'Backup repository already exists');
            } catch {
                debugLog('BackupManager', 'Creating new backup repository...');

                // Ensure parent directory exists first
                const backupsDir = path.dirname(this._backupRepoPath);
                try {
                    await vscode.workspace.fs.createDirectory(vscode.Uri.file(backupsDir));
                    debugLog('BackupManager', `Created backups directory: ${backupsDir}`);
                } catch (e) {
                    // Directory might already exist
                }

                await vscode.workspace.fs.createDirectory(vscode.Uri.file(this._backupRepoPath));
                debugLog('BackupManager', `Created .git directory: ${this._backupRepoPath}`);

                const workspacePath = workspaceFolder.uri.fsPath;
                debugLog('BackupManager', `Workspace path: ${workspacePath}`);

                // Initialize git repo with workspace as work-tree
                debugLog('BackupManager', `Running init command: git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" init`);
                await execFile('git', ['--git-dir', this._backupRepoPath, '--work-tree', workspacePath, 'init']);

                await execFile('git', ['--git-dir', this._backupRepoPath, 'config', 'user.name', 'Claude Code Chat']);
                await execFile('git', ['--git-dir', this._backupRepoPath, 'config', 'user.email', 'claude@anthropic.com']);

                debugLog('BackupManager', `Initialized backup repository at: ${this._backupRepoPath}`);
            }

            await this.ensureExcludes(workspaceFolder.uri.fsPath);
        } catch (error: any) {
            debugError('BackupManager', `Failed to initialize backup repository: ${error.message}`);
        }
    }

    async createBackupCommit(userMessage: string): Promise<CommitInfo | undefined> {
        try {
            debugLog('BackupManager', `Creating backup commit for message: ${userMessage.substring(0, 50)}`);
            const shortMessage = `${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;
            const commit = await this._snapshot(`Before: ${shortMessage}`, `Initial backup: ${shortMessage}`);
            if (commit) {
                return commit;
            }
            // Nothing changed since the last snapshot, so that snapshot already is the
            // state before this message: offer it as the checkpoint. Without this the
            // restore button only appeared when files had changed (and used to show up
            // almost always only because the debug log changed on every message).
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspacePath || !this._backupRepoPath) {
                return undefined;
            }
            const headSha = (await this._git(workspacePath, ['rev-parse', 'HEAD'])).trim();
            debugLog('BackupManager', `No changes since last snapshot, reusing HEAD as checkpoint: ${headSha}`);
            return {
                id: `commit-${new Date().toISOString().replace(/[:.]/g, '-')}`,
                sha: headSha,
                message: `Before: ${shortMessage}`,
                timestamp: new Date().toISOString()
            };
        } catch (error: any) {
            debugError('BackupManager', `Failed to create backup commit: ${error.message}`, error);
            return undefined;
        }
    }

    /**
     * Commit the current workspace state to the backup repo.
     * Throws on git failures (callers decide whether that is fatal).
     * @returns The new commit, or undefined when nothing changed since HEAD (or no workspace)
     */
    private async _snapshot(commitMessage: string, firstCommitMessage: string): Promise<CommitInfo | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder || !this._backupRepoPath) {
            debugLog('BackupManager', 'No workspace folder or backup repo path');
            return undefined;
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        const displayTimestamp = now.toISOString();

        await this.ensureExcludes(workspacePath);

        // Add all files using git-dir and work-tree (excludes .git automatically)
        debugLog('BackupManager', `Running add command: git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" add -A`);
        await execFile('git', ['--git-dir', this._backupRepoPath, '--work-tree', workspacePath, 'add', '-A']);

        // Check if this is the first commit (no HEAD exists yet)
        let isFirstCommit = false;
        try {
            debugLog('BackupManager', `Checking for HEAD: git --git-dir="${this._backupRepoPath}" rev-parse HEAD`);
            await execFile('git', ['--git-dir', this._backupRepoPath, 'rev-parse', 'HEAD']);
        } catch (e) {
            debugLog('BackupManager', 'No HEAD found, this is the first commit');
            isFirstCommit = true;
        }

        // Check if there are changes to commit
        debugLog('BackupManager', `Running status command: git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" status --porcelain`);
        const { stdout: status } = await execFile('git', ['--git-dir', this._backupRepoPath, '--work-tree', workspacePath, 'status', '--porcelain']);

        debugLog('BackupManager', 'Git status check', {
            isFirstCommit,
            hasChanges: !!status.trim(),
            statusOutput: status,
            statusLength: status.length,
            workspacePath: workspacePath,
            backupRepoPath: this._backupRepoPath
        });

        // Only create a commit if there are actual changes or if it's the very first backup.
        if (isFirstCommit || status.trim()) {
            const actualMessage = isFirstCommit ? firstCommitMessage : commitMessage;

            // Create commit - use execFile to prevent shell injection via actualMessage
            debugLog('BackupManager', `Running commit command: git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" commit -m "${actualMessage}"`);
            await execFile('git', ['--git-dir', this._backupRepoPath, '--work-tree', workspacePath, 'commit', '-m', actualMessage]);

            debugLog('BackupManager', `Getting commit SHA: git --git-dir="${this._backupRepoPath}" rev-parse HEAD`);
            const { stdout: sha } = await execFile('git', ['--git-dir', this._backupRepoPath, 'rev-parse', 'HEAD']);

            // Store commit info
            const commitInfo: CommitInfo = {
                id: `commit-${timestamp}`,
                sha: sha.trim(),
                message: actualMessage,
                timestamp: displayTimestamp
            };

            this._commits.push(commitInfo);

            debugLog('BackupManager', 'Created backup commit', commitInfo);
            debugLog('BackupManager', `Total commits stored: ${this._commits.length}`);
            return commitInfo;
        } else {
            debugLog('BackupManager', 'No changes detected, skipping backup commit.');
            return undefined;
        }
    }

    /**
     * Keep BACKUP_EXCLUDES out of snapshots: list them in the backup repo's
     * info/exclude, and untrack them if an older snapshot already tracks them
     * (exclude rules do not apply to tracked files). `rm --cached` only touches
     * the backup repo's index; the workspace files stay on disk.
     */
    private async ensureExcludes(workspacePath: string): Promise<void> {
        if (!this._backupRepoPath) {
            return;
        }
        try {
            const excludePath = path.join(this._backupRepoPath, 'info', 'exclude');
            const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
            const lines = existing.split(/\r?\n/).map(l => l.trim());
            const missing = BACKUP_EXCLUDES.filter(p => !lines.includes(p));
            if (missing.length > 0) {
                fs.mkdirSync(path.dirname(excludePath), { recursive: true });
                const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
                fs.appendFileSync(excludePath, prefix + missing.join('\n') + '\n');
                debugLog('BackupManager', 'Added backup excludes', { missing });
            }

            await execFile('git', [
                '--git-dir', this._backupRepoPath, '--work-tree', workspacePath,
                'rm', '--cached', '--ignore-unmatch', '-q', '--', ...BACKUP_EXCLUDES
            ], { cwd: workspacePath });
        } catch (error: any) {
            debugError('BackupManager', `Failed to apply backup excludes: ${error.message}`);
        }
    }

    /**
     * Run a git command against the backup repo with the workspace as work tree.
     * cwd is the workspace so relative pathspecs resolve against its root.
     */
    private async _git(workspacePath: string, args: string[], extraEnv?: Record<string, string>): Promise<string> {
        const { stdout } = await execFile('git', ['--git-dir', this._backupRepoPath!, '--work-tree', workspacePath, ...args], {
            cwd: workspacePath,
            maxBuffer: GIT_MAX_BUFFER,
            env: extraEnv ? { ...process.env, ...extraEnv } : undefined
        });
        return stdout;
    }

    /**
     * Look the checkpoint up in git itself (not the in-memory list, which is empty
     * after a restart even though the snapshot still exists).
     */
    private async _resolveCommit(workspacePath: string, commitSha: string): Promise<CommitInfo> {
        if (typeof commitSha !== 'string' || !SHA_PATTERN.test(commitSha)) {
            throw new Error('Invalid checkpoint id');
        }
        try {
            await this._git(workspacePath, ['cat-file', '-e', `${commitSha}^{commit}`]);
        } catch {
            throw new Error('Checkpoint not found in the backup repository');
        }
        const out = await this._git(workspacePath, ['log', '-1', '--format=%H%x00%cI%x00%s', commitSha]);
        const [sha, date, subject] = out.trim().split('\0');
        return { id: `commit-${sha}`, sha, message: subject || sha.substring(0, 8), timestamp: date };
    }

    /**
     * Compare the current workspace (non-ignored files) with a snapshot.
     * Stages the workspace into a temporary index (GIT_INDEX_FILE) so the backup
     * repo's real index is not touched, then diffs the snapshot tree against it.
     */
    private async _computeChanges(workspacePath: string, commit: CommitInfo): Promise<RestorePreview> {
        const tmpIndex = path.join(os.tmpdir(),
            `claude-chatui-restore-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.index`);
        const realIndex = path.join(this._backupRepoPath!, 'index');
        try {
            // Start from the real index so `add -A` can reuse cached stat info (fast on big workspaces)
            if (fs.existsSync(realIndex)) {
                fs.copyFileSync(realIndex, tmpIndex);
            }
            const env = { GIT_INDEX_FILE: tmpIndex };
            await this._git(workspacePath, ['add', '-A'], env);
            const currentTree = (await this._git(workspacePath, ['write-tree'], env)).trim();
            const raw = await this._git(workspacePath, ['diff-tree', '-r', '-z', '--no-renames', commit.sha, currentTree]);

            const preview: RestorePreview = { commit, overwrite: [], remove: [], skipped: [] };
            // Raw -z format: ":<srcMode> <dstMode> <srcSha> <dstSha> <status>\0<path>\0"
            const parts = raw.split('\0');
            for (let i = 0; i + 1 < parts.length; i += 2) {
                const meta = parts[i];
                const filePath = parts[i + 1];
                if (!meta.startsWith(':') || !filePath) {
                    continue;
                }
                const [srcMode, dstMode, , , status] = meta.slice(1).split(' ');
                // Never touch nested git repos (gitlinks)
                if (srcMode === GITLINK_MODE || dstMode === GITLINK_MODE) {
                    continue;
                }
                if (status === 'A') {
                    // Exists now, not in the snapshot: created after it
                    preview.remove.push(filePath);
                } else if (status === 'D') {
                    // In the snapshot, not in the current tree. If it is still on disk it is
                    // ignored now (e.g. debug_log.txt in old snapshots): leave it alone.
                    if (fs.existsSync(path.resolve(workspacePath, filePath))) {
                        preview.skipped.push(filePath);
                    } else {
                        preview.overwrite.push(filePath);
                    }
                } else {
                    preview.overwrite.push(filePath);
                }
            }
            return preview;
        } finally {
            fs.rmSync(tmpIndex, { force: true });
            fs.rmSync(`${tmpIndex}.lock`, { force: true });
        }
    }

    /**
     * Preview what restoring a checkpoint would change, for the confirmation dialog.
     * Throws when the checkpoint or backup repo is unavailable.
     */
    async previewRestore(commitSha: string): Promise<RestorePreview> {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspacePath || !this._backupRepoPath) {
            throw new Error('No workspace folder or backup repository available.');
        }
        const commit = await this._resolveCommit(workspacePath, commitSha);
        return this._computeChanges(workspacePath, commit);
    }

    /**
     * Write snapshot versions of the given files back to the workspace.
     * Chunked to stay under the Windows command-line limit; literal pathspecs so
     * names containing *, ? or : are not treated as patterns or magic.
     */
    private async _checkoutFiles(workspacePath: string, sha: string, files: string[]): Promise<void> {
        let chunk: string[] = [];
        let length = 0;
        const flush = async () => {
            if (chunk.length > 0) {
                await this._git(workspacePath, ['checkout', sha, '--', ...chunk], { GIT_LITERAL_PATHSPECS: '1' });
                chunk = [];
                length = 0;
            }
        };
        for (const file of files) {
            if (length + file.length > 8000) {
                await flush();
            }
            chunk.push(file);
            length += file.length + 3;
        }
        await flush();
    }

    /**
     * Delete files created after the snapshot. Only regular files/symlinks inside the
     * workspace are removed (never directories recursively); directories left empty
     * by the deletion are pruned.
     * @returns Number of deleted files
     */
    private _removeFiles(workspacePath: string, files: string[]): number {
        const root = path.resolve(workspacePath);
        const normalize = (p: string) => process.platform === 'win32' ? p.toLowerCase() : p;
        const rootPrefix = normalize(root.endsWith(path.sep) ? root : root + path.sep);
        let removed = 0;

        for (const file of files) {
            const abs = path.resolve(root, file);
            if (!normalize(abs).startsWith(rootPrefix)) {
                debugError('BackupManager', `Refusing to delete a path outside the workspace: ${file}`);
                continue;
            }
            try {
                if (fs.lstatSync(abs).isDirectory()) {
                    continue;
                }
                fs.unlinkSync(abs);
                removed++;
            } catch (error: any) {
                if (error?.code !== 'ENOENT') {
                    debugError('BackupManager', `Failed to delete ${file}: ${error.message}`);
                }
                continue;
            }

            // Prune parent directories that are now empty (rmdir fails on non-empty dirs)
            let dir = path.dirname(abs);
            while (normalize(dir).startsWith(rootPrefix)) {
                try {
                    fs.rmdirSync(dir);
                } catch {
                    break;
                }
                dir = path.dirname(dir);
            }
        }
        return removed;
    }

    /**
     * Restore workspace files to a checkpoint.
     * 1. Snapshot the current state first ("Before restore") so the restore can be undone
     * 2. Write back files that differ from the checkpoint (ignored files are never touched)
     * 3. Delete files created after the checkpoint
     */
    async restoreToCommit(commitSha: string): Promise<RestoreResult> {
        try {
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspacePath || !this._backupRepoPath) {
                return { success: false, message: 'No workspace folder or backup repository available.' };
            }

            const target = await this._resolveCommit(workspacePath, commitSha);

            // A failed safety snapshot aborts the restore (_snapshot throws).
            // No new commit means nothing changed since HEAD, so HEAD is the undo point.
            const label = `Before restore: ${target.message}`.substring(0, 100);
            const before = await this._snapshot(label, label);
            const undoSha = before
                ? before.sha
                : (await this._git(workspacePath, ['rev-parse', 'HEAD'])).trim();

            const changes = await this._computeChanges(workspacePath, target);
            await this._checkoutFiles(workspacePath, target.sha, changes.overwrite);
            const removed = this._removeFiles(workspacePath, changes.remove);

            debugLog('BackupManager', 'Restore completed', {
                target: target.sha,
                undoSha,
                overwritten: changes.overwrite.length,
                removed,
                skippedIgnored: changes.skipped.length
            });

            // No user-derived text here: the chat renders this string and it should stay plain
            let message = `Restored ${changes.overwrite.length} file(s) and deleted ${removed} file(s) created later`;
            if (changes.skipped.length > 0) {
                message += `. ${changes.skipped.length} file(s) now ignored by .gitignore were left untouched`;
            }
            vscode.window.showInformationMessage(`Restored to checkpoint: ${target.message}`);

            return {
                success: true,
                message,
                commit: target,
                undoSha,
                overwritten: changes.overwrite.length,
                removed
            };
        } catch (error: any) {
            debugError('BackupManager', `Failed to restore commit: ${error.message}`, error);
            vscode.window.showErrorMessage(`Failed to restore commit: ${error.message}`);
            return {
                success: false,
                message: `Failed to restore: ${error.message}`
            };
        }
    }
}