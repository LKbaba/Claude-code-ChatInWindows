/**
 * File Rename Operation Strategy
 * Handles renaming/moving of files
 */

import * as vscode from 'vscode';
import { Operation } from '../../../types/Operation';
import { BaseOperationStrategy } from '../BaseOperationStrategy';
import { OperationContext, OperationPreview, UndoRedoResult } from '../IOperationStrategy';

export class FileRenameStrategy extends BaseOperationStrategy {
    async previewUndo(operation: Operation): Promise<OperationPreview> {
        return this.createBasicPreview(
            operation,
            `Will rename back: ${operation.data.newPath!} → ${operation.data.oldPath!}`
        );
    }

    async previewRedo(operation: Operation): Promise<OperationPreview> {
        return this.createBasicPreview(
            operation,
            `Will rename: ${operation.data.oldPath!} → ${operation.data.newPath!}`
        );
    }

    async undo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const error = this.validateRenamePaths(operation);
        if (error) return { success: false, message: error };

        const oldUri = vscode.Uri.file(operation.data.newPath!);
        const newUri = vscode.Uri.file(operation.data.oldPath!);

        return this.executeWithErrorHandling(
            () => Promise.resolve(vscode.workspace.fs.rename(oldUri, newUri)),
            `File renamed back to: ${operation.data.oldPath!}`,
            'Failed to rename file back'
        );
    }

    async redo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const error = this.validateRenamePaths(operation);
        if (error) return { success: false, message: error };

        const oldUri = vscode.Uri.file(operation.data.oldPath!);
        const newUri = vscode.Uri.file(operation.data.newPath!);

        return this.executeWithErrorHandling(
            () => Promise.resolve(vscode.workspace.fs.rename(oldUri, newUri)),
            `File renamed to: ${operation.data.newPath!}`,
            'Failed to rename file'
        );
    }
}