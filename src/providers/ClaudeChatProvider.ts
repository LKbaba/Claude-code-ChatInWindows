import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';
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
	private _selectedModel: string = 'default'; // Default model
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
	private _isCompactMode: boolean = false; // 压缩模式标志
	private _compactSummaryBuffer: string = ''; // 压缩总结缓冲区
	
	// 静态模型定价数据（使用 Map 提高查找效率）
	private static readonly MODEL_PRICING = new Map<string, { input: number; output: number }>([
		['claude-opus-4-20250514', { input: 15.00, output: 75.00 }],
		['claude-opus-4-1-20250805', { input: 15.00, output: 75.00 }], // Opus 4.1 最新旗舰模型
		['claude-3-opus-20240229', { input: 15.00, output: 75.00 }],
		['claude-sonnet-4-20250514', { input: 3.00, output: 15.00 }], // Sonnet 4 最新模型
		['claude-3-5-sonnet-20241022', { input: 3.00, output: 15.00 }],
		['claude-3-5-sonnet-20240620', { input: 3.00, output: 15.00 }],
		['claude-3-sonnet-20240229', { input: 3.00, output: 15.00 }],
		['claude-3-haiku-20240307', { input: 0.25, output: 1.25 }],
		// 添加更多模型价格
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
			console.error('[ClaudeChatProvider] Failed to initialize backup repo:', error);
		});

		// Load saved model preference
		this._selectedModel = this._context.workspaceState.get('claude.selectedModel', 'default');

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
				console.error('[ClaudeChatProvider] Failed to load operations:', error);
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
		
		// 更新 CLAUDE.md 文件（添加 Windows 环境信息和 MCP 使用指南）
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (workspaceFolder) {
			// 获取当前启用的 MCP 服务器
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
							// 获取webview可访问的URI
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
					case 'testMcpConnection':
						this._testMcpConnection();
						return;
					case 'getMcpTools':
						this._getMcpTools(message.serverId, message.serverName);
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
			
			// 发送初始token使用情况
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
			// 获取当前启用的 MCP 服务器
			const mcpStatus = this._configurationManager.getMcpStatus();
			await updateClaudeMdWithWindowsInfo(workspaceFolder, mcpStatus.servers);
		}
		
		// Ensure conversationId is set before processing
		if (!this._conversationId && this._currentSessionId) {
			this._conversationId = this._currentSessionId;
			console.log('[ClaudeChatProvider] Set conversationId from currentSessionId:', this._conversationId);
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
					// 使用 MCP Sequential Thinking 工具进行结构化思考
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

		// 在压缩模式下不显示用户输入
		if (!this._isCompactMode) {
			this._sendAndSaveMessage({ type: 'userInput', data: message });
		}
		this._panel?.webview.postMessage({ type: 'setProcessing', data: true });

		// 在压缩模式下不创建备份提交
		if (!this._isCompactMode) {
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
							// 在压缩模式下，收集总结而不是立即显示
							this._compactSummaryBuffer += text;
						} else {
							// 正常模式下，显示 Claude 的响应
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
						// 发送token使用情况到UI
						this._sendTokenUsage();
					},
					onFinalResult: (result: any) => {
						if (result.sessionId) {
							this._currentSessionId = result.sessionId;
							
							// Set conversationId on first session creation
							if (!this._conversationId) {
								this._conversationId = result.sessionId;
								console.log('[ClaudeChatProvider] Set conversationId:', this._conversationId);
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
						this._panel?.webview.postMessage(message);
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
				console.error('Claude stderr:', error);
				// Check for specific MCP-related errors
				if (error.includes('--mcp-server')) {
					console.error('ERROR: Claude is complaining about --mcp-server');
				}
			},
			onClose: (code: number | null) => {
				// 在压缩模式下，显示格式化的总结
				if (this._isCompactMode && this._compactSummaryBuffer.trim()) {
					const summaryMessage = `## ⚓️ 对话总结\n\n${this._compactSummaryBuffer}\n\n---\n*以上是之前对话的总结。现在开始新的对话。*`;
					
					this._sendAndSaveMessage({
						type: 'output',
						data: summaryMessage
					});
					
					// 清空缓冲区
					this._compactSummaryBuffer = '';
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

	private _newSession() {
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

		// 发送token使用情况到UI
		this._sendTokenUsage();

		// Reset message processor
		this._messageProcessor.reset();
		
		// Reset operation tracker session
		this._operationTracker.setCurrentSession('');

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
		// 使用增量更新机制，提高性能
		
		const os = require('os');
		const path = require('path');
		const fs = require('fs').promises;
		const readline = require('readline');
		const { createReadStream } = require('fs');
		
		// 确定 Claude 配置目录
		const homeDir = os.homedir();
		const claudeDir = path.join(homeDir, '.claude', 'projects');
		
		// 首先检查是否有缓存的聚合结果
		const cacheKey = `${claudeDir}_${type}`;
		const cachedResult = this._statisticsCache.getAggregatedCache(cacheKey, type);
		if (cachedResult) {
			console.log(`[Statistics] 使用缓存的聚合结果: ${type}`);
			return cachedResult;
		}
		
		try {
			// 定期清理过期缓存
			this._statisticsCache.cleanExpiredCache();
			
			// 清理当前类型的去重集合，确保不同统计类型之间不会相互影响
			// 这样每个统计类型都会有独立的去重逻辑
			this._statisticsCache.clearProcessedHashes();
			
			// 使用 glob pattern 直接查找所有 JSONL 文件
			const globPattern = path.join(claudeDir, '**/*.jsonl').replace(/\\/g, '/');
			
			// 在 VS Code 扩展环境中使用不同的导入方式
			let files: string[] = [];
			try {
				// 尝试使用 glob 的默认导出
				const globModule = require('glob');
				if (typeof globModule.glob === 'function') {
					// glob v10+ 使用 glob.glob
					files = await globModule.glob(globPattern, {
						windowsPathsNoEscape: true  // Windows 路径兼容性
					});
				} else if (typeof globModule === 'function') {
					// glob v7-9 使用回调方式
					files = await new Promise((resolve, reject) => {
						globModule(globPattern, { 
							windowsPathsNoEscape: true 
						}, (err: any, matches: string[]) => {
							if (err) reject(err);
							else resolve(matches);
						});
					});
				} else {
					throw new Error('无法找到可用的 glob 函数');
				}
			} catch (globError) {
				console.error('Glob 加载失败，使用备用方案:', globError);
				// 备用方案：使用 VS Code API
				const vscodeFiles = await vscode.workspace.findFiles(
					new vscode.RelativePattern(claudeDir, '**/*.jsonl'),
					null,
					10000 // 最多 10000 个文件
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
			
			// 累积所有条目（缓存的 + 新的）
			const allEntries: StatisticsEntry[] = [];
			
			// 10MB 阈值（以字节为单位）
			const FILE_SIZE_THRESHOLD = 10 * 1024 * 1024;
			
			// 并行处理文件，但只处理需要更新的文件
			await Promise.all(files.map(async (file) => {
				try {
					const stats = await fs.stat(file);
					const fileTimestamp = stats.mtimeMs;
					
					// 检查是否需要更新此文件
					const needsUpdate = await this._statisticsCache.needsUpdate(file);
					
					// 如果有缓存且不需要更新，使用缓存数据
					if (!needsUpdate) {
						const cachedEntries = this._statisticsCache.getCachedEntries(file);
						if (cachedEntries) {
							allEntries.push(...cachedEntries);
							console.log(`[Statistics] 使用缓存数据: ${file} (${cachedEntries.length} 条)`);
							return;
						}
					}
					
					console.log(`[Statistics] 读取文件: ${file}`);
					const fileEntries: StatisticsEntry[] = [];
					const fileSize = stats.size;
					
					if (fileSize < FILE_SIZE_THRESHOLD) {
						// 小文件：直接读取整个文件
						const content = await fs.readFile(file, 'utf-8');
						const lines = content.split('\n').filter((line: string) => line.trim());
						
						for (const line of lines) {
							try {
								const entry = JSON.parse(line);
								
								// 生成唯一哈希用于去重
								const messageHash = this._generateMessageHash(entry);
								if (this._statisticsCache.isProcessed(messageHash)) {
									continue; // 跳过已处理的消息
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
								// 跳过无效的 JSON 行
							}
						}
					} else {
						// 大文件：使用流式读取，减少内存占用
						await new Promise<void>((resolve, reject) => {
							const rl = readline.createInterface({
								input: createReadStream(file),
								crlfDelay: Infinity
							});
							
							rl.on('line', (line: string) => {
								if (!line.trim()) return;
								
								try {
									const entry = JSON.parse(line);
									
									// 生成唯一哈希用于去重
									const messageHash = this._generateMessageHash(entry);
									if (this._statisticsCache.isProcessed(messageHash)) {
										return; // 跳过已处理的消息
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
									// 跳过无效的 JSON 行
								}
							});
							
							rl.on('close', () => resolve());
							rl.on('error', (err: Error) => reject(err));
						});
					}
					
					// 更新此文件的缓存
					if (fileEntries.length > 0) {
						this._statisticsCache.updateCache(file, fileEntries, fileTimestamp);
						allEntries.push(...fileEntries);
					}
					
				} catch (e) {
					console.warn(`跳过无法读取的文件: ${file}`, e);
				}
			}));
			
			// 输出缓存统计信息
			const cacheStats = this._statisticsCache.getCacheStats();
			console.log(`[Statistics] 缓存统计 - 文件: ${cacheStats.fileCacheSize}, 哈希: ${cacheStats.processedHashesSize}`);
			
			// 聚合数据
			console.log(`[Statistics] 准备聚合 ${allEntries.length} 条数据，类型: ${type}`);
			const result = this._aggregateStatistics(allEntries, type);
			console.log(`[Statistics] 聚合完成，结果包含 ${result.rows.length} 行`);
			
			// 缓存聚合结果
			this._statisticsCache.updateAggregatedCache(cacheKey, type, result);
			
			return result;
			
		} catch (error) {
			console.error('加载统计数据时出错:', error);
			throw error;
		}
	}
	
	// 新增：生成消息的唯一哈希值用于去重
	private _generateMessageHash(entry: any): string {
		// 使用消息ID和请求ID的组合作为唯一标识
		const messageId = entry.message?.id || '';
		const requestId = entry.requestId || '';
		const timestamp = entry.timestamp || '';
		
		// 如果没有唯一ID，使用时间戳和内容的组合
		if (!messageId && !requestId) {
			const usage = entry.message?.usage || {};
			return `${timestamp}_${usage.input_tokens}_${usage.output_tokens}`;
		}
		
		return `${messageId}_${requestId}`;
	}

	private _aggregateStatistics(entries: any[], type: string): any {
		// 使用静态 MODEL_PRICING Map 代替局部对象
		// 提前退出：如果没有数据，直接返回
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
		
		// 定义聚合数据的类型
		interface AggregatedStats {
			inputTokens: number;
			outputTokens: number;
			cacheCreationTokens: number;
			cacheReadTokens: number;
			totalTokens: number;
			cost: number;
			models: Set<string>;
			lastTimestamp: Date;
			// 用于5小时块的额外信息
			blockEntries?: Map<string, number>;
			hourlyActivity?: number[];
		}
		
		// 使用 Map 存储聚合数据，提高查找效率
		const aggregated = new Map<string, AggregatedStats>();
		
		// 用于调试的键集合
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
			
			// 记录调试键
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
					// 5小时块的额外统计信息
					...(type === 'blocks' ? { 
						blockEntries: new Map<string, number>(),
						hourlyActivity: new Array(5).fill(0) // 每小时活动计数
					} : {})
				});
			}
			
			const stats = aggregated.get(key);
			// TypeScript 类型保护：确保 stats 不是 undefined
			if (!stats) {
				console.error(`统计数据未找到，键: ${key}`);
				return;
			}
			
			stats.inputTokens += entry.usage.input_tokens || 0;
			stats.outputTokens += entry.usage.output_tokens || 0;
			// 修正：从usage中获取缓存相关的token
			stats.cacheCreationTokens += entry.usage.cache_creation_input_tokens || 0;
			stats.cacheReadTokens += entry.usage.cache_read_input_tokens || 0;
			// 总token应该包含所有类型的token
			stats.totalTokens += (entry.usage.input_tokens || 0) + 
			                    (entry.usage.output_tokens || 0) + 
			                    (entry.usage.cache_creation_input_tokens || 0) + 
			                    (entry.usage.cache_read_input_tokens || 0);
			
			// 使用 Map 计算成本，如果为 0 或缺失
			let cost = entry.costUSD || 0;
			if (cost === 0 && entry.model) {
				const pricing = ClaudeChatProvider.MODEL_PRICING.get(entry.model);
				if (pricing) {
					// 计算普通输入token的成本（不包括缓存读取）
					const normalInputCost = ((entry.usage.input_tokens || 0) * pricing.input) / 1000000;
					
					// 计算缓存读取token的成本（输入价格的10%）
					const cacheReadCost = ((entry.usage.cache_read_input_tokens || 0) * pricing.input * 0.1) / 1000000;
					
					// 计算输出token的成本
					const outputCost = ((entry.usage.output_tokens || 0) * pricing.output) / 1000000;
					
					// 计算缓存创建token的成本（输出价格的25%）
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
			
			// 对于5小时块，记录每小时的活动
			if (type === 'blocks' && stats.hourlyActivity) {
				const hour = date.getHours();
				const blockStartHour = Math.floor(hour / 5) * 5;
				const hourIndex = hour - blockStartHour; // 0-4 的索引
				stats.hourlyActivity[hourIndex]++;
				
				// 记录每个文件的条目数
				if (stats.blockEntries) {
					const fileKey = entry.file;
					stats.blockEntries.set(fileKey, (stats.blockEntries.get(fileKey) || 0) + 1);
				}
			}
		});
		
		// 输出调试信息
		console.log(`[Statistics] ${type} 统计找到的唯一键: ${debugKeys.size} 个`);
		console.log(`[Statistics] ${type} 键列表:`, Array.from(debugKeys).sort());
		
		// Convert to array and sort
		const rows = Array.from(aggregated.entries())
			.map(([key, stats]) => {
				const result: any = {
					...stats,
					models: Array.from(stats.models) // Convert Set to Array
				};
				
				if (type === 'blocks') {
					result.block = key;
					// 判断块是否活跃（最近5小时内有活动）
					const now = new Date();
					const blockDate = new Date(key.split(' ')[0]);
					const blockStartHour = parseInt(key.split(' ')[1].split('-')[0]);
					blockDate.setHours(blockStartHour);
					
					const hoursSinceBlock = (now.getTime() - blockDate.getTime()) / (1000 * 60 * 60);
					result.status = hoursSinceBlock < 5 ? 'active' : 'inactive';
					
					// 添加每小时活动统计
					if (stats.hourlyActivity) {
						result.hourlyActivity = stats.hourlyActivity;
						result.peakHour = stats.hourlyActivity.indexOf(Math.max(...stats.hourlyActivity));
					}
					
					// 添加文件分布信息
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
		
		// 优化：提前退出计算总计
		let totals = {
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			totalTokens: 0,
			cost: 0
		};
		
		// 如果没有数据，直接返回
		if (rows.length === 0) {
			return { rows, totals };
		}
		
		// 使用 for 循环代替 reduce，可以更好地控制和优化
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
			
			// 获取webview可访问的URI
			const webviewUri = this._panel?.webview.asWebviewUri(imagePath);
			
			this._panel?.webview.postMessage({
				type: 'imagePath',
				path: relativePath,
				webviewUri: webviewUri?.toString()
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
		
		// 发送token使用情况到UI
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
			
			// 显示成功提示
			vscode.window.showInformationMessage('Settings updated successfully');
			
			// Send updated MCP status
			if (settings['mcp.enabled']) {
				this._sendMcpStatus();
			}
		} catch (error) {
			console.error('Failed to update settings:', error);
			vscode.window.showErrorMessage('Failed to update settings');
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
			
			// 尝试动态查询MCP服务器的工具
			console.log(`[MCP] Attempting to dynamically query tools for ${serverName}`);
			const dynamicTools = await this._queryMcpServerTools(server);
			
			if (dynamicTools && dynamicTools.length > 0) {
				// 成功获取工具列表
				console.log(`[MCP] Successfully got ${dynamicTools.length} tools from ${serverName} via dynamic query`);
				this._panel?.webview.postMessage({
					type: 'mcpToolsData',
					data: {
						tools: dynamicTools,
						serverName: serverName
					}
				});
			} else {
				// 动态查询失败，显示错误信息
				console.log(`[MCP] Dynamic query failed or returned no tools for ${serverName}`);
				this._panel?.webview.postMessage({
					type: 'mcpToolsData',
					data: {
						error: `Failed to retrieve tools from ${serverName}. The MCP server might not be running, not installed, or doesn't support tool discovery.`,
						serverName: serverName,
						command: `${server.command} ${server.args?.join(' ') || ''}`
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
	 * Dynamically query MCP server for available tools
	 * @param server MCP server configuration
	 * @returns Array of tools or null if failed
	 */
	private async _queryMcpServerTools(server: any): Promise<any[] | null> {
		try {
			console.log(`[MCP] Querying tools for server: ${server.name}`);

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
			
			console.log(`[MCP] Spawning process - command: ${command}, args:`, args);
			const startTime = Date.now();
			const mcpProcess = cp.spawn(command, args, spawnOptions);

			if (!mcpProcess.stdout || !mcpProcess.stderr || !mcpProcess.stdin) {
				console.error(`[MCP] Failed to get stdio streams for ${server.name}`);
				return null;
			}
			
			const mcpStdout = mcpProcess.stdout;
			const mcpStderr = mcpProcess.stderr;
			const mcpStdin = mcpProcess.stdin;

			return new Promise((resolve) => {
				let responseData = '';
				let errorData = '';

				// Python MCP 服务器需要更长的启动时间
				const timeoutDuration = command === 'uvx' || command.includes('python') ? 15000 : 8000;
				
				const timeout = setTimeout(() => {
					if (!mcpProcess.killed) {
						mcpProcess.kill();
					}
					console.log(`[MCP] Timeout waiting for response from ${server.name} (waited ${timeoutDuration/1000}s)`);
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

								if (response.id === 1 && response.result) { // 初始化响应
									const elapsedTime = Date.now() - startTime;
									console.log(`[MCP] Initialized with ${server.name} (took ${elapsedTime}ms).`);
									console.log(`[MCP] Server capabilities:`, JSON.stringify(response.result.capabilities));
									
									// 发送 initialized 通知
									const initializedNotification = {
										jsonrpc: '2.0',
										method: 'notifications/initialized'
									};
									mcpStdin.write(JSON.stringify(initializedNotification) + '\n');
									
									if (response.result.capabilities?.tools) {
										// 延迟一下确保初始化完成
										setTimeout(() => {
											const toolListRequest = {
												jsonrpc: '2.0',
												id: 2,
												method: 'tools/list'
												// 不发送 params 字段
											};
											console.log(`[MCP] Sending tools/list request`);
											mcpStdin.write(JSON.stringify(toolListRequest) + '\n');
										}, 500);
									} else {
										console.log(`[MCP] ${server.name} does not support tools.`);
										cleanup();
										resolve([]);
									}
								} else if (response.id === 2 && response.result) { // tools/list 响应
									const elapsedTime = Date.now() - startTime;
									const tools = response.result.tools || [];
									const toolList = tools.map((tool: any) => ({
										name: tool.name || 'Unknown Tool',
										description: tool.description || 'No description available.'
									}));
									console.log(`[MCP] Retrieved ${toolList.length} tools from ${server.name} (total time: ${elapsedTime}ms).`);
									// 输出前几个工具名称用于调试
									if (toolList.length > 0) {
										console.log(`[MCP] First few tools:`, toolList.slice(0, 3).map((t: any) => t.name).join(', '));
									}
									cleanup();
									resolve(toolList);
								} else if (response.id === 2 && response.error) { // tools/list 错误响应
									console.error(`[MCP] Error getting tools from ${server.name}:`, response.error);
									console.error(`[MCP] Error details:`, JSON.stringify(response.error));
									cleanup();
									resolve(null);
								}
							} catch (e) {
								// 忽略已知的非 JSON 消息
								const trimmedLine = line.trim();
								
								// 添加调试信息
								console.log(`[MCP DEBUG] Received non-JSON line from ${server.name}: "${trimmedLine}"`);
								console.log(`[MCP DEBUG] Line length: ${trimmedLine.length}, Original line: "${line}"`);
								
								if (trimmedLine === 'Shutdown signal received' || 
								    trimmedLine.toLowerCase().includes('shutdown signal') ||
								    trimmedLine.toLowerCase().includes('shutting down')) {
									// 这是 MCP 关闭时的正常消息，不需要记录错误
									console.log(`[MCP] ${server.name} shutting down (handled gracefully)`);
								} else if (trimmedLine === '') {
									// 忽略空行
									console.log(`[MCP] Ignoring empty line from ${server.name}`);
								} else {
									// 其他未知的 JSON 解析错误才记录为普通日志
									console.log(`[MCP] Non-JSON message from ${server.name}: "${line}"`);
									console.log(`[MCP] Parse attempt failed:`, (e as Error).message || e);
								}
								// continue to next line
							}
						}
					}
				});

				mcpStderr.on('data', (data: Buffer) => {
					const stderr = data.toString();
					errorData += stderr;
					// 输出stderr以便调试（过滤掉INFO日志和已知的关闭消息）
					if (!stderr.includes('INFO') && 
					    !stderr.includes('Starting MCP server') && 
					    !stderr.includes('Shutdown signal received')) {
						console.log(`[MCP] stderr from ${server.name}:`, stderr.trim());
					} else if (stderr.includes('Shutdown signal received')) {
						console.log(`[MCP] ${server.name} shutting down (from stderr)`);
					}
				});

				mcpProcess.on('error', (error: any) => {
					console.error(`[MCP] Failed to spawn ${server.name}:`, error);
					cleanup();
					resolve(null);
				});

				mcpProcess.on('close', (code: number) => {
					cleanup();
					if (code !== 0 && code !== null) {
						console.error(`[MCP] ${server.name} exited with code: ${code}`);
						if(errorData) {
							console.error(`[MCP] stderr:`, errorData);
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
			console.error(`[MCP] Error querying server tools for ${server.name}:`, error);
			return null;
		}
	}

	private _setSelectedModel(model: string): void {
		// Validate model name to prevent issues mentioned in the GitHub issue
		if (VALID_MODELS.includes(model as ValidModel)) {
			this._selectedModel = model;
			// DEBUG: console.log('Model selected:', model);
			
			// Store the model preference in workspace state
			this._context.workspaceState.update('claude.selectedModel', model);
			
			// Show confirmation
			const displayName = model === 'claude-opus-4-1-20250805' ? 'Opus 4.1' : model.charAt(0).toUpperCase() + model.slice(1);
			vscode.window.showInformationMessage(`Claude model switched to: ${displayName}`);
		} else {
			console.error('Invalid model selected:', model);
			vscode.window.showErrorMessage(`Invalid model: ${model}. Please select one of: ${VALID_MODELS.join(', ')}.`);
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
					this._conversationId = undefined;
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
						data: `## Model Selection\n\nCurrent model: ${this._selectedModel || 'opus'}\n\nAvailable models:\n• opus - Claude 3 Opus (most capable)\n• claude-opus-4-1-20250805 - Opus 4.1 (latest flagship model)\n• sonnet - Claude 3.5 Sonnet (balanced)\n• default - User configured\n\nTo change model, use the model selector dropdown in the UI.`
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
			console.error('Failed to preview operation:', error);
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
			console.error('Failed to undo operation:', error);
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
			console.error('Failed to redo operation:', error);
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

	// 发送token使用情况到UI
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

	// 压缩对话功能
	private async _compactConversation(languageMode?: boolean, selectedLanguage?: string): Promise<void> {
		try {
			// 设置处理状态
			this._panel?.webview.postMessage({
				type: 'setProcessing',
				data: true
			});

			// 获取当前对话内容
			const conversationData = this._conversationManager.getConversationForSummary();
			
			if (!conversationData || (conversationData.userMessages.length === 0 && conversationData.assistantMessages.length === 0)) {
				// 恢复处理状态
				this._panel?.webview.postMessage({
					type: 'setProcessing',
					data: false
				});
				
				// 显示错误消息
				this._panel?.webview.postMessage({
					type: 'error',
					data: 'No conversation to compact'
				});
				return;
			}

			// 格式化对话内容
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

			// 构造压缩提示词（英文提示词）
			const compactPrompt = `Please summarize the following conversation within 500 words. Focus on:
1. The main topics discussed
2. Key decisions made
3. Important code changes (list filenames and change types)
4. Any unresolved issues or todos
5. Any errors or issues that need attention

Conversation:
${conversationText}

Please provide a well-structured summary.`;

			// 保存当前对话历史（压缩前）
			const currentSessionId = Date.now().toString();
			await this._conversationManager.saveCurrentConversation(
				currentSessionId,
				this._totalCost,
				this._totalTokensInput,
				this._totalTokensOutput
			);

			// 创建新会话
			this._newSession();
			
			// 在新会话中显示"正在总结中"提示
			this._panel?.webview.postMessage({
				type: 'output',
				data: '⏳ Generating conversation summary...'
			});

			// 后台生成总结（不显示提示词）
			await this._generateCompactSummary(compactPrompt, conversationData, languageMode, selectedLanguage);

			// 恢复处理状态
			this._panel?.webview.postMessage({
				type: 'setProcessing',
				data: false
			});

		} catch (error: any) {
			console.error('Failed to compact conversation:', error);
			
			// 恢复处理状态
			this._panel?.webview.postMessage({
				type: 'setProcessing',
				data: false
			});
			
			// 显示错误消息
			this._panel?.webview.postMessage({
				type: 'error',
				data: `Failed to compact conversation: ${error.message}`
			});
		}
	}

	// 后台生成压缩总结
	private async _generateCompactSummary(prompt: string, conversationData: any, languageMode?: boolean, selectedLanguage?: string): Promise<void> {
		// 如果没有指定语言模式，默认使用英文
		let actualPrompt = prompt;
		
		// 使用特殊的压缩模式发送消息
		this._isCompactMode = true;
		
		// 发送压缩提示（不会在 UI 显示）
		// 传递语言设置以支持 Language Mode
		await this._sendMessageToClaude(actualPrompt, false, false, languageMode || false, selectedLanguage);
		
		// 重置压缩模式标志
		this._isCompactMode = false;
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