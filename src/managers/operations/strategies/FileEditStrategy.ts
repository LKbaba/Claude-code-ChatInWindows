/**
 * File Edit Operation Strategy
 * Handles undo/redo for FILE_EDIT and MULTI_EDIT operations
 */

import * as vscode from 'vscode';
import { Operation, OperationType } from '../../../types/Operation';
import { BaseOperationStrategy } from '../BaseOperationStrategy';
import { OperationContext, OperationPreview, UndoRedoResult } from '../IOperationStrategy';

export class FileEditStrategy extends BaseOperationStrategy {
    /**
     * Preview what will happen if a file edit operation is undone
     */
    async previewUndo(operation: Operation): Promise<OperationPreview> {
        if (!operation.data.filePath) {
            return this.createBasicPreview(operation, 'No file path specified');
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath);
            const content = await vscode.workspace.fs.readFile(fileUri);
            const currentContent = content.toString();

            let changes: string;
            if (operation.type === OperationType.MULTI_EDIT && operation.data.edits) {
                // For multi-edit, show number of changes
                changes = `Will revert ${operation.data.edits.length} edit(s) in ${operation.data.filePath}`;
            } else if (operation.data.newString) {
                // For single edit, show what will be changed
                const preview = currentContent.includes(operation.data.newString)
                    ? `Will replace "${operation.data.newString}" with "${operation.data.oldString}"`
                    : 'Target string not found in current file';
                changes = preview;
            } else {
                changes = `Will revert changes to ${operation.data.filePath}`;
            }

            return this.createBasicPreview(operation, changes);
        } catch (error) {
            return this.createBasicPreview(
                operation, 
                `File not accessible: ${operation.data.filePath}`
            );
        }
    }

    /**
     * Preview what will happen if a file edit operation is redone
     */
    async previewRedo(operation: Operation): Promise<OperationPreview> {
        const filePath = operation.data.filePath || 'unknown file';
        const changes = `Will reapply edit to: ${filePath}`;
        return this.createBasicPreview(operation, changes);
    }

    /**
     * Undo a file edit operation
     */
    async undo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const validationError = this.validateFilePath(operation);
        if (validationError) {
            return { success: false, message: validationError };
        }

        if (operation.type === OperationType.MULTI_EDIT) {
            return this._undoMultiEdit(operation, context);
        } else {
            return this._undoFileEdit(operation, context);
        }
    }

    /**
     * Redo a file edit operation
     */
    async redo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        const validationError = this.validateFilePath(operation);
        if (validationError) {
            return { success: false, message: validationError };
        }

        if (operation.type === OperationType.MULTI_EDIT) {
            return this._redoMultiEdit(operation, context);
        } else {
            return this._redoFileEdit(operation, context);
        }
    }

    /**
     * Undo a single file edit
     */
    private async _undoFileEdit(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        try {
            const fileUri = vscode.Uri.file(operation.data.filePath!);
            const content = await vscode.workspace.fs.readFile(fileUri);
            let currentContent = content.toString();

            // Backup current state
            const backupPath = await context.backupFile(operation.id + '-current', fileUri);

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
     * Undo a multi-edit operation
     */
    private async _undoMultiEdit(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        if (!operation.data.edits) {
            return { success: false, message: 'No edits specified' };
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath!);
            const content = await vscode.workspace.fs.readFile(fileUri);
            let currentContent = content.toString();

            // Backup current state
            const backupPath = await context.backupFile(operation.id + '-current', fileUri);

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
     * Redo a single file edit
     */
    private async _redoFileEdit(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        try {
            const fileUri = vscode.Uri.file(operation.data.filePath!);
            const content = await vscode.workspace.fs.readFile(fileUri);
            let currentContent = content.toString();

            // Backup current state
            const backupPath = await context.backupFile(operation.id + '-redo', fileUri);

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
     * Redo a multi-edit operation
     */
    private async _redoMultiEdit(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        if (!operation.data.edits) {
            return { success: false, message: 'No edits specified' };
        }

        try {
            const fileUri = vscode.Uri.file(operation.data.filePath!);
            const content = await vscode.workspace.fs.readFile(fileUri);
            let currentContent = content.toString();

            // Backup current state
            const backupPath = await context.backupFile(operation.id + '-redo', fileUri);

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
}