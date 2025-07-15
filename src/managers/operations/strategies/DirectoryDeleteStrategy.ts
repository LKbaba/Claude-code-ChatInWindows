/**
 * Directory Delete Operation Strategy
 * Handles deletion and restoration of directories
 */

import * as vscode from 'vscode';
import { Operation } from '../../../types/Operation';
import { BaseOperationStrategy } from '../BaseOperationStrategy';
import { OperationContext, OperationPreview, UndoRedoResult } from '../IOperationStrategy';

export class DirectoryDeleteStrategy extends BaseOperationStrategy {
    async previewUndo(operation: Operation): Promise<OperationPreview> {
        const warnings = operation.data.files 
            ? [] 
            : ['Directory structure not available - cannot fully restore'];
        
        return this.createBasicPreview(
            operation,
            `Will restore directory: ${operation.data.dirPath!}`,
            warnings
        );
    }

    async previewRedo(operation: Operation): Promise<OperationPreview> {
        return this.createBasicPreview(
            operation,
            `Will delete directory: ${operation.data.dirPath!}`
        );
    }

    async undo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const error = this.validateDirectoryPath(operation);
        if (error) return { success: false, message: error };

        const dirUri = vscode.Uri.file(operation.data.dirPath!);
        
        try {
            // Recreate the directory
            await Promise.resolve(vscode.workspace.fs.createDirectory(dirUri));
            
            // Restore files if available
            if (operation.data.files && Array.isArray(operation.data.files)) {
                for (const file of operation.data.files) {
                    if (file.path && file.content) {
                        const fileUri = vscode.Uri.file(file.path);
                        await Promise.resolve(vscode.workspace.fs.writeFile(
                            fileUri, 
                            Buffer.from(file.content, 'utf8')
                        ));
                    }
                }
            }
            
            return { 
                success: true, 
                message: `Directory restored: ${operation.data.dirPath!}` 
            };
        } catch (error: any) {
            return { 
                success: false, 
                message: `Failed to restore directory: ${error.message || 'Unknown error'}` 
            };
        }
    }

    async redo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const error = this.validateDirectoryPath(operation);
        if (error) return { success: false, message: error };

        const dirUri = vscode.Uri.file(operation.data.dirPath!);

        return this.executeWithErrorHandling(
            () => Promise.resolve(vscode.workspace.fs.delete(dirUri, { recursive: true })),
            `Directory deleted: ${operation.data.dirPath!}`,
            'Failed to delete directory'
        );
    }
}