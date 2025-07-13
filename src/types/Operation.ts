/**
 * Operation types supported by the undo/redo system
 */
export enum OperationType {
  FILE_CREATE = 'file_create',
  FILE_EDIT = 'file_edit',
  FILE_DELETE = 'file_delete',
  FILE_RENAME = 'file_rename',
  DIRECTORY_CREATE = 'directory_create',
  DIRECTORY_DELETE = 'directory_delete',
  BASH_COMMAND = 'bash_command',
  MULTI_EDIT = 'multi_edit'
}

/**
 * Represents a single edit operation within a file
 */
export interface EditOperation {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

/**
 * Data structure for different operation types
 */
export interface OperationData {
  // Common fields
  filePath?: string;
  
  // For FILE_CREATE and FILE_DELETE
  content?: string;
  
  // For FILE_EDIT
  originalContent?: string;
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
  
  // For MULTI_EDIT
  edits?: EditOperation[];
  isMultiEdit?: boolean;
  
  // For FILE_RENAME
  oldPath?: string;
  newPath?: string;
  
  // For DIRECTORY operations
  dirPath?: string;
  
  // For BASH_COMMAND
  command?: string;
  output?: string;
}

/**
 * Represents a single operation that can be undone/redone
 */
export class Operation {
  id: string;
  type: OperationType;
  data: OperationData;
  timestamp: Date;
  undone: boolean;
  messageId?: string;
  sessionId?: string;
  dependencies: string[]; // IDs of operations that depend on this one
  dependsOn: string[]; // IDs of operations this one depends on

  constructor(type: OperationType, data: OperationData, messageId?: string) {
    this.id = this.generateId();
    this.type = type;
    this.data = data;
    this.timestamp = new Date();
    this.undone = false;
    this.messageId = messageId;
    this.dependencies = [];
    this.dependsOn = [];
  }

  private generateId(): string {
    // Generate a unique ID similar to Claude's tool IDs
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `op_${timestamp}_${random}`;
  }

  /**
   * Convert operation to JSON for storage
   */
  toJSON(): object {
    return {
      id: this.id,
      type: this.type,
      data: this.data,
      timestamp: this.timestamp.toISOString(),
      undone: this.undone,
      messageId: this.messageId,
      sessionId: this.sessionId,
      dependencies: this.dependencies,
      dependsOn: this.dependsOn
    };
  }

  /**
   * Create operation from JSON
   */
  static fromJSON(json: any): Operation {
    const op = new Operation(json.type, json.data, json.messageId);
    op.id = json.id;
    op.timestamp = new Date(json.timestamp);
    op.undone = json.undone || false;
    op.sessionId = json.sessionId;
    op.dependencies = json.dependencies || [];
    op.dependsOn = json.dependsOn || [];
    return op;
  }

  /**
   * Get a human-readable description of the operation
   */
  getDescription(): string {
    switch (this.type) {
      case OperationType.FILE_CREATE:
        return `Create file: ${this.data.filePath}`;
      case OperationType.FILE_EDIT:
        return `Edit file: ${this.data.filePath}`;
      case OperationType.FILE_DELETE:
        return `Delete file: ${this.data.filePath}`;
      case OperationType.FILE_RENAME:
        return `Rename: ${this.data.oldPath} → ${this.data.newPath}`;
      case OperationType.DIRECTORY_CREATE:
        return `Create directory: ${this.data.dirPath}`;
      case OperationType.DIRECTORY_DELETE:
        return `Delete directory: ${this.data.dirPath}`;
      case OperationType.BASH_COMMAND:
        return `Run command: ${this.data.command}`;
      case OperationType.MULTI_EDIT:
        return `Multi-edit file: ${this.data.filePath} (${this.data.edits?.length} changes)`;
      default:
        return `Unknown operation: ${this.type}`;
    }
  }

  /**
   * Get icon for the operation type
   */
  getIcon(): string {
    switch (this.type) {
      case OperationType.FILE_CREATE:
      case OperationType.DIRECTORY_CREATE:
        return '➕';
      case OperationType.FILE_EDIT:
      case OperationType.MULTI_EDIT:
        return '📝';
      case OperationType.FILE_DELETE:
      case OperationType.DIRECTORY_DELETE:
        return '🗑️';
      case OperationType.FILE_RENAME:
        return '🔄';
      case OperationType.BASH_COMMAND:
        return '💻';
      default:
        return '❓';
    }
  }
}