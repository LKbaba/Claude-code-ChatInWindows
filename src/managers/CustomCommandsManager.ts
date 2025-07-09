import * as vscode from 'vscode';

export interface CustomCommand {
    id: string;
    name: string;
    description: string;
    command: string;
    icon?: string;
}

export class CustomCommandsManager {
    private _customCommands: CustomCommand[] = [];
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        // Load custom commands from workspace state
        this._customCommands = this._context.workspaceState.get('claude.customCommands', []);
    }

    public getCommands(): CustomCommand[] {
        return this._customCommands;
    }

    public async saveCommand(command: any): Promise<void> {
        try {
            // If command has an id, it's an update, otherwise it's new
            if (command.id) {
                // Update existing command
                const index = this._customCommands.findIndex(c => c.id === command.id);
                if (index >= 0) {
                    this._customCommands[index] = command;
                }
            } else {
                // Add new command with generated id
                command.id = `cmd-${Date.now()}`;
                this._customCommands.push(command);
            }

            // Save to workspace state
            await this._context.workspaceState.update('claude.customCommands', this._customCommands);

            vscode.window.showInformationMessage(`Custom command "${command.name}" saved successfully`);
        } catch (error) {
            console.error('Failed to save custom command:', error);
            vscode.window.showErrorMessage('Failed to save custom command');
            throw error;
        }
    }

    public async deleteCommand(commandId: string): Promise<void> {
        try {
            // Remove command from array
            this._customCommands = this._customCommands.filter(c => c.id !== commandId);

            // Save to workspace state
            await this._context.workspaceState.update('claude.customCommands', this._customCommands);

            vscode.window.showInformationMessage('Custom command deleted successfully');
        } catch (error) {
            console.error('Failed to delete custom command:', error);
            vscode.window.showErrorMessage('Failed to delete custom command');
            throw error;
        }
    }
}