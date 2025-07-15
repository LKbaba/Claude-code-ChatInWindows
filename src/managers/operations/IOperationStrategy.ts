/**
 * Operation Strategy Interface
 * Defines the contract for all operation type strategies
 */

import * as vscode from 'vscode';
import { Operation } from '../../types/Operation';
import { OperationTracker } from '../OperationTracker';

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
 * Context provided to strategies for performing operations
 */
export interface OperationContext {
    backupDir: vscode.Uri | undefined;
    backupFile: (id: string, uri: vscode.Uri) => Promise<string | undefined>;
    getBackupUri?: (id: string) => Promise<vscode.Uri | undefined>;
    operationTracker: OperationTracker;
}

/**
 * Strategy interface for operation type handlers
 */
export interface IOperationStrategy {
    /**
     * Preview what will happen if the operation is undone
     */
    previewUndo(operation: Operation): Promise<OperationPreview>;
    
    /**
     * Preview what will happen if the operation is redone
     */
    previewRedo(operation: Operation): Promise<OperationPreview>;
    
    /**
     * Perform the undo operation
     */
    undo(operation: Operation, context: OperationContext): Promise<UndoRedoResult>;
    
    /**
     * Perform the redo operation
     */
    redo(operation: Operation, context: OperationContext): Promise<UndoRedoResult>;
}