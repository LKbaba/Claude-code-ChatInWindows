import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CustomCommand {
    id: string;
    name: string;
    description: string;
    command: string;
    icon?: string;
    source: 'user' | 'project' | 'ui';  // 命令来源
    filePath?: string;  // 对应的文件路径（如果是从文件加载的）
}

export class CustomCommandsManager {
    private _customCommands: CustomCommand[] = [];
    private _context: vscode.ExtensionContext;
    private _fileWatcher: vscode.FileSystemWatcher | undefined;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._loadAllCommands();
        this._setupFileWatcher();
    }

    /**
     * 加载所有命令（UI 创建的 + 文件系统的）
     */
    private async _loadAllCommands(): Promise<void> {
        // 1. 加载 UI 创建的命令
        const uiCommands: CustomCommand[] = this._context.workspaceState.get('claude.customCommands', []);
        uiCommands.forEach(cmd => cmd.source = 'ui');

        // 2. 加载项目级命令 (.claude/commands/)
        const projectCommands = await this._loadCommandsFromDirectory('project');

        // 3. 加载用户级命令 (~/.claude/commands/)
        const userCommands = await this._loadCommandsFromDirectory('user');

        // 合并所有命令（项目级优先于用户级）
        this._customCommands = [...projectCommands, ...userCommands, ...uiCommands];
        
        console.log(`[CustomCommandsManager] Loaded ${this._customCommands.length} commands:`, {
            project: projectCommands.length,
            user: userCommands.length,
            ui: uiCommands.length
        });
    }

    /**
     * 从目录加载命令
     */
    private async _loadCommandsFromDirectory(scope: 'user' | 'project'): Promise<CustomCommand[]> {
        const commands: CustomCommand[] = [];
        let commandsDir: string;

        if (scope === 'user') {
            commandsDir = path.join(os.homedir(), '.claude', 'commands');
        } else {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return commands;
            }
            commandsDir = path.join(workspaceFolder.uri.fsPath, '.claude', 'commands');
        }

        if (!fs.existsSync(commandsDir)) {
            return commands;
        }

        try {
            const loadedCommands = await this._scanDirectory(commandsDir, '', scope);
            commands.push(...loadedCommands);
        } catch (error) {
            console.error(`[CustomCommandsManager] Error loading ${scope} commands:`, error);
        }

        return commands;
    }

    /**
     * 递归扫描目录加载命令
     */
    private async _scanDirectory(baseDir: string, relativePath: string, scope: 'user' | 'project'): Promise<CustomCommand[]> {
        const commands: CustomCommand[] = [];
        const currentDir = path.join(baseDir, relativePath);

        if (!fs.existsSync(currentDir)) {
            return commands;
        }

        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(relativePath, entry.name);

            if (entry.isDirectory()) {
                // 递归扫描子目录
                const subCommands = await this._scanDirectory(baseDir, entryPath, scope);
                commands.push(...subCommands);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                // 解析 Markdown 文件为命令
                const command = await this._parseCommandFile(baseDir, entryPath, scope);
                if (command) {
                    commands.push(command);
                }
            }
        }

        return commands;
    }

    /**
     * 解析命令文件
     */
    private async _parseCommandFile(baseDir: string, relativePath: string, scope: 'user' | 'project'): Promise<CustomCommand | null> {
        const filePath = path.join(baseDir, relativePath);
        
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            
            // 命令名：去掉 .md 后缀，用 : 连接路径
            // 例如：posts/new.md → posts:new
            const commandName = relativePath
                .replace(/\.md$/, '')
                .replace(/[/\\]/g, ':');

            // 提取描述（第一行非空内容或前 100 个字符）
            const lines = content.split('\n').filter(line => line.trim());
            let description = lines[0] || '';
            if (description.startsWith('#')) {
                description = description.replace(/^#+\s*/, '');
            }
            if (description.length > 100) {
                description = description.substring(0, 100) + '...';
            }

            const prefix = scope === 'project' ? '/project:' : '/user:';

            return {
                id: `${scope}:${commandName}`,
                name: `${prefix}${commandName}`,
                description: description || `Custom ${scope} command`,
                command: content,
                source: scope,
                filePath: filePath,
                icon: '📝'
            };
        } catch (error) {
            console.error(`[CustomCommandsManager] Error parsing command file ${filePath}:`, error);
            return null;
        }
    }

    /**
     * 设置文件监听器，自动刷新命令
     */
    private _setupFileWatcher(): void {
        // 监听项目级命令目录
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const pattern = new vscode.RelativePattern(
                workspaceFolder,
                '.claude/commands/**/*.md'
            );
            this._fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
            
            this._fileWatcher.onDidCreate(() => this._loadAllCommands());
            this._fileWatcher.onDidChange(() => this._loadAllCommands());
            this._fileWatcher.onDidDelete(() => this._loadAllCommands());
        }
    }

    /**
     * 获取所有命令
     */
    public getCommands(): CustomCommand[] {
        return this._customCommands;
    }

    /**
     * 获取按来源分组的命令
     */
    public getCommandsBySource(): { project: CustomCommand[], user: CustomCommand[], ui: CustomCommand[] } {
        return {
            project: this._customCommands.filter(c => c.source === 'project'),
            user: this._customCommands.filter(c => c.source === 'user'),
            ui: this._customCommands.filter(c => c.source === 'ui')
        };
    }

    /**
     * 刷新命令列表
     */
    public async refresh(): Promise<void> {
        await this._loadAllCommands();
    }

    /**
     * 保存 UI 创建的命令
     */
    public async saveCommand(command: any): Promise<void> {
        try {
            command.source = 'ui';
            
            if (command.id) {
                // Update existing command
                const index = this._customCommands.findIndex(c => c.id === command.id && c.source === 'ui');
                if (index >= 0) {
                    this._customCommands[index] = command;
                }
            } else {
                // Add new command with generated id
                command.id = `ui:cmd-${Date.now()}`;
                this._customCommands.push(command);
            }

            // 只保存 UI 创建的命令到 workspace state
            const uiCommands = this._customCommands.filter(c => c.source === 'ui');
            await this._context.workspaceState.update('claude.customCommands', uiCommands);

            vscode.window.showInformationMessage(`Custom command "${command.name}" saved successfully`);
        } catch (error) {
            console.error('Failed to save custom command:', error);
            vscode.window.showErrorMessage('Failed to save custom command');
            throw error;
        }
    }

    /**
     * 删除命令
     */
    public async deleteCommand(commandId: string): Promise<void> {
        try {
            const command = this._customCommands.find(c => c.id === commandId);
            
            if (command?.source === 'ui') {
                // UI 命令：从内存和 workspace state 中删除
                this._customCommands = this._customCommands.filter(c => c.id !== commandId);
                const uiCommands = this._customCommands.filter(c => c.source === 'ui');
                await this._context.workspaceState.update('claude.customCommands', uiCommands);
                vscode.window.showInformationMessage('Custom command deleted successfully');
            } else if (command?.filePath) {
                // 文件命令：提示用户手动删除文件
                const result = await vscode.window.showWarningMessage(
                    `This command is defined in a file. Delete the file?`,
                    'Delete File',
                    'Open File',
                    'Cancel'
                );
                
                if (result === 'Delete File') {
                    fs.unlinkSync(command.filePath);
                    await this._loadAllCommands();
                    vscode.window.showInformationMessage('Command file deleted');
                } else if (result === 'Open File') {
                    const doc = await vscode.workspace.openTextDocument(command.filePath);
                    await vscode.window.showTextDocument(doc);
                }
            }
        } catch (error) {
            console.error('Failed to delete custom command:', error);
            vscode.window.showErrorMessage('Failed to delete custom command');
            throw error;
        }
    }

    /**
     * 创建新的命令文件
     */
    public async createCommandFile(name: string, scope: 'project' | 'user'): Promise<string | null> {
        let commandsDir: string;

        if (scope === 'user') {
            commandsDir = path.join(os.homedir(), '.claude', 'commands');
        } else {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder open');
                return null;
            }
            commandsDir = path.join(workspaceFolder.uri.fsPath, '.claude', 'commands');
        }

        // 确保目录存在
        if (!fs.existsSync(commandsDir)) {
            fs.mkdirSync(commandsDir, { recursive: true });
        }

        // 创建文件
        const fileName = name.endsWith('.md') ? name : `${name}.md`;
        const filePath = path.join(commandsDir, fileName);

        if (fs.existsSync(filePath)) {
            vscode.window.showErrorMessage(`Command file already exists: ${fileName}`);
            return null;
        }

        const template = `# ${name.replace('.md', '')}

<!-- 
This is a custom slash command for Claude Code.
Usage: /${scope}:${name.replace('.md', '')} [arguments]

You can use $ARGUMENTS to reference any arguments passed to this command.
-->

Your prompt here. Use $ARGUMENTS to include any arguments passed to this command.
`;

        fs.writeFileSync(filePath, template, 'utf-8');
        
        // 打开文件进行编辑
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);

        await this._loadAllCommands();
        
        return filePath;
    }

    /**
     * 处理命令中的参数替换
     */
    public processCommandWithArguments(command: CustomCommand, args: string): string {
        return command.command.replace(/\$ARGUMENTS/g, args);
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this._fileWatcher?.dispose();
    }
}
