import * as vscode from 'vscode';
import { Operation, OperationType } from '../types/Operation';
import { OperationTracker } from '../managers/OperationTracker';
import * as path from 'path';

/**
 * Statistics for operation preview
 */
export interface OperationStatistics {
    totalLines?: number;      // 文件总行数
    affectedLines?: number;   // 受影响的行数
    fileSize?: string;        // 文件大小
    additions?: number;       // 添加的行数
    deletions?: number;       // 删除的行数
}

/**
 * Detailed preview of an operation
 */
export interface DetailedOperationPreview {
    operation: Operation;
    previewType: 'diff' | 'content' | 'info';
    title: string;
    description: string;
    diff?: DiffPreview;
    content?: string;
    cascadingOperations: Operation[];
    warnings: string[];
    canUndo: boolean;
    canRedo: boolean;
    statistics?: OperationStatistics;
}

/**
 * Diff preview for file changes
 */
export interface DiffPreview {
    original: string;
    modified: string;
    additions: number;
    deletions: number;
    hunks: DiffHunk[];
}

/**
 * A single diff hunk
 */
export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
}

/**
 * A single line in a diff
 */
export interface DiffLine {
    type: 'add' | 'delete' | 'context';
    content: string;
    oldLineNo?: number;
    newLineNo?: number;
}

/**
 * Service for generating operation previews
 */
export class OperationPreviewService {
    constructor(private readonly _operationTracker: OperationTracker) {}

    /**
     * Generate a detailed preview for an operation
     */
    async generatePreview(
        operationId: string,
        action: 'undo' | 'redo'
    ): Promise<DetailedOperationPreview | null> {
        const operation = this._operationTracker.getOperation(operationId);
        if (!operation) return null;

        const cascading = this._operationTracker.getCascadingOperations(operationId, action);
        const warnings: string[] = [];
        
        // Check if action is valid
        const canUndo = !operation.undone;
        const canRedo = operation.undone;
        
        if (action === 'undo' && !canUndo) {
            return null;
        }
        if (action === 'redo' && !canRedo) {
            return null;
        }

        // Add cascading warning
        if (cascading.length > 0) {
            const affectedFiles = new Set<string>();
            cascading.forEach(op => {
                if (op.data.filePath) affectedFiles.add(op.data.filePath);
                else if (op.data.dirPath) affectedFiles.add(op.data.dirPath);
            });
            
            warnings.push(
                `This will ${action} ${cascading.length} additional operation(s) affecting ${affectedFiles.size} file(s)`
            );
        }

        // Generate preview based on operation type
        let preview: DetailedOperationPreview;
        
        switch (operation.type) {
            case OperationType.FILE_CREATE:
                preview = await this._previewFileCreate(operation, action);
                break;
            case OperationType.FILE_EDIT:
            case OperationType.MULTI_EDIT:
                preview = await this._previewFileEdit(operation, action);
                break;
            case OperationType.FILE_DELETE:
                preview = await this._previewFileDelete(operation, action);
                break;
            case OperationType.FILE_RENAME:
                preview = await this._previewFileRename(operation, action);
                break;
            case OperationType.DIRECTORY_CREATE:
            case OperationType.DIRECTORY_DELETE:
                preview = await this._previewDirectory(operation, action);
                break;
            case OperationType.BASH_COMMAND:
                preview = this._previewBashCommand(operation, action);
                break;
            default:
                preview = {
                    operation,
                    previewType: 'info',
                    title: 'Unknown Operation',
                    description: 'Cannot preview this operation type',
                    cascadingOperations: cascading,
                    warnings: ['Unknown operation type'],
                    canUndo,
                    canRedo
                };
        }

        // Add common warnings
        preview.warnings.push(...warnings);
        preview.cascadingOperations = cascading;
        preview.canUndo = canUndo;
        preview.canRedo = canRedo;

        return preview;
    }

    /**
     * Preview file creation operation
     */
    private async _previewFileCreate(
        operation: Operation,
        action: 'undo' | 'redo'
    ): Promise<DetailedOperationPreview> {
        const filePath = operation.data.filePath!;
        const fileName = path.basename(filePath);

        if (action === 'undo') {
            // Undoing creation = deleting file
            try {
                const fileUri = vscode.Uri.file(filePath);
                const content = await vscode.workspace.fs.readFile(fileUri);
                const fileContent = content.toString();
                const lineCount = fileContent.split('\n').length;

                return {
                    operation,
                    previewType: 'content',
                    title: `Delete ${fileName}`,
                    description: `This file will be deleted (${lineCount} lines)`,
                    content: fileContent,
                    cascadingOperations: [],
                    warnings: ['The file will be backed up before deletion'],
                    canUndo: true,
                    canRedo: false,
                    statistics: this._generateStatistics(fileContent)
                };
            } catch (error) {
                // File doesn't exist, but we can still undo the creation operation
                return {
                    operation,
                    previewType: 'info',
                    title: `Delete ${fileName}`,
                    description: 'File has already been deleted or moved',
                    cascadingOperations: [],
                    warnings: ['File no longer exists at the original location'],
                    canUndo: true,  // Still allow undo to mark operation as undone
                    canRedo: false
                };
            }
        } else {
            // Redoing creation = recreating file
            const content = operation.data.content || '';
            const lineCount = content.split('\n').length;

            return {
                operation,
                previewType: 'content',
                title: `Recreate ${fileName}`,
                description: `This file will be recreated (${lineCount} lines)`,
                content: content,
                cascadingOperations: [],
                warnings: content ? [] : ['File content may not be available'],
                canUndo: false,
                canRedo: true
            };
        }
    }

