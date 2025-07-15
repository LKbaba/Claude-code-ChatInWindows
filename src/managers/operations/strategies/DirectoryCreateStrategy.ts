/**
 * Directory Create Operation Strategy
 * Handles creation and removal of directories
 */

import * as vscode from 'vscode';
import { Operation } from '../../../types/Operation';
import { BaseOperationStrategy } from '../BaseOperationStrategy';
import { OperationContext, OperationPreview, UndoRedoResult } from '../IOperationStrategy';

export class DirectoryCreateStrategy extends BaseOperationStrategy {
    async previewUndo(operation: Operation): Promise<OperationPreview> {
        return this.createBasicPreview(
            operation,
            `Will remove directory: ${operation.data.dirPath!}`
        );
    }

    async previewRedo(operation: Operation): Promise<OperationPreview> {
        return this.createBasicPreview(
            operation,
            `Will recreate directory: ${operation.data.dirPath!}`
        );
    }

    async undo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const error = this.validateDirectoryPath(operation);
        if (error) return { success: false, message: error };

        const dirUri = vscode.Uri.file(operation.data.dirPath!);

        return this.executeWithErrorHandling(
            () => Promise.resolve(vscode.workspace.fs.delete(dirUri, { recursive: true })),
            `Directory removed: ${operation.data.dirPath!}`,
            'Failed to remove directory'
        );
    }

    async redo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const error = this.validateDirectoryPath(operation);
        if (error) return { success: false, message: error };

        const dirUri = vscode.Uri.file(operation.data.dirPath!);

        return this.executeWithErrorHandling(
            () => Promise.resolve(vscode.workspace.fs.createDirectory(dirUri)),
            `Directory recreated: ${operation.data.dirPath!}`,
            'Failed to recreate directory'
        );
    }
}