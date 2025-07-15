import * as vscode from 'vscode';
import { Operation, OperationType, OperationData, OperationStatus } from '../types/Operation';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Manages operation tracking for undo/redo functionality
 */
export class OperationTracker {
  private _operations: Map<string, Operation> = new Map();
  private _operationsByMessage: Map<string, string[]> = new Map();
  private _operationsBySession: Map<string, string[]> = new Map();
  private _currentSessionId: string | undefined;
  private readonly _maxOperations = 1000; // Limit memory usage
  private _storageUri: vscode.Uri | undefined;
  private _workspaceId: string | undefined;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._storageUri = _context.globalStorageUri;
    this._workspaceId = this.calculateWorkspaceId();
    this.initializeStorage();
  }

  /**
   * Calculate a unique identifier for the current workspace
   */
  private calculateWorkspaceId(): string | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return undefined;
    }
    
    // Use workspace folder path as a unique identifier
    // Create a simple hash from the path to avoid file system issues
    const path = workspaceFolder.uri.fsPath;
    let hash = 0;
    for (let i = 0; i < path.length; i++) {
      const char = path.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  private async initializeStorage(): Promise<void> {
    if (this._storageUri) {
      try {
        await vscode.workspace.fs.createDirectory(this._storageUri);
      } catch (error) {
        console.error('Failed to create storage directory:', error);
      }
    }
  }

  /**
   * Set the current session ID
   */
  setCurrentSession(sessionId: string): void {
    this._currentSessionId = sessionId;
  }

  /**
   * Get the current workspace ID
   */
  getWorkspaceId(): string | undefined {
    return this._workspaceId;
  }

  /**
   * Track a new operation
   */
  trackOperation(
    type: OperationType,
    data: OperationData,
    messageId?: string,
    toolId?: string
  ): Operation {
    // For file delete operations, try to read the file content if not provided
    if (type === OperationType.FILE_DELETE && data.filePath && !data.content) {
      try {
        const fsSync = require('fs');
        if (fsSync.existsSync(data.filePath)) {
          data.content = fsSync.readFileSync(data.filePath, 'utf8');
          console.log(`[OperationTracker] Read content for file delete: ${data.filePath}, size: ${data.content?.length || 0}`);
        } else {
          console.warn(`[OperationTracker] File not found for delete operation: ${data.filePath}`);
        }
      } catch (error) {
        console.warn(`[OperationTracker] Error reading file for delete operation:`, error);
      }
    }
    
    const operation = new Operation(type, data, messageId);
    
    // Use tool ID if provided
    if (toolId) {
      operation.id = toolId;
    }
    
    operation.sessionId = this._currentSessionId;

    // Store operation
    this._operations.set(operation.id, operation);

    // Track by message
    if (messageId) {
      const messageOps = this._operationsByMessage.get(messageId) || [];
      messageOps.push(operation.id);
      this._operationsByMessage.set(messageId, messageOps);
    }

    // Track by session
    // IMPORTANT: Always track operations, even without a session ID
    // This ensures operations are visible before Claude establishes a session
    const sessionKey = this._currentSessionId || '__no_session__';
    const sessionOps = this._operationsBySession.get(sessionKey) || [];
    sessionOps.push(operation.id);
    this._operationsBySession.set(sessionKey, sessionOps);

    // Establish dependencies
    this.establishDependencies(operation);

    // Cleanup old operations if needed
    this.cleanupOldOperations();

    // Emit event
    this.emitOperationTracked(operation);

    return operation;
  }

  /**
   * Establish dependencies between operations
   */
  private establishDependencies(newOperation: Operation): void {
    if (!this._currentSessionId) return;

    const sessionOps = this._operationsBySession.get(this._currentSessionId) || [];
    
    // For file operations, establish dependencies based on file paths
    if (newOperation.data.filePath) {
      for (const opId of sessionOps) {
        const op = this._operations.get(opId);
        if (!op || op.id === newOperation.id || op.undone) continue;

        // If operating on the same file
        if (op.data.filePath === newOperation.data.filePath) {
          // New operation depends on previous operations on the same file
          if (op.timestamp < newOperation.timestamp) {
            newOperation.dependsOn.push(op.id);
            op.dependencies.push(newOperation.id);
          }
        }

        // If a file was renamed, track dependencies
        if (op.type === OperationType.FILE_RENAME && 
            op.data.newPath === newOperation.data.filePath) {
          newOperation.dependsOn.push(op.id);
          op.dependencies.push(newOperation.id);
        }
      }
    }

    // For directory operations
    if (newOperation.data.dirPath) {
      for (const opId of sessionOps) {
        const op = this._operations.get(opId);
        if (!op || op.id === newOperation.id || op.undone) continue;

        // Check if file operations are within this directory
        if (op.data.filePath && 
            op.data.filePath.startsWith(newOperation.data.dirPath + path.sep)) {
          // File operations depend on directory creation
          if (newOperation.type === OperationType.DIRECTORY_CREATE) {
            op.dependsOn.push(newOperation.id);
            newOperation.dependencies.push(op.id);
          }
          // Directory deletion depends on file operations
          else if (newOperation.type === OperationType.DIRECTORY_DELETE) {
            newOperation.dependsOn.push(op.id);
            op.dependencies.push(newOperation.id);
          }
        }
      }
    }
  }

  /**
   * Get operation by ID
   */
  getOperation(operationId: string): Operation | undefined {
    return this._operations.get(operationId);
  }

  /**
   * Get operations for a message
   */
  getOperationsByMessage(messageId: string): Operation[] {
    const opIds = this._operationsByMessage.get(messageId) || [];
    return opIds
      .map(id => this._operations.get(id))
      .filter((op): op is Operation => op !== undefined);
  }

  /**
   * Get operations for current session
   */
  getCurrentSessionOperations(): Operation[] {
    // Get operations for current session or no session
    const sessionKey = this._currentSessionId || '__no_session__';
    const sessionOps = this._operationsBySession.get(sessionKey) || [];
    
    // Also include operations without any session if we have a current session
    // This handles the case where operations were tracked before session was established
    const noSessionOps = this._currentSessionId ? 
      (this._operationsBySession.get('__no_session__') || []) : [];
    
    // Combine both sets of operation IDs
    const allOpIds = [...new Set([...sessionOps, ...noSessionOps])];
    
    return allOpIds
      .map(id => this._operations.get(id))
      .filter((op): op is Operation => op !== undefined)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get active (not undone) operations
   */
  getActiveOperations(): Operation[] {
    return this.getCurrentSessionOperations().filter(op => op.status === OperationStatus.ACTIVE);
  }

  /**
   * Get undone operations that can be redone
   */
  getUndoneOperations(): Operation[] {
    return this.getCurrentSessionOperations().filter(op => op.status === OperationStatus.UNDONE);
  }

  /**
   * Mark operation as undone
   */
  markAsUndone(operationId: string): void {
    const operation = this._operations.get(operationId);
    if (operation) {
      operation.status = OperationStatus.UNDONE;
      operation.undone = true; // 保留向后兼容
      this.emitOperationChanged(operation);
    }
  }

  /**
   * Mark operation as redone
   */
  markAsRedone(operationId: string): void {
    const operation = this._operations.get(operationId);
    if (operation) {
      operation.status = OperationStatus.ACTIVE;
      operation.undone = false; // 保留向后兼容
      this.emitOperationChanged(operation);
    }
  }

  /**
   * Mark operation as failed
   */
  markAsFailed(operationId: string, error: string): void {
    const operation = this._operations.get(operationId);
    if (operation) {
      operation.status = OperationStatus.FAILED;
      operation.error = error;
      this.emitOperationChanged(operation);
    }
  }

  /**
   * Get operations that would be affected by undoing/redoing an operation
   */
  getCascadingOperations(operationId: string, action: 'undo' | 'redo'): Operation[] {
    const operation = this._operations.get(operationId);
    if (!operation) return [];

    const affected: Set<string> = new Set();
    const toProcess: string[] = [operationId];

    while (toProcess.length > 0) {
      const currentId = toProcess.pop()!;
      if (affected.has(currentId)) continue;
      
      affected.add(currentId);
      const current = this._operations.get(currentId);
      if (!current) continue;

      if (action === 'undo') {
        // When undoing, all operations that depend on this one must also be undone
        for (const depId of current.dependencies) {
          const dep = this._operations.get(depId);
          if (dep && !dep.undone) {
            toProcess.push(depId);
          }
        }
      } else {
        // When redoing, all operations this depends on must be redone first
        for (const depId of current.dependsOn) {
          const dep = this._operations.get(depId);
          if (dep && dep.undone) {
            toProcess.push(depId);
          }
        }
      }
    }

    affected.delete(operationId); // Remove the original operation
    return Array.from(affected)
      .map(id => this._operations.get(id))
      .filter((op): op is Operation => op !== undefined)
      .sort((a, b) => {
        // For undo: newer operations first
        // For redo: older operations first
        return action === 'undo' 
          ? b.timestamp.getTime() - a.timestamp.getTime()
          : a.timestamp.getTime() - b.timestamp.getTime();
      });
  }

  /**
   * Clean up old operations to prevent memory bloat
   */
  private cleanupOldOperations(): void {
    if (this._operations.size <= this._maxOperations) return;

    // Get all operations sorted by timestamp
    const allOps = Array.from(this._operations.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Remove oldest operations
    const toRemove = allOps.slice(0, allOps.length - this._maxOperations);
    
    for (const op of toRemove) {
      this._operations.delete(op.id);
      
      // Clean up references
      if (op.messageId) {
        const messageOps = this._operationsByMessage.get(op.messageId);
        if (messageOps) {
          const filtered = messageOps.filter(id => id !== op.id);
          if (filtered.length > 0) {
            this._operationsByMessage.set(op.messageId, filtered);
          } else {
            this._operationsByMessage.delete(op.messageId);
          }
        }
      }

      if (op.sessionId) {
        const sessionOps = this._operationsBySession.get(op.sessionId);
        if (sessionOps) {
          const filtered = sessionOps.filter(id => id !== op.id);
          if (filtered.length > 0) {
            this._operationsBySession.set(op.sessionId, filtered);
          } else {
            this._operationsBySession.delete(op.sessionId);
          }
        }
      }
    }
  }

  /**
   * Save operations to disk
   */
  async saveOperations(): Promise<void> {
    if (!this._storageUri || !this._workspaceId) return;

    try {
      const data = {
        operations: Array.from(this._operations.entries()),
        operationsByMessage: Array.from(this._operationsByMessage.entries()),
        operationsBySession: Array.from(this._operationsBySession.entries()),
        currentSessionId: this._currentSessionId,
        workspaceId: this._workspaceId
      };

      // Use workspace-specific filename
      const filename = `operations-${this._workspaceId}.json`;
      const filePath = vscode.Uri.joinPath(this._storageUri, filename);
      await vscode.workspace.fs.writeFile(
        filePath,
        Buffer.from(JSON.stringify(data, null, 2))
      );
    } catch (error) {
      console.error('Failed to save operations:', error);
    }
  }

  /**
   * Load operations from disk
   */
  async loadOperations(): Promise<void> {
    if (!this._storageUri || !this._workspaceId) return;

    try {
      // Use workspace-specific filename
      const filename = `operations-${this._workspaceId}.json`;
      const filePath = vscode.Uri.joinPath(this._storageUri, filename);
      const content = await vscode.workspace.fs.readFile(filePath);
      const data = JSON.parse(content.toString());

      // Verify workspace ID matches
      if (data.workspaceId !== this._workspaceId) {
        console.warn('Workspace ID mismatch in operations file');
        return;
      }

      // Restore operations
      this._operations.clear();
      for (const [id, opData] of data.operations || []) {
        this._operations.set(id, Operation.fromJSON(opData));
      }

      // Restore indexes
      this._operationsByMessage = new Map(data.operationsByMessage || []);
      this._operationsBySession = new Map(data.operationsBySession || []);
      this._currentSessionId = data.currentSessionId;
    } catch (error) {
      // File might not exist yet
      console.log(`No saved operations found for workspace ${this._workspaceId}`);
    }
  }

  /**
   * Clear all operations
   */
  clearOperations(): void {
    this._operations.clear();
    this._operationsByMessage.clear();
    this._operationsBySession.clear();
  }

  /**
   * Emit operation tracked event
   */
  private emitOperationTracked(operation: Operation): void {
    vscode.commands.executeCommand('claude-code-chat.operationTracked', operation);
  }

  /**
   * Emit operation changed event
   */
  private emitOperationChanged(operation: Operation): void {
    vscode.commands.executeCommand('claude-code-chat.operationChanged', operation);
  }
}