    /**
     * Preview file edit operation
     */
    private async _previewFileEdit(
        operation: Operation,
        action: 'undo' | 'redo'
    ): Promise<DetailedOperationPreview> {
        const filePath = operation.data.filePath!;
        const fileName = path.basename(filePath);

        try {
            const fileUri = vscode.Uri.file(filePath);
            const content = await vscode.workspace.fs.readFile(fileUri);
            const currentContent = content.toString();

            // Generate diff based on action
            let diff: DiffPreview;
            
            if (operation.type === OperationType.MULTI_EDIT && operation.data.edits) {
                // Multi-edit preview
                const editCount = operation.data.edits.length;
                const title = action === 'undo'
                    ? `Revert ${editCount} edits in ${fileName}`
                    : `Reapply ${editCount} edits in ${fileName}`;

                // For multi-edit, we show a summary instead of full diff
                return {
                    operation,
                    previewType: 'info',
                    title,
                    description: this._generateMultiEditSummary(operation.data.edits, action),
                    cascadingOperations: [],
                    warnings: [],
                    canUndo: !operation.undone,
                    canRedo: operation.undone
                };
            } else {
                // Single edit preview
                diff = this._generateEditDiff(
                    currentContent,
                    operation.data.oldString || '',
                    operation.data.newString || '',
                    operation.data.replaceAll || false,
                    action
                );

                const title = action === 'undo'
                    ? `Revert edit in ${fileName}`
                    : `Reapply edit in ${fileName}`;

                return {
                    operation,
                    previewType: 'diff',
                    title,
                    description: `${diff.deletions} deletion(s), ${diff.additions} addition(s)`,
                    diff,
                    cascadingOperations: [],
                    warnings: [],
                    canUndo: !operation.undone,
                    canRedo: operation.undone,
                    statistics: this._generateStatistics(currentContent, diff)
                };
            }
        } catch (error) {
            return {
                operation,
                previewType: 'info',
                title: `Edit ${fileName}`,
                description: 'File not found or not accessible',
                cascadingOperations: [],
                warnings: ['Cannot preview: file is not accessible'],
                canUndo: false,
                canRedo: false
            };
        }
    }

