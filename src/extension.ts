import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';
import { loadUIHtml } from './ui-loader';
import { resolveNpmPrefix, updateClaudeMdWithWindowsInfo } from './utils/utils';
import { EnvironmentChecker } from './utils/EnvironmentChecker';
import { FileOperationsManager } from './managers/FileOperationsManager';
import { ConfigurationManager } from './managers/ConfigurationManager';
import { CustomCommandsManager } from './managers/CustomCommandsManager';
import { ClaudeChatViewProvider } from './providers/ClaudeChatViewProvider';
import { BackupManager } from './managers/BackupManager';
import { ConversationManager } from './managers/ConversationManager';
import { WindowsCompatibility } from './managers/WindowsCompatibility';
import { ClaudeProcessService } from './services/ClaudeProcessService';
import { MessageProcessor } from './services/MessageProcessor';

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

	const provider = new ClaudeChatProvider(context.extensionUri, context);

	const disposable = vscode.commands.registerCommand('claude-code-chatui.openChat', () => {
		// DEBUG: console.log('Claude Code Chat command executed!');
		provider.show();
	});

	const loadConversationDisposable = vscode.commands.registerCommand('claude-code-chatui.loadConversation', (filename: string) => {
		provider.loadConversation(filename);
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
	statusBarItem.command = 'claude-code-chat.openChat';
	statusBarItem.show();

	context.subscriptions.push(disposable, loadConversationDisposable, statusBarItem);
	// DEBUG: console.log('Claude Code Chat extension activation completed successfully!');
}

export function deactivate() { }

class ClaudeChatProvider {
	private _panel: vscode.WebviewPanel | undefined;
	private _disposables: vscode.Disposable[] = [];
	private _totalCost: number = 0;
	private _totalTokensInput: number = 0;
	private _totalTokensOutput: number = 0;
	private _requestCount: number = 0;
	private _currentSessionId: string | undefined;
	private _treeProvider: ClaudeChatViewProvider | undefined;
	private _selectedModel: string = 'default'; // Default model
	private _npmPrefixPromise: Promise<string | undefined>;
	private _fileOperationsManager: FileOperationsManager;
	private _configurationManager: ConfigurationManager;
	private _customCommandsManager: CustomCommandsManager;
	private _backupManager: BackupManager;
	private _conversationManager: ConversationManager;
	private _windowsCompatibility: WindowsCompatibility;
	private _processService: ClaudeProcessService;
	private _messageProcessor: MessageProcessor;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext
	) {
		this._npmPrefixPromise = resolveNpmPrefix();
		// Initialize managers
		this._fileOperationsManager = new FileOperationsManager();
		this._configurationManager = new ConfigurationManager();
		this._customCommandsManager = new CustomCommandsManager(this._context);
		this._backupManager = new BackupManager(this._context);
		this._conversationManager = new ConversationManager(this._context);
		this._windowsCompatibility = new WindowsCompatibility(this._npmPrefixPromise, this._configurationManager);
		
		// Initialize services
		this._processService = new ClaudeProcessService(
			this._windowsCompatibility,
			this._configurationManager,
			this._conversationManager,
			() => this._npmPrefixPromise
		);
		
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		this._messageProcessor = new MessageProcessor(
			this._conversationManager,
			workspaceFolder?.uri.fsPath
		);
		
		// Initialize conversations
		this._conversationManager.initializeConversations();
		
		// Initialize backup repository asynchronously
		// We don't await here to avoid blocking constructor, but we'll ensure it's ready in show()
		this._backupManager.initializeBackupRepo().catch(error => {
			console.error('[ClaudeChatProvider] Failed to initialize backup repo:', error);
		});

		// Load saved model preference
		this._selectedModel = this._context.workspaceState.get('claude.selectedModel', 'default');

		// Custom commands are now loaded by CustomCommandsManager

		// Resume session from latest conversation
		const latestConversation = this._conversationManager.getLatestConversation();
		this._currentSessionId = latestConversation?.sessionId;
	}

	public async show() {
		const column = vscode.ViewColumn.Two;

		if (this._panel) {
			this._panel.reveal(column);
			return;
		}
		
		// Ensure backup repository is initialized
		await this._backupManager.initializeBackupRepo();

		this._panel = vscode.window.createWebviewPanel(
			'claudeChat',
			'Claude Code Chat',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this._extensionUri]
			}
		);

		// Set icon for the webview tab using URI path
		const iconPath = vscode.Uri.joinPath(this._extensionUri, 'icon.png');
		this._panel.iconPath = iconPath;

		// Load HTML asynchronously based on UI version
		this._panel.webview.html = await this._getHtmlForWebview();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.type) {
					case 'sendMessage':
						this._sendMessageToClaude(message.text, message.planMode, message.thinkingMode);
						return;
					case 'newSession':
						this._newSession();
						return;
					case 'restoreCommit':
						this._handleRestoreCommit(message.commitSha);
						return;
					case 'getConversationList':
						this._sendConversationList();
						return;
					case 'getStatistics':
						this._sendStatistics(message.statsType);
						return;
					case 'getWorkspaceFiles':
						this._sendWorkspaceFiles(message.searchTerm);
						return;
					case 'selectImageFile':
						const imagePaths = await this._fileOperationsManager.selectImageFiles();
						imagePaths.forEach((filePath: string) => {
							this._panel?.webview.postMessage({
								type: 'imagePath',
								path: filePath
							});
						});
						return;
					case 'loadConversation':
						this.loadConversation(message.filename);
						return;
					case 'stopRequest':
						this._stopClaudeProcess();
						return;
					case 'getSettings':
						this._sendCurrentSettings();
						return;
					case 'updateSettings':
						this._updateSettings(message.settings);
						return;
					case 'testMcpConnection':
						this._testMcpConnection();
						return;
					case 'getClipboardText':
						const clipboardText = await this._fileOperationsManager.getClipboardText();
						this._panel?.webview.postMessage({
							type: 'clipboardText',
							data: clipboardText
						});
						return;
					case 'pasteImage':
						await this._handlePasteImage(message.imageData, message.mimeType);
						return;
					case 'selectModel':
						this._setSelectedModel(message.model);
						return;
					case 'openModelTerminal':
						this._openModelTerminal();
						return;
					case 'executeSlashCommand':
						this._executeSlashCommand(message.command);
						return;
					case 'openFile':
						this._fileOperationsManager.openFileInEditor(message.filePath);
						return;
					case 'getCustomCommands':
						this._sendCustomCommands();
						return;
					case 'saveCustomCommand':
						await this._customCommandsManager.saveCommand(message.command);
						this._sendCustomCommands();
						return;
					case 'deleteCustomCommand':
						await this._customCommandsManager.deleteCommand(message.commandId);
						this._sendCustomCommands();
						return;
					case 'executeCustomCommand':
						this._executeCustomCommand(message.command);
						return;
				}
			},
			null,
			this._disposables
		);

		// Resume session from latest conversation
		const latestConversation = this._conversationManager.getLatestConversation();
		this._currentSessionId = latestConversation?.sessionId;

		// Load latest conversation history if available
		if (latestConversation) {
			this._loadConversationHistory(latestConversation.filename);
		}

		// Send ready message immediately
		setTimeout(() => {
			// Send current session info if available
			if (this._currentSessionId) {
				this._panel?.webview.postMessage({
					type: 'sessionResumed',
					data: {
						sessionId: this._currentSessionId
					}
				});
			}

			this._panel?.webview.postMessage({
				type: 'ready',
				data: 'Ready to chat with Claude Code! Type your message below.'
			});

			// Send current model to webview
			this._panel?.webview.postMessage({
				type: 'modelSelected',
				model: this._selectedModel
			});

			// Send extension version
			const extension = vscode.extensions.getExtension('lkbaba.claude-code-chatui');
			const version = extension?.packageJSON?.version || '1.2.0';
			this._panel?.webview.postMessage({
				type: 'extensionVersion',
				version: version
			});

		}, 100);
	}

	/**
	 * Send a message to Claude Code CLI with optional Plan First and Thinking Mode features
	 * 
	 * @param message - The user's message
	 * @param planMode - If true, Claude will first create a detailed plan and wait for approval
	 * @param thinkingMode - If true, Claude will show its step-by-step thinking process
	 * 
	 * How it works:
	 * - These features are implemented through message prefixes, not CLI arguments
	 * - Plan First: Adds "PLAN FIRST FOR THIS MESSAGE ONLY:" prefix to make Claude plan before implementing
	 * - Thinking Mode: Adds "THINK/THINK HARD/ULTRATHINK THROUGH THIS STEP BY STEP:" prefix for extended reasoning
	 * - The prefixes trigger Claude's built-in behaviors without needing special CLI flags
	 * - Both modes only affect the current message, not the entire conversation
	 */
	private async _sendMessageToClaude(message: string, planMode?: boolean, thinkingMode?: boolean) {
		if (this._processService.isProcessRunning()) {
			// DEBUG: console.log("A request is already in progress. Please wait.");
			
			// Send feedback to user that a request is already in progress
			this._panel?.webview.postMessage({
				type: 'info',
				message: '⏳ A request is already in progress. Please wait for it to complete.'
			});
			
			// Send a more specific error message to be displayed in the chat
			this._sendAndSaveMessage({
				type: 'error',
				data: '⚠️ Claude is still processing your previous request. Please wait for it to complete before sending another message.'
			});
			
			return;
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

		// Get thinking intensity setting
		const thinkingIntensity = this._configurationManager.getThinkingIntensity();

		// Check if this is the first message of a new session and we're on Windows
		const isFirstMessage = !this._currentSessionId || this._conversationManager.currentConversation.length === 0;
		const isWindows = process.platform === 'win32';
		let windowsEnvironmentInfo = '';

		if (isFirstMessage && isWindows) {
			// Inject Windows environment information
			windowsEnvironmentInfo = this._windowsCompatibility.getWindowsEnvironmentInfo();
			
			// Also update or create CLAUDE.md in the project root if it doesn't have Windows info
			await updateClaudeMdWithWindowsInfo(workspaceFolder);
		}

		// Prepend mode instructions if enabled
		let actualMessage = windowsEnvironmentInfo + message;
		if (planMode) {
			// Plan First mode: Claude will create a detailed plan and wait for approval before implementing
			actualMessage = windowsEnvironmentInfo + 'PLAN FIRST FOR THIS MESSAGE ONLY: Plan first before making any changes. Show me in detail what you will change and wait for my explicit approval in a separate message before proceeding. Do not implement anything until I confirm. This planning requirement applies ONLY to this current message.\n\n' + message;
		}
		if (thinkingMode) {
			// Thinking Mode: Claude will show its step-by-step reasoning process
			// The intensity affects how deeply Claude thinks through the problem
			let thinkingPrompt = '';
			const thinkingMessage = ' THROUGH THIS STEP BY STEP: \n\n';
			switch (thinkingIntensity) {
				case 'think':
					thinkingPrompt = 'THINK';
					break;
				case 'think-hard':
					thinkingPrompt = 'THINK HARD';
					break;
				case 'think-harder':
					thinkingPrompt = 'THINK HARDER';
					break;
				case 'ultrathink':
					thinkingPrompt = 'ULTRATHINK';
					break;
				default:
					thinkingPrompt = 'THINK';
			}
			actualMessage = windowsEnvironmentInfo + thinkingPrompt + thinkingMessage + actualMessage;
		}

		this._sendAndSaveMessage({ type: 'userInput', data: message });
		this._panel?.webview.postMessage({ type: 'setProcessing', data: true });

		// Create backup commit
		console.log('[ClaudeChatProvider] Creating backup commit for message:', message.substring(0, 50));
		const commitInfo = await this._backupManager.createBackupCommit(message);
		console.log('[ClaudeChatProvider] Backup commit result:', commitInfo);
		
		if (commitInfo) {
			// Show restore option in UI and save to conversation
			console.log('[ClaudeChatProvider] Sending showRestoreOption message to UI');
			this._sendAndSaveMessage({
				type: 'showRestoreOption',
				data: commitInfo
			});
		} else {
			console.log('[ClaudeChatProvider] No backup commit created (no changes or error)');
		}

		// Reset message processor state for new conversation
		if (!this._currentSessionId) {
			this._messageProcessor.reset();
		}

		// Prepare process options
		const processOptions = {
			message: actualMessage,
			cwd: cwd,
			sessionId: this._currentSessionId,
			model: this._selectedModel,
			windowsEnvironmentInfo: windowsEnvironmentInfo
			// Note: planMode and thinkingMode are handled through message prefixes above,
			// not passed to ProcessService
		};

		// Prepare callbacks for process service
		const callbacks = {
			onData: (data: any) => {
				this._messageProcessor.processJsonLine(JSON.stringify(data), {
					onSystemMessage: (text: string) => {
						// Handle system messages if needed
					},
					onAssistantMessage: (text: string) => {
						// Display Claude's response
						this._sendAndSaveMessage({
							type: 'output',
							data: text
						});
					},
					onToolStatus: (toolName: string, details: string) => {
						this._panel?.webview.postMessage({
							type: 'toolStatus',
							data: {
								status: details,
								toolName: toolName
							}
						});
					},
					onToolResult: (data: any) => {
						// Tool results are handled through saveMessage
					},
					onTokenUpdate: (tokens: any) => {
						this._totalTokensInput = tokens.totalTokensInput;
						this._totalTokensOutput = tokens.totalTokensOutput;
						this._sendAndSaveMessage({
							type: 'updateTokens',
							data: tokens
						});
					},
					onFinalResult: (result: any) => {
						if (result.sessionId) {
							this._currentSessionId = result.sessionId;
							this._sendAndSaveMessage({
								type: 'sessionInfo',
								data: {
									sessionId: result.sessionId
								}
							});
						}
						// Update totals from message processor
						const totals = this._messageProcessor.getTotals();
						this._totalCost = totals.totalCost;
						this._totalTokensInput = totals.totalTokensInput;
						this._totalTokensOutput = totals.totalTokensOutput;
						this._requestCount = totals.requestCount;
					},
					onError: (error: string) => {
						if (error.includes('login')) {
							this._handleLoginRequired();
						} else {
							this._sendAndSaveMessage({ type: 'error', data: error });
						}
					},
					sendToWebview: (message: any) => {
						this._panel?.webview.postMessage(message);
					},
					saveMessage: (message: any) => {
						this._sendAndSaveMessage(message);
					}
				});
			},
			onError: (error: string) => {
				console.error('Claude stderr:', error);
				// Check for specific MCP-related errors
				if (error.includes('--mcp-server')) {
					console.error('ERROR: Claude is complaining about --mcp-server');
				}
			},
			onClose: (code: number | null) => {
				this._panel?.webview.postMessage({ type: 'setProcessing', data: false });
				if (code !== 0) {
					// Error handling is done through onError callback
				}
			}
		};

		try {
			await this._processService.startProcess(processOptions, callbacks);
		} catch (error: any) {
			this._panel?.webview.postMessage({ type: 'setProcessing', data: false });
			
			// Provide more specific error messages for common Windows issues
			let errorMessage = this._windowsCompatibility.providePlatformSpecificError(error);
			
			this._sendAndSaveMessage({ type: 'error', data: errorMessage });
		}
	}

	// This method is no longer used - replaced by MessageProcessor
	// private _processJsonStreamData(jsonData: any) { }

	private _newSession() {
		// Clear current session
		this._currentSessionId = undefined;

		// Clear conversation
		this._conversationManager.clearCurrentConversation();

		// Reset counters
		this._totalCost = 0;
		this._totalTokensInput = 0;
		this._totalTokensOutput = 0;
		this._requestCount = 0;

		// Reset message processor
		this._messageProcessor.reset();

		// Notify webview to clear all messages and reset session
		this._panel?.webview.postMessage({
			type: 'sessionCleared'
		});
	}


	private _handleLoginRequired() {
		// Clear processing state
		this._panel?.webview.postMessage({
			type: 'setProcessing',
			data: false
		});

		// Show login required message
		this._panel?.webview.postMessage({
			type: 'loginRequired'
		});

		// Open terminal and run claude login
		const terminal = vscode.window.createTerminal('Claude Login');
		terminal.sendText(this._windowsCompatibility.getLoginCommand());
		terminal.show();

		// Show info message
		vscode.window.showInformationMessage(
			'Please login to Claude in the terminal, then come back to this chat to continue.',
			'OK'
		);

		// Send message to UI about terminal
		this._panel?.webview.postMessage({
			type: 'terminalOpened',
			data: `Please login to Claude in the terminal, then come back to this chat to continue.`,
		});
	}

	private async _handleRestoreCommit(commitSha: string): Promise<void> {
		this._panel?.webview.postMessage({
			type: 'restoreProgress',
			data: 'Restoring files from backup...'
		});

		const result = await this._backupManager.restoreToCommit(commitSha);

		if (result.success) {
			this._sendAndSaveMessage({
				type: 'restoreSuccess',
				data: {
					message: result.message,
					commitSha: commitSha
				}
			});
		} else {
			this._panel?.webview.postMessage({
				type: 'restoreError',
				data: result.message
			});
		}
	}


	private _sendAndSaveMessage(message: { type: string, data: any }): void {
		if (message.type === 'sessionInfo') {
			message.data.sessionId;
		}

		// Send to UI
		this._panel?.webview.postMessage(message);

		// Save to conversation
		this._conversationManager.addMessage({
			timestamp: new Date().toISOString(),
			messageType: message.type,
			data: message.data
		});

		// Persist conversation
		void this._saveCurrentConversation();
	}

	private async _saveCurrentConversation(): Promise<void> {
		await this._conversationManager.saveCurrentConversation(
			this._currentSessionId,
			this._totalCost,
			this._totalTokensInput,
			this._totalTokensOutput
		);
		// Refresh tree view
		this._treeProvider?.refresh();
	}

	public setTreeProvider(treeProvider: ClaudeChatViewProvider): void {
		this._treeProvider = treeProvider;
	}

	public async loadConversation(filename: string): Promise<void> {
		// Show the webview first
		await this.show();

		// Load the conversation history
		await this._loadConversationHistory(filename);
	}

	private _sendConversationList(): void {
		this._panel?.webview.postMessage({
			type: 'conversationList',
			data: this._conversationManager.conversationIndex
		});
	}

	private async _sendStatistics(statsType: string): Promise<void> {
		try {
			// For now, we'll create a data loader service to read JSONL files
			const statistics = await this._loadStatistics(statsType);
			
			this._panel?.webview.postMessage({
				type: 'statisticsData',
				data: statistics
			});
		} catch (error: any) {
			this._panel?.webview.postMessage({
				type: 'statisticsData',
				data: {
					error: error.message || 'Failed to load statistics'
				}
			});
		}
	}

	private async _loadStatistics(type: string): Promise<any> {
		// This is a simplified implementation. In a full implementation,
		// you would read from ~/.claude/projects/**/*.jsonl files
		// and aggregate the data like CCusage does.
		
		const os = require('os');
		const path = require('path');
		const fs = require('fs').promises;
		
		// Determine Claude config directory
		const homeDir = os.homedir();
		const claudeDir = path.join(homeDir, '.claude', 'projects');
		
		try {
			// Find all JSONL files using VS Code's file system API
			const files: string[] = [];
			
			async function findJsonlFiles(dir: string): Promise<void> {
				try {
					const entries = await fs.readdir(dir, { withFileTypes: true });
					for (const entry of entries) {
						const fullPath = path.join(dir, entry.name);
						if (entry.isDirectory()) {
							await findJsonlFiles(fullPath);
						} else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
							files.push(fullPath);
						}
					}
				} catch (e) {
					// Skip directories that can't be read
				}
			}
			
			await findJsonlFiles(claudeDir);
			
			if (files.length === 0) {
				return {
					rows: [],
					totals: {
						inputTokens: 0,
						outputTokens: 0,
						totalTokens: 0,
						cost: 0
					}
				};
			}
			
			// Read and parse all JSONL files
			const allEntries = [];
			for (const file of files) {
				try {
					const content = await fs.readFile(file, 'utf-8');
					const lines = content.split('\n').filter((line: string) => line.trim());
					
					for (const line of lines) {
						try {
							const entry = JSON.parse(line);
							if (entry.message?.usage) {
								allEntries.push({
									timestamp: entry.timestamp,
									usage: entry.message.usage,
									costUSD: entry.costUSD || 0,
									model: entry.message.model,
									cacheCreationTokens: entry.message.usage.cache_creation_input_tokens || 0,
									cacheReadTokens: entry.message.usage.cache_read_input_tokens || 0,
									file: file // Include file path for session grouping
								});
							}
						} catch (e) {
							// Skip invalid JSON lines
						}
					}
				} catch (e) {
					// Skip files that can't be read
				}
			}
			
			// Aggregate data based on type
			return this._aggregateStatistics(allEntries, type);
			
		} catch (error) {
			console.error('Error loading statistics:', error);
			throw error;
		}
	}

	private _aggregateStatistics(entries: any[], type: string): any {
		// Pricing data (per million tokens)
		const modelPricing: { [key: string]: { input: number; output: number } } = {
			'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
			'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
			'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
			'claude-3-5-sonnet-20240620': { input: 3.00, output: 15.00 },
			'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
			'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
			// Add more models as needed
		};
		
		const aggregated = new Map();
		
		entries.forEach(entry => {
			const date = new Date(entry.timestamp);
			let key;
			
			switch (type) {
				case 'daily':
					key = date.toISOString().split('T')[0]; // YYYY-MM-DD
					break;
				case 'monthly':
					key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
					break;
				case 'blocks':
					// Calculate 5-hour block
					const blockStartHour = Math.floor(date.getHours() / 5) * 5;
					const blockEndHour = blockStartHour + 5;
					key = `${date.toISOString().split('T')[0]} ${String(blockStartHour).padStart(2, '0')}:00-${String(blockEndHour).padStart(2, '0')}:00`;
					break;
				case 'session':
					// Extract project name from file path using a generic approach
					let projectName = 'unknown';
					
					// First try standard Claude path: ~/.claude/projects/[project-name]/[timestamp].jsonl
					const standardMatch = entry.file.match(/projects[\\\/]([^\\\/]+)[\\\/]/);
					if (standardMatch) {
						projectName = standardMatch[1];
					} else {
						// For non-standard paths, Claude Code appears to convert the full path to a filename
						// Format: path-segments-separated-by-hyphens-TIMESTAMP.jsonl
						// Example: C-Users-LiuKe-Desktop-AI-coding-Async-code-2024-12-29T09-41-22.394Z.jsonl
						
						// Remove timestamp and extension
						const cleanedPath = entry.file.replace(/-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.jsonl$/, '');
						
						// Split by hyphens to get path segments
						const segments = cleanedPath.split('-');
						
						// Common system/generic folder names to skip
						const skipPatterns = [
							/^[A-Z]$/, // Drive letters
							/^Users?$/i,
							/^Desktop$/i,
							/^Documents?$/i,
							/^Downloads?$/i,
							/^Home$/i,
							/^[Ww]orkspace[s]?$/,
							/^[Pp]rojects?$/,
							/^[Rr]epos?$/,
							/^[Rr]epositories$/,
							/^[Dd]ev(?:elopment)?$/,
							/^[Cc]ode$/,
							/^[Ss]rc$/,
							/^[Ss]ource$/,
							/^www$/i,
							/^htdocs$/i,
							/^public$/i,
							/^private$/i,
							/^\d+$/, // Pure numbers
							/^temp$/i,
							/^tmp$/i,
							/^var$/i,
							/^opt$/i,
							/^work$/i
						];
						
						// Function to check if a segment should be skipped
						const shouldSkip = (segment: string) => {
							return skipPatterns.some(pattern => pattern.test(segment));
						};
						
						// Try to find the best project name candidate
						// Strategy: Look for meaningful folder names from the end of the path
						let candidates: { name: string; score: number }[] = [];
						
						// Check single segments first
						for (let i = segments.length - 1; i >= 0; i--) {
							const segment = segments[i];
							if (!shouldSkip(segment) && segment.length > 1) {
								let score = 0;
								
								// Higher score for being closer to the end
								score += (segments.length - i) * 2;
								
								// Higher score for reasonable length
								if (segment.length >= 3 && segment.length <= 30) score += 2;
								
								// Lower score for all uppercase (might be acronym, but often system folders)
								if (segment === segment.toUpperCase() && segment.length > 3) score -= 1;
								
								candidates.push({ name: segment, score });
							}
						}
						
						// Also check combinations for hyphenated project names
						// Look for 2-4 consecutive segments that might form a project name
						for (let start = Math.max(0, segments.length - 5); start < segments.length; start++) {
							for (let length = 2; length <= 4 && start + length <= segments.length; length++) {
								const combined = segments.slice(start, start + length);
								
								// Skip if any segment in the combination should be skipped
								if (combined.some((seg: string) => shouldSkip(seg))) continue;
								
								const combinedName = combined.join('-');
								
								// Skip if it's too long
								if (combinedName.length > 40) continue;
								
								let score = 0;
								
								// Higher score for being closer to the end
								score += (segments.length - start) * 2;
								
								// Higher score for hyphenated names (common in projects)
								score += length * 3;
								
								// Higher score for common project name patterns
								if (combinedName.match(/-app$|-web$|-api$|-cli$|-ui$|-client$|-server$|-frontend$|-backend$|-service$/i)) {
									score += 5;
								}
								
								candidates.push({ name: combinedName, score });
							}
						}
						
						// Sort by score and pick the best candidate
						candidates.sort((a, b) => b.score - a.score);
						
						if (candidates.length > 0) {
							projectName = candidates[0].name;
						}
					}
					
					// Use only project name as key to group all sessions of same project together
					key = projectName;
					break;
				default:
					key = date.toISOString().split('T')[0];
			}
			
			if (!aggregated.has(key)) {
				aggregated.set(key, {
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					totalTokens: 0,
					cost: 0,
					models: new Set(),
					lastTimestamp: date // Track last activity timestamp
				});
			}
			
			const stats = aggregated.get(key);
			stats.inputTokens += entry.usage.input_tokens || 0;
			stats.outputTokens += entry.usage.output_tokens || 0;
			stats.cacheCreationTokens += entry.cacheCreationTokens || 0;
			stats.cacheReadTokens += entry.cacheReadTokens || 0;
			stats.totalTokens += (entry.usage.input_tokens || 0) + (entry.usage.output_tokens || 0);
			
			// Calculate cost if it's 0 or missing
			let cost = entry.costUSD || 0;
			if (cost === 0 && entry.model && modelPricing[entry.model]) {
				const pricing = modelPricing[entry.model];
				const inputCost = ((entry.usage.input_tokens || 0) * pricing.input) / 1000000;
				const outputCost = ((entry.usage.output_tokens || 0) * pricing.output) / 1000000;
				cost = inputCost + outputCost;
			}
			stats.cost += cost;
			
			if (entry.model) {
				stats.models.add(entry.model);
			}
			
			// Update last timestamp if this entry is newer
			if (date > stats.lastTimestamp) {
				stats.lastTimestamp = date;
			}
		});
		
		// Convert to array and sort
		const rows = Array.from(aggregated.entries())
			.map(([key, stats]) => {
				const result: any = {
					...stats,
					models: Array.from(stats.models) // Convert Set to Array
				};
				
				if (type === 'blocks') {
					result.block = key;
					// Determine if block is active (has usage in last hour)
					const now = new Date();
					const blockDate = new Date(key.split(' ')[0]);
					const blockStartHour = parseInt(key.split(' ')[1].split('-')[0]);
					blockDate.setHours(blockStartHour);
					
					const hoursSinceBlock = (now.getTime() - blockDate.getTime()) / (1000 * 60 * 60);
					result.status = hoursSinceBlock < 5 ? 'active' : 'inactive';
				} else {
					result[type === 'daily' ? 'date' : type === 'monthly' ? 'month' : 'session'] = key;
					
					// Add lastActivity for session view
					if (type === 'session' && stats.lastTimestamp) {
						const lastActivity = new Date(stats.lastTimestamp);
						// Format as YYYY-MM-DD HH:mm
						const year = lastActivity.getFullYear();
						const month = String(lastActivity.getMonth() + 1).padStart(2, '0');
						const day = String(lastActivity.getDate()).padStart(2, '0');
						const hours = String(lastActivity.getHours()).padStart(2, '0');
						const minutes = String(lastActivity.getMinutes()).padStart(2, '0');
						result.lastActivity = `${year}-${month}-${day} ${hours}:${minutes}`;
					}
				}
				
				return result;
			})
			.sort((a, b) => {
				// For session view, sort by lastActivity date (newest first)
				if (type === 'session' && a.lastActivity && b.lastActivity) {
					return b.lastActivity.localeCompare(a.lastActivity);
				}
				// For other views, use the regular key comparison
				const keyA = a.date || a.month || a.session || a.block;
				const keyB = b.date || b.month || b.session || b.block;
				return keyB.localeCompare(keyA); // Descending order
			});
		
		// Calculate totals
		const totals = rows.reduce((acc, row) => ({
			inputTokens: acc.inputTokens + row.inputTokens,
			outputTokens: acc.outputTokens + row.outputTokens,
			cacheCreationTokens: acc.cacheCreationTokens + row.cacheCreationTokens,
			cacheReadTokens: acc.cacheReadTokens + row.cacheReadTokens,
			totalTokens: acc.totalTokens + row.totalTokens,
			cost: acc.cost + row.cost
		}), {
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			totalTokens: 0,
			cost: 0
		});
		
		return { rows, totals };
	}

	private async _sendWorkspaceFiles(searchTerm?: string): Promise<void> {
		const fileList = await this._fileOperationsManager.getWorkspaceFiles(searchTerm);
		this._panel?.webview.postMessage({
			type: 'workspaceFiles',
			data: fileList
		});
	}

	private async _handlePasteImage(imageData: string, mimeType: string): Promise<void> {
		try {
			// Generate filename based on timestamp
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, '_').split('Z')[0];
			const extension = mimeType.split('/')[1] || 'png';
			const filename = `pasted-image-${timestamp}.${extension}`;
			
			// Get workspace folder
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}
			
			// Create images directory if it doesn't exist
			const imagesDir = vscode.Uri.joinPath(workspaceFolder.uri, 'images');
			try {
				await vscode.workspace.fs.stat(imagesDir);
			} catch {
				// Directory doesn't exist, create it
				await vscode.workspace.fs.createDirectory(imagesDir);
			}
			
			// Save image file
			const imagePath = vscode.Uri.joinPath(imagesDir, filename);
			const imageBuffer = Buffer.from(imageData, 'base64');
			await vscode.workspace.fs.writeFile(imagePath, imageBuffer);
			
			// Send back the file path to insert into the input
			const relativePath = vscode.workspace.asRelativePath(imagePath);
			this._panel?.webview.postMessage({
				type: 'imagePath',
				path: relativePath
			});
			
			// Show info message
			vscode.window.showInformationMessage(`Image saved: ${relativePath}`);
		} catch (error: any) {
			console.error('Error handling pasted image:', error);
			vscode.window.showErrorMessage(`Failed to save pasted image: ${error.message}`);
		}
	}


	private async _stopClaudeProcess(): Promise<void> {
		// DEBUG: console.log('Stop request received');
		
		if (this._processService.isProcessRunning()) {
			// DEBUG: console.log('Terminating Claude process...');
			
			try {
				await this._processService.stopProcess();
				
				// Update UI state
				this._panel?.webview.postMessage({
					type: 'setProcessing',
					data: false
				});
				
				this._panel?.webview.postMessage({
					type: 'clearLoading'
				});
				
				// Send stop confirmation message directly to UI and save
				this._sendAndSaveMessage({
					type: 'error',
					data: '⏹️ Claude code was stopped.'
				});
				
				// DEBUG: console.log('Claude process termination completed');
			} catch (error) {
				console.error('Error stopping Claude process:', error);
			}
		} else {
			// DEBUG: console.log('No Claude process running to stop');
		}
	}


	private async _loadConversationHistory(filename: string): Promise<void> {
		const conversationData = await this._conversationManager.loadConversationHistory(filename);
		if (!conversationData) {return;}

		// Update current state from loaded conversation
		this._totalCost = conversationData.totalCost || 0;
		this._totalTokensInput = conversationData.totalTokens?.input || 0;
		this._totalTokensOutput = conversationData.totalTokens?.output || 0;
		
		// Reset message processor and update its state
		this._messageProcessor.reset();
		// Note: MessageProcessor state will be automatically updated when messages are processed

		// Clear UI messages first, then send all messages to recreate the conversation
		setTimeout(() => {
			// Clear existing messages
			this._panel?.webview.postMessage({
				type: 'sessionCleared'
			});

			// Small delay to ensure messages are cleared before loading new ones
			setTimeout(() => {
				for (const message of this._conversationManager.currentConversation) {
					this._panel?.webview.postMessage({
						type: message.messageType,
						data: message.data
					});
				}

				// Send updated totals
				this._panel?.webview.postMessage({
					type: 'updateTotals',
					data: {
						totalCost: this._totalCost,
						totalTokensInput: this._totalTokensInput,
						totalTokensOutput: this._totalTokensOutput,
						requestCount: this._requestCount
					}
				});
			}, 50);
		}, 100); // Small delay to ensure webview is ready
	}

	private async _getHtmlForWebview(): Promise<string> {
		// Load UI based on configuration (which is now hardcoded to v2)
		return await loadUIHtml(this._configurationManager);
	}

	private _sendCurrentSettings(): void {
		const settings = this._configurationManager.getCurrentSettings();

		// DEBUG: console.log('Sending current settings including MCP:', settings);

		this._panel?.webview.postMessage({
			type: 'settingsData',
			data: settings
		});
	}

	private async _updateSettings(settings: { [key: string]: any }): Promise<void> {
		// DEBUG: console.log('Updating settings:', settings);
		
		try {
			await this._configurationManager.updateSettings(settings);
			
			// Send updated MCP status
			if (settings['mcp.enabled']) {
				this._sendMcpStatus();
			}
		} catch (error) {
			console.error('Failed to update settings:', error);
		}
	}
	
	private async _testMcpConnection(): Promise<void> {
		// Send testing status
		this._panel?.webview.postMessage({
			type: 'mcpStatus',
			data: { status: 'testing', message: 'Testing MCP connection...' }
		});

		const result = await this._configurationManager.testMcpConnection(
			() => this._windowsCompatibility.getExecutionEnvironment()
		);

		this._panel?.webview.postMessage({
			type: 'mcpStatus',
			data: result
		});
	}
	
	private _sendMcpStatus(): void {
		const mcpStatus = this._configurationManager.getMcpStatus();
		
		this._panel?.webview.postMessage({
			type: 'mcpStatus',
			data: mcpStatus
		});
	}


	private _setSelectedModel(model: string): void {
		// Validate model name to prevent issues mentioned in the GitHub issue
		const validModels = ['opus', 'sonnet', 'default'];
		if (validModels.includes(model)) {
			this._selectedModel = model;
			// DEBUG: console.log('Model selected:', model);
			
			// Store the model preference in workspace state
			this._context.workspaceState.update('claude.selectedModel', model);
			
			// Show confirmation
			vscode.window.showInformationMessage(`Claude model switched to: ${model.charAt(0).toUpperCase() + model.slice(1)}`);
		} else {
			console.error('Invalid model selected:', model);
			vscode.window.showErrorMessage(`Invalid model: ${model}. Please select Opus, Sonnet, or Default.`);
		}
	}

	private async _openModelTerminal(): Promise<void> {
		try {
			const terminal = await this._windowsCompatibility.createTerminal('Claude Code Model Setup', true);
			terminal.sendText('claude model');
			terminal.show();
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to open model terminal: ${error.message}`);
		}
	}

	private async _executeSlashCommand(command: string): Promise<void> {
		try {
			console.log(`[ClaudeChatProvider] Starting _executeSlashCommand for: /${command}`);
			
			// Since we're using SDK mode (not interactive REPL), we need to handle slash commands internally
			// Slash commands only work in interactive Claude CLI, not in SDK mode with -p flag
			
			switch (command.toLowerCase()) {
				case 'help':
					this._sendAndSaveMessage({
						type: 'output',
						data: `## Claude Code Chat - Available Commands

**Slash Commands:**
• \`/help\` - Show this help message
• \`/clear\` - Clear conversation history
• \`/status\` - Show current session status
• \`/cost\` - Show token usage and cost
• \`/model\` - Switch AI model
• \`/config\` - View configuration

**Features:**
• Ask questions about your codebase
• Edit and create files
• Run commands and tests  
• Get code explanations and reviews

**Note:** This VS Code extension uses Claude Code in SDK mode. Some CLI-specific commands like /login, /doctor, /mcp are not available here. Use the terminal for full CLI features.`
					});
					return;
					
				case 'clear':
					// Clear conversation history
					if (this._currentSessionId) {
						this._conversationManager.clearCurrentConversation();
					}
					this._currentSessionId = undefined;
					this._panel?.webview.postMessage({ type: 'clearMessages' });
					this._sendAndSaveMessage({
						type: 'output',
						data: 'Conversation history cleared. Starting fresh!'
					});
					return;
					
				case 'status':
					const sessionInfo = this._currentSessionId 
						? `Active session: ${this._currentSessionId}`
						: 'No active session';
					const modelInfo = `Model: ${this._selectedModel || 'opus'}`;
					const processInfo = this._processService.isProcessRunning() 
						? 'Claude process: Running'
						: 'Claude process: Not running';
					this._sendAndSaveMessage({
						type: 'output',
						data: `## Status\n\n${sessionInfo}\n${modelInfo}\n${processInfo}\nClaude Code Chat UI v${this._context.extension.packageJSON.version}`
					});
					return;
					
				case 'cost':
					// Get token usage from the last message in UI
					const costMessage = this._currentSessionId 
						? 'Check the token usage display at the bottom of each message in the chat.'
						: 'No active session. Start a conversation to see token usage.';
					this._sendAndSaveMessage({
						type: 'output',
						data: `## Token Usage\n\n${costMessage}\n\nNote: Detailed cost tracking is shown in the UI after each message.`
					});
					return;
					
				case 'model':
					// Show model selection info
					this._sendAndSaveMessage({
						type: 'output',
						data: `## Model Selection\n\nCurrent model: ${this._selectedModel || 'opus'}\n\nAvailable models:\n• opus - Claude 3 Opus (most capable)\n• sonnet - Claude 3.5 Sonnet (balanced)\n• haiku - Claude 3 Haiku (fastest)\n\nTo change model, use the model selector dropdown in the UI.`
					});
					return;
					
				case 'config':
					// Show key configuration
					const settings = this._configurationManager.getCurrentSettings();
					const configInfo = {
						'Git Bash Path': settings['windows.gitBashPath'],
						'Thinking Mode': settings['thinking.intensity'],
						'MCP Enabled': settings['mcp.enabled'],
						'MCP Servers': settings['mcp.servers']?.length || 0
					};
					this._sendAndSaveMessage({
						type: 'output',
						data: `## Configuration\n\n\`\`\`json\n${JSON.stringify(configInfo, null, 2)}\n\`\`\`\n\nTo modify settings, use VS Code settings (Ctrl+,) and search for "Claude Code Chat".`
					});
					return;
					
				default:
					// For unsupported commands, show a helpful message
					this._sendAndSaveMessage({
						type: 'output',
						data: `The \`/${command}\` command is not available in this VS Code extension.\n\nThis extension uses Claude Code in SDK mode, which doesn't support all CLI commands.\n\nAvailable commands: /help, /clear, /status, /cost, /model, /config\n\nFor full CLI features, use Claude Code directly in the terminal.`
					});
					return;
			}
		} catch (error: any) {
			console.error(`[ClaudeChatProvider] Exception in _executeSlashCommand:`, error);
			this._sendAndSaveMessage({
				type: 'error',
				data: `Failed to execute command: ${error.message}`
			});
		}
	}


	private _sendCustomCommands(): void {
		this._panel?.webview.postMessage({
			type: 'customCommands',
			data: this._customCommandsManager.getCommands()
		});
	}

	private async _executeCustomCommand(command: string): Promise<void> {
		try {
			const terminal = await this._windowsCompatibility.createTerminal(`Custom: ${command.split(' ')[0]}`);
			terminal.sendText(command);
			terminal.show();
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to execute custom command: ${error.message}`);
		}
	}


	public dispose() {
		if (this._panel) {
			this._panel.dispose();
			this._panel = undefined;
		}

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}