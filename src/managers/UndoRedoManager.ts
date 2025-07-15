import * as vscode from 'vscode';
import { Operation, OperationType } from '../types/Operation';
import { OperationTracker } from './OperationTracker';
import { OperationStrategyRegistry } from './operations/OperationStrategyRegistry';
import { OperationContext, OperationPreview, UndoRedoResult } from './operations/IOperationStrategy';

// Re-export interfaces from IOperationStrategy
export { UndoRedoResult, OperationPreview } from './operations/IOperationStrategy';

/**
 * Manages undo and redo operations
 */
export class UndoRedoManager {
    private _backupDir: vscode.Uri | undefined;
    private readonly _strategyRegistry: OperationStrategyRegistry;
    private readonly _operationContext: OperationContext;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _operationTracker: OperationTracker
    ) {
        this._initializeBackupDir();
        this._strategyRegistry = new OperationStrategyRegistry();
        
        // Create operation context that will be passed to strategies
        this._operationContext = {
            backupDir: this._backupDir,
            backupFile: this._backupFile.bind(this),
            getBackupUri: this._getBackupUri.bind(this),
            operationTracker: this._operationTracker
        };
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

        const strategy = this._strategyRegistry.getStrategy(operation.type);
        if (!strategy) {
            return {
                operation,
                changes: `Unknown operation type: ${operation.type}`,
                cascadingOperations: [],
                warnings: ['No strategy found for this operation type']
            };
        }

        const preview = await strategy.previewUndo(operation);
        
        // Add cascading operations to the preview
        const cascading = this._operationTracker.getCascadingOperations(operationId, 'undo');
        if (cascading.length > 0) {
            preview.warnings.push(`This will also undo ${cascading.length} dependent operation(s)`);
        }
        preview.cascadingOperations = cascading;

        return preview;
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

        // Update context with current backup directory
        this._operationContext.backupDir = this._backupDir;

        // Get cascading operations
        const cascading = this._operationTracker.getCascadingOperations(operationId, 'undo');
        const allOperations = [...cascading, operation];

        // Undo in reverse order (newest first)
        const results: UndoRedoResult[] = [];
        for (const op of allOperations) {
            const strategy = this._strategyRegistry.getStrategy(op.type);
            if (!strategy) {
                results.push({ 
                    success: false, 
                    message: `No strategy found for operation type: ${op.type}` 
                });
                break;
            }

            const result = await strategy.undo(op, this._operationContext);
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
     * Preview what will happen if an operation is redone
     */
    async previewRedo(operationId: string): Promise<OperationPreview | null> {
        const operation = this._operationTracker.getOperation(operationId);
        if (!operation || !operation.undone) return null;

        const strategy = this._strategyRegistry.getStrategy(operation.type);
        if (!strategy) {
            return {
                operation,
                changes: `Unknown operation type: ${operation.type}`,
                cascadingOperations: [],
                warnings: ['No strategy found for this operation type']
            };
        }

        const preview = await strategy.previewRedo(operation);
        
        // Add cascading operations to the preview
        const cascading = this._operationTracker.getCascadingOperations(operationId, 'redo');
        if (cascading.length > 0) {
            preview.warnings.push(`This will also redo ${cascading.length} dependent operation(s)`);
        }
        preview.cascadingOperations = cascading;

        // Check for backup availability if needed
        if (operation.type === OperationType.FILE_CREATE && 
            !operation.data.content && 
            !await this._hasBackup(operation.id)) {
            preview.warnings.push('File content not available - cannot recreate');
        }

        return preview;
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

        // Update context with current backup directory
        this._operationContext.backupDir = this._backupDir;

        // Get cascading operations
        const cascading = this._operationTracker.getCascadingOperations(operationId, 'redo');
        const allOperations = [...cascading, operation];

        // Redo in order (oldest first)
        const results: UndoRedoResult[] = [];
        for (const op of allOperations) {
            const strategy = this._strategyRegistry.getStrategy(op.type);
            if (!strategy) {
                results.push({ 
                    success: false, 
                    message: `No strategy found for operation type: ${op.type}` 
                });
                break;
            }

            const result = await strategy.redo(op, this._operationContext);
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
     * Backup a file before modification
     */
    private async _backupFile(backupId: string, fileUri: vscode.Uri): Promise<string | undefined> {
        if (!this._backupDir) return undefined;

        try {
            const content = await vscode.workspace.fs.readFile(fileUri);
            const backupUri = vscode.Uri.joinPath(this._backupDir, backupId);
            await vscode.workspace.fs.writeFile(backupUri, content);
            return backupUri.fsPath;
        } catch (error: any) {
            // Don't log error for missing files - this is expected when undoing file creation
            if (error.code !== 'FileNotFound' && error.code !== 'EntryNotFound') {
                console.error('Failed to backup file:', error);
            }
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