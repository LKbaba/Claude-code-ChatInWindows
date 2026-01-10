import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import { loadUIHtml } from '../ui-loader';
import { resolveNpmPrefix, updateClaudeMdWithWindowsInfo } from '../utils/utils';
import { FileOperationsManager } from '../managers/FileOperationsManager';
import { ConfigurationManagerFacade } from '../managers/config/ConfigurationManagerFacade';
import { CustomCommandsManager } from '../managers/CustomCommandsManager';
import { ClaudeChatViewProvider } from './ClaudeChatViewProvider';
import { BackupManager } from '../managers/BackupManager';
import { ConversationManager } from '../managers/ConversationManager';
import { WindowsCompatibility } from '../managers/WindowsCompatibility';
import { ClaudeProcessService } from '../services/ClaudeProcessService';
import { MessageProcessor } from '../services/MessageProcessor';
import { OperationTracker } from '../managers/OperationTracker';
import { UndoRedoManager } from '../managers/UndoRedoManager';
import { OperationPreviewService } from '../services/OperationPreview';
import { expandVariables } from '../utils/configUtils';
import { StatisticsCache, StatisticsEntry } from '../services/StatisticsCache';
import { VALID_MODELS, ValidModel } from '../utils/constants';
import { PluginManager } from '../services/PluginManager';
import { secretService, SecretService } from '../services/SecretService';
import { debugLog, debugWarn, debugError } from '../services/DebugLogger';

// Compute mode settings interface
interface ComputeModeSettings {
	mode: 'auto' | 'max';           // Compute mode selection
	enhanceSubagents: boolean;       // Whether to enhance subagents (independent setting)
}

export class ClaudeChatProvider {
	private _panel: vscode.WebviewPanel | undefined;
	private _disposables: vscode.Disposable[] = [];
	private _totalCost: number = 0;
	private _totalTokensInput: number = 0;
	private _totalTokensOutput: number = 0;
	private _requestCount: number = 0;
	private _currentSessionId: string | undefined;
	private _conversationId: string | undefined;  // Main conversation ID that persists across sessions
	private _treeProvider: ClaudeChatViewProvider | undefined;
	private _selectedModel: string = 'claude-sonnet-4-5-20250929'; // Default to Sonnet 4.5
	private _npmPrefixPromise: Promise<string | undefined>;
	private _fileOperationsManager: FileOperationsManager;
	private _configurationManager: ConfigurationManagerFacade;
	private _customCommandsManager: CustomCommandsManager;
	private _backupManager: BackupManager;
	private _conversationManager: ConversationManager;
	private _windowsCompatibility: WindowsCompatibility;
	private _processService: ClaudeProcessService;
	private _messageProcessor: MessageProcessor;
	private _operationTracker: OperationTracker;
	private _undoRedoManager: UndoRedoManager;
	private _operationPreviewService: OperationPreviewService;
	private _statisticsCache: StatisticsCache;
	private _isCompactMode: boolean = false; // Compact mode flag
	private _compactSummaryBuffer: string = ''; // Compact summary buffer

