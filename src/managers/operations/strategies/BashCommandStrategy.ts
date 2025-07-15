/**
 * Bash Command Operation Strategy
 * Handles bash/shell command operations
 */

import { Operation } from '../../../types/Operation';
import { BaseOperationStrategy } from '../BaseOperationStrategy';
import { OperationContext, OperationPreview, UndoRedoResult } from '../IOperationStrategy';

export class BashCommandStrategy extends BaseOperationStrategy {
    async previewUndo(operation: Operation): Promise<OperationPreview> {
        return this.createBasicPreview(
            operation,
            `Cannot auto-undo command: ${operation.data.command}`,
            ['Manual intervention required']
        );
    }

    async previewRedo(operation: Operation): Promise<OperationPreview> {
        return this.createBasicPreview(
            operation,
            `Cannot auto-redo command: ${operation.data.command}`,
            ['Manual intervention required']
        );
    }

    async undo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        // Bash commands cannot be automatically undone
        return { 
            success: false, 
            message: `Cannot automatically undo bash command: ${operation.data.command}. Manual intervention required.` 
        };
    }

    async redo(operation: Operation, context: OperationContext): Promise<UndoRedoResult> {
        // Bash commands cannot be automatically redone
        return { 
            success: false, 
            message: `Cannot automatically redo bash command: ${operation.data.command}. Manual intervention required.` 
        };
    }
}