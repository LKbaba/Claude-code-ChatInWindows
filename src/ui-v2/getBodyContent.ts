// This file contains the getBodyContent function for UI v2
// It returns the exact same HTML structure as the original UI

export function getBodyContent(): string {
  return `
	<div class="header">
		<div style="display: flex; align-items: center;">
			<h2>Claude Code Chat</h2>
			<span id="versionDisplay" style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-left: 8px; opacity: 0.7; align-self: flex-end; margin-bottom: 2px;">v2.0.5</span>
			<!-- <div id="sessionInfo" class="session-badge" style="display: none;">
				<span class="session-icon">💬</span>
				<span id="sessionId">-</span>
				<span class="session-label">session</span>
			</div> -->
		</div>
		<div class="header-buttons" style="display: flex; gap: 8px; align-items: center;">
			<div id="sessionStatus" class="session-status" style="display: none;">No session</div>
			<button class="btn outlined" id="settingsBtn" onclick="toggleSettings()" title="Settings">⚙️</button>
			<button class="btn outlined" id="statsBtn" onclick="toggleStats()" title="Usage Statistics">📈</button>
			<button class="btn outlined" id="operationHistoryBtn" onclick="toggleOperationHistory()" title="Operation Undo">🔄</button>
			<button class="btn outlined" id="historyBtn" onclick="toggleConversationHistory()" style="display: none;">📜 History</button>
			<button class="btn primary" id="newSessionBtn" onclick="newSession()" style="display: none;">New Chat</button>
		</div>
	</div>
	
	<div id="conversationHistory" class="conversation-history" style="display: none;">
		<div class="conversation-header">
			<h3>Conversation History</h3>
			<button class="btn" onclick="toggleConversationHistory()">✕ Close</button>
		</div>
		<div id="conversationList" class="conversation-list">
			<!-- Conversations will be loaded here -->
		</div>
	</div>

	<div id="statsPanel" class="stats-panel" style="display: none;">
		<div class="stats-header">
			<h3>Usage Statistics <span style="font-size: 12px; color: var(--vscode-descriptionForeground); font-weight: normal;">(Price calculated based on actual model used)</span></h3>
			<button class="btn" onclick="toggleStats()">✕ Close</button>
		</div>
		<div class="stats-tabs">
			<button class="stats-tab active" onclick="switchStatsTab('daily')">Daily</button>
			<button class="stats-tab" onclick="switchStatsTab('monthly')">Monthly</button>
			<button class="stats-tab" onclick="switchStatsTab('blocks')">Blocks</button>
			<button class="stats-tab" onclick="switchStatsTab('session')">Session</button>
		</div>
		<div id="statsContent" class="stats-content">
			<div class="stats-loading">Loading statistics...</div>
		</div>
	</div>

	<div class="chat-container" id="chatContainer">
		<div class="messages" id="messages"></div>
		
		<div class="input-container" id="inputContainer">
			<div class="input-modes">
				<div class="mode-toggle">
					<span id="planModeLabel" onclick="togglePlanMode()">Plan First</span>
					<div class="mode-switch" id="planModeSwitch" onclick="togglePlanMode()"></div>
				</div>
				<div class="mode-toggle">
					<span id="thinkingModeLabel" onclick="toggleThinkingMode()">Thinking Mode</span>
					<div class="mode-switch" id="thinkingModeSwitch" onclick="toggleThinkingMode()"></div>
				</div>
				<div class="mode-toggle">
					<span id="languageModeLabel" onclick="handleLanguageLabelClick()">Language Mode</span>
					<div class="mode-switch" id="languageModeSwitch" onclick="toggleLanguageMode()"></div>
				</div>
			</div>
			<div class="textarea-container">
				<div class="textarea-wrapper">
					<textarea class="input-field" id="messageInput" placeholder="Type your message to Claude Code..." rows="1"></textarea>
					<div class="input-controls">
						<div class="left-controls">
							<button class="model-selector" id="modelSelector" onclick="showModelSelector()" title="Select model">
								<span id="selectedModel">Opus</span>
								<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
									<path d="M1 2.5l3 3 3-3"></path>
								</svg>
							</button>

							<!-- 算力模式选择器 -->
							<button class="model-selector" id="modeSelector" onclick="showModeSelector()" title="Select compute mode">
								<span id="selectedMode">Auto</span>
								<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
									<path d="M1 2.5l3 3 3-3"></path>
								</svg>
							</button>

							<button class="tools-btn" onclick="showToolsModal()" title="Configure tools">
								Tools: All
								<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
									<path d="M1 2.5l3 3 3-3"></path>
								</svg>
							</button>

							<button class="plugins-btn" id="plugins-button" onclick="showPluginsModal()" title="View all plugins">
								Plugins: All
								<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
									<path d="M1 2.5l3 3 3-3"></path>
								</svg>
							</button>
						</div>
						<div class="right-controls">
							<button class="slash-btn" onclick="showSlashCommandsModal()" title="Slash commands">/</button>
							<button class="at-btn" onclick="showFilePicker()" title="Reference files">@</button>
							<button class="image-btn" id="imageBtn" onclick="selectImage()" title="Attach images">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								width="14"
								height="16"
								>
								<g fill="currentColor">
									<path d="M6.002 5.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0"></path>
									<path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2zm13 1a.5.5 0 0 1 .5.5v6l-3.775-1.947a.5.5 0 0 0-.577.093l-3.71 3.71l-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12v.54L1 12.5v-9a.5.5 0 0 1 .5-.5z"></path>
								</g>
							</svg>
							</button>
							<button class="send-btn" id="sendBtn" onclick="sendMessage()">
							<div>
							<span>Send </span>
							   <svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								width="11"
								height="11"
								>
								<path
									fill="currentColor"
									d="M20 4v9a4 4 0 0 1-4 4H6.914l2.5 2.5L8 20.914L3.086 16L8 11.086L9.414 12.5l-2.5 2.5H16a2 2 0 0 0 2-2V4z"
								></path>
								</svg>
								</div>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
	
	<div class="status ready" id="status">
		<div class="status-indicator"></div>
		<div class="status-text" id="statusText">Initializing...</div>
		<button class="btn stop" id="stopBtn" onclick="stopRequest()" style="display: none;">
			<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
				<path d="M6 6h12v12H6z"/>
			</svg>
			Stop
		</button>
	</div>

	<!-- Operation History Panel -->
	<div id="operationHistoryPanel" class="stats-panel" style="display: none;">
		<div class="stats-header">
			<h3>Operation History</h3>
			<button class="btn" onclick="toggleOperationHistory()">✕ Close</button>
		</div>
		<div class="operation-history-stats">
			<div class="operation-stat-item">
				<span class="stat-label">Active Operations:</span>
				<span id="activeOperationsCount" class="stat-value">0</span>
			</div>
			<div class="operation-stat-item">
				<span class="stat-label">Undone Operations:</span>
				<span id="undoneOperationsCount" class="stat-value">0</span>
			</div>
		</div>
		<div id="operationHistoryContent" class="stats-content">
			<div class="stats-loading">Loading operation history...</div>
		</div>
	</div>

	<div class="beta-warning">
		In Beta. All Claude Code tools are allowed. Use at your own risk.
	</div>

	<!-- File picker modal -->
	<div id="filePickerModal" class="file-picker-modal" style="display: none;">
		<div class="file-picker-content">
			<div class="file-picker-header">
				<span>Select File</span>
				<input type="text" id="fileSearchInput" placeholder="Search files..." class="file-search-input">
			</div>
			<div id="fileList" class="file-list">
				<!-- Files will be loaded here -->
			</div>
		</div>
	</div>

	<!-- Tools modal -->
	<div id="toolsModal" class="tools-modal" style="display: none;">
		<div class="tools-modal-content">
			<div class="tools-modal-header">
				<span>Claude Code Tools</span>
				<button class="tools-close-btn" onclick="hideToolsModal()">✕</button>
			</div>
			<div class="tools-beta-warning">
				In Beta: All tools are enabled by default. Use at your own risk.
			</div>
			<div id="toolsList" class="tools-list">
				<div class="tool-item">
					<input type="checkbox" id="tool-task" checked disabled>
					<label for="tool-task">Task - Launch agent for search tasks</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-bash" checked disabled>
					<label for="tool-bash">Bash - Execute shell commands</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-glob" checked disabled>
					<label for="tool-glob">Glob - Find files by pattern</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-grep" checked disabled>
					<label for="tool-grep">Grep - Search file contents</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-ls" checked disabled>
					<label for="tool-ls">LS - List directory contents</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-exit-plan-mode" checked disabled>
					<label for="tool-exit-plan-mode">Exit Plan Mode - Exit planning mode</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-read" checked disabled>
					<label for="tool-read">Read - Read file contents</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-edit" checked disabled>
					<label for="tool-edit">Edit - Modify files</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-multiedit" checked disabled>
					<label for="tool-multiedit">MultiEdit - Edit multiple files</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-write" checked disabled>
					<label for="tool-write">Write - Create new files</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-notebook-read" checked disabled>
					<label for="tool-notebook-read">NotebookRead - Read Jupyter notebooks</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-notebook-edit" checked disabled>
					<label for="tool-notebook-edit">NotebookEdit - Edit Jupyter notebooks</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-webfetch" checked disabled>
					<label for="tool-webfetch">WebFetch - Fetch web content</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-todowrite" checked disabled>
					<label for="tool-todowrite">TodoWrite - Manage task lists</label>
				</div>
				<div class="tool-item">
					<input type="checkbox" id="tool-websearch" checked disabled>
					<label for="tool-websearch">WebSearch - Search the web</label>
				</div>
			</div>
		</div>
	</div>

	<!-- Plugins modal -->
	<div id="pluginsModal" class="tools-modal" style="display: none;">
		<div class="tools-modal-content">
			<div class="tools-modal-header">
				<span>Installed Plugins</span>
				<div style="display: flex; gap: 8px; align-items: center;">
					<button class="btn outlined" id="refresh-plugins-btn" onclick="handleRefreshPlugins()" title="Refresh plugin list" style="font-size: 11px; padding: 2px 8px; position: relative;">
						Refresh
					</button>
					<button class="tools-close-btn" onclick="hidePluginsModal()">✕</button>
				</div>
			</div>
			<div class="plugins-info" id="plugins-info">
				Loading plugins...
			</div>
			<div id="pluginsList" class="tools-list">
				<!-- 插件列表将动态填充到这里 -->
			</div>
		</div>
	</div>

	<!-- Settings modal -->
	<div id="settingsModal" class="tools-modal" style="display: none;">
		<div class="tools-modal-content" style="max-height: 80vh;">
			<div class="tools-modal-header">
				<span>Claude Code Chat Settings</span>
				<button class="tools-close-btn" onclick="hideSettingsModal()">✕</button>
			</div>
			<div class="tools-list">
				<h3 style="margin-top: 0; margin-bottom: 16px; font-size: 14px; font-weight: 600;">MCP Configuration</h3>
				<div>
					<p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0;">
						Model Context Protocol (MCP) allows Claude Code to connect to external systems and services for enhanced capabilities like databases, APIs, and tools.
					</p>
				</div>
				<div class="settings-group">
					<div class="tool-item">
						<input type="checkbox" id="mcp-enabled" onchange="updateSettings()">
						<label for="mcp-enabled">Enable MCP Integration</label>
					</div>
					
					<div id="mcpOptions" style="margin-left: 24px; margin-top: 12px; display: none;">
						<div id="mcpStatusBar" style="margin-bottom: 12px; padding: 8px; background: var(--vscode-panel-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; display: flex; align-items: center; justify-content: space-between;">
							<div id="mcpStatusText" style="font-size: 12px;">
								<span style="opacity: 0.8;">Status:</span> <span id="mcpStatusValue" style="font-weight: 500;">Not configured</span>
							</div>
							<button class="btn outlined" onclick="testMcpConnection()" style="font-size: 11px; padding: 2px 8px;">
								Test Connection
							</button>
						</div>
						<div id="mcpServersList" style="margin-bottom: 12px;">
							<!-- MCP servers will be dynamically added here -->
						</div>
						<div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
							<button class="btn outlined" onclick="addMcpServer()" style="font-size: 12px; padding: 4px 8px;">
								+ Add MCP Server
							</button>
							<select id="mcpTemplateSelector" onchange="addMcpFromTemplate()" style="font-size: 12px; padding: 4px 8px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px;">
								<option value="">Add from template...</option>
								<option value="sequential-thinking">Sequential Thinking</option>
								<option value="context7">Context7</option>
								<option value="basic-memory">Basic Memory</option>
								<option value="playwright">Playwright</option>
								<option value="n8n">n8n</option>
								<option value="shadcn">shadcn/ui</option>
							</select>
						</div>
						<div style="margin-top: 12px; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px;">
							<p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0;">
								📘 <strong>Quick Start:</strong> Select a template above or manually add your MCP server. 
								Learn more about available MCP servers at 
								<a href="https://github.com/modelcontextprotocol/servers" style="color: var(--vscode-textLink-foreground);">MCP Servers Repository</a>
							</p>
							<p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 8px 0 0 0;">
								💡 <strong>How it works:</strong> MCP servers extend Claude's capabilities. For example, add the SQLite server to query databases, or the filesystem server to access files outside the workspace.
							</p>
						</div>
					</div>
				</div>

				<h3 style="margin-top: 24px; margin-bottom: 16px; font-size: 14px; font-weight: 600;">API Configuration</h3>
				<div>
					<p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0;">
						Configure custom API endpoint for Claude. Useful for third-party API services or enterprise deployments.
					</p>
				</div>
				<div class="settings-group">
					<div class="tool-item">
						<input type="checkbox" id="api-useCustomAPI" onchange="toggleApiOptions()">
						<label for="api-useCustomAPI">Use Custom API Endpoint</label>
					</div>
					
					<div id="apiOptions" style="margin-left: 24px; margin-top: 12px; display: none;">
						<div style="margin-bottom: 12px;">
							<label for="api-key" style="display: block; font-size: 12px; margin-bottom: 4px;">API Key</label>
							<input type="password" id="api-key" placeholder="sk-ant-xxxxxxxxxx" style="width: 100%; padding: 6px 8px; font-size: 12px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;" onchange="updateSettings()">
						</div>
						<div style="margin-bottom: 12px;">
							<label for="api-baseUrl" style="display: block; font-size: 12px; margin-bottom: 4px;">Base URL</label>
							<input type="text" id="api-baseUrl" placeholder="https://api.tu-zi.com" value="https://api.anthropic.com" style="width: 100%; padding: 6px 8px; font-size: 12px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;" onchange="updateSettings()">
						</div>
						<div style="padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px;">
							<p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0;">
								🔒 Your API key will be stored securely in VS Code settings.
							</p>
							<p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 4px 0 0 0;">
								💡 Popular third-party services: tu-zi.com, openrouter.ai, etc.
							</p>
						</div>
					</div>
				</div>

				<h3 style="margin-top: 24px; margin-bottom: 16px; font-size: 14px; font-weight: 600;">Custom Slash Commands</h3>
				<div>
					<p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0;">
						Add your own custom slash commands that will appear in the commands modal. Define shortcuts for frequently used terminal commands.
					</p>
				</div>
				<div class="settings-group">
					<div style="margin-top: 12px;">
						<button class="mcp-template-btn" onclick="showCustomCommandsModal()" style="margin-bottom: 8px;">
							Manage Custom Commands
						</button>
					</div>
					<div id="custom-commands-list" style="margin-top: 12px; display: none;">
						<!-- Custom commands will be listed here -->
					</div>
				</div>
				
			</div>
		</div>
	</div>

	<!-- Model selector modal -->
	<div id="modelModal" class="tools-modal" style="display: none;">
		<div class="tools-modal-content" style="width: 400px;">
			<div class="tools-modal-header">
				<span>Enforce Model</span>
				<button class="tools-close-btn" onclick="hideModelModal()">✕</button>
			</div>
			<div class="model-explanatory-text">
				This overrides your default model setting for this conversation only.
			</div>
			<div class="tools-list">
				<div class="tool-item" onclick="selectModel('opus')">
					<input type="radio" name="model" id="model-opus" value="opus" checked>
					<label for="model-opus">
						<div class="model-title">Opus - Most capable model</div>
						<div class="model-description">
							Best for complex tasks and highest quality output
						</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectModel('claude-opus-4-1-20250805')">
					<input type="radio" name="model" id="model-opus-4-1" value="claude-opus-4-1-20250805">
					<label for="model-opus-4-1">
						<div class="model-title">Opus 4.1 - Latest flagship model</div>
						<div class="model-description">
							Latest Opus 4.1 model with enhanced performance
						</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectModel('sonnet')">
					<input type="radio" name="model" id="model-sonnet" value="sonnet">
					<label for="model-sonnet">
						<div class="model-title">Sonnet - Balanced model</div>
						<div class="model-description">
							Good balance of speed and capability
						</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectModel('claude-sonnet-4-5-20250929')">
					<input type="radio" name="model" id="model-sonnet-4-5" value="claude-sonnet-4-5-20250929">
					<label for="model-sonnet-4-5">
						<div class="model-title">Sonnet 4.5 - Latest intelligent model</div>
						<div class="model-description">
							Best balance of intelligence, speed and cost
						</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectModel('claude-haiku-4-5-20251001')">
					<input type="radio" name="model" id="model-haiku-4-5" value="claude-haiku-4-5-20251001">
					<label for="model-haiku-4-5">
						<div class="model-title">Haiku 4.5 - Cost-effective model</div>
						<div class="model-description">
							Fast responses with great value for money
						</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectModel('default')">
					<input type="radio" name="model" id="model-default" value="default">
					<label for="model-default" class="default-model-layout">
						<div class="model-option-content">
							<div class="model-title">Default - User configured</div>
							<div class="model-description">
								Uses the model configured in your settings
							</div>
						</div>
						<button class="secondary-button configure-button" onclick="event.stopPropagation(); openModelTerminal();">
							Configure
						</button>
					</label>
				</div>
			</div>
		</div>
	</div>

	<!-- Compute Mode Selection Modal -->
	<div id="modeModal" class="tools-modal" style="display: none;">
		<div class="tools-modal-content" style="width: 400px;">
			<div class="tools-modal-header">
				<span>Compute Mode</span>
				<button class="tools-close-btn" onclick="hideModeModal()">✕</button>
			</div>
			<div class="model-explanatory-text">
				Choose how Claude Code allocates models for background tasks
			</div>
			<div class="tools-list">
				<div class="tool-item" onclick="selectMode('auto')">
					<input type="radio" name="mode" id="mode-auto" value="auto" checked>
					<label for="mode-auto">
						<div class="model-title">Auto - Smart allocation</div>
						<div class="model-description">
							System automatically uses Haiku to save compute (Anthropic)
						</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectMode('max')">
					<input type="radio" name="mode" id="mode-max" value="max">
					<label for="mode-max">
						<div class="model-title">Max - Maximum performance</div>
						<div class="model-description">
							Prevents system from auto-switching to Haiku, enforces Sonnet 4.5
						</div>
					</label>
				</div>

				<!-- 高级设置区域（始终显示） -->
				<div class="advanced-settings-divider"></div>
				<div class="advanced-settings-section">
					<div class="advanced-settings-title">Advanced Settings</div>
					<div class="tool-item enhance-subagents-item">
						<input type="checkbox" id="enhance-subagents" onchange="toggleEnhanceSubagents()">
						<label for="enhance-subagents">
							<div class="model-title">Enhance Subagents</div>
							<div class="model-description">
								Use Sonnet 4.5 for all subagent operations (higher cost)
							</div>
						</label>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Thinking intensity modal -->
	<div id="thinkingIntensityModal" class="tools-modal" style="display: none;">
		<div class="tools-modal-content" style="width: 450px;">
			<div class="tools-modal-header">
				<span>Thinking Mode Intensity</span>
				<button class="tools-close-btn" onclick="hideThinkingIntensityModal()">✕</button>
			</div>
			<div class="thinking-modal-description">
				Configure the intensity of thinking mode. Higher levels provide more detailed reasoning but consume more tokens.
			</div>
			<div class="tools-list">
				<div class="thinking-slider-container">
					<input type="range" min="0" max="4" value="0" step="1" class="thinking-slider" id="thinkingIntensitySlider" oninput="updateThinkingIntensityDisplay(this.value)">
					<div class="slider-labels">
						<div class="slider-label active" id="thinking-label-0" onclick="setThinkingIntensityValue(0)">Think</div>
						<div class="slider-label" id="thinking-label-1" onclick="setThinkingIntensityValue(1)">Think Hard</div>
						<div class="slider-label" id="thinking-label-2" onclick="setThinkingIntensityValue(2)">Think Harder</div>
						<div class="slider-label" id="thinking-label-3" onclick="setThinkingIntensityValue(3)">Ultrathink</div>
						<div class="slider-label" id="thinking-label-4" onclick="setThinkingIntensityValue(4)">Sequential (MCP)</div>
					</div>
				</div>
				<div class="thinking-modal-actions">
					<button class="confirm-btn" onclick="confirmThinkingIntensity()">Confirm</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Language selection modal -->
	<div id="languageModal" class="tools-modal" style="display: none;">
		<div class="tools-modal-content" style="width: 400px;">
			<div class="tools-modal-header">
				<span>Select Language</span>
				<button class="tools-close-btn" onclick="hideLanguageModal()">✕</button>
			</div>
			<div class="language-modal-description">
				The language for CC to communicate & write code-comments.
			</div>
			<div class="tools-list">
				<div class="tool-item" onclick="selectLanguage('zh')">
					<input type="radio" name="language" id="language-zh" value="zh">
					<label for="language-zh">
						<div class="language-title">中文</div>
						<div class="language-description">用中文与您交流</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectLanguage('es')">
					<input type="radio" name="language" id="language-es" value="es">
					<label for="language-es">
						<div class="language-title">Español</div>
						<div class="language-description">Comunicarse en español</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectLanguage('ar')">
					<input type="radio" name="language" id="language-ar" value="ar">
					<label for="language-ar">
						<div class="language-title">العربية</div>
						<div class="language-description">التواصل بالعربية</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectLanguage('fr')">
					<input type="radio" name="language" id="language-fr" value="fr">
					<label for="language-fr">
						<div class="language-title">Français</div>
						<div class="language-description">Communiquer en français</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectLanguage('de')">
					<input type="radio" name="language" id="language-de" value="de">
					<label for="language-de">
						<div class="language-title">Deutsch</div>
						<div class="language-description">Auf Deutsch kommunizieren</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectLanguage('ja')">
					<input type="radio" name="language" id="language-ja" value="ja">
					<label for="language-ja">
						<div class="language-title">日本語</div>
						<div class="language-description">日本語で会話する</div>
					</label>
				</div>
				<div class="tool-item" onclick="selectLanguage('ko')">
					<input type="radio" name="language" id="language-ko" value="ko">
					<label for="language-ko">
						<div class="language-title">한국어</div>
						<div class="language-description">한국어로 대화하기</div>
					</label>
				</div>
			</div>
		</div>
	</div>

	<!-- Slash commands modal -->
	<div id="slashCommandsModal" class="tools-modal" style="display: none;">
		<div class="tools-modal-content">
			<div class="tools-modal-header">
				<span>Claude Code Commands</span>
				<button class="tools-close-btn" onclick="hideSlashCommandsModal()">✕</button>
			</div>
			<div class="slash-commands-info">
				<p>These commands require the Claude CLI and will open in VS Code terminal. Return here after completion.</p>
			</div>
			<div class="slash-commands-list">
			<div class="slash-command-item" onclick="executeSlashCommand('help')">
					<div class="slash-command-icon">❓</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/help</div>
						<div class="slash-command-description">Get usage help</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('status')">
					<div class="slash-command-icon">📊</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/status</div>
						<div class="slash-command-description">View account and system statuses</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('review')">
					<div class="slash-command-icon">👀</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/review</div>
						<div class="slash-command-description">Request code review</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('memory')">
					<div class="slash-command-icon">🧠</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/memory</div>
						<div class="slash-command-description">Edit CLAUDE.md memory files</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('mcp')">
					<div class="slash-command-icon">🔌</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/mcp</div>
						<div class="slash-command-description">Manage MCP server connections and OAuth authentication</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('config')">
					<div class="slash-command-icon">⚙️</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/config</div>
						<div class="slash-command-description">View/modify configuration</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('cost')">
					<div class="slash-command-icon">💰</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/cost</div>
						<div class="slash-command-description">Show token usage statistics</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('doctor')">
					<div class="slash-command-icon">🩺</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/doctor</div>
						<div class="slash-command-description">Checks the health of your Claude Code installation</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('bug')">
					<div class="slash-command-icon">🐛</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/bug</div>
						<div class="slash-command-description">Report bugs (sends conversation to Anthropic)</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('login')">
					<div class="slash-command-icon">🔑</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/login</div>
						<div class="slash-command-description">Switch Anthropic accounts</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('logout')">
					<div class="slash-command-icon">🚪</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/logout</div>
						<div class="slash-command-description">Sign out from your Anthropic account</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('terminal-setup')">
					<div class="slash-command-icon">⌨️</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/terminal-setup</div>
						<div class="slash-command-description">Install Shift+Enter key binding for newlines</div>
					</div>
				</div>
				<div class="slash-command-item" onclick="executeSlashCommand('vim')">
					<div class="slash-command-icon">📝</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/vim</div>
						<div class="slash-command-description">Enter vim mode for alternating insert and command modes</div>
					</div>
				</div>
				
				<!-- Custom Commands Section -->
				<div id="customCommandsSection" style="display: none;">
					<div style="padding: 10px 15px; border-top: 1px solid var(--vscode-panel-border); margin-top: 10px;">
						<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
							<span style="font-size: 12px; font-weight: 600; color: var(--vscode-foreground);">Your Custom Commands</span>
							<button class="manage-btn" onclick="hideSlashCommandsModal(); showCustomCommandsModal();" style="font-size: 11px; padding: 2px 8px;">Manage</button>
						</div>
						<div id="customCommandsList">
							<!-- Custom commands will be dynamically added here -->
						</div>
					</div>
				</div>
				
				<div class="slash-command-item custom-command-item">
					<div class="slash-command-icon">⚡</div>
					<div class="slash-command-content">
						<div class="slash-command-title">Custom Command</div>
						<div class="slash-command-description">
							<div class="custom-command-input-container">
								<span class="command-prefix">/</span>
								<input type="text" 
									   class="custom-command-input" 
									   id="customCommandInput"
									   placeholder="enter-command" 
									   onkeydown="handleCustomCommandKeydown(event)"
									   onclick="event.stopPropagation()">
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>


	<!-- Custom Commands Management Modal -->
	<div id="customCommandsModal" class="tools-modal" style="display: none;">
		<div class="tools-modal-content" style="width: 600px; max-height: 80vh;">
			<div class="tools-modal-header">
				<span>Manage Custom Commands</span>
				<button class="tools-close-btn" onclick="hideCustomCommandsModal()">✕</button>
			</div>
			<div style="padding: 20px;">
				<p style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 16px;">
					Create custom slash commands for frequently used terminal commands. These will appear in the slash commands menu.
				</p>
				
				<!-- Add/Edit Command Form -->
				<div style="background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 16px; margin-bottom: 16px;">
					<h4 style="margin: 0 0 12px 0; font-size: 13px;">Add New Command</h4>
					<input type="hidden" id="commandId" value="">
					<div style="margin-bottom: 12px;">
						<label style="display: block; font-size: 11px; margin-bottom: 4px;">Command Name (without /)</label>
						<input type="text" id="commandName" placeholder="e.g., test" style="width: 100%; padding: 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); border-radius: 2px;">
					</div>
					<div style="margin-bottom: 12px;">
						<label style="display: block; font-size: 11px; margin-bottom: 4px;">Description</label>
						<input type="text" id="commandDescription" placeholder="e.g., Run test suite" style="width: 100%; padding: 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); border-radius: 2px;">
					</div>
					<div style="margin-bottom: 12px;">
						<label style="display: block; font-size: 11px; margin-bottom: 4px;">Command to Execute</label>
						<input type="text" id="commandValue" placeholder="e.g., npm test" style="width: 100%; padding: 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); border-radius: 2px;">
					</div>
					<div style="margin-bottom: 12px;">
						<label style="display: block; font-size: 11px; margin-bottom: 4px;">Icon (Emoji, optional)</label>
						<input type="text" id="commandIcon" placeholder="e.g., 🧪" maxlength="2" style="width: 60px; padding: 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); border-radius: 2px;">
					</div>
					<div style="display: flex; gap: 8px;">
						<button onclick="saveCustomCommand()" style="padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer;">Save Command</button>
						<button onclick="clearCommandForm()" style="padding: 6px 12px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; cursor: pointer;">Clear</button>
					</div>
				</div>
				
				<!-- Existing Commands List -->
				<div>
					<h4 style="margin: 16px 0 12px 0; font-size: 13px;">Existing Commands</h4>
					<div id="existingCommandsList" style="max-height: 300px; overflow-y: auto;">
						<!-- Commands will be listed here -->
					</div>
				</div>
			</div>
		</div>
	</div>
  `;
}