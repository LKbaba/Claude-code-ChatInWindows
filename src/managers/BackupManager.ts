import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as util from 'util';
import { debugLog, debugError } from '../services/DebugLogger';

const execFile = util.promisify(cp.execFile);

// Backup is best-effort: a hung git call must never freeze the message-send
// pipeline. execFile's own `timeout` is not enough on Windows — when git
// leaves a background helper (fsmonitor daemon, credential manager) holding the
// stdout pipe open, Node never sees EOF and the promise never settles even
// after the child is killed. So we ALSO race every git call against a
// wall-clock timer that gives up regardless of whether the child ever exits.
const GIT_EXEC_OPTS: cp.ExecFileOptions = { timeout: 10000, windowsHide: true };
const GIT_WALL_CLOCK_MS = 12000;

export interface CommitInfo {
    id: string;
    sha: string;
    message: string;
    timestamp: string;
}

export class BackupManager {
    private _backupRepoPath: string | undefined;
    private _commits: CommitInfo[] = [];

    constructor(private readonly _context: vscode.ExtensionContext) {}

    /**
     * Run a git command with a hard wall-clock cap. Resolves/rejects regardless
     * of whether the spawned child (or a git background helper that inherited the
     * stdout pipe) ever exits, so a stuck git can never freeze the send pipeline.
     */
    private _git(args: string[]): Promise<{ stdout: string; stderr: string }> {
        const exec = execFile('git', args, GIT_EXEC_OPTS) as Promise<{ stdout: string; stderr: string }>;
        // Swallow a late rejection from a leaked, still-dying child so it can't
        // surface as an unhandled rejection after the wall-clock race gave up.
        exec.catch(() => { /* ignore */ });
        let timer: NodeJS.Timeout | undefined;
        const wall = new Promise<{ stdout: string; stderr: string }>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`git timed out after ${GIT_WALL_CLOCK_MS}ms: ${args.join(' ')}`)),
                GIT_WALL_CLOCK_MS
            );
        });
        return Promise.race([exec, wall]).finally(() => { if (timer) { clearTimeout(timer); } });
    }

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
                await this._git(['--git-dir', this._backupRepoPath, '--work-tree', workspacePath, 'init']);

                await this._git(['--git-dir', this._backupRepoPath, 'config', 'user.name', 'Claude Code Chat']);
                await this._git(['--git-dir', this._backupRepoPath, 'config', 'user.email', 'claude@anthropic.com']);

                debugLog('BackupManager', `Initialized backup repository at: ${this._backupRepoPath}`);
            }
        } catch (error: any) {
            debugError('BackupManager', `Failed to initialize backup repository: ${error.message}`);
        }
    }

    async createBackupCommit(userMessage: string): Promise<CommitInfo | undefined> {
        try {
            // Opt-in: the restore checkpoint is off by default (limited value in
            // practice + extra git latency). Only run when explicitly enabled.
            const backupEnabled = vscode.workspace.getConfiguration('claudeCodeChatUI').get<boolean>('backup.enabled', false);
            if (!backupEnabled) {
                debugLog('BackupManager', 'Backup disabled (claudeCodeChatUI.backup.enabled=false), skipping checkpoint');
                return undefined;
            }

            debugLog('BackupManager', `Creating backup commit for message: ${userMessage.substring(0, 50)}`);

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder || !this._backupRepoPath) {
                debugLog('BackupManager', 'No workspace folder or backup repo path');
                return undefined;
            }

            const workspacePath = workspaceFolder.uri.fsPath;
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-');
            const displayTimestamp = now.toISOString();
            const commitMessage = `Before: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;

            // Add all files using git-dir and work-tree (excludes .git automatically)
            debugLog('BackupManager', `Running add command: git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" add -A`);
            await this._git(['--git-dir', this._backupRepoPath, '--work-tree', workspacePath, 'add', '-A']);

            // Check if this is the first commit (no HEAD exists yet)
            let isFirstCommit = false;
            try {
                debugLog('BackupManager', `Checking for HEAD: git --git-dir="${this._backupRepoPath}" rev-parse HEAD`);
                await this._git(['--git-dir', this._backupRepoPath, 'rev-parse', 'HEAD']);
            } catch (e) {
                debugLog('BackupManager', 'No HEAD found, this is the first commit');
                isFirstCommit = true;
            }

            // Check if there are changes to commit
            debugLog('BackupManager', `Running status command: git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" status --porcelain`);
            const { stdout: status } = await this._git(['--git-dir', this._backupRepoPath, '--work-tree', workspacePath, 'status', '--porcelain']);

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
                let actualMessage;
                if (isFirstCommit) {
                    actualMessage = `Initial backup: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;
                } else {
                    actualMessage = commitMessage;
                }

                // Create commit - use execFile to prevent shell injection via actualMessage
                debugLog('BackupManager', `Running commit command: git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" commit -m "${actualMessage}"`);
                await this._git(['--git-dir', this._backupRepoPath, '--work-tree', workspacePath, 'commit', '-m', actualMessage]);

                debugLog('BackupManager', `Getting commit SHA: git --git-dir="${this._backupRepoPath}" rev-parse HEAD`);
                const { stdout: sha } = await this._git(['--git-dir', this._backupRepoPath, 'rev-parse', 'HEAD']);

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
        } catch (error: any) {
            debugError('BackupManager', `Failed to create backup commit: ${error.message}`, error);
            return undefined;
        }
    }

    async restoreToCommit(commitSha: string): Promise<{ success: boolean; message: string; commit?: CommitInfo }> {
        try {
            const commit = this._commits.find(c => c.sha === commitSha);
            if (!commit) {
                return { success: false, message: 'Commit not found' };
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder || !this._backupRepoPath) {
                return { success: false, message: 'No workspace folder or backup repository available.' };
            }

            const workspacePath = workspaceFolder.uri.fsPath;

            // Restore files directly to workspace using git checkout
            await this._git(['--git-dir', this._backupRepoPath, '--work-tree', workspacePath, 'checkout', commitSha, '--', '.']);

            vscode.window.showInformationMessage(`Restored to commit: ${commit.message}`);

            return {
                success: true,
                message: `Successfully restored to: ${commit.message}`,
                commit: commit
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