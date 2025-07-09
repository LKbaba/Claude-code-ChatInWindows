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
            // Always get all files and filter on the backend for better search results
            const files = await vscode.workspace.findFiles(
                '**/*',
                '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/.nuxt/**,**/target/**,**/bin/**,**/obj/**}',
                500 // Reasonable limit for filtering
            );

            let fileList = files.map(file => {
                const relativePath = vscode.workspace.asRelativePath(file);
                return {
                    name: file.path.split('/').pop() || '',
                    path: relativePath,
                    fsPath: file.fsPath
                };
            });

            // Filter results based on search term
            if (searchTerm && searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                fileList = fileList.filter(file => {
                    const fileName = file.name.toLowerCase();
                    const filePath = file.path.toLowerCase();
                    
                    // Check if term matches filename or any part of the path
                    return fileName.includes(term) || 
                           filePath.includes(term) ||
                           filePath.split('/').some(segment => segment.includes(term));
                });
            }

            // Sort and limit results
            fileList = fileList
                .sort((a, b) => a.name.localeCompare(b.name))
                .slice(0, 50);

            return fileList;
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