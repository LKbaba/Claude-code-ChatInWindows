/**
 * File Delete Operation Strategy
 * Handles deletion and restoration of files
 */

import * as vscode from 'vscode';
import { Operation } from '../../../types/Operation';
import { BaseOperationStrategy } from '../BaseOperationStrategy';
import { OperationContext, OperationPreview, UndoRedoResult } from '../IOperationStrategy';

export class FileDeleteStrategy extends BaseOperationStrategy {
    async previewUndo(operation: Operation): Promise<OperationPreview> {
        const warnings = operation.data.content 
            ? [] 
            : ['File content not available - cannot restore'];
        
        return this.createBasicPreview(
            operation,
            `Will restore file: ${operation.data.filePath!}`,
            warnings
        );
    }

    async previewRedo(operation: Operation): Promise<OperationPreview> {
        return this.createBasicPreview(
            operation,
            `Will delete file: ${operation.data.filePath!}`
        );
    }

    async undo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const error = this.validateFilePath(operation);
        if (error) return { success: false, message: error };

        if (!operation.data.content) {
            return { 
                success: false, 
                message: 'Cannot restore file without content' 
            };
        }

        const fileUri = vscode.Uri.file(operation.data.filePath!);
        
        return this.executeWithErrorHandling(
            () => Promise.resolve(vscode.workspace.fs.writeFile(
                fileUri, 
                Buffer.from(operation.data.content!, 'utf8')
            )),
            `File restored: ${operation.data.filePath!}`,
            'Failed to restore file'
        );
    }

    async redo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const error = this.validateFilePath(operation);
        if (error) return { success: false, message: error };

        const fileUri = vscode.Uri.file(operation.data.filePath!);
        
        // Backup file before deletion
        const backupPath = await context.backupFile(operation.id, fileUri);

        return this.executeWithErrorHandling(
            () => Promise.resolve(vscode.workspace.fs.delete(fileUri)),
            `File deleted: ${operation.data.filePath!}`,
            'Failed to delete file',
            backupPath
        );
    }
}