    /**
     * Generate diff for edit operation
     */
    private _generateEditDiff(
        content: string,
        oldString: string,
        newString: string,
        replaceAll: boolean,
        action: 'undo' | 'redo'
    ): DiffPreview {
        // For undo: replace newString with oldString
        // For redo: replace oldString with newString
        const searchStr = action === 'undo' ? newString : oldString;
        const replaceStr = action === 'undo' ? oldString : newString;

        let modifiedContent = content;
        if (replaceAll) {
            modifiedContent = content.split(searchStr).join(replaceStr);
        } else {
            modifiedContent = content.replace(searchStr, replaceStr);
        }

        // Generate simple diff
        const hunks = this._generateSimpleDiff(content, modifiedContent);
        
        return {
            original: content,
            modified: modifiedContent,
            additions: hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'add').length, 0),
            deletions: hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'delete').length, 0),
            hunks
        };
    }

    /**
     * Generate simple diff between two strings
     */
    private _generateSimpleDiff(original: string, modified: string): DiffHunk[] {
        const originalLines = original.split('\n');
        const modifiedLines = modified.split('\n');
        const hunks: DiffHunk[] = [];

        // Simple line-by-line comparison
        let i = 0, j = 0;
        let currentHunk: DiffHunk | null = null;

        while (i < originalLines.length || j < modifiedLines.length) {
            if (i >= originalLines.length) {
                // Remaining lines are additions
                if (!currentHunk) {
                    currentHunk = {
                        oldStart: i + 1,
                        oldLines: 0,
                        newStart: j + 1,
                        newLines: 0,
                        lines: []
                    };
                }
                currentHunk.lines.push({
                    type: 'add',
                    content: modifiedLines[j],
                    newLineNo: j + 1
                });
                currentHunk.newLines++;
                j++;
            } else if (j >= modifiedLines.length) {
                // Remaining lines are deletions
                if (!currentHunk) {
                    currentHunk = {
                        oldStart: i + 1,
                        oldLines: 0,
                        newStart: j + 1,
                        newLines: 0,
                        lines: []
                    };
                }
                currentHunk.lines.push({
                    type: 'delete',
                    content: originalLines[i],
                    oldLineNo: i + 1
                });
                currentHunk.oldLines++;
                i++;
            } else if (originalLines[i] === modifiedLines[j]) {
                // Lines are the same
                if (currentHunk) {
                    // Add context line and close hunk
                    currentHunk.lines.push({
                        type: 'context',
                        content: originalLines[i],
                        oldLineNo: i + 1,
                        newLineNo: j + 1
                    });
                    hunks.push(currentHunk);
                    currentHunk = null;
                }
                i++;
                j++;
            } else {
                // Lines are different
                if (!currentHunk) {
                    currentHunk = {
                        oldStart: i + 1,
                        oldLines: 0,
                        newStart: j + 1,
                        newLines: 0,
                        lines: []
                    };
                }
                currentHunk.lines.push({
                    type: 'delete',
                    content: originalLines[i],
                    oldLineNo: i + 1
                });
                currentHunk.lines.push({
                    type: 'add',
                    content: modifiedLines[j],
                    newLineNo: j + 1
                });
                currentHunk.oldLines++;
                currentHunk.newLines++;
                i++;
                j++;
            }
        }

        if (currentHunk) {
            hunks.push(currentHunk);
        }

        return hunks;
    }

    /**
     * Generate summary for multi-edit operations
     */
    private _generateMultiEditSummary(edits: any[], action: 'undo' | 'redo'): string {
        const lines: string[] = [];
        
        edits.forEach((edit, index) => {
            if (edit.oldString !== undefined && edit.newString) {
                const from = action === 'undo' ? edit.newString : edit.oldString;
                const to = action === 'undo' ? edit.oldString : edit.newString;
                
                lines.push(`Edit ${index + 1}: "${this._truncate(from, 30)}" → "${this._truncate(to, 30)}"`);
            }
        });

        return lines.join('\n');
    }

    /**
     * Preview file deletion operation
     */
    private async _previewFileDelete(
        operation: Operation,
        action: 'undo' | 'redo'
    ): Promise<DetailedOperationPreview> {
        const filePath = operation.data.filePath!;
        const fileName = path.basename(filePath);

        if (action === 'undo') {
            // Undoing deletion = restoring file
            const content = operation.data.content || '';
            const hasContent = !!content;

            return {
                operation,
                previewType: hasContent ? 'content' : 'info',
                title: `Restore ${fileName}`,
                description: hasContent
                    ? `File will be restored (${content.split('\n').length} lines)`
                    : 'Cannot restore: file content not available',
                content: hasContent ? content : undefined,
                cascadingOperations: [],
                warnings: hasContent ? [] : ['File content was not preserved'],
                canUndo: hasContent,
                canRedo: false
            };
        } else {
            // Redoing deletion = deleting again
            try {
                const fileUri = vscode.Uri.file(filePath);
                const content = await vscode.workspace.fs.readFile(fileUri);
                const fileContent = content.toString();

                return {
                    operation,
                    previewType: 'content',
                    title: `Delete ${fileName} again`,
                    description: `File will be deleted (${fileContent.split('\n').length} lines)`,
                    content: fileContent,
                    cascadingOperations: [],
                    warnings: ['The file will be backed up before deletion'],
                    canUndo: false,
                    canRedo: true
                };
            } catch {
                return {
                    operation,
                    previewType: 'info',
                    title: `Delete ${fileName}`,
                    description: 'File not found',
                    cascadingOperations: [],
                    warnings: ['File does not exist'],
                    canUndo: false,
                    canRedo: false
                };
            }
        }
    }

    /**
     * Preview file rename operation
     */
    private async _previewFileRename(
        operation: Operation,
        action: 'undo' | 'redo'
    ): Promise<DetailedOperationPreview> {
        const oldPath = operation.data.oldPath!;
        const newPath = operation.data.newPath!;
        const oldName = path.basename(oldPath);
        const newName = path.basename(newPath);

        const fromPath = action === 'undo' ? newPath : oldPath;
        const toPath = action === 'undo' ? oldPath : newPath;
        const fromName = action === 'undo' ? newName : oldName;
        const toName = action === 'undo' ? oldName : newName;

        return {
            operation,
            previewType: 'info',
            title: `Rename ${fromName} → ${toName}`,
            description: `File will be renamed from "${fromPath}" to "${toPath}"`,
            cascadingOperations: [],
            warnings: [],
            canUndo: !operation.undone,
            canRedo: operation.undone
        };
    }

    /**
     * Preview directory operations
     */
    private async _previewDirectory(
        operation: Operation,
        action: 'undo' | 'redo'
    ): Promise<DetailedOperationPreview> {
        const dirPath = operation.data.dirPath!;
        const dirName = path.basename(dirPath);

        let title: string;
        let description: string;

        if (operation.type === OperationType.DIRECTORY_CREATE) {
            if (action === 'undo') {
                title = `Remove directory ${dirName}`;
                description = `Directory "${dirPath}" will be removed`;
            } else {
                title = `Recreate directory ${dirName}`;
                description = `Directory "${dirPath}" will be created`;
            }
        } else {
            if (action === 'undo') {
                title = `Restore directory ${dirName}`;
                description = `Directory "${dirPath}" will be restored`;
            } else {
                title = `Remove directory ${dirName}`;
                description = `Directory "${dirPath}" will be removed`;
            }
        }

        return {
            operation,
            previewType: 'info',
            title,
            description,
            cascadingOperations: [],
            warnings: [],
            canUndo: !operation.undone,
            canRedo: operation.undone
        };
    }

    /**
     * Preview bash command operation
     */
    private _previewBashCommand(
        operation: Operation,
        action: 'undo' | 'redo'
    ): DetailedOperationPreview {
        const command = operation.data.command!;

        return {
            operation,
            previewType: 'info',
            title: `${action === 'undo' ? 'Undo' : 'Redo'} bash command`,
            description: `Command: ${command}`,
            cascadingOperations: [],
            warnings: [
                `Cannot automatically ${action} bash commands`,
                'Manual intervention required'
            ],
            canUndo: false,
            canRedo: false
        };
    }

    /**
     * Truncate string for display
     */
    private _truncate(str: string, maxLength: number): string {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength - 3) + '...';
    }

    /**
     * Generate HTML preview for diff
     */
    generateDiffHtml(diff: DiffPreview, statistics?: OperationStatistics): string {
        const hunks = diff.hunks.map(hunk => {
            const lines = hunk.lines.map(line => {
                const className = line.type === 'add' ? 'add' : line.type === 'delete' ? 'delete' : 'context';
                const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
                const lineNo = line.oldLineNo ? `${line.oldLineNo}` : '  ';
                
                return `<div class="diff-line ${className}">
                    <span class="line-no">${lineNo}</span>
                    <span class="prefix">${prefix}</span>
                    <span class="content">${this._escapeHtml(line.content)}</span>
                </div>`;
            }).join('\n');

            return `<div class="diff-hunk">
                <div class="hunk-header">@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@</div>
                ${lines}
            </div>`;
        }).join('\n');

        // Generate statistics bar
        const totalChanges = diff.additions + diff.deletions;
        const addPercent = totalChanges > 0 ? (diff.additions / totalChanges) * 100 : 0;
        const delPercent = totalChanges > 0 ? (diff.deletions / totalChanges) * 100 : 0;

        const statsBar = `
            <div class="diff-stats-bar">
                <div class="stats-bar-content">
                    <div class="stats-bar-additions" style="width: ${addPercent}%"></div>
                    <div class="stats-bar-deletions" style="width: ${delPercent}%"></div>
                </div>
            </div>
        `;

        const statsInfo = statistics ? `
            <div class="diff-stats-info">
                <span class="file-info">📄 ${statistics.totalLines} lines, ${statistics.fileSize}</span>
                <span class="separator">|</span>
                <span class="affected-lines">📝 ${statistics.affectedLines} lines changed</span>
            </div>
        ` : '';

        return `<div class="diff-preview">
            <div class="diff-stats">
                <span class="additions">+${diff.additions}</span>
                <span class="deletions">-${diff.deletions}</span>
                ${statsBar}
            </div>
            ${statsInfo}
            ${hunks}
        </div>`;
    }

    /**
     * Escape HTML for safe display
     */
    private _escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Format file size for display
     */
    private _formatFileSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
        else if (bytes < 1073741824) return Math.round(bytes / 1048576 * 10) / 10 + ' MB';
        else return Math.round(bytes / 1073741824 * 10) / 10 + ' GB';
    }

    /**
     * Generate statistics for content
     */
    private _generateStatistics(content: string, diff?: DiffPreview): OperationStatistics {
        const lines = content.split('\n');
        const bytes = Buffer.byteLength(content, 'utf8');
        
        return {
            totalLines: lines.length,
            fileSize: this._formatFileSize(bytes),
            additions: diff?.additions,
            deletions: diff?.deletions,
            affectedLines: diff ? (diff.additions + diff.deletions) : undefined
        };
    }
}