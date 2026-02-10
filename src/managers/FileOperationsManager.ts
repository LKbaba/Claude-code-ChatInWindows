/**
 * File Operations Manager for Claude Code Chat VS Code Extension
 * Handles file selection, workspace browsing, and clipboard operations
 */

import * as vscode from 'vscode';

export interface FileInfo {
    name: string;
    path: string;
    fsPath: string;
}

export class FileOperationsManager {
    /**
     * Gets workspace files with optional search filtering
     * @param searchTerm Optional search term to filter files
     * @returns Promise resolving to array of file information
     */
    public async getWorkspaceFiles(searchTerm?: string): Promise<FileInfo[]> {
        try {
            const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/.nuxt/**,**/target/**,**/bin/**,**/obj/**,**/.DS_Store,**/coverage/**,**/*.min.js,**/*.min.css}';

            let files: vscode.Uri[];

            if (searchTerm && searchTerm.trim()) {
                // Dynamic glob search - let VS Code do the filtering
                const term = searchTerm.trim();
                // Build case-insensitive glob pattern: each letter becomes [aA]
                const ciTerm = term.split('').map(ch => {
                    const lower = ch.toLowerCase();
                    const upper = ch.toUpperCase();
                    return lower !== upper ? `[${lower}${upper}]` : ch;
                }).join('');
                // Search for files containing the term in filename
                files = await vscode.workspace.findFiles(
                    `**/*${ciTerm}*`,
                    excludePattern,
                    200
                );

                // Also search in path segments if not enough results
                if (files.length < 50) {
                    const pathFiles = await vscode.workspace.findFiles(
                        `**/${ciTerm}*/**/*`,
                        excludePattern,
                        100
                    );
                    // Merge and deduplicate
                    const existingPaths = new Set(files.map(f => f.fsPath));
                    for (const f of pathFiles) {
                        if (!existingPaths.has(f.fsPath)) {
                            files.push(f);
                        }
                    }
                }
            } else {
                // Initial load - get more files for browsing
                files = await vscode.workspace.findFiles(
                    '**/*',
                    excludePattern,
                    2000
                );
            }

            let fileList = files.map(file => {
                const relativePath = vscode.workspace.asRelativePath(file);
                return {
                    name: file.path.split('/').pop() || '',
                    path: relativePath,
                    fsPath: file.fsPath
                };
            });

            // Sort by relevance: exact filename match first, then alphabetically
            if (searchTerm && searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                fileList.sort((a, b) => {
                    const aNameLower = a.name.toLowerCase();
                    const bNameLower = b.name.toLowerCase();
                    // Exact match first
                    const aExact = aNameLower === term;
                    const bExact = bNameLower === term;
                    if (aExact && !bExact) return -1;
                    if (!aExact && bExact) return 1;
                    // Starts with term second
                    const aStarts = aNameLower.startsWith(term);
                    const bStarts = bNameLower.startsWith(term);
                    if (aStarts && !bStarts) return -1;
                    if (!aStarts && bStarts) return 1;
                    // Then alphabetically
                    return a.name.localeCompare(b.name);
                });
            } else {
                fileList.sort((a, b) => a.name.localeCompare(b.name));
            }

            return fileList.slice(0, 100);
        } catch (error) {
            console.error('Error getting workspace files:', error);
            return [];
        }
    }

    /**
     * Opens file picker dialog for selecting image files
     * @returns Promise resolving to array of selected file paths
     */
    public async selectImageFiles(): Promise<string[]> {
        try {
            // Show VS Code's native file picker for images
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: true,
                title: 'Select image files',
                filters: {
                    'Images': ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']
                }
            });
            
            if (result && result.length > 0) {
                return result.map(uri => uri.fsPath);
            }
            
            return [];
        } catch (error) {
            console.error('Error selecting image files:', error);
            return [];
        }
    }

    /**
     * Opens a file in the VS Code editor
     * @param filePath Path to the file to open
     */
    public async openFileInEditor(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
            console.error('Error opening file:', error);
        }
    }

    /**
     * Reads text from the system clipboard
     * @returns Promise resolving to clipboard text content
     */
    public async getClipboardText(): Promise<string> {
        try {
            const text = await vscode.env.clipboard.readText();
            return text;
        } catch (error) {
            console.error('Failed to read clipboard:', error);
            return '';
        }
    }
}