	// Static model pricing data (using Map for better lookup efficiency)
	private static readonly MODEL_PRICING = new Map<string, { input: number; output: number }>([
		// Opus model series pricing
		['claude-opus-4-5-20251101', { input: 5.00, output: 25.00 }],    // Opus 4.5 latest flagship model (66% price cut)
		['claude-opus-4-1-20250805', { input: 15.00, output: 75.00 }],   // Opus 4.1 flagship model
		['claude-opus-4-20250514', { input: 15.00, output: 75.00 }],     // Opus 4
		['claude-3-opus-20240229', { input: 15.00, output: 75.00 }],     // Claude 3 Opus
		// Sonnet model series pricing
		['claude-sonnet-4-5-20250929', { input: 3.00, output: 15.00 }],  // Sonnet 4.5 latest intelligent model
		['claude-sonnet-4-20250514', { input: 3.00, output: 15.00 }],    // Sonnet 4
		['claude-3-5-sonnet-20241022', { input: 3.00, output: 15.00 }],  // Claude 3.5 Sonnet
		['claude-3-5-sonnet-20240620', { input: 3.00, output: 15.00 }],
		['claude-3-sonnet-20240229', { input: 3.00, output: 15.00 }],    // Claude 3 Sonnet
		// Haiku model series pricing
		['claude-haiku-4-5-20251001', { input: 1.00, output: 5.00 }],    // Haiku 4.5 cost-effective model
		['claude-3-haiku-20240307', { input: 0.25, output: 1.25 }],      // Claude 3 Haiku
	]);

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext
	) {
		this._npmPrefixPromise = resolveNpmPrefix();
		// Initialize managers
		this._fileOperationsManager = new FileOperationsManager();
		this._configurationManager = new ConfigurationManagerFacade();
		this._customCommandsManager = new CustomCommandsManager(this._context);
		this._backupManager = new BackupManager(this._context);
		this._conversationManager = new ConversationManager(this._context);
		this._windowsCompatibility = new WindowsCompatibility(this._npmPrefixPromise, this._configurationManager);
		
		// Initialize operation tracking
		this._operationTracker = new OperationTracker(this._context);
		this._undoRedoManager = new UndoRedoManager(this._context, this._operationTracker);
		this._operationPreviewService = new OperationPreviewService(this._operationTracker);
		
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
			this._operationTracker,
			workspaceFolder?.uri.fsPath
		);
		
		// Initialize statistics cache
		this._statisticsCache = new StatisticsCache();
		
		// Initialize conversations
		this._conversationManager.initializeConversations();
		
		// Initialize backup repository asynchronously
		// We don't await here to avoid blocking constructor, but we'll ensure it's ready in show()
		this._backupManager.initializeBackupRepo().catch(error => {
			debugError('ClaudeChatProvider', 'Failed to initialize backup repo', error);
		});

		// Load saved model preference (default to Sonnet 4.5)
		this._selectedModel = this._context.workspaceState.get('claude.selectedModel', 'claude-sonnet-4-5-20250929');

		// Restore compute mode state
		this._restoreComputeModeState();

		// Custom commands are now loaded by CustomCommandsManager

		// Resume session from latest conversation
		const latestConversation = this._conversationManager.getLatestConversation();
		this._currentSessionId = latestConversation?.sessionId;
		
		// Set conversationId from latest conversation
		// This ensures operations from the same conversation are grouped together
		if (latestConversation?.sessionId) {
			this._conversationId = latestConversation.sessionId;
		}
		
		// Load saved operations
		this._operationTracker.loadOperations()
			.then(() => {
				// Send operation history after loading
				this._sendOperationHistory();
			})
			.catch(error => {
				debugError('ClaudeChatProvider', 'Failed to load operations', error);
			});
		
		// Set current session in operation tracker using conversationId
		if (this._conversationId) {
			this._operationTracker.setCurrentSession(this._conversationId);
		}
	}

	public async show() {
		const column = vscode.ViewColumn.Two;

		if (this._panel) {
			this._panel.reveal(column);
			return;
		}
		
		// Ensure backup repository is initialized
		await this._backupManager.initializeBackupRepo();
		
		// Update CLAUDE.md file (add Windows environment info and MCP usage guide)
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (workspaceFolder) {
			// Get currently enabled MCP servers
			const mcpStatus = this._configurationManager.getMcpStatus();
			await updateClaudeMdWithWindowsInfo(workspaceFolder, mcpStatus.servers);
		}

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
						this._sendMessageToClaude(message.text, message.planMode, message.thinkingMode, message.languageMode, message.selectedLanguage);
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
							// Get webview-accessible URI
							const fileUri = vscode.Uri.file(filePath);
							const webviewUri = this._panel?.webview.asWebviewUri(fileUri);
							
							this._panel?.webview.postMessage({
								type: 'imagePath',
								path: filePath,
								webviewUri: webviewUri?.toString()
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
					case 'updateMcpServers':
						// Update MCP server configuration for the specified scope
						this._updateMcpServersForScope(message.scope, message.servers);
						return;
					case 'testMcpConnection':
						this._testMcpConnection();
						return;
					case 'setMcpConfigTarget':
						// Set MCP configuration save target ('user' or 'workspace')
						this._configurationManager.setMcpConfigTarget(message.target);
						return;
					case 'getMcpTools':
						this._getMcpTools(message.serverId, message.serverName);
						return;
					case 'getInstalledPlugins':
						// Get cached plugin list
						this._getInstalledPlugins();
						return;
					case 'refreshPlugins':
						// Refresh plugin list
						this._refreshPlugins();
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
					case 'selectMode':
						this._handleModeSelection(message.mode);
						return;
					case 'updateSubagentMode':
						this._handleSubagentEnhancement(message.enabled);
						return;
					case 'openModelTerminal':
						this._openModelTerminal();
						return;
					case 'executeSlashCommand':
						this._executeSlashCommand(message.command);
						return;
					case 'openFile':
						// Handle file path click event
						if (message.file) {
							// New message format with file, line, endLine
							this._openFileAtLine(message.file, message.line, message.endLine);
						} else if (message.filePath) {
							// Compatible with old message format
							this._fileOperationsManager.openFileInEditor(message.filePath);
						}
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
					case 'previewOperation':
						this._previewOperation(message.operationId, message.action);
						return;
					case 'undoOperation':
						this._undoOperation(message.operationId);
						return;
					case 'redoOperation':
						this._redoOperation(message.operationId);
						return;
					case 'getOperationHistory':
						this._sendOperationHistory();
						return;
					case 'compactConversation':
						this._compactConversation(message.languageMode, message.selectedLanguage);
						return;
					// Gemini Integration related message handling
					case 'updateGeminiIntegration':
						this._updateGeminiIntegration(message.enabled);
						return;
					case 'updateGeminiApiKey':
						this._updateGeminiApiKey(message.apiKey);
						return;
					case 'getGeminiIntegration':
						this._sendGeminiIntegrationConfig();
						return;
				}
			},
			null,
			this._disposables
		);

		// Resume session from latest conversation
		const latestConversation = this._conversationManager.getLatestConversation();
		this._currentSessionId = latestConversation?.sessionId;
		
		// Ensure conversationId is set
		if (latestConversation?.sessionId && !this._conversationId) {
			this._conversationId = latestConversation.sessionId;
		}

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

			// Send operation history after ready
			this._sendOperationHistory();
			
			// Send initial token usage
			this._sendTokenUsage();

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

			// Send Gemini Integration config to webview
			this._sendGeminiIntegrationConfig();

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
	private async _sendMessageToClaude(message: string, planMode?: boolean, thinkingMode?: boolean, languageMode?: boolean, selectedLanguage?: string) {
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
			// Get currently enabled MCP servers
			const mcpStatus = this._configurationManager.getMcpStatus();
			await updateClaudeMdWithWindowsInfo(workspaceFolder, mcpStatus.servers);
		}
		
		// Ensure conversationId is set before processing
		if (!this._conversationId && this._currentSessionId) {
			this._conversationId = this._currentSessionId;
			debugLog('ClaudeChatProvider', `Set conversationId from currentSessionId: ${this._conversationId}`);
			this._operationTracker.setCurrentSession(this._conversationId);
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
				case 'sequential-thinking':
					// Use MCP Sequential Thinking tool for structured reasoning
					thinkingPrompt = 'USE THE MCP SEQUENTIAL THINKING TOOL (mcp__sequential-thinking__sequentialthinking) TO';
					break;
				default:
					thinkingPrompt = 'THINK';
			}
			actualMessage = windowsEnvironmentInfo + thinkingPrompt + thinkingMessage + actualMessage;
		}
		
		// Language Mode: Add language instruction at the end
		if (languageMode && selectedLanguage) {
			const languagePrompts: { [key: string]: string } = {
				'zh': '\n\n请用中文与我交流。在编写代码时，代码注释也请使用中文。',
				'es': '\n\nPor favor, comunícate conmigo en español. Al escribir código, también usa español en los comentarios del código.',
				'ar': '\n\nيرجى التواصل معي بالعربية. عند كتابة الكود، يرجى أيضًا استخدام العربية في تعليقات الكود.',
				'fr': '\n\nVeuillez communiquer avec moi en français. Lors de l\'écriture du code, veuillez également utiliser le français dans les commentaires du code.',
				'de': '\n\nBitte kommunizieren Sie mit mir auf Deutsch. Beim Schreiben von Code verwenden Sie bitte auch Deutsch in den Code-Kommentaren.',
				'ja': '\n\n日本語で私と会話してください。コードを書く際は、コードコメントも日本語で記述してください。',
				'ko': '\n\n한국어로 대화해 주세요. 코드를 작성할 때 코드 주석도 한국어로 작성해 주세요.'
			};
			
			const languagePrompt = languagePrompts[selectedLanguage];
			if (languagePrompt) {
				actualMessage = actualMessage + languagePrompt;
			}
		}

		// Don't display user input in compact mode
		if (!this._isCompactMode) {
			this._sendAndSaveMessage({ type: 'userInput', data: message });
		}
		this._panel?.webview.postMessage({ type: 'setProcessing', data: true });

		// Don't create backup commit in compact mode
		if (!this._isCompactMode) {
			// Create backup commit
			debugLog('ClaudeChatProvider', `Creating backup commit for message: ${message.substring(0, 50)}`);
			const commitInfo = await this._backupManager.createBackupCommit(message);
			debugLog('ClaudeChatProvider', 'Backup commit result', commitInfo);

			if (commitInfo) {
				// Show restore option in UI and save to conversation
				debugLog('ClaudeChatProvider', 'Sending showRestoreOption message to UI');
				this._sendAndSaveMessage({
					type: 'showRestoreOption',
					data: commitInfo
				});
			} else {
				debugLog('ClaudeChatProvider', 'No backup commit created (no changes or error)');
			}
		}

		// Reset message processor state for new conversation
		if (!this._currentSessionId) {
			this._messageProcessor.reset();
			// Don't reset operation tracker session here, we'll use conversationId
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
						if (this._isCompactMode) {
							// In compact mode, collect summary instead of displaying immediately
							this._compactSummaryBuffer += text;
						} else {
							// In normal mode, display Claude's response
							this._sendAndSaveMessage({
								type: 'output',
								data: text
							});
						}
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
						// Tool results are now handled by saveMessage to avoid duplication
						// The saveMessage callback below will handle sending to webview
					},
					onTokenUpdate: (tokens: any) => {
						this._totalTokensInput = tokens.totalTokensInput;
						this._totalTokensOutput = tokens.totalTokensOutput;
						this._sendAndSaveMessage({
							type: 'updateTokens',
							data: tokens
						});
						// Send token usage to UI
						this._sendTokenUsage();
					},
					onFinalResult: (result: any) => {
						if (result.sessionId) {
							this._currentSessionId = result.sessionId;
							
							// Set conversationId on first session creation
							if (!this._conversationId) {
								this._conversationId = result.sessionId;
								debugLog('ClaudeChatProvider', `Set conversationId: ${this._conversationId}`);
							}
							
							// Update operation tracker with conversationId
							if (this._conversationId) {
								this._operationTracker.setCurrentSession(this._conversationId);
							}
							
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
						}
						// Error messages are now handled by saveMessage to avoid duplication
					},
					sendToWebview: (message: any) => {
						// In compact mode, filter out current* fields from updateTotals messages
						// Prevents displaying cost statistics (the yellow message) in chat area
						if (this._isCompactMode && message.type === 'updateTotals' && message.data) {
							// Only send cumulative statistics, not current request statistics
							const filteredMessage = {
								type: 'updateTotals',
								data: {
									totalCost: message.data.totalCost,
									totalTokensInput: message.data.totalTokensInput,
									totalTokensOutput: message.data.totalTokensOutput,
									requestCount: message.data.requestCount
									// Excludes currentCost, currentDuration, currentTokensInput, currentTokensOutput
								}
							};
							this._panel?.webview.postMessage(filteredMessage);
						} else {
							this._panel?.webview.postMessage(message);
						}
					},
					saveMessage: (message: any) => {
						this._sendAndSaveMessage(message);
					},
					onOperationTracked: (operation: any) => {
						// Send operation info to UI
						this._panel?.webview.postMessage({
							type: 'operationTracked',
							data: operation
						});
						// Save operations periodically
						this._operationTracker.saveOperations();
					}
				});
			},
			onError: (error: string) => {
				debugError('ClaudeChatProvider', 'Claude stderr', { error });
				// Check for specific MCP-related errors
				if (error.includes('--mcp-server')) {
					debugError('ClaudeChatProvider', 'Claude is complaining about --mcp-server');
				}
			},
			onClose: (code: number | null) => {
				// In compact mode, send compactComplete message
				// This clears the frontend message list and displays the summary
				if (this._isCompactMode && this._compactSummaryBuffer.trim()) {
					const summaryMessage = `## ⚡ Conversation Summary\n\n${this._compactSummaryBuffer}\n\n---\n*This is a summary of the previous conversation. Starting a new conversation now.*`;

					debugLog('ClaudeChatProvider', 'Sending compactComplete message');

					// Send compactComplete message, frontend will clear message list and display summary
					this._panel?.webview.postMessage({
						type: 'compactComplete',
						summary: summaryMessage
					});

					// Also save to conversation history
					this._conversationManager.addMessage({
						timestamp: new Date().toISOString(),
						messageType: 'output',
						data: summaryMessage
					});
					void this._conversationManager.saveCurrentConversation(
						this._currentSessionId || Date.now().toString(),
						this._totalCost,
						this._totalTokensInput,
						this._totalTokensOutput
					);

					// Clear buffer
					this._compactSummaryBuffer = '';

					// Reset compact mode flag
					this._isCompactMode = false;
				}

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

	private _newSession(isCompacting: boolean = false) {
		debugLog('ClaudeChatProvider', `_newSession called, isCompacting: ${isCompacting}`);

		// Clear current session and conversation ID
		this._currentSessionId = undefined;
		this._conversationId = undefined;

		// Clear conversation
		this._conversationManager.clearCurrentConversation();

		// Reset counters
		this._totalCost = 0;
		this._totalTokensInput = 0;
		this._totalTokensOutput = 0;
		this._requestCount = 0;

		// Send token usage to UI
		this._sendTokenUsage();

		// Reset message processor
		this._messageProcessor.reset();

		// Reset operation tracker session
		this._operationTracker.setCurrentSession('');

		// Notify webview to clear all messages and reset session
		// isCompacting flag tells frontend whether compacting is in progress, avoids message race condition
		debugLog('ClaudeChatProvider', `Sending sessionCleared message with isCompacting: ${isCompacting}, isProcessing: ${isCompacting}`);
		this._panel?.webview.postMessage({
			type: 'sessionCleared',
			isCompacting: isCompacting,
			isProcessing: isCompacting  // If compacting, also set Processing state
		});
		debugLog('ClaudeChatProvider', 'sessionCleared message sent');
	}

	/**
	 * Open file and jump to specified line
	 * @param filePath File path (can be relative or absolute)
	 * @param line Start line number (1-based)
	 * @param endLine End line number (1-based)
	 */
	private async _openFileAtLine(filePath: string, line?: number, endLine?: number): Promise<void> {
		try {
			// 1. Get workspace root directory
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('Cannot find workspace folder');
				return;
			}

			// 2. Build full path
			let fullPath: vscode.Uri;
			if (path.isAbsolute(filePath)) {
				fullPath = vscode.Uri.file(filePath);
			} else {
				// Relative path: relative to workspace root
				fullPath = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, filePath));
			}

			// 3. Check if file exists
			try {
				await vscode.workspace.fs.stat(fullPath);
			} catch {
				// Try to find in common directories
				const alternativePaths = [
					path.join(workspaceFolder.uri.fsPath, 'src', filePath),
					path.join(workspaceFolder.uri.fsPath, 'lib', filePath),
					path.join(workspaceFolder.uri.fsPath, 'app', filePath),
					path.join(workspaceFolder.uri.fsPath, 'components', filePath),
					path.join(workspaceFolder.uri.fsPath, 'pages', filePath)
				];

				let found = false;
				for (const altPath of alternativePaths) {
					try {
						const altUri = vscode.Uri.file(altPath);
						await vscode.workspace.fs.stat(altUri);
						fullPath = altUri;
						found = true;
						break;
					} catch {
						continue;
					}
				}

				if (!found) {
					vscode.window.showErrorMessage(`File does not exist: ${filePath}`);
					debugError('FileNav', `File does not exist: ${filePath}`);
					return;
				}
			}

			// 4. Open document
			const document = await vscode.workspace.openTextDocument(fullPath);

			// 5. Set cursor position and selection range
			const options: vscode.TextDocumentShowOptions = {
				preserveFocus: false,
				preview: false
			};

			if (line && line > 0) {
				// VS Code uses 0-based line numbers, so subtract 1
				const startPos = new vscode.Position(line - 1, 0);
				const endPos = endLine && endLine > 0
					? new vscode.Position(endLine - 1, Number.MAX_SAFE_INTEGER)
					: startPos;

				options.selection = new vscode.Range(startPos, endPos);
			}

			// 6. Show document
			await vscode.window.showTextDocument(document, options);

			// 7. Show success message
			const fileName = path.basename(filePath);
			const lineInfo = line ? `:${line}` : '';
			vscode.window.setStatusBarMessage(`Opened: ${fileName}${lineInfo}`, 3000);

			debugLog('FileNav', 'Successfully opened file', {
				filePath,
				line,
				endLine,
				fullPath: fullPath.fsPath
			});

		} catch (error: any) {
			debugError('FileNav', 'Failed to open file', {
				error: error.message,
				stack: error.stack,
				filePath,
				line,
				endLine
			});

			// Provide more helpful error message
			const errorMsg = error.code === 'FileNotFound'
				? `File not found: ${filePath}\nPlease check if the file path is correct`
				: `Unable to open file: ${error.message}`;

			vscode.window.showErrorMessage(errorMsg);
		}
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
		// Use incremental update mechanism to improve performance

		const os = require('os');
		const path = require('path');
		const fs = require('fs').promises;
		const readline = require('readline');
		const { createReadStream } = require('fs');

		// Determine Claude config directory
		const homeDir = os.homedir();
		const claudeDir = path.join(homeDir, '.claude', 'projects');

		// First check if there's a cached aggregated result
		const cacheKey = `${claudeDir}_${type}`;
		const cachedResult = this._statisticsCache.getAggregatedCache(cacheKey, type);
		if (cachedResult) {
			debugLog('Statistics', `Using cached aggregated results: ${type}`);
			return cachedResult;
		}

		try {
			// Periodically clean expired cache
			this._statisticsCache.cleanExpiredCache();

			// Clear deduplication set for current type, ensures different stat types don't interfere
			// Each stat type has independent deduplication logic
			this._statisticsCache.clearProcessedHashes();

			// Use glob pattern to find all JSONL files
			const globPattern = path.join(claudeDir, '**/*.jsonl').replace(/\\/g, '/');

			// Use different import method in VS Code extension environment
			let files: string[] = [];
			try {
				// Try using glob's default export
				const globModule = require('glob');
				if (typeof globModule.glob === 'function') {
					// glob v10+ uses glob.glob
					files = await globModule.glob(globPattern, {
						windowsPathsNoEscape: true  // Windows path compatibility
					});
				} else if (typeof globModule === 'function') {
					// glob v7-9 uses callback style
					files = await new Promise((resolve, reject) => {
						globModule(globPattern, {
							windowsPathsNoEscape: true
						}, (err: any, matches: string[]) => {
							if (err) reject(err);
							else resolve(matches);
						});
					});
				} else {
					throw new Error('Unable to find available glob function');
				}
			} catch (globError) {
				debugError('Statistics', 'Glob loading failed, using fallback', globError);
				// Fallback: use VS Code API
				const vscodeFiles = await vscode.workspace.findFiles(
					new vscode.RelativePattern(claudeDir, '**/*.jsonl'),
					null,
					10000 // Maximum 10000 files
				);
				files = vscodeFiles.map(uri => uri.fsPath);
			}

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

			// Accumulate all entries (cached + new)
			const allEntries: StatisticsEntry[] = [];

			// 10MB threshold (in bytes)
			const FILE_SIZE_THRESHOLD = 10 * 1024 * 1024;

			// Process files in parallel, but only process files that need updates
			await Promise.all(files.map(async (file) => {
				try {
					const stats = await fs.stat(file);
					const fileTimestamp = stats.mtimeMs;

					// Check if this file needs to be updated
					const needsUpdate = await this._statisticsCache.needsUpdate(file);

					// If cached and no update needed, use cached data
					if (!needsUpdate) {
						const cachedEntries = this._statisticsCache.getCachedEntries(file);
						if (cachedEntries) {
							allEntries.push(...cachedEntries);
							debugLog('Statistics', `Using cached data: ${file} (${cachedEntries.length} entries)`);
							return;
						}
					}

					debugLog('Statistics', `Reading file: ${file}`);
					const fileEntries: StatisticsEntry[] = [];
					const fileSize = stats.size;

					if (fileSize < FILE_SIZE_THRESHOLD) {
						// Small file: read entire file, use pre-indexing strategy to filter Warmup messages
						const content = await fs.readFile(file, 'utf-8');
						const lines = content.split('\n').filter((line: string) => line.trim());

						// First pass: parse all entries and collect Warmup-related UUIDs (supports chain filtering)
						const entries: any[] = [];
						const warmupUuids = new Set<string>();

						for (const line of lines) {
							try {
								const entry = JSON.parse(line);
								entries.push(entry);

								// Collect Warmup user message UUIDs
								if (entry.type === 'user' && entry.message?.content === 'Warmup' && entry.uuid) {
									warmupUuids.add(entry.uuid);
								}
							} catch {
								// Skip invalid JSON lines
							}
						}

						// Second pass: filter and process statistics, supports chain filtering (multi-round Warmup dialogs)
						for (const entry of entries) {
							// Skip Warmup user message itself
							if (entry.type === 'user' && entry.message?.content === 'Warmup') {
								continue;
							}

							// Skip Warmup response messages (parent is Warmup or its chain response)
							if (entry.parentUuid && warmupUuids.has(entry.parentUuid)) {
								// Chain filtering: add current response UUID to blacklist, handle multi-round dialogs
								if (entry.uuid) {
									warmupUuids.add(entry.uuid);
								}
								continue;
							}

							// Generate unique hash for deduplication
							const messageHash = this._generateMessageHash(entry);
							if (this._statisticsCache.isProcessed(messageHash)) {
								continue; // Skip already processed messages
							}
							this._statisticsCache.markAsProcessed(messageHash);

							if (entry.message?.usage) {
								const statsEntry: StatisticsEntry = {
									timestamp: entry.timestamp,
									usage: entry.message.usage,
									costUSD: entry.costUSD || 0,
									model: entry.message.model,
									cacheCreationTokens: entry.message.usage.cache_creation_input_tokens || 0,
									cacheReadTokens: entry.message.usage.cache_read_input_tokens || 0,
									file: file
								};
								fileEntries.push(statsEntry);
							}
						}
					} else {
						// Large file: use streaming read to reduce memory usage
						// Two-pass scan: first pass collects Warmup message UUIDs, second pass filters

						// First pass: collect Warmup message UUIDs
						const warmupUuids = new Set<string>();
						await new Promise<void>((resolve, reject) => {
							const rl = readline.createInterface({
								input: createReadStream(file),
								crlfDelay: Infinity
							});

							rl.on('line', (line: string) => {
								if (!line.trim()) return;
								try {
									const entry = JSON.parse(line);
									// If Warmup user message, record its UUID
									if (entry.type === 'user' && entry.message?.content === 'Warmup' && entry.uuid) {
										warmupUuids.add(entry.uuid);
									}
								} catch {
									// Skip invalid lines
								}
							});

							rl.on('close', () => resolve());
							rl.on('error', (err: Error) => reject(err));
						});

						// Second pass: process statistics, skip Warmup-related messages (supports chain filtering)
						await new Promise<void>((resolve, reject) => {
							const rl = readline.createInterface({
								input: createReadStream(file),
								crlfDelay: Infinity
							});

							rl.on('line', (line: string) => {
								if (!line.trim()) return;

								try {
									const entry = JSON.parse(line);

									// Skip Warmup user messages
									if (entry.type === 'user' && entry.message?.content === 'Warmup') {
										return;
									}

									// Skip Warmup response messages (parent is Warmup or its chain response)
									if (entry.parentUuid && warmupUuids.has(entry.parentUuid)) {
										// Chain filtering: add current response UUID to blacklist, handle multi-round dialogs
										if (entry.uuid) {
											warmupUuids.add(entry.uuid);
										}
										return;
									}

									// Generate unique hash for deduplication
									const messageHash = this._generateMessageHash(entry);
									if (this._statisticsCache.isProcessed(messageHash)) {
										return; // Skip already processed messages
									}
									this._statisticsCache.markAsProcessed(messageHash);

									if (entry.message?.usage) {
										const statsEntry: StatisticsEntry = {
											timestamp: entry.timestamp,
											usage: entry.message.usage,
											costUSD: entry.costUSD || 0,
											model: entry.message.model,
											cacheCreationTokens: entry.message.usage.cache_creation_input_tokens || 0,
											cacheReadTokens: entry.message.usage.cache_read_input_tokens || 0,
											file: file
										};
										fileEntries.push(statsEntry);
									}
								} catch (e) {
									// Skip invalid JSON lines
								}
							});

							rl.on('close', () => resolve());
							rl.on('error', (err: Error) => reject(err));
						});
					}

					// Update cache for this file
					if (fileEntries.length > 0) {
						this._statisticsCache.updateCache(file, fileEntries, fileTimestamp);
						allEntries.push(...fileEntries);
					}

				} catch (e) {
					debugWarn('Statistics', `Skipping unreadable file: ${file}`, e);
				}
			}));

			// Output cache statistics
			const cacheStats = this._statisticsCache.getCacheStats();
			debugLog('Statistics', `Cache stats - files: ${cacheStats.fileCacheSize}, hashes: ${cacheStats.processedHashesSize}`);

			// Aggregate data
			debugLog('Statistics', `Aggregating ${allEntries.length} entries, type: ${type}`);
			const result = this._aggregateStatistics(allEntries, type);
			debugLog('Statistics', `Aggregation complete, result contains ${result.rows.length} rows`);
			
			// Cache aggregated result
			this._statisticsCache.updateAggregatedCache(cacheKey, type, result);

			return result;

		} catch (error) {
			debugError('Statistics', 'Error loading statistics', error);
			throw error;
		}
	}

	// Generate unique hash for message deduplication
	private _generateMessageHash(entry: any): string {
		// Use combination of message ID and request ID as unique identifier
		const messageId = entry.message?.id || '';
		const requestId = entry.requestId || '';
		const timestamp = entry.timestamp || '';

		// If no unique ID, use combination of timestamp and content
		if (!messageId && !requestId) {
			const usage = entry.message?.usage || {};
			return `${timestamp}_${usage.input_tokens}_${usage.output_tokens}`;
		}

		return `${messageId}_${requestId}`;
	}

	/**
	 * Format model name for UI display
	 * Fixes incorrect display names for Sonnet 4.5, Haiku 4.5, Opus 4.5
	 */
	private _formatModelName(modelId: string): string {
		// Model ID to display name mapping
		const modelDisplayNames: { [key: string]: string } = {
			// Opus series
			'opus': 'Opus',
			'claude-opus-4-5-20251101': 'Opus 4.5',
			'claude-opus-4-1-20250805': 'Opus 4.1',
			'claude-opus-4-20250514': 'Opus 4',
			'claude-3-opus-20240229': 'Claude 3 Opus',
			// Sonnet series
			'sonnet': 'Sonnet',
			'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
			'claude-sonnet-4-20250514': 'Sonnet 4',
			'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
			'claude-3-5-sonnet-20240620': 'Sonnet 3.5',
			'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
			// Haiku series
			'haiku': 'Haiku',
			'claude-haiku-4-5-20251001': 'Haiku 4.5',
			'claude-3-haiku-20240307': 'Claude 3 Haiku',
			// Special modes
			'opusplan': 'Opus Plan',
			'default': 'Default'
		};

		return modelDisplayNames[modelId] || modelId;
	}

	private _aggregateStatistics(entries: any[], type: string): any {
		// Use static MODEL_PRICING Map instead of local object
		// Early exit: if no data, return immediately
		if (entries.length === 0) {
			return {
				rows: [],
				totals: {
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					totalTokens: 0,
					cost: 0
				}
			};
		}

		// Define aggregated data type
		interface AggregatedStats {
			inputTokens: number;
			outputTokens: number;
			cacheCreationTokens: number;
			cacheReadTokens: number;
			totalTokens: number;
			cost: number;
			models: Set<string>;
			lastTimestamp: Date;
			// Extra info for 5-hour blocks
			blockEntries?: Map<string, number>;
			hourlyActivity?: number[];
		}

		// Use Map to store aggregated data for better lookup efficiency
		const aggregated = new Map<string, AggregatedStats>();

		// Key set for debugging
		const debugKeys = new Set<string>();
		
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
								if (segment.length >= 3 && segment.length <= 30) {score += 2;}
								
								// Lower score for all uppercase (might be acronym, but often system folders)
								if (segment === segment.toUpperCase() && segment.length > 3) {score -= 1;}
								
								candidates.push({ name: segment, score });
							}
						}
						
						// Also check combinations for hyphenated project names
						// Look for 2-4 consecutive segments that might form a project name
						for (let start = Math.max(0, segments.length - 5); start < segments.length; start++) {
							for (let length = 2; length <= 4 && start + length <= segments.length; length++) {
								const combined = segments.slice(start, start + length);
								
								// Skip if any segment in the combination should be skipped
								if (combined.some((seg: string) => shouldSkip(seg))) {continue;}
								
								const combinedName = combined.join('-');
								
								// Skip if it's too long
								if (combinedName.length > 40) {continue;}
								
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
			
			// Record debug key
			debugKeys.add(key);

			if (!aggregated.has(key)) {
				aggregated.set(key, {
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					totalTokens: 0,
					cost: 0,
					models: new Set(),
					lastTimestamp: date, // Track last activity timestamp
					// Extra statistics for 5-hour blocks
					...(type === 'blocks' ? {
						blockEntries: new Map<string, number>(),
						hourlyActivity: new Array(5).fill(0) // Hourly activity count
					} : {})
				});
			}

			const stats = aggregated.get(key);
			// TypeScript type guard: ensure stats is not undefined
			if (!stats) {
				debugError('Statistics', `Statistics data not found, key: ${key}`);
				return;
			}

			stats.inputTokens += entry.usage.input_tokens || 0;
			stats.outputTokens += entry.usage.output_tokens || 0;
			// Fix: get cache-related tokens from usage
			stats.cacheCreationTokens += entry.usage.cache_creation_input_tokens || 0;
			stats.cacheReadTokens += entry.usage.cache_read_input_tokens || 0;
			// Total tokens should include all token types
			stats.totalTokens += (entry.usage.input_tokens || 0) +
			                    (entry.usage.output_tokens || 0) +
			                    (entry.usage.cache_creation_input_tokens || 0) +
			                    (entry.usage.cache_read_input_tokens || 0);

			// Use Map to calculate cost if 0 or missing
			let cost = entry.costUSD || 0;
			if (cost === 0 && entry.model) {
				const pricing = ClaudeChatProvider.MODEL_PRICING.get(entry.model);
				if (pricing) {
					// Calculate normal input token cost (excluding cache read)
					const normalInputCost = ((entry.usage.input_tokens || 0) * pricing.input) / 1000000;

					// Calculate cache read token cost (10% of input price)
					const cacheReadCost = ((entry.usage.cache_read_input_tokens || 0) * pricing.input * 0.1) / 1000000;

					// Calculate output token cost
					const outputCost = ((entry.usage.output_tokens || 0) * pricing.output) / 1000000;

					// Calculate cache creation token cost (25% of output price)
					const cacheCreationCost = ((entry.usage.cache_creation_input_tokens || 0) * pricing.output * 0.25) / 1000000;

					cost = normalInputCost + cacheReadCost + outputCost + cacheCreationCost;
				}
			}
			stats.cost += cost;

			if (entry.model) {
				stats.models.add(entry.model);
			}

			// Update last timestamp if this entry is newer
			if (date > stats.lastTimestamp) {
				stats.lastTimestamp = date;
			}

			// For 5-hour blocks, record hourly activity
			if (type === 'blocks' && stats.hourlyActivity) {
				const hour = date.getHours();
				const blockStartHour = Math.floor(hour / 5) * 5;
				const hourIndex = hour - blockStartHour; // Index 0-4
				stats.hourlyActivity[hourIndex]++;

				// Record entry count per file
				if (stats.blockEntries) {
					const fileKey = entry.file;
					stats.blockEntries.set(fileKey, (stats.blockEntries.get(fileKey) || 0) + 1);
				}
			}
		});

		// Output debug info
		debugLog('Statistics', `${type} statistics found unique keys: ${debugKeys.size}`);
		debugLog('Statistics', `${type} key list: ${Array.from(debugKeys).sort().join(', ')}`);

		// Convert to array and sort
		const rows = Array.from(aggregated.entries())
			.map(([key, stats]) => {
				const result: any = {
					...stats,
					// Format model names to correctly display Sonnet 4.5, Haiku 4.5, Opus 4.5, etc.
					models: Array.from(stats.models).map(modelId => this._formatModelName(modelId))
				};

				if (type === 'blocks') {
					result.block = key;
					// Determine if block is active (activity within last 5 hours)
					const now = new Date();
					const blockDate = new Date(key.split(' ')[0]);
					const blockStartHour = parseInt(key.split(' ')[1].split('-')[0]);
					blockDate.setHours(blockStartHour);

					const hoursSinceBlock = (now.getTime() - blockDate.getTime()) / (1000 * 60 * 60);
					result.status = hoursSinceBlock < 5 ? 'active' : 'inactive';

					// Add hourly activity statistics
					if (stats.hourlyActivity) {
						result.hourlyActivity = stats.hourlyActivity;
						result.peakHour = stats.hourlyActivity.indexOf(Math.max(...stats.hourlyActivity));
					}

					// Add file distribution info
					if (stats.blockEntries) {
						result.fileCount = stats.blockEntries.size;
						result.topFiles = Array.from(stats.blockEntries.entries())
							.sort((a, b) => b[1] - a[1])
							.slice(0, 3)
							.map(([file, count]) => ({
								file: file.split('/').pop() || file,
								count
							}));
					}
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

		// Optimization: early exit for totals calculation
		let totals = {
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			totalTokens: 0,
			cost: 0
		};

		// If no data, return immediately
		if (rows.length === 0) {
			return { rows, totals };
		}

		// Use for loop instead of reduce for better control and optimization
		for (const row of rows) {
			totals.inputTokens += row.inputTokens;
			totals.outputTokens += row.outputTokens;
			totals.cacheCreationTokens += row.cacheCreationTokens;
			totals.cacheReadTokens += row.cacheReadTokens;
			totals.totalTokens += row.totalTokens;
			totals.cost += row.cost;
		}
		
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
			
			// Create CCimages directory if it doesn't exist
			const imagesDir = vscode.Uri.joinPath(workspaceFolder.uri, 'CCimages');
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
			
			// Get webview-accessible URI
			const webviewUri = this._panel?.webview.asWebviewUri(imagePath);
			
			this._panel?.webview.postMessage({
				type: 'imagePath',
				path: relativePath,
				webviewUri: webviewUri?.toString()
			});
			
			// Show info message
			vscode.window.showInformationMessage(`Image saved: ${relativePath}`);
		} catch (error: any) {
			debugError('ClaudeChatProvider', 'Error handling pasted image', error);
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
				debugError('ClaudeChatProvider', 'Error stopping Claude process', error);
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
		
		// Send token usage to UI
		this._sendTokenUsage();

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
		return await loadUIHtml();
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

			// Show success notification
			vscode.window.showInformationMessage('Settings updated successfully');

			// Send updated MCP status
			if (settings['mcp.enabled']) {
				this._sendMcpStatus();
			}
		} catch (error) {
			debugError('ClaudeChatProvider', 'Failed to update settings', error);
			vscode.window.showErrorMessage('Failed to update settings');
		}
	}

	/**
	 * Update MCP server configuration for specified scope (global or workspace)
	 * @param scope 'global' | 'workspace'
	 * @param servers Server configuration array
	 */
	private async _updateMcpServersForScope(scope: 'global' | 'workspace', servers: any[]): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration('claudeCodeChatUI');

			// Strict workspace validation - do not silently save workspace config to global
			if (scope === 'workspace') {
				if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
					debugWarn('ClaudeChatProvider', 'Cannot save workspace config: no folder is open');
					vscode.window.showWarningMessage('Cannot save workspace config: no folder is open. Please open a folder first.');
					return;
				}
				// Save to workspace
				await config.update('mcp.servers', servers, vscode.ConfigurationTarget.Workspace);
			} else {
				// Save to global
				await config.update('mcp.servers', servers, vscode.ConfigurationTarget.Global);
			}

			// Send MCP status update
			this._sendMcpStatus();

			const scopeName = scope === 'workspace' ? 'Workspace' : 'Global';
			vscode.window.setStatusBarMessage(`MCP servers updated (${scopeName})`, 3000);
		} catch (error) {
			debugError('ClaudeChatProvider', `Failed to update ${scope} MCP config`, error);
			vscode.window.showErrorMessage(`Failed to save config: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// ==================== Gemini Integration Methods ====================

	/**
	 * Update Gemini Integration enabled status
	 */
	private async _updateGeminiIntegration(enabled: boolean): Promise<void> {
		try {
			await secretService.setGeminiIntegrationEnabled(enabled);
			debugLog('Gemini', `Integration status updated: ${enabled}`);

			if (enabled) {
				vscode.window.showInformationMessage('Gemini Integration enabled. API key will be automatically injected.');
			}
		} catch (error) {
			debugError('Gemini', 'Failed to update Integration status', error);
			vscode.window.showErrorMessage('Failed to update Gemini Integration settings');
		}
	}

	/**
	 * Update Gemini API Key (secure storage)
	 */
	private async _updateGeminiApiKey(apiKey: string): Promise<void> {
		try {
			// Validate API Key format
			if (!SecretService.isValidGeminiApiKeyFormat(apiKey)) {
				vscode.window.showWarningMessage('Gemini API key format may be incorrect. Keys typically start with "AIza".');
			}

			await secretService.setGeminiApiKey(apiKey);
			debugLog('Gemini', 'API Key stored securely');
			vscode.window.showInformationMessage('Gemini API key saved securely');

			// Send updated config to webview
			this._sendGeminiIntegrationConfig();
		} catch (error) {
			debugError('Gemini', 'Failed to save API Key', error);
			vscode.window.showErrorMessage('Failed to save Gemini API key');
		}
	}

	/**
	 * Send Gemini Integration config to webview
	 */
	private async _sendGeminiIntegrationConfig(): Promise<void> {
		try {
			const config = await secretService.getGeminiIntegrationConfig();

			this._panel?.webview.postMessage({
				type: 'geminiIntegrationConfig',
				data: {
					enabled: config.enabled,
					hasApiKey: !!config.apiKey,
					maskedKey: config.apiKey ? SecretService.maskApiKey(config.apiKey) : ''
				}
			});

			debugLog('Gemini', 'Config sent to webview');
		} catch (error) {
			debugError('Gemini', 'Failed to get config', error);
		}
	}

	// ==================== Other Methods ====================

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
	
	private async _getMcpTools(serverId: string, serverName: string): Promise<void> {
		try {
			// Get MCP servers configuration
			const settings = this._configurationManager.getCurrentSettings();
			const mcpServers = settings['mcp.servers'] || [];
			
			// Find the server with matching name
			const server = mcpServers.find((s: any) => s.name === serverName);
			
			if (!server) {
				this._panel?.webview.postMessage({
					type: 'mcpToolsData',
					data: {
						error: `Server "${serverName}" not found`
					}
				});
				return;
			}
			
			// Try to dynamically query MCP server tools
			debugLog('MCP', `Attempting to dynamically query tools for ${serverName}`);
			const dynamicTools = await this._queryMcpServerTools(server);

			if (dynamicTools && dynamicTools.length > 0) {
				// Successfully got tool list
				debugLog('MCP', `Successfully got ${dynamicTools.length} tools from ${serverName} via dynamic query`);
				this._panel?.webview.postMessage({
					type: 'mcpToolsData',
					data: {
						tools: dynamicTools,
						serverName: serverName
					}
				});
			} else {
				// Dynamic query failed, show error message
				debugLog('MCP', `Dynamic query failed or returned no tools for ${serverName}`);

				// Generate different error messages based on server type
				let errorDetails = '';
				if (server.type === 'http' || server.type === 'sse') {
					errorDetails = `URL: ${server.url}`;
				} else {
					errorDetails = `Command: ${server.command} ${server.args?.join(' ') || ''}`;
				}

				this._panel?.webview.postMessage({
					type: 'mcpToolsData',
					data: {
						error: `Failed to retrieve tools from ${serverName}. The MCP server might not be running, not installed, or doesn't support tool discovery.\n${errorDetails}`,
						serverName: serverName
					}
				});
			}
			
		} catch (error: any) {
			this._panel?.webview.postMessage({
				type: 'mcpToolsData',
				data: {
					error: `Failed to get tool list: ${error.message}`,
					serverName: serverName
				}
			});
		}
	}

	/**
	 * Get installed plugin list (from cache)
	 * This method quickly returns plugin data from memory cache
	 */
	private _getInstalledPlugins(): void {
		try {
			const pluginManager = PluginManager.getInstance();
			const plugins = pluginManager.getCachedPlugins();

			// Send plugin list to webview
			this._panel?.webview.postMessage({
				type: 'pluginsList',
				data: {
					plugins: plugins,
					refreshed: false
				}
			});

			debugLog('PluginManager', `Sent ${plugins.length} plugin(s) to webview (from cache)`);
		} catch (error: any) {
			debugError('PluginManager', 'Failed to get plugins', error);
			this._panel?.webview.postMessage({
				type: 'pluginsList',
				data: {
					plugins: [],
					refreshed: false,
					error: 'Failed to load plugins'
				}
			});
		}
	}

	/**
	 * Refresh plugin list (reload from file)
	 * This method forces a reload of the plugin config file and updates the cache
	 */
	private async _refreshPlugins(): Promise<void> {
		try {
			const pluginManager = PluginManager.getInstance();
			// Force reload (forceReload = true)
			const plugins = await pluginManager.loadInstalledPlugins(true);

			debugLog('PluginManager', `Plugins refreshed: ${plugins.length} plugin(s) loaded`);

			// Send refreshed plugin list to webview and mark as refresh operation
			this._panel?.webview.postMessage({
				type: 'pluginsList',
				data: {
					plugins: plugins,
					refreshed: true  // Mark as refresh operation, frontend can show notification
				}
			});
		} catch (error: any) {
			debugError('PluginManager', 'Failed to refresh plugins', error);
			this._panel?.webview.postMessage({
				type: 'pluginsList',
				data: {
					plugins: [],
					refreshed: false,
					error: 'Failed to refresh plugins'
				}
			});
		}
	}

	/**
	 * Dynamically query MCP server for available tools
	 * @param server MCP server configuration
	 * @returns Array of tools or null if failed
	 */
	private async _queryMcpServerTools(server: any): Promise<any[] | null> {
		try {
			debugLog('MCP', `Querying tools for server: ${server.name}`);

			// ===== HTTP/SSE mode =====
			if (server.type === 'http' || server.type === 'sse') {
				return await this._queryHttpMcpServerTools(server);
			}

			// ===== stdio mode (original logic) =====
			// Expand environment variables in command and args using expandVariables function
			const command = expandVariables(server.command);
			
			// Expand variables in args
			let args: string[] = [];
			if (server.args) {
				if (typeof server.args === 'string') {
					// If args is a string, split it and expand variables
					args = server.args.trim().split(/\s+/).map((arg: string) => 
						expandVariables(arg)
					);
				} else if (Array.isArray(server.args)) {
					// Expand variables in each argument
					args = server.args.map((arg: any) => 
						typeof arg === 'string' ? expandVariables(arg) : arg
					);
				}
			}
			
			// Expand variables in environment
			let expandedEnv: any = {};
			if (server.env) {
				if (typeof server.env === 'object') {
					for (const [key, value] of Object.entries(server.env)) {
						let expandedValue = typeof value === 'string' ? 
							expandVariables(value) : value;
						
						// Normalize Windows paths
						if (typeof expandedValue === 'string' && process.platform === 'win32') {
							expandedValue = require('path').normalize(expandedValue);
						}
						
						expandedEnv[key] = expandedValue;
					}
				}
			}

			// Get execution environment for Windows compatibility
			const execEnvironment = await this._windowsCompatibility.getExecutionEnvironment();
			const spawnOptions = {
				...execEnvironment.spawnOptions,
				env: {
					...execEnvironment.spawnOptions.env,
					...expandedEnv
				}
			};
			
			debugLog('MCP', `Spawning process - command: ${command}`, { args });
			const startTime = Date.now();
			const mcpProcess = cp.spawn(command, args, spawnOptions);

			if (!mcpProcess.stdout || !mcpProcess.stderr || !mcpProcess.stdin) {
				debugError('MCP', `Failed to get stdio streams for ${server.name}`);
				return null;
			}
			
			const mcpStdout = mcpProcess.stdout;
			const mcpStderr = mcpProcess.stderr;
			const mcpStdin = mcpProcess.stdin;

			return new Promise((resolve) => {
				let responseData = '';
				let errorData = '';

				// Python MCP servers need longer startup time
				const timeoutDuration = command === 'uvx' || command.includes('python') ? 15000 : 8000;
				
				const timeout = setTimeout(() => {
					if (!mcpProcess.killed) {
						mcpProcess.kill();
					}
					debugLog('MCP', `Timeout waiting for response from ${server.name} (waited ${timeoutDuration/1000}s)`);
					resolve(null);
				}, timeoutDuration);

				const cleanup = () => {
					clearTimeout(timeout);
					if (!mcpProcess.killed) {
						mcpProcess.kill();
					}
				};

				mcpStdout.on('data', (data: Buffer) => {
					responseData += data.toString();
					const lines = responseData.split('\n');
					responseData = lines.pop() || ''; // Keep incomplete line

					for (const line of lines) {
						if (line.trim()) {
							try {
								const response = JSON.parse(line);

								if (response.id === 1 && response.result) { // Initialize response
									const elapsedTime = Date.now() - startTime;
									debugLog('MCP', `Initialized with ${server.name} (took ${elapsedTime}ms)`);
									debugLog('MCP', 'Server capabilities', response.result.capabilities);

									// Send initialized notification
									const initializedNotification = {
										jsonrpc: '2.0',
										method: 'notifications/initialized'
									};
									mcpStdin.write(JSON.stringify(initializedNotification) + '\n');

									if (response.result.capabilities?.tools) {
										// Delay to ensure initialization is complete
										setTimeout(() => {
											const toolListRequest = {
												jsonrpc: '2.0',
												id: 2,
												method: 'tools/list'
												// Don't send params field
											};
											debugLog('MCP', 'Sending tools/list request');
											mcpStdin.write(JSON.stringify(toolListRequest) + '\n');
										}, 500);
									} else {
										debugLog('MCP', `${server.name} does not support tools`);
										cleanup();
										resolve([]);
									}
								} else if (response.id === 2 && response.result) { // tools/list response
									const elapsedTime = Date.now() - startTime;
									const tools = response.result.tools || [];
									const toolList = tools.map((tool: any) => ({
										name: tool.name || 'Unknown Tool',
										description: tool.description || 'No description available.'
									}));
									debugLog('MCP', `Retrieved ${toolList.length} tools from ${server.name} (total time: ${elapsedTime}ms)`);
									// Output first few tool names for debugging
									if (toolList.length > 0) {
										debugLog('MCP', 'First few tools', toolList.slice(0, 3).map((t: any) => t.name));
									}
									cleanup();
									resolve(toolList);
								} else if (response.id === 2 && response.error) { // tools/list error response
									debugError('MCP', `Error getting tools from ${server.name}`, response.error);
									debugError('MCP', 'Error details', response.error);
									cleanup();
									resolve(null);
								}
							} catch (e) {
								// Ignore known non-JSON messages
								const trimmedLine = line.trim();

								// Add debug info
								debugLog('MCP', `Received non-JSON line from ${server.name}`, { trimmedLine, lineLength: trimmedLine.length, originalLine: line });

								if (trimmedLine === 'Shutdown signal received' ||
								    trimmedLine.toLowerCase().includes('shutdown signal') ||
								    trimmedLine.toLowerCase().includes('shutting down')) {
									// This is a normal message when MCP shuts down, no need to log error
									debugLog('MCP', `${server.name} shutting down (handled gracefully)`);
								} else if (trimmedLine === '') {
									// Ignore empty lines
									debugLog('MCP', `Ignoring empty line from ${server.name}`);
								} else {
									// Only log other unknown JSON parse errors as regular logs
									debugLog('MCP', `Non-JSON message from ${server.name}`, { line });
									debugLog('MCP', 'Parse attempt failed', (e as Error).message || e);
								}
								// continue to next line
							}
						}
					}
				});

				mcpStderr.on('data', (data: Buffer) => {
					const stderr = data.toString();
					errorData += stderr;
					// Output stderr for debugging (filter out INFO logs and known shutdown messages)
					if (!stderr.includes('INFO') &&
					    !stderr.includes('Starting MCP server') &&
					    !stderr.includes('Shutdown signal received')) {
						debugLog('MCP', `stderr from ${server.name}`, stderr.trim());
					} else if (stderr.includes('Shutdown signal received')) {
						debugLog('MCP', `${server.name} shutting down (from stderr)`);
					}
				});

				mcpProcess.on('error', (error: any) => {
					debugError('MCP', `Failed to spawn ${server.name}`, error);
					cleanup();
					resolve(null);
				});

				mcpProcess.on('close', (code: number) => {
					cleanup();
					if (code !== 0 && code !== null) {
						debugError('MCP', `${server.name} exited with code: ${code}`);
						if(errorData) {
							debugError('MCP', 'stderr', errorData);
						}
						resolve([]); // Resolve with empty array on error
					}
				});
				
				// Send initialization request
				const initRequest = {
					jsonrpc: '2.0',
					id: 1,
					method: 'initialize',
					params: {
						protocolVersion: '2024-11-05',
						clientInfo: {
							name: 'claude-code-chatui',
							version: '1.0.0'
						},
						capabilities: {}
					}
				};
				mcpStdin.write(JSON.stringify(initRequest) + '\n');
			});
		} catch (error) {
			debugError('MCP', `Error querying server tools for ${server.name}`, error);
			return null;
		}
	}

	/**
	 * Query HTTP/SSE MCP server for available tools
	 * @param server HTTP/SSE MCP server configuration
	 * @returns Array of tools or null if failed
	 */
	private async _queryHttpMcpServerTools(server: any): Promise<any[] | null> {
		try {
			const https = require('https');
			const http = require('http');
			const url = require('url');

			debugLog('MCP', `Querying HTTP/SSE server: ${server.name}`);

			// Parse URL
			const parsedUrl = url.parse(server.url);
			const isHttps = parsedUrl.protocol === 'https:';
			const httpModule = isHttps ? https : http;

			// Prepare headers
			// Server requires client to accept both application/json and text/event-stream
			const headers: any = {
				'Content-Type': 'application/json',
				'Accept': 'application/json, text/event-stream',
				...server.headers
			};

			// Step 1: Initialize connection
			const initRequest = {
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: '2024-11-05',
					clientInfo: {
						name: 'claude-code-chatui',
						version: '2.1.3'
					},
					capabilities: {}
				}
			};

			// Send initialize request and get response (including headers)
			const initResult = await this._sendHttpMcpRequest(httpModule, parsedUrl, headers, initRequest);
			const initResponse = initResult.body;
			const initResponseHeaders = initResult.headers;

			if (!initResponse || !initResponse.result) {
				debugError('MCP', `Failed to initialize ${server.name}`);
				return null;
			}

			debugLog('MCP', `${server.name} initialized successfully`);

			// Extract session ID if server returned one
			let sessionId = initResponseHeaders['mcp-session-id'] || initResponseHeaders['MCP-Session-ID'];
			if (sessionId) {
				debugLog('MCP', `Session ID received: ${sessionId.substring(0, 8)}...`);
				// Add session ID to subsequent requests
				headers['mcp-session-id'] = sessionId;
			}

			// Check if server supports tools
			if (!initResponse.result.capabilities?.tools) {
				debugLog('MCP', `Server ${server.name} does not support tools`);
				return [];
			}

			// Step 2: Send initialized notification (optional but good practice)
			const initializedNotification = {
				jsonrpc: '2.0',
				method: 'notifications/initialized'
			};
			// Note: Notifications don't expect responses
			await this._sendHttpMcpRequest(httpModule, parsedUrl, headers, initializedNotification).catch(() => {
				// Silently ignore notification errors
			});

			// Step 3: Request tools list
			const toolsRequest = {
				jsonrpc: '2.0',
				id: 2,
				method: 'tools/list'
			};

			const toolsResult = await this._sendHttpMcpRequest(httpModule, parsedUrl, headers, toolsRequest);
			const toolsResponse = toolsResult.body;

			if (!toolsResponse || !toolsResponse.result) {
				debugError('MCP', `Failed to get tools from ${server.name}`);
				return null;
			}

			const tools = toolsResponse.result.tools || [];
			const toolList = tools.map((tool: any) => ({
				name: tool.name || 'Unknown Tool',
				description: tool.description || 'No description available.'
			}));

			debugLog('MCP', `Retrieved ${toolList.length} tool(s) from ${server.name}`);

			return toolList;

		} catch (error: any) {
			debugError('MCP', `Error querying HTTP/SSE server ${server.name}`, error.message);
			return null;
		}
	}

	/**
	 * Send HTTP request to MCP server
	 * @param httpModule http or https module
	 * @param parsedUrl Parsed URL object
	 * @param headers Request headers
	 * @param body Request body (JSON-RPC payload)
	 * @returns Object containing response body and headers
	 */
	private _sendHttpMcpRequest(httpModule: any, parsedUrl: any, headers: any, body: any): Promise<{body: any, headers: any}> {
		return new Promise((resolve, reject) => {
			const postData = JSON.stringify(body);

			const options = {
				hostname: parsedUrl.hostname,
				port: parsedUrl.port,
				path: parsedUrl.path,
				method: 'POST',
				headers: {
					...headers,
					'Content-Length': Buffer.byteLength(postData)
				}
			};

			const req = httpModule.request(options, (res: any) => {
				let data = '';

				res.on('data', (chunk: Buffer) => {
					data += chunk.toString();
				});

				res.on('end', () => {
					try {
						// Check HTTP status code
						// 2xx indicates success: 200 OK, 202 Accepted (common for notifications)
						const isSuccess = res.statusCode >= 200 && res.statusCode < 300;

						if (!isSuccess) {
							debugError('MCP', `HTTP ${res.statusCode} error`);
							reject(new Error(`HTTP ${res.statusCode}: ${data}`));
							return;
						}

						// For notifications (no id), we don't expect a response
						// HTTP 202 Accepted is common for notification requests
						if (!body.id) {
							resolve({ body: { success: true }, headers: res.headers });
							return;
						}

						// Handle empty response (e.g., 202)
						if (!data || data.trim().length === 0) {
							resolve({ body: { success: true }, headers: res.headers });
							return;
						}

						// Check response content type, handle SSE format
						const contentType = res.headers['content-type'] || '';
						let response: any;

						if (contentType.includes('text/event-stream')) {
							// SSE format: parse "data: {...}" line
							// SSE format example:
							// event: message
							// data: {"result":{...},"jsonrpc":"2.0","id":1}

							const lines = data.split('\n');
							let jsonData = '';

							for (const line of lines) {
								const trimmedLine = line.trim();
								if (trimmedLine.startsWith('data:')) {
									// Extract JSON after data:
									jsonData = trimmedLine.substring(5).trim();
									break;
								}
							}

							if (!jsonData) {
								debugError('MCP', 'SSE response missing data field');
								reject(new Error('Invalid SSE response: no data field'));
								return;
							}

							response = JSON.parse(jsonData);
						} else {
							// Pure JSON format
							response = JSON.parse(data);
						}

						// Return response body and headers
						resolve({ body: response, headers: res.headers });
					} catch (error: any) {
						debugError('MCP', 'Failed to parse response', error.message);
						reject(error);
					}
				});
			});

			req.on('error', (error: any) => {
				debugError('MCP', 'HTTP request error', error.message);
				reject(error);
			});

			req.write(postData);
			req.end();
		});
	}

	private _setSelectedModel(model: string): void {
		// Validate model name to prevent issues
		if (VALID_MODELS.includes(model as ValidModel)) {
			this._selectedModel = model;
			// DEBUG: console.log('Model selected:', model);

			// Store model preference in workspace state
			this._context.workspaceState.update('claude.selectedModel', model);

			// Get display name
			let displayName: string;
			let message: string;

			switch (model) {
				case 'claude-opus-4-5-20251101':
					displayName = 'Opus 4.5';
					message = `Claude model switched to: ${displayName} (Latest flagship model, 66% cheaper than Opus 4.1)`;
					break;
				case 'claude-opus-4-1-20250805':
					displayName = 'Opus 4.1';
					message = `Claude model switched to: ${displayName}`;
					break;
				case 'opusplan':
					displayName = 'Opus Plan';
					message = `Claude model switched to: ${displayName}\n\n💡 Tip: Enable "Plan First" mode to use Opus for planning and Sonnet for execution. Without Plan First, it will use Sonnet for direct execution.`;
					break;
				case 'claude-sonnet-4-5-20250929':
					displayName = 'Sonnet 4.5';
					message = `Claude model switched to: ${displayName}`;
					break;
				case 'claude-haiku-4-5-20251001':
					displayName = 'Haiku 4.5';
					message = `Claude model switched to: ${displayName}`;
					break;
				default:
					displayName = model.charAt(0).toUpperCase() + model.slice(1);
					message = `Claude model switched to: ${displayName}`;
			}

			// Show confirmation message
			vscode.window.showInformationMessage(message);
		} else {
			debugError('ClaudeChatProvider', 'Invalid model selected', model);
			vscode.window.showErrorMessage(`Invalid model: ${model}. Please select one of: ${VALID_MODELS.join(', ')}.`);
		}
	}

	/**
	 * Handle compute mode selection (independent of subagent settings)
	 * @param mode - 'auto' or 'max'
	 */
	private _handleModeSelection(mode: 'auto' | 'max'): void {
		const SONNET_4_5 = 'claude-sonnet-4-5-20250929';

		if (mode === 'max') {
			// Max mode: set ANTHROPIC_DEFAULT_HAIKU_MODEL
			process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = SONNET_4_5;
			debugLog('ComputeMode', 'Max mode enabled - Using Sonnet 4.5 for background tasks');
			vscode.window.showInformationMessage('Max mode enabled - Maximum performance, higher cost');
		} else {
			// Auto mode: clear ANTHROPIC_DEFAULT_HAIKU_MODEL
			delete process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
			debugLog('ComputeMode', 'Auto mode enabled - Smart allocation for cost efficiency');
			vscode.window.showInformationMessage('Auto mode enabled - Smart allocation');
		}

		// Save mode settings
		const currentSettings = this._context.workspaceState.get<ComputeModeSettings>('computeModeSettings', {
			mode: 'auto',
			enhanceSubagents: false
		});

		this._context.workspaceState.update('computeModeSettings', {
			...currentSettings,
			mode: mode
		});
	}

	/**
	 * Handle subagent enhancement settings (independent of mode settings)
	 * @param enabled - Whether to enable subagent enhancement
	 */
	private _handleSubagentEnhancement(enabled: boolean): void {
		const SONNET_4_5 = 'claude-sonnet-4-5-20250929';

		if (enabled) {
			// Enable enhancement: set CLAUDE_CODE_SUBAGENT_MODEL
			process.env.CLAUDE_CODE_SUBAGENT_MODEL = SONNET_4_5;
			debugLog('ComputeMode', 'Enhanced subagents enabled - Using Sonnet 4.5 for all subagent operations');
			vscode.window.showInformationMessage('Enhanced subagents enabled - Higher performance, increased cost');
		} else {
			// Disable enhancement: clear CLAUDE_CODE_SUBAGENT_MODEL
			delete process.env.CLAUDE_CODE_SUBAGENT_MODEL;
			debugLog('ComputeMode', 'Standard subagents enabled - Using default model allocation');
		}

		// Save subagent settings
		const currentSettings = this._context.workspaceState.get<ComputeModeSettings>('computeModeSettings', {
			mode: 'auto',
			enhanceSubagents: false
		});

		this._context.workspaceState.update('computeModeSettings', {
			...currentSettings,
			enhanceSubagents: enabled
		});
	}

	/**
	 * Restore compute mode state on initialization
	 */
	private _restoreComputeModeState(): void {
		// Try to read new config format
		const settings = this._context.workspaceState.get<ComputeModeSettings>('computeModeSettings');

		if (settings) {
			// Use new format
			const SONNET_4_5 = 'claude-sonnet-4-5-20250929';

			// Restore mode settings
			if (settings.mode === 'max') {
				process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = SONNET_4_5;
				debugLog('ComputeMode', 'Restored Max mode');
			}

			// Restore subagent settings (independent)
			if (settings.enhanceSubagents) {
				process.env.CLAUDE_CODE_SUBAGENT_MODEL = SONNET_4_5;
				debugLog('ComputeMode', 'Restored enhanced subagents');
			}

			debugLog('ComputeMode', 'Settings restored', settings);
		} else {
			// Backward compatibility: check old maxModeEnabled config
			const maxModeEnabled = this._context.workspaceState.get('maxModeEnabled', false);
			if (maxModeEnabled) {
				const SONNET_4_5 = 'claude-sonnet-4-5-20250929';
				process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = SONNET_4_5;
				debugLog('ComputeMode', 'Migrated from old Max mode setting');

				// Migrate to new format
				this._context.workspaceState.update('computeModeSettings', {
					mode: 'max',
					enhanceSubagents: false
				});
				// Delete old config
				this._context.workspaceState.update('maxModeEnabled', undefined);
			}
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
			debugLog('ClaudeChatProvider', `Executing slash command: /${command}`);

			// Show prompt message in chat window (using output type for bordered style)
			this._sendAndSaveMessage({
				type: 'output',
				data: `⚡ Executing \`/${command}\` command in terminal...\n\nPlease check the terminal window for output.`
			});

			// Create terminal window and execute command
			const terminal = vscode.window.createTerminal(`Claude /${command}`);
			terminal.sendText(`claude /${command}`);
			terminal.show();

			debugLog('ClaudeChatProvider', `Command sent to terminal: claude /${command}`);

		} catch (error: any) {
			debugError('ClaudeChatProvider', 'Failed to execute slash command', error);
			this._sendAndSaveMessage({
				type: 'error',
				data: `❌ Failed to execute command: ${error.message}\n\nPlease ensure Claude CLI is properly installed and available in PATH.`
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

	private async _previewOperation(operationId: string, action: 'undo' | 'redo'): Promise<void> {
		try {
			const preview = await this._operationPreviewService.generatePreview(operationId, action);
			if (preview) {
				this._panel?.webview.postMessage({
					type: 'operationPreview',
					data: preview
				});
			}
		} catch (error: any) {
			debugError('ClaudeChatProvider', 'Failed to preview operation', error);
			this._panel?.webview.postMessage({
				type: 'error',
				data: `Failed to preview operation: ${error.message}`
			});
		}
	}

	private async _undoOperation(operationId: string): Promise<void> {
		try {
			this._panel?.webview.postMessage({
				type: 'operationProgress',
				data: 'Undoing operation...'
			});

			const result = await this._undoRedoManager.undo(operationId);
			
			if (result.success) {
				this._sendAndSaveMessage({
					type: 'operationUndone',
					data: {
						message: result.message,
						operationId: operationId,
						affectedOperations: result.affectedOperations
					}
				});
			} else {
				this._panel?.webview.postMessage({
					type: 'operationError',
					data: result.message
				});
			}
			
			// Refresh operation history
			this._sendOperationHistory();
		} catch (error: any) {
			debugError('ClaudeChatProvider', 'Failed to undo operation', error);
			this._panel?.webview.postMessage({
				type: 'error',
				data: `Failed to undo operation: ${error.message}`
			});
		}
	}

	private async _redoOperation(operationId: string): Promise<void> {
		try {
			this._panel?.webview.postMessage({
				type: 'operationProgress',
				data: 'Redoing operation...'
			});

			const result = await this._undoRedoManager.redo(operationId);
			
			if (result.success) {
				this._sendAndSaveMessage({
					type: 'operationRedone',
					data: {
						message: result.message,
						operationId: operationId,
						affectedOperations: result.affectedOperations
					}
				});
			} else {
				this._panel?.webview.postMessage({
					type: 'operationError',
					data: result.message
				});
			}
			
			// Refresh operation history
			this._sendOperationHistory();
		} catch (error: any) {
			debugError('ClaudeChatProvider', 'Failed to redo operation', error);
			this._panel?.webview.postMessage({
				type: 'error',
				data: `Failed to redo operation: ${error.message}`
			});
		}
	}

	private _sendOperationHistory(): void {
		const activeOperations = this._operationTracker.getActiveOperations();
		const undoneOperations = this._operationTracker.getUndoneOperations();
		
		this._panel?.webview.postMessage({
			type: 'operationHistory',
			data: {
				active: activeOperations,
				undone: undoneOperations
			}
		});
	}

	// Send token usage to UI
	private _sendTokenUsage(): void {
		const usage = this._conversationManager.getCurrentTokenUsage(
			this._totalTokensInput,
			this._totalTokensOutput
		);

		this._panel?.webview.postMessage({
			type: 'tokenUsage',
			data: usage
		});
	}

	// Compact conversation feature
	// New design: show compacting status first, then clear and display summary after generation
	private async _compactConversation(languageMode?: boolean, selectedLanguage?: string): Promise<void> {
		try {
			debugLog('ClaudeChatProvider', 'Starting conversation compaction');

			// Get current conversation content (before any operations)
			const conversationData = this._conversationManager.getConversationForSummary();

			if (!conversationData || (conversationData.userMessages.length === 0 && conversationData.assistantMessages.length === 0)) {
				this._panel?.webview.postMessage({
					type: 'error',
					data: 'No conversation to compact'
				});
				return;
			}

			// Step 1: Notify frontend to start compacting (show compacting message, set Processing state)
			// Use single message to avoid race conditions
			debugLog('ClaudeChatProvider', 'Sending compactStart message');
			this._panel?.webview.postMessage({
				type: 'compactStart'
			});

			// Format conversation content
			let conversationText = '';
			const maxMessages = Math.max(conversationData.userMessages.length, conversationData.assistantMessages.length);

			for (let i = 0; i < maxMessages; i++) {
				if (i < conversationData.userMessages.length) {
					conversationText += `User: ${conversationData.userMessages[i]}\n\n`;
				}
				if (i < conversationData.assistantMessages.length) {
					conversationText += `Assistant: ${conversationData.assistantMessages[i]}\n\n`;
				}
			}

			// Construct compact prompt (English prompt)
			const compactPrompt = `Please summarize the following conversation within 500 words. Focus on:
1. The main topics discussed
2. Key decisions made
3. Important code changes (list filenames and change types)
4. Any unresolved issues or todos
5. Any errors or issues that need attention

Conversation:
${conversationText}

Please provide a well-structured summary.`;

			// Save current conversation history (before compaction)
			const currentSessionId = Date.now().toString();
			await this._conversationManager.saveCurrentConversation(
				currentSessionId,
				this._totalCost,
				this._totalTokensInput,
				this._totalTokensOutput
			);

			// Reset backend state (but don't send sessionCleared message to frontend)
			this._currentSessionId = undefined;
			this._conversationId = undefined;
			this._conversationManager.clearCurrentConversation();
			this._totalCost = 0;
			this._totalTokensInput = 0;
			this._totalTokensOutput = 0;
			this._requestCount = 0;
			this._messageProcessor.reset();
			this._operationTracker.setCurrentSession('');

			// Generate summary in background (don't display prompt)
			debugLog('ClaudeChatProvider', 'Starting compact summary generation');
			await this._generateCompactSummary(compactPrompt, conversationData, languageMode, selectedLanguage);
			debugLog('ClaudeChatProvider', 'Compact summary generation complete');

			// Note: compactingEnd and setProcessing: false will be sent in onClose callback

		} catch (error: any) {
			debugError('ClaudeChatProvider', 'Failed to compact conversation', error);

			// Notify frontend compaction ended (even on error)
			this._panel?.webview.postMessage({
				type: 'compactingEnd'
			});

			// Restore processing state
			this._panel?.webview.postMessage({
				type: 'setProcessing',
				data: false
			});

			// Show error message
			this._panel?.webview.postMessage({
				type: 'error',
				data: `Failed to compact conversation: ${error.message}`
			});
		}
	}

	// Generate compact summary in background
	private async _generateCompactSummary(prompt: string, conversationData: any, languageMode?: boolean, selectedLanguage?: string): Promise<void> {
		// If language mode not specified, default to English
		let actualPrompt = prompt;

		// Use special compact mode to send message
		// Note: _isCompactMode flag is reset in onClose callback (around line 688)
		// Cannot reset here because _sendMessageToClaude is async and returns immediately
		// while onAssistantMessage callback is called during process execution
		this._isCompactMode = true;

		// Send compact prompt (won't display in UI)
		// Pass language settings to support Language Mode
		await this._sendMessageToClaude(actualPrompt, false, false, languageMode || false, selectedLanguage);

		// Note: Don't reset _isCompactMode here because:
		// 1. _sendMessageToClaude just starts the process and returns immediately
		// 2. onAssistantMessage callback is called during process execution
		// 3. _isCompactMode will be correctly reset in onClose callback
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