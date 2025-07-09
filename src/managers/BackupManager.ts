import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as util from 'util';

const exec = util.promisify(cp.exec);

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

    get commits(): CommitInfo[] {
        return this._commits;
    }

    async initializeBackupRepo(): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {return;}

            const storagePath = this._context.storageUri?.fsPath;
            if (!storagePath) {
                console.error('No workspace storage available');
                return;
            }
            console.log('[BackupManager] Workspace storage path:', storagePath);
            this._backupRepoPath = path.join(storagePath, 'backups', '.git');
            console.log('[BackupManager] Backup repo path:', this._backupRepoPath);

            // Create backup git directory if it doesn't exist
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(this._backupRepoPath));
                console.log('[BackupManager] Backup repository already exists');
            } catch {
                console.log('[BackupManager] Creating new backup repository...');
                
                // Ensure parent directory exists first
                const backupsDir = path.dirname(this._backupRepoPath);
                try {
                    await vscode.workspace.fs.createDirectory(vscode.Uri.file(backupsDir));
                    console.log('[BackupManager] Created backups directory:', backupsDir);
                } catch (e) {
                    // Directory might already exist
                }
                
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(this._backupRepoPath));
                console.log('[BackupManager] Created .git directory:', this._backupRepoPath);

                const workspacePath = workspaceFolder.uri.fsPath;
                console.log('[BackupManager] Workspace path:', workspacePath);

                // Initialize git repo with workspace as work-tree
                const initCmd = `git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" init`;
                console.log('[BackupManager] Running init command:', initCmd);
                await exec(initCmd);
                
                await exec(`git --git-dir="${this._backupRepoPath}" config user.name "Claude Code Chat"`);
                await exec(`git --git-dir="${this._backupRepoPath}" config user.email "claude@anthropic.com"`);

                console.log(`[BackupManager] Initialized backup repository at: ${this._backupRepoPath}`);
            }
        } catch (error: any) {
            console.error('Failed to initialize backup repository:', error.message);
        }
    }

    async createBackupCommit(userMessage: string): Promise<CommitInfo | undefined> {
        try {
            console.log('[BackupManager] Creating backup commit for message:', userMessage.substring(0, 50));
            
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder || !this._backupRepoPath) {
                console.log('[BackupManager] No workspace folder or backup repo path');
                return undefined;
            }

            const workspacePath = workspaceFolder.uri.fsPath;
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-');
            const displayTimestamp = now.toISOString();
            const commitMessage = `Before: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;

            // Add all files using git-dir and work-tree (excludes .git automatically)
            const addCmd = `git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" add -A`;
            console.log('[BackupManager] Running add command:', addCmd);
            await exec(addCmd);

            // Check if this is the first commit (no HEAD exists yet)
            let isFirstCommit = false;
            try {
                const headCmd = `git --git-dir="${this._backupRepoPath}" rev-parse HEAD`;
                console.log('[BackupManager] Checking for HEAD:', headCmd);
                await exec(headCmd);
            } catch (e) {
                console.log('[BackupManager] No HEAD found, this is the first commit');
                isFirstCommit = true;
            }

            // Check if there are changes to commit
            const statusCmd = `git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" status --porcelain`;
            console.log('[BackupManager] Running status command:', statusCmd);
            const { stdout: status } = await exec(statusCmd);
            
            console.log('[BackupManager] Git status check:', {
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

                // Create commit
                const commitCmd = `git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" commit -m "${actualMessage}"`;
                console.log('[BackupManager] Running commit command:', commitCmd);
                await exec(commitCmd);
                
                const shaCmd = `git --git-dir="${this._backupRepoPath}" rev-parse HEAD`;
                console.log('[BackupManager] Getting commit SHA:', shaCmd);
                const { stdout: sha } = await exec(shaCmd);

                // Store commit info
                const commitInfo: CommitInfo = {
                    id: `commit-${timestamp}`,
                    sha: sha.trim(),
                    message: actualMessage,
                    timestamp: displayTimestamp
                };

                this._commits.push(commitInfo);

                console.log(`[BackupManager] Created backup commit:`, commitInfo);
                console.log(`[BackupManager] Total commits stored:`, this._commits.length);
                return commitInfo;
            } else {
                console.log('[BackupManager] No changes detected, skipping backup commit.');
                return undefined;
            }
        } catch (error: any) {
            console.error('[BackupManager] Failed to create backup commit:', error.message);
            console.error('[BackupManager] Full error:', error);
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
            await exec(`git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" checkout ${commitSha} -- .`);

            vscode.window.showInformationMessage(`Restored to commit: ${commit.message}`);

            return {
                success: true,
                message: `Successfully restored to: ${commit.message}`,
                commit: commit
            };

        } catch (error: any) {
            console.error('Failed to restore commit:', error.message);
            vscode.window.showErrorMessage(`Failed to restore commit: ${error.message}`);
            return {
                success: false,
                message: `Failed to restore: ${error.message}`
            };
        }
    }
}