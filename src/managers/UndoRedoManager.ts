import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Operation, OperationType } from '../types/Operation';
import { OperationTracker } from './OperationTracker';

/**
 * Result of an undo/redo operation
 */
export interface UndoRedoResult {
    success: boolean;
    message: string;
    backupPath?: string;
    affectedOperations?: Operation[];
}

/**
 * Preview of changes that will occur
 */
export interface OperationPreview {
    operation: Operation;
    changes: string;
    cascadingOperations: Operation[];
    warnings: string[];
}

/**
 * Manages undo and redo operations
 */
export class UndoRedoManager {
    private _backupDir: vscode.Uri | undefined;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _operationTracker: OperationTracker
    ) {
        this._initializeBackupDir();
    }

    private async _initializeBackupDir(): Promise<void> {
        if (this._context.globalStorageUri) {
            this._backupDir = vscode.Uri.joinPath(this._context.globalStorageUri, 'operation-backups');
            try {
                await vscode.workspace.fs.createDirectory(this._backupDir);
            } catch (error) {
                console.error('Failed to create backup directory:', error);
            }
        }
    }

    /**
     * Preview what will happen if an operation is undone
     */
    async previewUndo(operationId: string): Promise<OperationPreview | null> {
        const operation = this._operationTracker.getOperation(operationId);
        if (!operation || operation.undone) return null;

        const cascading = this._operationTracker.getCascadingOperations(operationId, 'undo');
        const warnings: string[] = [];
        let changes = '';

        // Generate preview based on operation type
        switch (operation.type) {
            case OperationType.FILE_CREATE:
                changes = `Will delete file: ${operation.data.filePath}`;
                break;

            case OperationType.FILE_EDIT:
            case OperationType.MULTI_EDIT:
                changes = await this._previewFileEditUndo(operation);
                break;

            case OperationType.FILE_DELETE:
                changes = `Will restore file: ${operation.data.filePath}`;
                if (!operation.data.content) {
                    warnings.push('File content not available - cannot restore');
                }
                break;

            case OperationType.FILE_RENAME:
                changes = `Will rename back: ${operation.data.newPath} → ${operation.data.oldPath}`;
                break;

            case OperationType.DIRECTORY_CREATE:
                changes = `Will remove directory: ${operation.data.dirPath}`;
                break;

            case OperationType.DIRECTORY_DELETE:
                changes = `Will restore directory: ${operation.data.dirPath}`;
                break;

            case OperationType.BASH_COMMAND:
                changes = `Cannot auto-undo command: ${operation.data.command}`;
                warnings.push('Manual intervention required');
                break;
        }

        if (cascading.length > 0) {
            warnings.push(`This will also undo ${cascading.length} dependent operation(s)`);
        }

        return {
            operation,
            changes,
            cascadingOperations: cascading,
            warnings
        };
    }

    /**
     * Preview file edit undo
     */
    private async _previewFileEditUndo(operation: Operation): Promise<string> {
        if (!operation.data.filePath) return 'No file path specified';

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath);
            const content = await vscode.workspace.fs.readFile(fileUri);
            const currentContent = content.toString();

            if (operation.type === OperationType.MULTI_EDIT && operation.data.edits) {
                // For multi-edit, show number of changes
                return `Will revert ${operation.data.edits.length} edit(s) in ${operation.data.filePath}`;
            } else if (operation.data.newString) {
                // For single edit, show what will be changed
                const preview = currentContent.includes(operation.data.newString)
                    ? `Will replace "${operation.data.newString}" with "${operation.data.oldString}"`
                    : 'Target string not found in current file';
                return preview;
            }

            return `Will revert changes to ${operation.data.filePath}`;
        } catch (error) {
            return `File not accessible: ${operation.data.filePath}`;
        }
    }

    /**
     * Undo an operation
     */
    async undo(operationId: string): Promise<UndoRedoResult> {
        const operation = this._operationTracker.getOperation(operationId);
        if (!operation) {
            return { success: false, message: 'Operation not found' };
        }

        if (operation.undone) {
            return { success: false, message: 'Operation already undone' };
        }

        // Get cascading operations
        const cascading = this._operationTracker.getCascadingOperations(operationId, 'undo');
        const allOperations = [...cascading, operation];

        // Undo in reverse order (newest first)
        const results: UndoRedoResult[] = [];
        for (const op of allOperations) {
            const result = await this._undoSingleOperation(op);
            results.push(result);
            
            if (result.success) {
                this._operationTracker.markAsUndone(op.id);
            } else {
                // Stop on first failure
                break;
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        return {
            success: failureCount === 0,
            message: `Undone ${successCount} operation(s)${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
            affectedOperations: allOperations
        };
    }

    /**
     * Undo a single operation
     */
    private async _undoSingleOperation(operation: Operation): Promise<UndoRedoResult> {
        switch (operation.type) {
            case OperationType.FILE_CREATE:
                return await this._undoFileCreate(operation);
            case OperationType.FILE_EDIT:
                return await this._undoFileEdit(operation);
            case OperationType.MULTI_EDIT:
                return await this._undoMultiEdit(operation);
            case OperationType.FILE_DELETE:
                return await this._undoFileDelete(operation);
            case OperationType.FILE_RENAME:
                return await this._undoFileRename(operation);
            case OperationType.DIRECTORY_CREATE:
                return await this._undoDirectoryCreate(operation);
            case OperationType.DIRECTORY_DELETE:
                return await this._undoDirectoryDelete(operation);
            case OperationType.BASH_COMMAND:
                return await this._undoBashCommand(operation);
            default:
                return { success: false, message: `Unknown operation type: ${operation.type}` };
        }
    }

    /**
     * Undo file creation
     */
    private async _undoFileCreate(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.filePath) {
            return { success: false, message: 'No file path specified' };
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath);
            
            // Backup file before deletion
            const backupPath = await this._backupFile(operation.id, fileUri);
            
            // Delete the file
            await vscode.workspace.fs.delete(fileUri);
            
            return {
                success: true,
                message: `File deleted: ${operation.data.filePath}`,
                backupPath
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to undo file creation: ${error.message}`
            };
        }
    }

    /**
     * Undo file edit
     */
    private async _undoFileEdit(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.filePath) {
            return { success: false, message: 'No file path specified' };
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath);
            const content = await vscode.workspace.fs.readFile(fileUri);
            let currentContent = content.toString();

            // Backup current state
            const backupPath = await this._backupFile(operation.id + '-current', fileUri);

            // Revert the edit
            if (operation.data.oldString !== undefined && operation.data.newString) {
                if (operation.data.replaceAll) {
                    currentContent = currentContent.split(operation.data.newString).join(operation.data.oldString);
                } else {
                    currentContent = currentContent.replace(operation.data.newString, operation.data.oldString);
                }
            } else {
                return {
                    success: false,
                    message: 'Insufficient data to undo edit'
                };
            }

            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(currentContent));

            return {
                success: true,
                message: `File edit reverted: ${operation.data.filePath}`,
                backupPath
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to undo file edit: ${error.message}`
            };
        }
    }

    /**
     * Undo multi-edit operation
     */
    private async _undoMultiEdit(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.filePath || !operation.data.edits) {
            return { success: false, message: 'No file path or edits specified' };
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath);
            const content = await vscode.workspace.fs.readFile(fileUri);
            let currentContent = content.toString();

            // Backup current state
            const backupPath = await this._backupFile(operation.id + '-current', fileUri);

            // Revert edits in reverse order
            for (let i = operation.data.edits.length - 1; i >= 0; i--) {
                const edit = operation.data.edits[i];
                if (edit.newString && edit.oldString !== undefined) {
                    if (currentContent.includes(edit.newString)) {
                        currentContent = currentContent.replace(edit.newString, edit.oldString);
                    }
                }
            }

            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(currentContent));

            return {
                success: true,
                message: `Multi-edit reverted: ${operation.data.filePath}`,
                backupPath
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to undo multi-edit: ${error.message}`
            };
        }
    }

    /**
     * Undo file deletion
     */
    private async _undoFileDelete(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.filePath) {
            return { success: false, message: 'No file path specified' };
        }

        if (!operation.data.content) {
            return {
                success: false,
                message: 'Cannot restore file: content not available'
            };
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath);
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(operation.data.content));

            return {
                success: true,
                message: `File restored: ${operation.data.filePath}`
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to restore file: ${error.message}`
            };
        }
    }

    /**
     * Undo file rename
     */
    private async _undoFileRename(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.oldPath || !operation.data.newPath) {
            return { success: false, message: 'Missing path information' };
        }

        try {
            const oldUri = vscode.Uri.file(operation.data.oldPath);
            const newUri = vscode.Uri.file(operation.data.newPath);
            
            await vscode.workspace.fs.rename(newUri, oldUri);

            return {
                success: true,
                message: `File renamed back: ${operation.data.newPath} → ${operation.data.oldPath}`
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to undo rename: ${error.message}`
            };
        }
    }

    /**
     * Undo directory creation
     */
    private async _undoDirectoryCreate(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.dirPath) {
            return { success: false, message: 'No directory path specified' };
        }

        try {
            const dirUri = vscode.Uri.file(operation.data.dirPath);
            await vscode.workspace.fs.delete(dirUri, { recursive: false });

            return {
                success: true,
                message: `Directory removed: ${operation.data.dirPath}`
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to remove directory: ${error.message}`
            };
        }
    }

    /**
     * Undo directory deletion
     */
    private async _undoDirectoryDelete(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.dirPath) {
            return { success: false, message: 'No directory path specified' };
        }

        try {
            const dirUri = vscode.Uri.file(operation.data.dirPath);
            await vscode.workspace.fs.createDirectory(dirUri);

            return {
                success: true,
                message: `Directory restored: ${operation.data.dirPath}`
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to restore directory: ${error.message}`
            };
        }
    }

    /**
     * Undo bash command
     */
    private async _undoBashCommand(operation: Operation): Promise<UndoRedoResult> {
        return {
            success: false,
            message: `Cannot auto-undo bash command: ${operation.data.command}\nManual intervention required.`
        };
    }

    /**
     * Preview what will happen if an operation is redone
     */
    async previewRedo(operationId: string): Promise<OperationPreview | null> {
        const operation = this._operationTracker.getOperation(operationId);
        if (!operation || !operation.undone) return null;

        const cascading = this._operationTracker.getCascadingOperations(operationId, 'redo');
        const warnings: string[] = [];
        let changes = '';

        // Generate preview based on operation type
        switch (operation.type) {
            case OperationType.FILE_CREATE:
                changes = `Will recreate file: ${operation.data.filePath}`;
                if (!operation.data.content && !this._hasBackup(operation.id)) {
                    warnings.push('File content not available - cannot recreate');
                }
                break;

            case OperationType.FILE_EDIT:
            case OperationType.MULTI_EDIT:
                changes = `Will reapply edit to: ${operation.data.filePath}`;
                break;

            case OperationType.FILE_DELETE:
                changes = `Will delete file again: ${operation.data.filePath}`;
                break;

            case OperationType.FILE_RENAME:
                changes = `Will rename again: ${operation.data.oldPath} → ${operation.data.newPath}`;
                break;

            case OperationType.DIRECTORY_CREATE:
                changes = `Will recreate directory: ${operation.data.dirPath}`;
                break;

            case OperationType.DIRECTORY_DELETE:
                changes = `Will delete directory again: ${operation.data.dirPath}`;
                break;

            case OperationType.BASH_COMMAND:
                changes = `Cannot auto-redo command: ${operation.data.command}`;
                warnings.push('Manual intervention required');
                break;
        }

        if (cascading.length > 0) {
            warnings.push(`This will also redo ${cascading.length} dependent operation(s)`);
        }

        return {
            operation,
            changes,
            cascadingOperations: cascading,
            warnings
        };
    }

    /**
     * Redo an operation
     */
    async redo(operationId: string): Promise<UndoRedoResult> {
        const operation = this._operationTracker.getOperation(operationId);
        if (!operation) {
            return { success: false, message: 'Operation not found' };
        }

        if (!operation.undone) {
            return { success: false, message: 'Operation not undone' };
        }

        // Get cascading operations
        const cascading = this._operationTracker.getCascadingOperations(operationId, 'redo');
        const allOperations = [...cascading, operation];

        // Redo in order (oldest first)
        const results: UndoRedoResult[] = [];
        for (const op of allOperations) {
            const result = await this._redoSingleOperation(op);
            results.push(result);
            
            if (result.success) {
                this._operationTracker.markAsRedone(op.id);
            } else {
                // Stop on first failure
                break;
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        return {
            success: failureCount === 0,
            message: `Redone ${successCount} operation(s)${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
            affectedOperations: allOperations
        };
    }

    /**
     * Redo a single operation
     */
    private async _redoSingleOperation(operation: Operation): Promise<UndoRedoResult> {
        switch (operation.type) {
            case OperationType.FILE_CREATE:
                return await this._redoFileCreate(operation);
            case OperationType.FILE_EDIT:
                return await this._redoFileEdit(operation);
            case OperationType.MULTI_EDIT:
                return await this._redoMultiEdit(operation);
            case OperationType.FILE_DELETE:
                return await this._redoFileDelete(operation);
            case OperationType.FILE_RENAME:
                return await this._redoFileRename(operation);
            case OperationType.DIRECTORY_CREATE:
                return await this._redoDirectoryCreate(operation);
            case OperationType.DIRECTORY_DELETE:
                return await this._redoDirectoryDelete(operation);
            case OperationType.BASH_COMMAND:
                return await this._redoBashCommand(operation);
            default:
                return { success: false, message: `Unknown operation type: ${operation.type}` };
        }
    }

    /**
     * Redo file creation
     */
    private async _redoFileCreate(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.filePath) {
            return { success: false, message: 'No file path specified' };
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath);
            
            // Check if file already exists
            try {
                await vscode.workspace.fs.stat(fileUri);
                return {
                    success: false,
                    message: `Cannot redo: file already exists at ${operation.data.filePath}`
                };
            } catch {
                // File doesn't exist, proceed
            }

            // Try to restore from backup or use original content
            let content = '';
            const backupUri = await this._getBackupUri(operation.id);
            if (backupUri) {
                try {
                    const backupContent = await vscode.workspace.fs.readFile(backupUri);
                    content = backupContent.toString();
                } catch {
                    // Backup not found
                }
            }

            if (!content && operation.data.content) {
                content = operation.data.content;
            }

            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content));

            return {
                success: true,
                message: `File recreated: ${operation.data.filePath}`
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to redo file creation: ${error.message}`
            };
        }
    }

    /**
     * Redo file edit
     */
    private async _redoFileEdit(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.filePath) {
            return { success: false, message: 'No file path specified' };
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath);
            const content = await vscode.workspace.fs.readFile(fileUri);
            let currentContent = content.toString();

            // Backup current state
            const backupPath = await this._backupFile(operation.id + '-redo', fileUri);

            // Reapply the edit
            if (operation.data.oldString !== undefined && operation.data.newString) {
                if (operation.data.replaceAll) {
                    currentContent = currentContent.split(operation.data.oldString).join(operation.data.newString);
                } else {
                    currentContent = currentContent.replace(operation.data.oldString, operation.data.newString);
                }
            } else {
                return {
                    success: false,
                    message: 'Insufficient data to redo edit'
                };
            }

            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(currentContent));

            return {
                success: true,
                message: `File edit redone: ${operation.data.filePath}`,
                backupPath
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to redo file edit: ${error.message}`
            };
        }
    }

    /**
     * Redo multi-edit operation
     */
    private async _redoMultiEdit(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.filePath || !operation.data.edits) {
            return { success: false, message: 'No file path or edits specified' };
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath);
            const content = await vscode.workspace.fs.readFile(fileUri);
            let currentContent = content.toString();

            // Backup current state
            const backupPath = await this._backupFile(operation.id + '-redo', fileUri);

            // Reapply edits in order
            for (const edit of operation.data.edits) {
                if (edit.oldString !== undefined && edit.newString) {
                    if (currentContent.includes(edit.oldString)) {
                        currentContent = currentContent.replace(edit.oldString, edit.newString);
                    }
                }
            }

            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(currentContent));

            return {
                success: true,
                message: `Multi-edit redone: ${operation.data.filePath}`,
                backupPath
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to redo multi-edit: ${error.message}`
            };
        }
    }

    /**
     * Redo file deletion
     */
    private async _redoFileDelete(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.filePath) {
            return { success: false, message: 'No file path specified' };
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath);
            
            // Check if file exists
            try {
                await vscode.workspace.fs.stat(fileUri);
            } catch {
                return {
                    success: false,
                    message: `Cannot redo deletion: file does not exist at ${operation.data.filePath}`
                };
            }

            // Backup before deletion
            const backupPath = await this._backupFile(operation.id + '-redo-deleted', fileUri);

            await vscode.workspace.fs.delete(fileUri);

            return {
                success: true,
                message: `File deleted again: ${operation.data.filePath}`,
                backupPath
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to redo file deletion: ${error.message}`
            };
        }
    }

    /**
     * Redo file rename
     */
    private async _redoFileRename(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.oldPath || !operation.data.newPath) {
            return { success: false, message: 'Missing path information' };
        }

        try {
            const oldUri = vscode.Uri.file(operation.data.oldPath);
            const newUri = vscode.Uri.file(operation.data.newPath);
            
            await vscode.workspace.fs.rename(oldUri, newUri);

            return {
                success: true,
                message: `File renamed again: ${operation.data.oldPath} → ${operation.data.newPath}`
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to redo rename: ${error.message}`
            };
        }
    }

    /**
     * Redo directory creation
     */
    private async _redoDirectoryCreate(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.dirPath) {
            return { success: false, message: 'No directory path specified' };
        }

        try {
            const dirUri = vscode.Uri.file(operation.data.dirPath);
            await vscode.workspace.fs.createDirectory(dirUri);

            return {
                success: true,
                message: `Directory created again: ${operation.data.dirPath}`
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to recreate directory: ${error.message}`
            };
        }
    }

    /**
     * Redo directory deletion
     */
    private async _redoDirectoryDelete(operation: Operation): Promise<UndoRedoResult> {
        if (!operation.data.dirPath) {
            return { success: false, message: 'No directory path specified' };
        }

        try {
            const dirUri = vscode.Uri.file(operation.data.dirPath);
            await vscode.workspace.fs.delete(dirUri, { recursive: false });

            return {
                success: true,
                message: `Directory deleted again: ${operation.data.dirPath}`
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to redo directory deletion: ${error.message}`
            };
        }
    }

    /**
     * Redo bash command
     */
    private async _redoBashCommand(operation: Operation): Promise<UndoRedoResult> {
        return {
            success: false,
            message: `Cannot auto-redo bash command: ${operation.data.command}\nPlease manually re-run the command.`
        };
    }

    /**
     * Backup a file before modification
     */
    private async _backupFile(backupId: string, fileUri: vscode.Uri): Promise<string | undefined> {
        if (!this._backupDir) return undefined;

        try {
            const content = await vscode.workspace.fs.readFile(fileUri);
            const backupUri = vscode.Uri.joinPath(this._backupDir, backupId);
            await vscode.workspace.fs.writeFile(backupUri, content);
            return backupUri.fsPath;
        } catch (error) {
            console.error('Failed to backup file:', error);
            return undefined;
        }
    }

    /**
     * Get backup URI for an operation
     */
    private async _getBackupUri(backupId: string): Promise<vscode.Uri | undefined> {
        if (!this._backupDir) return undefined;

        const backupUri = vscode.Uri.joinPath(this._backupDir, backupId);
        try {
            await vscode.workspace.fs.stat(backupUri);
            return backupUri;
        } catch {
            return undefined;
        }
    }

    /**
     * Check if backup exists
     */
    private async _hasBackup(backupId: string): Promise<boolean> {
        const backupUri = await this._getBackupUri(backupId);
        return backupUri !== undefined;
    }

    /**
     * Clean up old backups
     */
    async cleanupBackups(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
        if (!this._backupDir) return;

        try {
            const entries = await vscode.workspace.fs.readDirectory(this._backupDir);
            const now = Date.now();

            for (const [name, type] of entries) {
                if (type === vscode.FileType.File) {
                    const fileUri = vscode.Uri.joinPath(this._backupDir, name);
                    const stat = await vscode.workspace.fs.stat(fileUri);
                    
                    if (now - stat.mtime > olderThanMs) {
                        await vscode.workspace.fs.delete(fileUri);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to cleanup backups:', error);
        }
    }
}