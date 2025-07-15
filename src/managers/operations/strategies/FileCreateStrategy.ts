/**
 * File Create Operation Strategy
 * Handles creation and deletion of files
 */

import * as vscode from 'vscode';
import { Operation } from '../../../types/Operation';
import { BaseOperationStrategy } from '../BaseOperationStrategy';
import { OperationContext, OperationPreview, UndoRedoResult } from '../IOperationStrategy';

export class FileCreateStrategy extends BaseOperationStrategy {
    async previewUndo(operation: Operation): Promise<OperationPreview> {
        return this.createBasicPreview(
            operation,
            `Will delete file: ${operation.data.filePath!}`
        );
    }

    async previewRedo(operation: Operation): Promise<OperationPreview> {
        const warnings = operation.data.content 
            ? [] 
            : ['File content not available - cannot recreate file'];
        
        return this.createBasicPreview(
            operation,
            `Will recreate file: ${operation.data.filePath!}`,
            warnings
        );
    }

    async undo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
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

    async redo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const error = this.validateFilePath(operation);
        if (error) return { success: false, message: error };

        if (!operation.data.content) {
            return { 
                success: false, 
                message: 'Cannot recreate file without content' 
            };
        }

        const fileUri = vscode.Uri.file(operation.data.filePath!);
        
        return this.executeWithErrorHandling(
            () => Promise.resolve(vscode.workspace.fs.writeFile(
                fileUri, 
                Buffer.from(operation.data.content!, 'utf8')
            )),
            `File recreated: ${operation.data.filePath!}`,
            'Failed to recreate file'
        );
    }
}