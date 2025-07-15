/**
 * Base Operation Strategy
 * Provides common functionality for all operation strategies
 */

import * as vscode from 'vscode';
import { Operation } from '../../types/Operation';
import { IOperationStrategy, OperationContext, OperationPreview, UndoRedoResult } from './IOperationStrategy';

export abstract class BaseOperationStrategy implements IOperationStrategy {
    abstract previewUndo(operation: Operation): Promise<OperationPreview>;
    abstract previewRedo(operation: Operation): Promise<OperationPreview>;
    abstract undo(operation: Operation, context: OperationContext): Promise<UndoRedoResult>;
    abstract redo(operation: Operation, context: OperationContext): Promise<UndoRedoResult>;

    /**
     * Validate that the operation has a file path
     */
    protected validateFilePath(operation: Operation): string | null {
        if (!operation.data.filePath) {
            return 'No file path specified';
        }
        return null;
    }

    /**
     * Validate that the operation has a directory path
     */
    protected validateDirectoryPath(operation: Operation): string | null {
        if (!operation.data.dirPath) {
            return 'No directory path specified';
        }
        return null;
    }

    /**
     * Validate that the operation has both old and new paths for rename
     */
    protected validateRenamePaths(operation: Operation): string | null {
        if (!operation.data.oldPath || !operation.data.newPath) {
            return 'Missing path information for rename operation';
        }
        return null;
    }

    /**
     * Execute an operation with standard error handling
     */
    protected async executeWithErrorHandling(
        operation: () => Promise<void>,
        successMessage: string,
        errorPrefix: string,
        backupPath?: string
    ): Promise<UndoRedoResult> {
        try {
            await operation();
            const result: UndoRedoResult = { 
                success: true, 
                message: successMessage 
            };
            if (backupPath) {
                result.backupPath = backupPath;
            }
            return result;
        } catch (error: any) {
            return { 
                success: false, 
                message: `${errorPrefix}: ${error.message || 'Unknown error'}` 
            };
        }
    }

    /**
     * Create a basic preview with no cascading operations
     */
    protected createBasicPreview(
        operation: Operation, 
        changes: string, 
        warnings: string[] = []
    ): OperationPreview {
        return {
            operation,
            changes,
            cascadingOperations: [],
            warnings
        };
    }

    /**
     * Replace content in a string
     */
    protected replaceContent(content: string, oldString: string, newString: string): string {
        // Escape special regex characters
        const escapedOld = oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return content.replace(new RegExp(escapedOld, 'g'), newString);
    }
}