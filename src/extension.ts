import * as vscode from 'vscode';
import * as fs from 'fs';
import { EnvironmentChecker } from './utils/EnvironmentChecker';
import { ClaudeChatViewProvider } from './providers/ClaudeChatViewProvider';
import { ClaudeChatProvider } from './providers/ClaudeChatProvider';
import { PluginManager } from './services/PluginManager';

export async function activate(context: vscode.ExtensionContext) {
	// DEBUG: console.log('Claude Code Chat extension is being activated!');

	// Perform environment check on activation
	const checkResult = await EnvironmentChecker.check(context);
	if (!checkResult.success) {
		vscode.window.showErrorMessage(checkResult.message, 'Open Settings').then(selection => {
			if (selection === 'Open Settings') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'claudeCodeChatUI');
			}
		});
		// Do not block extension activation, but some features will fail.
	}
	
	// Create ~/.claude directory for Claude Code v1.0.48+
	if (process.platform === 'win32') {
		try {
			const homeDir = require('os').homedir();
			const claudeDir = require('path').join(homeDir, '.claude');
			
			// Create directory if it doesn't exist
			if (!fs.existsSync(claudeDir)) {
				fs.mkdirSync(claudeDir, { recursive: true });
				console.log('[Extension] Successfully created ~/.claude directory at:', claudeDir);
			}
		} catch (error) {
			console.error('[Extension] Error creating ~/.claude directory:', error);
		}
	}

	// Initialize plugin manager
	try {
		const pluginManager = PluginManager.getInstance();
		await pluginManager.loadInstalledPlugins();
		console.log('[Extension] Plugin manager initialized successfully');
	} catch (error) {
		console.error('[Extension] Failed to initialize plugin manager:', error);
		// Initialization failure should not block extension startup
	}

	const provider = new ClaudeChatProvider(context.extensionUri, context);

	const disposable = vscode.commands.registerCommand('claude-code-chatui.openChat', () => {
		// DEBUG: console.log('Claude Code Chat command executed!');
		provider.show();
	});

	const loadConversationDisposable = vscode.commands.registerCommand('claude-code-chatui.loadConversation', (filename: string) => {
		provider.loadConversation(filename);
	});

	// Register operation tracking commands (fix for "command not found" errors)
	const operationTrackedCommand = vscode.commands.registerCommand('claude-code-chat.operationTracked', () => {
		// Command is already handled through MessageProcessor callback
		// This registration is just to prevent "command not found" errors
	});

	const operationChangedCommand = vscode.commands.registerCommand('claude-code-chat.operationChanged', () => {
		// Command is already handled through MessageProcessor callback
		// This registration is just to prevent "command not found" errors
	});

	// Register tree data provider for the activity bar view
	const treeProvider = new ClaudeChatViewProvider(context.extensionUri, context);
	vscode.window.registerTreeDataProvider('claude-code-chatui.chat', treeProvider);

	// Make tree provider accessible to chat provider for refreshing
	provider.setTreeProvider(treeProvider);

	// Create status bar item
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "Claude";
	statusBarItem.tooltip = "Open Claude Code Chat (Ctrl+Shift+C)";
	statusBarItem.command = 'claude-code-chatui.openChat';
	statusBarItem.show();

	context.subscriptions.push(disposable, loadConversationDisposable, operationTrackedCommand, operationChangedCommand, statusBarItem);
	// DEBUG: console.log('Claude Code Chat extension activation completed successfully!');
}

export function deactivate() { }
