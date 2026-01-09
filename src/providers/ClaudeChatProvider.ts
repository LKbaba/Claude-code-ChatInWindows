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

// 计算模式设置接口
interface ComputeModeSettings {
	mode: 'auto' | 'max';           // 计算模式选择
	enhanceSubagents: boolean;       // 是否增强子代理（独立设置）
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
	private _selectedModel: string = 'claude-sonnet-4-5-20250929'; // 默认使用 Sonnet 4.5
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
		// Opus 系列模型定价
		['claude-opus-4-5-20251101', { input: 5.00, output: 25.00 }],    // Opus 4.5 最新旗舰模型（降价66%）
		['claude-opus-4-1-20250805', { input: 15.00, output: 75.00 }],   // Opus 4.1 旗舰模型
		['claude-opus-4-20250514', { input: 15.00, output: 75.00 }],     // Opus 4
		['claude-3-opus-20240229', { input: 15.00, output: 75.00 }],     // Claude 3 Opus
		// Sonnet 系列模型定价
		['claude-sonnet-4-5-20250929', { input: 3.00, output: 15.00 }],  // Sonnet 4.5 最新智能模型
		['claude-sonnet-4-20250514', { input: 3.00, output: 15.00 }],    // Sonnet 4
		['claude-3-5-sonnet-20241022', { input: 3.00, output: 15.00 }],  // Claude 3.5 Sonnet
		['claude-3-5-sonnet-20240620', { input: 3.00, output: 15.00 }],
		['claude-3-sonnet-20240229', { input: 3.00, output: 15.00 }],    // Claude 3 Sonnet
		// Haiku 系列模型定价
		['claude-haiku-4-5-20251001', { input: 1.00, output: 5.00 }],    // Haiku 4.5 高性价比模型
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
			console.error('[ClaudeChatProvider] Failed to initialize backup repo:', error);
		});

		// Load saved model preference (default to Sonnet 4.5)
		this._selectedModel = this._context.workspaceState.get('claude.selectedModel', 'claude-sonnet-4-5-20250929');

		// 恢复计算模式状态
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
					case 'setMcpConfigTarget':
						// 设置 MCP 配置保存目标（'user' 或 'workspace'）
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
						// 处理文件路径点击事件
						if (message.file) {
							// 新的消息格式，包含file、line、endLine
							this._openFileAtLine(message.file, message.line, message.endLine);
						} else if (message.filePath) {
							// 兼容旧的消息格式
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
					// Gemini Integration 相关消息处理
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

			// 发送 Gemini Integration 配置到 webview
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
					console.error('[FileNav] File does not exist:', filePath);
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

			console.log('[FileNav] Successfully opened file:', {
				filePath,
				line,
				endLine,
				fullPath: fullPath.fsPath
			});

		} catch (error: any) {
			console.error('[FileNav] Failed to open file:', {
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
			console.log(`[Statistics] Using cached aggregated results: ${type}`);
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
					throw new Error('Unable to find available glob function');
				}
			} catch (globError) {
				console.error('Glob loading failed, using fallback:', globError);
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
							console.log(`[Statistics] Using cached data: ${file} (${cachedEntries.length} entries)`);
							return;
						}
					}
					
					console.log(`[Statistics] Reading file: ${file}`);
					const fileEntries: StatisticsEntry[] = [];
					const fileSize = stats.size;
					
					if (fileSize < FILE_SIZE_THRESHOLD) {
						// 小文件：直接读取整个文件，使用预索引策略过滤 Warmup 消息
						const content = await fs.readFile(file, 'utf-8');
						const lines = content.split('\n').filter((line: string) => line.trim());

						// 第一遍：解析所有条目并收集 Warmup 相关的 UUID（支持链式过滤）
						const entries: any[] = [];
						const warmupUuids = new Set<string>();

						for (const line of lines) {
							try {
								const entry = JSON.parse(line);
								entries.push(entry);

								// 收集 Warmup 用户消息的 UUID
								if (entry.type === 'user' && entry.message?.content === 'Warmup' && entry.uuid) {
									warmupUuids.add(entry.uuid);
								}
							} catch {
								// 跳过无效的 JSON 行
							}
						}

						// 第二遍：过滤并处理统计数据，支持链式过滤（多轮 Warmup 对话）
						for (const entry of entries) {
							// 跳过 Warmup 用户消息本身
							if (entry.type === 'user' && entry.message?.content === 'Warmup') {
								continue;
							}

							// 跳过 Warmup 的响应消息（父消息是 Warmup 或其链式响应）
							if (entry.parentUuid && warmupUuids.has(entry.parentUuid)) {
								// 链式过滤：将当前响应的 UUID 也加入黑名单，处理多轮对话
								if (entry.uuid) {
									warmupUuids.add(entry.uuid);
								}
								continue;
							}

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
						}
					} else {
						// 大文件：使用流式读取，减少内存占用
						// 两遍扫描：第一遍收集 Warmup 消息的 UUID，第二遍过滤

						// 第一遍：收集 Warmup 消息的 UUID
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
									// 如果是 Warmup 用户消息，记录其 UUID
									if (entry.type === 'user' && entry.message?.content === 'Warmup' && entry.uuid) {
										warmupUuids.add(entry.uuid);
									}
								} catch {
									// 跳过无效行
								}
							});

							rl.on('close', () => resolve());
							rl.on('error', (err: Error) => reject(err));
						});

						// 第二遍：处理统计数据，跳过 Warmup 相关的消息（支持链式过滤）
						await new Promise<void>((resolve, reject) => {
							const rl = readline.createInterface({
								input: createReadStream(file),
								crlfDelay: Infinity
							});

							rl.on('line', (line: string) => {
								if (!line.trim()) return;

								try {
									const entry = JSON.parse(line);

									// 跳过 Warmup 用户消息
									if (entry.type === 'user' && entry.message?.content === 'Warmup') {
										return;
									}

									// 跳过 Warmup 的响应消息（父消息是 Warmup 或其链式响应）
									if (entry.parentUuid && warmupUuids.has(entry.parentUuid)) {
										// 链式过滤：将当前响应的 UUID 也加入黑名单，处理多轮对话
										if (entry.uuid) {
											warmupUuids.add(entry.uuid);
										}
										return;
									}

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
					console.warn(`Skipping unreadable file: ${file}`, e);
				}
			}));
			
			// 输出缓存统计信息
			const cacheStats = this._statisticsCache.getCacheStats();
			console.log(`[Statistics] Cache stats - files: ${cacheStats.fileCacheSize}, hashes: ${cacheStats.processedHashesSize}`);
			
			// 聚合数据
			console.log(`[Statistics] Aggregating ${allEntries.length} entries, type: ${type}`);
			const result = this._aggregateStatistics(allEntries, type);
			console.log(`[Statistics] Aggregation complete, result contains ${result.rows.length} rows`);
			
			// 缓存聚合结果
			this._statisticsCache.updateAggregatedCache(cacheKey, type, result);
			
			return result;
			
		} catch (error) {
			console.error('Error loading statistics:', error);
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

	/**
	 * 格式化模型名称以便在UI中显示
	 * 解决 Sonnet 4.5、Haiku 4.5、Opus 4.5 显示名称不正确的问题
	 */
	private _formatModelName(modelId: string): string {
		// 模型ID到显示名称的映射
		const modelDisplayNames: { [key: string]: string } = {
			// Opus 系列
			'opus': 'Opus',
			'claude-opus-4-5-20251101': 'Opus 4.5',
			'claude-opus-4-1-20250805': 'Opus 4.1',
			'claude-opus-4-20250514': 'Opus 4',
			'claude-3-opus-20240229': 'Claude 3 Opus',
			// Sonnet 系列
			'sonnet': 'Sonnet',
			'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
			'claude-sonnet-4-20250514': 'Sonnet 4',
			'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
			'claude-3-5-sonnet-20240620': 'Sonnet 3.5',
			'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
			// Haiku 系列
			'haiku': 'Haiku',
			'claude-haiku-4-5-20251001': 'Haiku 4.5',
			'claude-3-haiku-20240307': 'Claude 3 Haiku',
			// 特殊模式
			'opusplan': 'Opus Plan',
			'default': 'Default'
		};

		return modelDisplayNames[modelId] || modelId;
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
				console.error(`Statistics data not found, key: ${key}`);
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
		console.log(`[Statistics] ${type} statistics found unique keys: ${debugKeys.size}`);
		console.log(`[Statistics] ${type} key list:`, Array.from(debugKeys).sort());
		
		// Convert to array and sort
		const rows = Array.from(aggregated.entries())
			.map(([key, stats]) => {
				const result: any = {
					...stats,
					// 格式化模型名称以正确显示 Sonnet 4.5、Haiku 4.5、Opus 4.5 等
					models: Array.from(stats.models).map(modelId => this._formatModelName(modelId))
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

	// ==================== Gemini Integration 相关方法 ====================

	/**
	 * 更新 Gemini Integration 启用状态
	 */
	private async _updateGeminiIntegration(enabled: boolean): Promise<void> {
		try {
			await secretService.setGeminiIntegrationEnabled(enabled);
			console.log('[Gemini] Integration status updated:', enabled);

			if (enabled) {
				vscode.window.showInformationMessage('Gemini Integration enabled. API key will be automatically injected.');
			}
		} catch (error) {
			console.error('[Gemini] Failed to update Integration status:', error);
			vscode.window.showErrorMessage('Failed to update Gemini Integration settings');
		}
	}

	/**
	 * 更新 Gemini API Key（安全存储）
	 */
	private async _updateGeminiApiKey(apiKey: string): Promise<void> {
		try {
			// 验证 API Key 格式
			if (!SecretService.isValidGeminiApiKeyFormat(apiKey)) {
				vscode.window.showWarningMessage('Gemini API key format may be incorrect. Keys typically start with "AIza".');
			}

			await secretService.setGeminiApiKey(apiKey);
			console.log('[Gemini] API Key stored securely');
			vscode.window.showInformationMessage('Gemini API key saved securely');

			// 发送更新后的配置到 webview
			this._sendGeminiIntegrationConfig();
		} catch (error) {
			console.error('[Gemini] Failed to save API Key:', error);
			vscode.window.showErrorMessage('Failed to save Gemini API key');
		}
	}

	/**
	 * 发送 Gemini Integration 配置到 webview
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

			console.log('[Gemini] Config sent to webview');
		} catch (error) {
			console.error('[Gemini] Failed to get config:', error);
		}
	}

	// ==================== 其他方法 ====================

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

				// 根据服务器类型生成不同的错误信息
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

			console.log(`[PluginManager] Sent ${plugins.length} plugin(s) to webview (from cache)`);
		} catch (error: any) {
			console.error('[PluginManager] Failed to get plugins:', error);
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

			console.log(`[PluginManager] Plugins refreshed: ${plugins.length} plugin(s) loaded`);

			// Send refreshed plugin list to webview and mark as refresh operation
			this._panel?.webview.postMessage({
				type: 'pluginsList',
				data: {
					plugins: plugins,
					refreshed: true  // Mark as refresh operation, frontend can show notification
				}
			});
		} catch (error: any) {
			console.error('[PluginManager] Failed to refresh plugins:', error);
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
			console.log(`[MCP] Querying tools for server: ${server.name}`);

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

			console.log(`[MCP] Querying HTTP/SSE server: ${server.name}`);

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
						version: '2.1.2'
					},
					capabilities: {}
				}
			};

			// Send initialize request and get response (including headers)
			const initResult = await this._sendHttpMcpRequest(httpModule, parsedUrl, headers, initRequest);
			const initResponse = initResult.body;
			const initResponseHeaders = initResult.headers;

			if (!initResponse || !initResponse.result) {
				console.error(`[MCP] Failed to initialize ${server.name}`);
				return null;
			}

			console.log(`[MCP] ✓ ${server.name} initialized successfully`);

			// Extract session ID if server returned one
			let sessionId = initResponseHeaders['mcp-session-id'] || initResponseHeaders['MCP-Session-ID'];
			if (sessionId) {
				console.log(`[MCP] Session ID received: ${sessionId.substring(0, 8)}...`);
				// Add session ID to subsequent requests
				headers['mcp-session-id'] = sessionId;
			}

			// Check if server supports tools
			if (!initResponse.result.capabilities?.tools) {
				console.log(`[MCP] Server ${server.name} does not support tools`);
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
				console.error(`[MCP] Failed to get tools from ${server.name}`);
				return null;
			}

			const tools = toolsResponse.result.tools || [];
			const toolList = tools.map((tool: any) => ({
				name: tool.name || 'Unknown Tool',
				description: tool.description || 'No description available.'
			}));

			console.log(`[MCP] ✓ Retrieved ${toolList.length} tool(s) from ${server.name}`);

			return toolList;

		} catch (error: any) {
			console.error(`[MCP] Error querying HTTP/SSE server ${server.name}:`, error.message);
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
							console.error(`[MCP] HTTP ${res.statusCode} error`);
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
								console.error(`[MCP] SSE response missing data field`);
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
						console.error(`[MCP] Failed to parse response:`, error.message);
						reject(error);
					}
				});
			});

			req.on('error', (error: any) => {
				console.error(`[MCP] HTTP request error:`, error.message);
				reject(error);
			});

			req.write(postData);
			req.end();
		});
	}

	private _setSelectedModel(model: string): void {
		// 验证模型名称以防止问题
		if (VALID_MODELS.includes(model as ValidModel)) {
			this._selectedModel = model;
			// DEBUG: console.log('Model selected:', model);

			// 在工作区状态中存储模型偏好
			this._context.workspaceState.update('claude.selectedModel', model);

			// 获取显示名称
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

			// 显示确认消息
			vscode.window.showInformationMessage(message);
		} else {
			console.error('Invalid model selected:', model);
			vscode.window.showErrorMessage(`Invalid model: ${model}. Please select one of: ${VALID_MODELS.join(', ')}.`);
		}
	}

	/**
	 * 处理计算模式选择（独立于子代理设置）
	 * @param mode - 'auto' 或 'max'
	 */
	private _handleModeSelection(mode: 'auto' | 'max'): void {
		const SONNET_4_5 = 'claude-sonnet-4-5-20250929';

		if (mode === 'max') {
			// Max模式：设置ANTHROPIC_DEFAULT_HAIKU_MODEL
			process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = SONNET_4_5;
			console.log('[Compute Mode] Max mode enabled - Using Sonnet 4.5 for background tasks');
			vscode.window.showInformationMessage('Max mode enabled - Maximum performance, higher cost');
		} else {
			// Auto模式：清除ANTHROPIC_DEFAULT_HAIKU_MODEL
			delete process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
			console.log('[Compute Mode] Auto mode enabled - Smart allocation for cost efficiency');
			vscode.window.showInformationMessage('Auto mode enabled - Smart allocation');
		}

		// 保存模式设置
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
	 * 处理子代理增强设置（独立于模式设置）
	 * @param enabled - 是否启用子代理增强
	 */
	private _handleSubagentEnhancement(enabled: boolean): void {
		const SONNET_4_5 = 'claude-sonnet-4-5-20250929';

		if (enabled) {
			// 启用增强：设置CLAUDE_CODE_SUBAGENT_MODEL
			process.env.CLAUDE_CODE_SUBAGENT_MODEL = SONNET_4_5;
			console.log('[Compute Mode] Enhanced subagents enabled - Using Sonnet 4.5 for all subagent operations');
			vscode.window.showInformationMessage('Enhanced subagents enabled - Higher performance, increased cost');
		} else {
			// 禁用增强：清除CLAUDE_CODE_SUBAGENT_MODEL
			delete process.env.CLAUDE_CODE_SUBAGENT_MODEL;
			console.log('[Compute Mode] Standard subagents enabled - Using default model allocation');
		}

		// 保存子代理设置
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
	 * 在初始化时恢复计算模式状态
	 */
	private _restoreComputeModeState(): void {
		// 尝试读取新的配置格式
		const settings = this._context.workspaceState.get<ComputeModeSettings>('computeModeSettings');

		if (settings) {
			// 使用新格式
			const SONNET_4_5 = 'claude-sonnet-4-5-20250929';

			// 恢复模式设置
			if (settings.mode === 'max') {
				process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = SONNET_4_5;
				console.log('[Compute Mode] Restored Max mode');
			}

			// 恢复子代理设置（独立）
			if (settings.enhanceSubagents) {
				process.env.CLAUDE_CODE_SUBAGENT_MODEL = SONNET_4_5;
				console.log('[Compute Mode] Restored enhanced subagents');
			}

			console.log('[Compute Mode] Settings restored:', settings);
		} else {
			// 向后兼容：检查旧的maxModeEnabled配置
			const maxModeEnabled = this._context.workspaceState.get('maxModeEnabled', false);
			if (maxModeEnabled) {
				const SONNET_4_5 = 'claude-sonnet-4-5-20250929';
				process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = SONNET_4_5;
				console.log('[Compute Mode] Migrated from old Max mode setting');

				// 迁移到新格式
				this._context.workspaceState.update('computeModeSettings', {
					mode: 'max',
					enhanceSubagents: false
				});
				// 删除旧配置
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
			console.log(`[ClaudeChatProvider] Executing slash command: /${command}`);

			// Show prompt message in chat window (using output type for bordered style)
			this._sendAndSaveMessage({
				type: 'output',
				data: `⚡ Executing \`/${command}\` command in terminal...\n\nPlease check the terminal window for output.`
			});

			// Create terminal window and execute command
			const terminal = vscode.window.createTerminal(`Claude /${command}`);
			terminal.sendText(`claude /${command}`);
			terminal.show();

			console.log(`[ClaudeChatProvider] Command sent to terminal: claude /${command}`);

		} catch (error: any) {
			console.error(`[ClaudeChatProvider] Failed to execute slash command:`, error);
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