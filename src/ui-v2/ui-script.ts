/**
 * This file contains the complete JavaScript code extracted from the UI system.
 * The script is exported as a string constant for use in the HTML template.
 */

export const uiScript = `
		const vscode = acquireVsCodeApi();
		const messagesDiv = document.getElementById('messages');
		const messageInput = document.getElementById('messageInput');
		const sendBtn = document.getElementById('sendBtn');
		const statusDiv = document.getElementById('status');
		const statusTextDiv = document.getElementById('statusText');
		const filePickerModal = document.getElementById('filePickerModal');
		const fileSearchInput = document.getElementById('fileSearchInput');
		const fileList = document.getElementById('fileList');
		const imageBtn = document.getElementById('imageBtn');

		let isProcessRunning = false;
		let filteredFiles = [];
		let selectedFileIndex = -1;
		let planModeEnabled = false;
		let thinkingModeEnabled = false;
		let languageModeEnabled = false;
		let selectedLanguage = null;
		let currentMode = 'auto'; // 当前算力模式

		// Undo/Redo history management
		let inputHistory = [''];
		let historyPosition = 0;
		let isUpdatingFromHistory = false;
		
		// 存储图片路径到webview URI的映射
		const imagePathMap = new Map();

		function addMessage(content, type = 'claude') {
			const messageDiv = document.createElement('div');
			messageDiv.className = \`message \${type}\`;
			
			// Add header for main message types (excluding system)
			if (type === 'user' || type === 'claude' || type === 'error') {
				const headerDiv = document.createElement('div');
				headerDiv.className = 'message-header';
				
				const iconDiv = document.createElement('div');
				iconDiv.className = \`message-icon \${type}\`;
				
				const labelDiv = document.createElement('div');
				labelDiv.className = 'message-label';
				
				// Set icon and label based on type
				switch(type) {
					case 'user':
						iconDiv.textContent = '🐒';  // Monkey icon for user
						labelDiv.textContent = 'You';
						break;
					case 'claude':
						iconDiv.textContent = '👁️';  // Eye icon for Claude's insight
						labelDiv.textContent = 'Claude';
						break;
					case 'error':
						iconDiv.textContent = '⚠️';
						labelDiv.textContent = 'Error';
						break;
				}
				
				// Add copy button
				const copyBtn = document.createElement('button');
				copyBtn.className = 'copy-btn';
				copyBtn.title = 'Copy message';
				copyBtn.onclick = () => copyMessageContent(messageDiv);
				copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
				
				headerDiv.appendChild(iconDiv);
				headerDiv.appendChild(labelDiv);
				headerDiv.appendChild(copyBtn);
				messageDiv.appendChild(headerDiv);
			}
			
			// Add content
			const contentDiv = document.createElement('div');
			contentDiv.className = 'message-content';
			
			if(type == 'user' || type === 'claude' || type === 'thinking'){
				// Apply file link conversion to Claude's messages
				const processedContent = type === 'claude' ? convertFileLinksToClickable(content) : content;
				contentDiv.innerHTML = processedContent;
			} else if (type === 'system' && content.includes('class="request-stats"')) {
				// Special handling for request stats to render HTML
				contentDiv.innerHTML = content;
			} else {
				const preElement = document.createElement('pre');
				preElement.textContent = content;
				contentDiv.appendChild(preElement);
			}
			
			messageDiv.appendChild(contentDiv);
			messagesDiv.appendChild(messageDiv);
			messagesDiv.scrollTop = messagesDiv.scrollHeight;
		}


		function addToolUseMessage(data) {
			const messageDiv = document.createElement('div');
			messageDiv.className = 'message tool';
			
			// Create modern header with icon
			const headerDiv = document.createElement('div');
			headerDiv.className = 'tool-header';
			
			const iconDiv = document.createElement('div');
			iconDiv.className = 'tool-icon';
			
			const toolInfoElement = document.createElement('div');
			toolInfoElement.className = 'tool-info';
			let toolName = data.toolInfo.replace('🔧 Executing: ', '');
			
			// Get the correct icon for this tool
			const toolIcon = getToolStatusIcon(data.toolName || toolName);
			iconDiv.textContent = toolIcon;
			
			// Replace TodoWrite with more user-friendly name
			if (toolName === 'TodoWrite') {
				toolName = 'Update Todos';
			}
			toolInfoElement.textContent = toolName;
			
			headerDiv.appendChild(iconDiv);
			headerDiv.appendChild(toolInfoElement);
			messageDiv.appendChild(headerDiv);
			
			if (data.rawInput) {
				const inputElement = document.createElement('div');
				inputElement.className = 'tool-input';
				
				const contentDiv = document.createElement('div');
				contentDiv.className = 'tool-input-content';
				
				// Handle TodoWrite specially or format raw input
				if (data.toolName === 'TodoWrite' && data.rawInput.todos) {
					let todoHtml = 'Todo List Update:';
					for (const todo of data.rawInput.todos) {
						const status = todo.status === 'completed' ? '✅' :
							todo.status === 'in_progress' ? '🔄' : '⏳';
						todoHtml += '\\n' + status + ' ' + todo.content + ' <span class="priority-badge ' + todo.priority + '">' + todo.priority + '</span>';
					}
					contentDiv.innerHTML = todoHtml;
				} else {
					// Format raw input with expandable content for long values
					// Use diff format for Edit, MultiEdit, and Write tools, regular format for others
					if (data.toolName === 'Edit') {
						contentDiv.innerHTML = formatEditToolDiff(data.rawInput);
					} else if (data.toolName === 'MultiEdit') {
						contentDiv.innerHTML = formatMultiEditToolDiff(data.rawInput);
					} else if (data.toolName === 'Write') {
						contentDiv.innerHTML = formatWriteToolDiff(data.rawInput);
					} else {
						contentDiv.innerHTML = formatToolInputUI(data.rawInput);
					}
				}
				
				inputElement.appendChild(contentDiv);
				messageDiv.appendChild(inputElement);
			} else if (data.toolInput) {
				// Fallback for pre-formatted input
				const inputElement = document.createElement('div');
				inputElement.className = 'tool-input';
				
				const labelDiv = document.createElement('div');
				labelDiv.className = 'tool-input-label';
				labelDiv.textContent = 'INPUT';
				inputElement.appendChild(labelDiv);
				
				const contentDiv = document.createElement('div');
				contentDiv.className = 'tool-input-content';
				contentDiv.textContent = data.toolInput;
				inputElement.appendChild(contentDiv);
				messageDiv.appendChild(inputElement);
			}
			
			messagesDiv.appendChild(messageDiv);
			messagesDiv.scrollTop = messagesDiv.scrollHeight;
		}



		function addToolResultMessage(data) {
			// Clear tool status when result is received
			clearToolStatus();
			
			// For Read and Edit tools with hidden flag, just hide loading state
			if (data.hidden && !data.isError) {
				// Don't hide MCP thinking results - we want to show them
				if (data.toolName && data.toolName.startsWith('mcp__') && data.toolName.includes('thinking')) {
					// Continue to show the result
				} else {
					// Hide other tools like Read, Edit, etc.
					return;
				}
			}

			const messageDiv = document.createElement('div');
			messageDiv.className = data.isError ? 'message error' : 'message tool-result';
			
			// Create header
			const headerDiv = document.createElement('div');
			headerDiv.className = 'message-header';
			
			const iconDiv = document.createElement('div');
			iconDiv.className = data.isError ? 'message-icon error' : 'message-icon';
			iconDiv.style.background = data.isError ? 
				'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' : 
				'linear-gradient(135deg, #1cc08c 0%, #16a974 100%)';
			iconDiv.textContent = data.isError ? '❌' : '✅';
			
			const labelDiv = document.createElement('div');
			labelDiv.className = 'message-label';
			labelDiv.textContent = data.isError ? 'Error' : 'Result';
			
			headerDiv.appendChild(iconDiv);
			headerDiv.appendChild(labelDiv);
			messageDiv.appendChild(headerDiv);
			
			// Add content
			const contentDiv = document.createElement('div');
			contentDiv.className = 'message-content';
			
			// Check if it's a tool result and truncate appropriately
			let content = data.content;
			
			// Special handling for MCP thinking tools - render as Markdown
			if (data.toolName && data.toolName.startsWith('mcp__') && data.toolName.includes('thinking')) {
				// Parse and render as Markdown
				contentDiv.innerHTML = parseSimpleMarkdown(content, imagePathMap);
			} else if (content.length > 200 && !data.isError) {
				const truncateAt = 197;
				const truncated = content.substring(0, truncateAt);
				const resultId = 'result_' + Math.random().toString(36).substr(2, 9);
				
				const preElement = document.createElement('pre');
				preElement.innerHTML = '<span id="' + resultId + '_visible">' + escapeHtml(truncated) + '</span>' +
									   '<span id="' + resultId + '_ellipsis">...</span>' +
									   '<span id="' + resultId + '_hidden" style="display: none;">' + escapeHtml(content.substring(truncateAt)) + '</span>';
				contentDiv.appendChild(preElement);
				
				// Add expand button container
				const expandContainer = document.createElement('div');
				expandContainer.className = 'diff-expand-container';
				const expandButton = document.createElement('button');
				expandButton.className = 'diff-expand-btn';
				expandButton.textContent = 'Show more';
				expandButton.setAttribute('onclick', 'toggleResultExpansion(\\'' + resultId + '\\\')');
				expandContainer.appendChild(expandButton);
				contentDiv.appendChild(expandContainer);
			} else {
				const preElement = document.createElement('pre');
				preElement.textContent = content;
				contentDiv.appendChild(preElement);
			}
			
			messageDiv.appendChild(contentDiv);
			messagesDiv.appendChild(messageDiv);
			messagesDiv.scrollTop = messagesDiv.scrollHeight;
		}

		function formatToolInputUI(input) {
			if (!input || typeof input !== 'object') {
				const str = String(input);
				if (str.length > 100) {
					const truncateAt = 97;
					const truncated = str.substring(0, truncateAt);
					const inputId = 'input_' + Math.random().toString(36).substr(2, 9);
					
					return '<span id="' + inputId + '_visible">' + escapeHtml(truncated) + '</span>' +
						   '<span id="' + inputId + '_ellipsis">...</span>' +
						   '<span id="' + inputId + '_hidden" style="display: none;">' + escapeHtml(str.substring(truncateAt)) + '</span>' +
						   '<div class="diff-expand-container">' +
						   '<button class="diff-expand-btn" onclick="toggleResultExpansion(\\\'' + inputId + '\\\')">Show more</button>' +
						   '</div>';
				}
				return str;
			}

			// Special handling for Read tool - always show file path in special format
			// but also show other parameters like offset and limit
			const isReadTool = input.file_path && (input.hasOwnProperty('offset') || input.hasOwnProperty('limit'));

			let result = '';
			let isFirst = true;
			for (const [key, value] of Object.entries(input)) {
				const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
				
				if (!isFirst) result += '\\n';
				isFirst = false;
				
				// Special formatting for file_path
				if (key === 'file_path') {
					const formattedPath = formatFilePath(valueStr);
					const normalizedPath = normalizePathForHtml(valueStr);
					result += '<div class="diff-file-path" onclick="openFileInEditor(\\\'' + escapeHtml(normalizedPath) + '\\\')">' + formattedPath + '</div>';
				} else if (isReadTool && (key === 'offset' || key === 'limit')) {
					// Always show offset and limit for Read tool
					result += '<strong>' + key + ':</strong> ' + valueStr;
				} else if (valueStr.length > 100) {
					const truncated = valueStr.substring(0, 97) + '...';
					result += '<strong>' + key + ':</strong> ' + truncated;
				} else {
					result += '<strong>' + key + ':</strong> ' + valueStr;
				}
			}
			return result;
		}

		function formatEditToolDiff(input) {
			if (!input || typeof input !== 'object') {
				return formatToolInputUI(input);
			}

			// Check if this is an Edit tool (has file_path, old_string, new_string)
			if (!input.file_path || !input.old_string || !input.new_string) {
				return formatToolInputUI(input);
			}

			// Format file path with better display
			const formattedPath = formatFilePath(input.file_path);
			const normalizedPath = normalizePathForHtml(input.file_path);
			let result = '<div class="diff-file-path" onclick="openFileInEditor(\\\'' + escapeHtml(normalizedPath) + '\\\')">' + formattedPath + '</div>\\n';

			// Create diff view
			const oldLines = input.old_string.split('\\n');
			const newLines = input.new_string.split('\\n');
			const allLines = [...oldLines.map(line => ({type: 'removed', content: line})), 
							 ...newLines.map(line => ({type: 'added', content: line}))];
			
			const maxLines = 6;
			const shouldTruncate = allLines.length > maxLines;
			const visibleLines = shouldTruncate ? allLines.slice(0, maxLines) : allLines;
			const hiddenLines = shouldTruncate ? allLines.slice(maxLines) : [];
			
			result += '<div class="diff-container">';
			result += '<div class="diff-header">Changes:</div>';
			
			// Create a unique ID for this diff
			const diffId = 'diff_' + Math.random().toString(36).substr(2, 9);
			
			// Show visible lines
			result += '<div id="' + diffId + '_visible">';
			for (const line of visibleLines) {
				const prefix = line.type === 'removed' ? '- ' : '+ ';
				const cssClass = line.type === 'removed' ? 'removed' : 'added';
				result += '<div class="diff-line ' + cssClass + '">' + prefix + escapeHtml(line.content) + '</div>';
			}
			result += '</div>';
			
			// Show hidden lines (initially hidden)
			if (shouldTruncate) {
				result += '<div id="' + diffId + '_hidden" style="display: none;">';
				for (const line of hiddenLines) {
					const prefix = line.type === 'removed' ? '- ' : '+ ';
					const cssClass = line.type === 'removed' ? 'removed' : 'added';
					result += '<div class="diff-line ' + cssClass + '">' + prefix + escapeHtml(line.content) + '</div>';
				}
				result += '</div>';
				
				// Add expand button
				result += '<div class="diff-expand-container">';
				result += '<button class="diff-expand-btn" onclick="toggleDiffExpansion(\\\'' + diffId + '\\\')">Show ' + hiddenLines.length + ' more lines</button>';
				result += '</div>';
			}
			
			result += '</div>';
			
			// Add other properties if they exist
			for (const [key, value] of Object.entries(input)) {
				if (key !== 'file_path' && key !== 'old_string' && key !== 'new_string') {
					const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
					result += '\\n<strong>' + key + ':</strong> ' + valueStr;
				}
			}
			
			return result;
		}

		function formatMultiEditToolDiff(input) {
			if (!input || typeof input !== 'object') {
				return formatToolInputUI(input);
			}

			// Check if this is a MultiEdit tool (has file_path and edits array)
			if (!input.file_path || !input.edits || !Array.isArray(input.edits)) {
				return formatToolInputUI(input);
			}

			// Format file path with better display
			const formattedPath = formatFilePath(input.file_path);
			const normalizedPath = normalizePathForHtml(input.file_path);
			let result = '<div class="diff-file-path" onclick="openFileInEditor(\\\'' + escapeHtml(normalizedPath) + '\\\')">' + formattedPath + '</div>\\n';

			// Count total lines across all edits for truncation
			let totalLines = 0;
			for (const edit of input.edits) {
				if (edit.old_string && edit.new_string) {
					const oldLines = edit.old_string.split('\\n');
					const newLines = edit.new_string.split('\\n');
					totalLines += oldLines.length + newLines.length;
				}
			}

			const maxLines = 6;
			const shouldTruncate = totalLines > maxLines;
			
			result += '<div class="diff-container">';
			result += '<div class="diff-header">Changes (' + input.edits.length + ' edit' + (input.edits.length > 1 ? 's' : '') + '):</div>';
			
			// Create a unique ID for this diff
			const diffId = 'multiedit_' + Math.random().toString(36).substr(2, 9);
			
			let currentLineCount = 0;
			let visibleEdits = [];
			let hiddenEdits = [];
			
			// Determine which edits to show/hide based on line count
			for (let i = 0; i < input.edits.length; i++) {
				const edit = input.edits[i];
				if (!edit.old_string || !edit.new_string) continue;
				
				const oldLines = edit.old_string.split('\\n');
				const newLines = edit.new_string.split('\\n');
				const editLines = oldLines.length + newLines.length;
				
				if (shouldTruncate && currentLineCount + editLines > maxLines && visibleEdits.length > 0) {
					hiddenEdits.push(edit);
				} else {
					visibleEdits.push(edit);
					currentLineCount += editLines;
				}
			}
			
			// Show visible edits
			result += '<div id="' + diffId + '_visible">';
			for (let i = 0; i < visibleEdits.length; i++) {
				const edit = visibleEdits[i];
				if (i > 0) result += '<div class="diff-edit-separator"></div>';
				result += formatSingleEdit(edit, i + 1);
			}
			result += '</div>';
			
			// Show hidden edits (initially hidden)
			if (hiddenEdits.length > 0) {
				result += '<div id="' + diffId + '_hidden" style="display: none;">';
				for (let i = 0; i < hiddenEdits.length; i++) {
					const edit = hiddenEdits[i];
					result += '<div class="diff-edit-separator"></div>';
					result += formatSingleEdit(edit, visibleEdits.length + i + 1);
				}
				result += '</div>';
				
				// Add expand button
				result += '<div class="diff-expand-container">';
				result += '<button class="diff-expand-btn" onclick="toggleDiffExpansion(\\\'' + diffId + '\\\')">Show ' + hiddenEdits.length + ' more edit' + (hiddenEdits.length > 1 ? 's' : '') + '</button>';
				result += '</div>';
			}
			
			result += '</div>';
			
			// Add other properties if they exist
			for (const [key, value] of Object.entries(input)) {
				if (key !== 'file_path' && key !== 'edits') {
					const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
					result += '\\n<strong>' + key + ':</strong> ' + valueStr;
				}
			}
			
			return result;
		}

		function formatSingleEdit(edit, editNumber) {
			let result = '<div class="single-edit">';
			result += '<div class="edit-number">Edit #' + editNumber + '</div>';
			
			// Create diff view for this single edit
			const oldLines = edit.old_string.split('\\n');
			const newLines = edit.new_string.split('\\n');
			
			// Show removed lines
			for (const line of oldLines) {
				result += '<div class="diff-line removed">- ' + escapeHtml(line) + '</div>';
			}
			
			// Show added lines
			for (const line of newLines) {
				result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
			}
			
			result += '</div>';
			return result;
		}

		function formatWriteToolDiff(input) {
			if (!input || typeof input !== 'object') {
				return formatToolInputUI(input);
			}

			// Check if this is a Write tool (has file_path and content)
			if (!input.file_path || !input.content) {
				return formatToolInputUI(input);
			}

			// Format file path with better display
			const formattedPath = formatFilePath(input.file_path);
			const normalizedPath = normalizePathForHtml(input.file_path);
			let result = '<div class="diff-file-path" onclick="openFileInEditor(\\\'' + escapeHtml(normalizedPath) + '\\\')">' + formattedPath + '</div>\\n';

			// Create diff view showing all content as additions
			const contentLines = input.content.split('\\n');
			
			const maxLines = 6;
			const shouldTruncate = contentLines.length > maxLines;
			const visibleLines = shouldTruncate ? contentLines.slice(0, maxLines) : contentLines;
			const hiddenLines = shouldTruncate ? contentLines.slice(maxLines) : [];
			
			result += '<div class="diff-container">';
			result += '<div class="diff-header">New file content:</div>';
			
			// Create a unique ID for this diff
			const diffId = 'write_' + Math.random().toString(36).substr(2, 9);
			
			// Show visible lines (all as additions)
			result += '<div id="' + diffId + '_visible">';
			for (const line of visibleLines) {
				result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
			}
			result += '</div>';
			
			// Show hidden lines (initially hidden)
			if (shouldTruncate) {
				result += '<div id="' + diffId + '_hidden" style="display: none;">';
				for (const line of hiddenLines) {
					result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
				}
				result += '</div>';
				
				// Add expand button
				result += '<div class="diff-expand-container">';
				result += '<button class="diff-expand-btn" onclick="toggleDiffExpansion(\\\'' + diffId + '\\\')">Show ' + hiddenLines.length + ' more lines</button>';
				result += '</div>';
			}
			
			result += '</div>';
			
			// Add other properties if they exist
			for (const [key, value] of Object.entries(input)) {
				if (key !== 'file_path' && key !== 'content') {
					const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
					result += '\\n<strong>' + key + ':</strong> ' + valueStr;
				}
			}
			
			return result;
		}

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		// 规范化文件路径，将反斜杠替换为正斜杠
		// 这样可以避免在HTML onclick属性中反斜杠被解释为转义字符的问题
		function normalizePathForHtml(filePath) {
			return filePath.replace(/\\\\/g, '/');
		}

		function openFileInEditor(filePath) {
			vscode.postMessage({
				type: 'openFile',
				filePath: filePath
			});
		}

		function formatFilePath(filePath) {
			if (!filePath) return '';
			
			// Extract just the filename
			const parts = filePath.split('/');
			const fileName = parts[parts.length - 1];
			
			return '<span class="file-path-truncated" title="' + escapeHtml(filePath) + '" data-file-path="' + escapeHtml(filePath) + '">' + 
				   '<span class="file-icon">📄</span>' + escapeHtml(fileName) + '</span>';
		}

		function toggleDiffExpansion(diffId) {
			const hiddenDiv = document.getElementById(diffId + '_hidden');
			const button = document.querySelector('[onclick*="' + diffId + '"]');
			
			if (hiddenDiv && button) {
				if (hiddenDiv.style.display === 'none') {
					hiddenDiv.style.display = 'block';
					button.textContent = 'Show less';
				} else {
					hiddenDiv.style.display = 'none';
					const hiddenLines = hiddenDiv.querySelectorAll('.diff-line').length;
					button.textContent = 'Show ' + hiddenLines + ' more lines';
				}
			}
		}

		function toggleResultExpansion(resultId) {
			const hiddenDiv = document.getElementById(resultId + '_hidden');
			const ellipsis = document.getElementById(resultId + '_ellipsis');
			const button = document.querySelector('[onclick*="toggleResultExpansion(\\'' + resultId + '\\\')"]');
			
			if (hiddenDiv && button) {
				if (hiddenDiv.style.display === 'none') {
					hiddenDiv.style.display = 'inline';
					if (ellipsis) ellipsis.style.display = 'none';
					button.textContent = 'Show less';
				} else {
					hiddenDiv.style.display = 'none';
					if (ellipsis) ellipsis.style.display = 'inline';
					button.textContent = 'Show more';
				}
			}
		}

		function sendMessage() {
			const text = messageInput.value.trim();
			if (text) {
				vscode.postMessage({
					type: 'sendMessage',
					text: text,
					planMode: planModeEnabled,
					thinkingMode: thinkingModeEnabled,
					languageMode: languageModeEnabled,
					selectedLanguage: selectedLanguage
				});
				
				messageInput.value = '';
				// Reset history after sending
				inputHistory = [''];
				historyPosition = 0;
			}
		}
		
		// Undo/Redo functionality
		function addToHistory(value) {
			if (isUpdatingFromHistory) return;
			
			// Remove any history after current position
			inputHistory = inputHistory.slice(0, historyPosition + 1);
			
			// Only add if different from current position
			if (inputHistory[historyPosition] !== value) {
				inputHistory.push(value);
				historyPosition = inputHistory.length - 1;
				
				// Limit history size to prevent memory issues
				const maxHistorySize = 100;
				if (inputHistory.length > maxHistorySize) {
					inputHistory = inputHistory.slice(-maxHistorySize);
					historyPosition = inputHistory.length - 1;
				}
			}
		}
		
		function performUndo() {
			if (historyPosition > 0) {
				// Save current state if we're at the end
				if (historyPosition === inputHistory.length - 1) {
					inputHistory[historyPosition] = messageInput.value;
				}
				
				historyPosition--;
				isUpdatingFromHistory = true;
				messageInput.value = inputHistory[historyPosition];
				adjustTextareaHeight();
				isUpdatingFromHistory = false;
			}
		}
		
		function performRedo() {
			if (historyPosition < inputHistory.length - 1) {
				historyPosition++;
				isUpdatingFromHistory = true;
				messageInput.value = inputHistory[historyPosition];
				adjustTextareaHeight();
				isUpdatingFromHistory = false;
			}
		}

		function togglePlanMode() {
			planModeEnabled = !planModeEnabled;
			const switchElement = document.getElementById('planModeSwitch');
			if (planModeEnabled) {
				switchElement.classList.add('active');
			} else {
				switchElement.classList.remove('active');
			}
		}

		function toggleThinkingMode() {
			thinkingModeEnabled = !thinkingModeEnabled;
			const switchElement = document.getElementById('thinkingModeSwitch');
			const toggleLabel = document.getElementById('thinkingModeLabel');
			if (thinkingModeEnabled) {
				switchElement.classList.add('active');
				// Show thinking intensity modal when thinking mode is enabled
				showThinkingIntensityModal();
			} else {
				switchElement.classList.remove('active');
				// Reset to default "Thinking Mode" when turned off
				if (toggleLabel) {
					toggleLabel.textContent = 'Thinking Mode';
				}
			}
		}

		function handleLanguageLabelClick() {
			// If language mode is already enabled, show the modal
			if (languageModeEnabled) {
				showLanguageModal();
			} else {
				// Otherwise, enable it (same as clicking the switch)
				toggleLanguageMode();
			}
		}
		
		function toggleLanguageMode() {
			languageModeEnabled = !languageModeEnabled;
			const switchElement = document.getElementById('languageModeSwitch');
			const toggleLabel = document.getElementById('languageModeLabel');
			if (languageModeEnabled) {
				switchElement.classList.add('active');
				// Show language selection modal when language mode is enabled
				showLanguageModal();
			} else {
				switchElement.classList.remove('active');
				selectedLanguage = null;
				// Reset to default "Language Mode" when turned off
				if (toggleLabel) {
					toggleLabel.textContent = 'Language Mode';
				}
				// Save disabled state to settings
				vscode.postMessage({
					type: 'updateSettings',
					settings: {
						'language.enabled': false,
						'language.selected': null
					}
				});
			}
		}


		let totalCost = 0;
		let totalTokensInput = 0;
		let totalTokensOutput = 0;
		let requestCount = 0;
		let isProcessing = false;
		let requestStartTime = null;
		let requestTimer = null;
		let spinnerFrame = 0;
		const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
		let lastContextTokens = 0; // Track latest context window usage
		let maxContextTokensInSession = 0; // Track maximum context usage in current session
		
		// Tool execution tracking
		let currentToolExecution = null;
		let toolExecutionStartTime = null;
		let toolStatusElement = null;
		let toolTimerInterval = null;

		function updateStatus(text, state = 'ready') {
			if (state === 'processing') {
				// Add spinner animation for processing state
				const spinner = spinnerFrames[spinnerFrame % spinnerFrames.length];
				statusTextDiv.textContent = spinner + ' ' + text;
			} else {
				statusTextDiv.textContent = text;
			}
			statusDiv.className = 'status ' + state;
		}

		function updateStatusWithTotals() {
			if (isProcessing) {
				// While processing, show tokens and elapsed time
				const totalTokens = totalTokensInput + totalTokensOutput;
				const tokensStr = totalTokens > 0 ? 
					\`\${totalTokens.toLocaleString()} tokens\` : '0 tokens';
				
				let elapsedStr = '';
				if (requestStartTime) {
					const elapsedSeconds = Math.floor((Date.now() - requestStartTime) / 1000);
					elapsedStr = \` • \${elapsedSeconds}s\`;
				}
				
				const statusText = \`Processing • \${tokensStr}\${elapsedStr}\`;
				updateStatus(statusText, 'processing');
			} else {
				// When ready, show full info
				const costStr = totalCost > 0 ? \`$\${totalCost.toFixed(4)}\` : '$0.00';
				const totalTokens = totalTokensInput + totalTokensOutput;
				const tokensStr = totalTokens > 0 ? 
					\`\${totalTokens.toLocaleString()} tokens\` : '0 tokens';
				const requestStr = requestCount > 0 ? \`\${requestCount} requests\` : '';
				
				const statusText = \`Ready • \${costStr} • \${tokensStr}\${requestStr ? \` • \${requestStr}\` : ''}\`;
				updateStatus(statusText, 'ready');
			}
		}

		// 更新token使用指示器
		function updateTokenUsageIndicator(usage) {
			// 查找或创建token指示器容器
			let indicatorContainer = document.getElementById('tokenUsageIndicator');
			if (!indicatorContainer) {
				// 如果不存在，创建并添加到输入模式区域
				const inputModes = document.querySelector('.input-modes');
				if (inputModes) {
					indicatorContainer = document.createElement('div');
					indicatorContainer.id = 'tokenUsageIndicator';
					indicatorContainer.className = 'token-usage-indicator';
					indicatorContainer.style.marginLeft = 'auto'; // 推到最右侧
					inputModes.appendChild(indicatorContainer);
				} else {
					return; // 如果找不到输入模式区域，退出
				}
			}
			// 根据剩余百分比确定颜色
			let barColor = '#66BB6A'; // Green
			if (usage.percentage < 20) {
				barColor = '#EF5350'; // Red
			} else if (usage.percentage < 60) {
				barColor = '#FFCA28'; // Yellow
			}
			
			// 更新指示器内容
			indicatorContainer.innerHTML = \`
				<div class="usage-display" style="display: inline-flex; align-items: center; gap: 12px;">
					<div style="display: flex; align-items: center; gap: 6px;">
						<span class="compact-label" style="color: var(--vscode-descriptionForeground); opacity: 0.8;">Compact</span>
						<div class="mode-switch" id="compactButton" onclick="compactConversation()" title="Compact context"></div>
					</div>
					<div style="display: inline-flex; flex-direction: column; align-items: flex-start;">
						<div style="display: flex; align-items: center; gap: 6px;">
							<span class="usage-label" style="color: var(--vscode-descriptionForeground); opacity: 0.8;">Context Window</span>
							<span class="usage-label" style="color: var(--vscode-descriptionForeground); opacity: 0.8;">\${usage.percentage}%</span>
						</div>
						<div style="
							width: 100px;
							height: 4px;
							background-color: rgba(255, 255, 255, 0.15);
							border-radius: 2px;
							margin-top: 2px;
							overflow: hidden;
							position: relative;
						">
							<div style="
								width: \${usage.percentage}%;
								height: 100%;
								background-color: \${barColor};
								transition: width 0.3s ease, background-color 0.3s ease;
								border-radius: 2px;
							"></div>
						</div>
					</div>
				</div>
			\`;
			
			// 添加工具提示
			const usageDisplay = indicatorContainer.querySelector('.usage-display');
			if (usageDisplay) {
				const usedK = Math.round(usage.used / 1000);
				const totalK = Math.round(usage.total / 1000);
				usageDisplay.title = \`Used: \${usedK}K / \${totalK}K tokens\nRemaining: \${usage.percentage}%\`;
			}
		}

		function startRequestTimer() {
			requestStartTime = Date.now();
			spinnerFrame = 0;
			// Update status every 100ms for smooth real-time display
			requestTimer = setInterval(() => {
				if (isProcessing) {
					spinnerFrame++;
					updateStatusWithTotals();
				}
			}, 100);
		}

		function stopRequestTimer() {
			if (requestTimer) {
				clearInterval(requestTimer);
				requestTimer = null;
			}
			requestStartTime = null;
		}
		
		// Tool execution status functions
		function updateToolStatus(data) {
			console.log('updateToolStatus called with:', data);
			if (!data || !data.status) return;
			
			// Clear any existing timer
			if (toolTimerInterval) {
				clearInterval(toolTimerInterval);
				toolTimerInterval = null;
			}
			
			// Start timing for this tool
			toolExecutionStartTime = Date.now();
			currentToolExecution = data;
			
			// Create or update status element
			createOrUpdateToolStatusBar(data);
			
			// Start timer to update elapsed time
			toolTimerInterval = setInterval(() => {
				updateToolExecutionTime();
			}, 100);
		}
		
		function createOrUpdateToolStatusBar(data) {
			console.log('createOrUpdateToolStatusBar called');
			// Find the last message element
			const messages = messagesDiv.children;
			if (messages.length === 0) {
				console.log('No messages found');
				return;
			}
			
			const lastMessage = messages[messages.length - 1];
			console.log('Last message element:', lastMessage);
			
			// Check if we already have a status bar
			let statusBar = lastMessage.querySelector('.tool-status-bar');
			if (!statusBar) {
				statusBar = document.createElement('div');
				statusBar.className = 'tool-status-bar';
				lastMessage.appendChild(statusBar);
			}
			
			// Update status bar content
			const statusIcon = getToolStatusIcon(data.toolName);
			const initialHtml = '<div class="tool-status-content">' +
				'<span class="tool-status-icon">' + statusIcon + '</span>' +
				'<span class="tool-status-text">' + data.status + '</span>' +
				'<span class="tool-status-time"> • 0s</span>' +
				'</div>';
			statusBar.innerHTML = initialHtml;
			toolStatusElement = statusBar;
		}
		
		function updateToolExecutionTime() {
			if (!toolStatusElement || !toolExecutionStartTime) return;
			
			const elapsed = Math.floor((Date.now() - toolExecutionStartTime) / 1000);
			const timeElement = toolStatusElement.querySelector('.tool-status-time');
			if (timeElement) {
				timeElement.textContent = ' • ' + elapsed + 's';
			}
		}
		
		function clearToolStatus() {
			if (toolTimerInterval) {
				clearInterval(toolTimerInterval);
				toolTimerInterval = null;
			}
			if (toolStatusElement) {
				// Fade out the status bar
				toolStatusElement.style.opacity = '0.5';
			}
			currentToolExecution = null;
			toolExecutionStartTime = null;
		}
		
		function getToolStatusIcon(toolName) {
			const iconMap = {
				'Task': '🎯',            // Target icon for tasks/goals
				'Bash': '💻',            // Keep
				'Read': '📖',            // Keep
				'Edit': '✏️',            // Keep
				'Write': '📝',           // Keep
				'Grep': '🔎',            // Keep
				'Glob': '📁',            // Keep
				'LS': '📂',              // Keep
				'TodoWrite': '✅',        // Keep
				'TodoRead': '📋',         // Keep
				'WebFetch': '🌐',        // Keep
				'WebSearch': '🔍',       // Keep search icon
				'MultiEdit': '📑',       // Multi-page document icon
				'NotebookRead': '📓',    // Keep
				'NotebookEdit': '📔',    // Slightly different notebook icon
				'exit_plan_mode': '🚪',  // Keep
				// MCP tools
				'mcp__sequential-thinking__sequentialthinking': '🧠'  // Brain icon for thinking tool
			};
			// Handle other MCP tools
			if (toolName && toolName.startsWith('mcp__')) {
				// Provide default icons for different types of MCP tools
				if (toolName.includes('thinking')) return '🧠';
				if (toolName.includes('search')) return '🔍';
				if (toolName.includes('database') || toolName.includes('sql')) return '🗄️';
				if (toolName.includes('file')) return '📁';
				return '🔧'; // Default icon for MCP tools (wrench)
			}
			return iconMap[toolName] || '🔧';
		}
		
		// Real-time token display
		let tokenDisplayElement = null;
		
		function updateRealTimeTokenDisplay(tokenData) {
			console.log('updateRealTimeTokenDisplay called with:', tokenData);
			// Find or create token display element
			const messages = messagesDiv.children;
			if (messages.length === 0) return;
			
			// Look for the last Claude message that doesn't already have a token display
			let targetMessage = null;
			for (let i = messages.length - 1; i >= 0; i--) {
				if (messages[i].classList.contains('claude')) {
					// Skip if this message already has a token display with content
					const existingDisplay = messages[i].querySelector('.real-time-token-display');
					if (!existingDisplay || existingDisplay.innerHTML === '') {
						targetMessage = messages[i];
						console.log('Found target Claude message at index:', i);
						break;
					}
				}
			}
			
			if (!targetMessage) {
				console.log('No suitable Claude message found for token display');
				return;
			}
			
			// Check if we already have a token display
			let tokenDisplay = targetMessage.querySelector('.real-time-token-display');
			if (!tokenDisplay) {
				tokenDisplay = document.createElement('div');
				tokenDisplay.className = 'real-time-token-display';
				targetMessage.appendChild(tokenDisplay);
			}
			
			// Calculate current usage
			const currentInputTokens = tokenData.currentInputTokens || 0;
			const currentOutputTokens = tokenData.currentOutputTokens || 0;
			const currentTotal = currentInputTokens + currentOutputTokens;
			
			// Format cache info
			let cacheInfo = '';
			if (tokenData.cacheCreationTokens || tokenData.cacheReadTokens) {
				const cacheItems = [];
				if (tokenData.cacheCreationTokens) cacheItems.push(tokenData.cacheCreationTokens.toLocaleString() + ' cached');
				if (tokenData.cacheReadTokens) cacheItems.push(tokenData.cacheReadTokens.toLocaleString() + ' from cache');
				cacheInfo = ' • ' + cacheItems.join(' • ');
			}
			
			// Update display with animated counter
			const html = '<div class="token-display-content">' +
				'<span class="token-icon">🪙</span>' +
				'<span class="token-text">' +
					'<span class="token-input">' + currentInputTokens.toLocaleString() + ' in</span>' +
					'<span class="token-separator">→</span>' +
					'<span class="token-output">' + currentOutputTokens.toLocaleString() + ' out</span>' +
					'<span class="token-total">(' + currentTotal.toLocaleString() + ' total)</span>' +
					(cacheInfo ? '<span class="token-cache">' + cacheInfo + '</span>' : '') +
				'</span>' +
				'</div>';
			
			tokenDisplay.innerHTML = html;
			tokenDisplayElement = tokenDisplay;
		}

		// Auto-resize textarea
		function adjustTextareaHeight() {
			// Store current height to minimize visual jumps
			const currentHeight = messageInput.style.height;
			
			// Temporarily reset height to calculate new height
			messageInput.style.height = 'auto';
			
			// Get computed styles
			const computedStyle = getComputedStyle(messageInput);
			const lineHeight = parseFloat(computedStyle.lineHeight);
			const paddingTop = parseFloat(computedStyle.paddingTop);
			const paddingBottom = parseFloat(computedStyle.paddingBottom);
			const borderTop = parseFloat(computedStyle.borderTopWidth);
			const borderBottom = parseFloat(computedStyle.borderBottomWidth);
			
			// Calculate heights
			const scrollHeight = messageInput.scrollHeight;
			const maxRows = 5;
			const minHeight = lineHeight + paddingTop + paddingBottom + borderTop + borderBottom;
			const maxHeight = (lineHeight * maxRows) + paddingTop + paddingBottom + borderTop + borderBottom;
			
			// Calculate new height
			let newHeight;
			let newOverflow;
			
			if (scrollHeight <= maxHeight) {
				newHeight = Math.max(scrollHeight, minHeight) + 'px';
				newOverflow = 'hidden';
			} else {
				newHeight = maxHeight + 'px';
				newOverflow = 'auto';
			}
			
			// Only update if height actually changed
			if (newHeight !== currentHeight) {
				messageInput.style.height = newHeight;
			} else {
				// Restore the original height if no change needed
				messageInput.style.height = currentHeight;
			}
			
			messageInput.style.overflowY = newOverflow;
		}

		messageInput.addEventListener('input', (e) => {
			adjustTextareaHeight();
			// Track history for undo/redo
			addToHistory(messageInput.value);
		});
		
		messageInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			} else if (e.key === '@' && !e.ctrlKey && !e.metaKey) {
				// Don't prevent default, let @ be typed first
				setTimeout(() => {
					showFilePicker();
				}, 0);
			} else if (e.key === 'Escape' && filePickerModal.style.display === 'flex') {
				e.preventDefault();
				hideFilePicker();
			} else if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
				// Handle Ctrl+V/Cmd+V explicitly in case paste event doesn't fire
				// Don't prevent default - let browser handle it first
				setTimeout(() => {
					// If value hasn't changed, manually trigger paste
					const currentValue = messageInput.value;
					setTimeout(() => {
						if (messageInput.value === currentValue) {
							// Value didn't change, request clipboard from VS Code
							vscode.postMessage({
								type: 'getClipboardText'
							});
						}
					}, 50);
				}, 0);
			} else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
				// Undo (Ctrl+Z / Cmd+Z)
				e.preventDefault();
				performUndo();
			} else if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || 
					   (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
				// Redo (Ctrl+Y / Cmd+Y or Ctrl+Shift+Z / Cmd+Shift+Z)
				e.preventDefault();
				performRedo();
			}
		});

		// Add explicit paste event handler for better clipboard support in VSCode webviews
		messageInput.addEventListener('paste', async (e) => {
			e.preventDefault();
			
			try {
				// Try to get clipboard data from the event first
				const clipboardData = e.clipboardData;
				let hasImage = false;
				let text = '';
				
				if (clipboardData) {
					// Check for image data first
					const items = clipboardData.items;
					if (items) {
						for (let i = 0; i < items.length; i++) {
							const item = items[i];
							// Check if this is an image
							if (item.type.indexOf('image') !== -1) {
								hasImage = true;
								const blob = item.getAsFile();
								if (blob) {
									// Send image data to VS Code extension to save
									const reader = new FileReader();
									reader.onload = function(event) {
										const base64 = event.target.result.split(',')[1]; // Remove data:image/png;base64, prefix
										vscode.postMessage({
											type: 'pasteImage',
											imageData: base64,
											mimeType: item.type
										});
									};
									reader.readAsDataURL(blob);
									return; // Exit after handling image
								}
							}
						}
					}
					
					// If no image, try to get text
					if (!hasImage) {
						text = clipboardData.getData('text/plain');
					}
				}
				
				// If no text from event, try navigator.clipboard API
				if (!text && !hasImage && navigator.clipboard && navigator.clipboard.readText) {
					try {
						text = await navigator.clipboard.readText();
					} catch (err) {
						console.log('Clipboard API failed:', err);
					}
				}
				
				// If still no text, request from VS Code extension
				if (!text && !hasImage) {
					vscode.postMessage({
						type: 'getClipboardText'
					});
					return;
				}
				
				// Insert text at cursor position
				if (text) {
					const start = messageInput.selectionStart;
					const end = messageInput.selectionEnd;
					const currentValue = messageInput.value;
					
					const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
					messageInput.value = newValue;
					
					// Set cursor position after pasted text
					const newCursorPos = start + text.length;
					messageInput.setSelectionRange(newCursorPos, newCursorPos);
					
					// Trigger input event to adjust height
					messageInput.dispatchEvent(new Event('input', { bubbles: true }));
				}
			} catch (error) {
				console.error('Paste error:', error);
			}
		});

		// Handle context menu paste
		messageInput.addEventListener('contextmenu', (e) => {
			// Don't prevent default - allow context menu to show
			// but ensure paste will work when selected
		});

		// Initialize textarea height
		adjustTextareaHeight();
		
		// Add drag and drop support for images
		const dropZone = messageInput;
		let dragCounter = 0;
		
		// Prevent default drag behaviors
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
			dropZone.addEventListener(eventName, preventDefaults, false);
			document.body.addEventListener(eventName, preventDefaults, false);
		});
		
		function preventDefaults(e) {
			e.preventDefault();
			e.stopPropagation();
		}
		
		// Highlight drop area when item is dragged over it
		['dragenter', 'dragover'].forEach(eventName => {
			dropZone.addEventListener(eventName, (e) => {
				// Check if dragging files
				if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
					// Check if any item is a file
					for (let i = 0; i < e.dataTransfer.items.length; i++) {
						if (e.dataTransfer.items[i].kind === 'file') {
							if (eventName === 'dragenter') {
								dragCounter++;
							}
							dropZone.classList.add('drag-over');
							break;
						}
					}
				}
			}, false);
		});
		
		dropZone.addEventListener('dragleave', (e) => {
			dragCounter--;
			if (dragCounter === 0) {
				dropZone.classList.remove('drag-over');
			}
		}, false);
		
		// Handle dropped files
		dropZone.addEventListener('drop', handleDrop, false);
		
		function handleDrop(e) {
			dragCounter = 0;
			dropZone.classList.remove('drag-over');
			
			const dt = e.dataTransfer;
			const files = dt.files;
			
			handleFiles(files);
		}
		
		function handleFiles(files) {
			const imageFiles = [];
			const textFiles = [];
			
			// Separate images from other files
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				if (file.type.startsWith('image/')) {
					imageFiles.push(file);
				} else {
					textFiles.push(file);
				}
			}
			
			// Handle image files
			if (imageFiles.length > 0) {
				imageFiles.forEach(file => {
					const reader = new FileReader();
					reader.onload = function(event) {
						const base64 = event.target.result.split(',')[1];
						vscode.postMessage({
							type: 'pasteImage',
							imageData: base64,
							mimeType: file.type,
							fileName: file.name
						});
					};
					reader.readAsDataURL(file);
				});
			}
			
			// Handle text files by adding their paths
			if (textFiles.length > 0) {
				// For text files, we can't get the full path in web context
				// So we'll just notify the user
				const fileNames = textFiles.map(f => f.name).join(', ');
				vscode.postMessage({
					type: 'info',
					data: 'To reference files, use @ to open the file picker. Dropped files: ' + fileNames
				});
			}
		}

		// File picker event listeners
		fileSearchInput.addEventListener('input', (e) => {
			filterFiles(e.target.value);
		});

		fileSearchInput.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedFileIndex = Math.min(selectedFileIndex + 1, filteredFiles.length - 1);
				renderFileList();
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedFileIndex = Math.max(selectedFileIndex - 1, -1);
				renderFileList();
			} else if (e.key === 'Enter' && selectedFileIndex >= 0) {
				e.preventDefault();
				selectFile(filteredFiles[selectedFileIndex]);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				hideFilePicker();
			}
		});

		// Close modal when clicking outside
		filePickerModal.addEventListener('click', (e) => {
			if (e.target === filePickerModal) {
				hideFilePicker();
			}
		});

		// Tools modal functions
		function showToolsModal() {
			document.getElementById('toolsModal').style.display = 'flex';
		}

		function hideToolsModal() {
			document.getElementById('toolsModal').style.display = 'none';
		}

		// Close tools modal when clicking outside
		document.getElementById('toolsModal').addEventListener('click', (e) => {
			if (e.target === document.getElementById('toolsModal')) {
				hideToolsModal();
			}
		});

		// ========== Plugins Modal Functions ==========

	/**
	 * 显示插件模态框
	 * 向后端请求插件列表
	 */
	function showPluginsModal() {
		console.log('[Plugins] showPluginsModal called');
		// 显示模态框
		document.getElementById('pluginsModal').style.display = 'flex';
		// 向后端请求插件列表
		console.log('[Plugins] Requesting plugin list from backend');
		vscode.postMessage({ type: 'getInstalledPlugins' });
	}

	/**
	 * 隐藏插件模态框
	 */
	function hidePluginsModal() {
		document.getElementById('pluginsModal').style.display = 'none';
	}

	/**
	 * 更新插件列表内容
	 * @param {Array} plugins - 插件列表
	 * @param {boolean} isRefresh - 是否是刷新操作
	 */
	function updatePluginsList(plugins, isRefresh) {
		console.log('[Plugins] updatePluginsList called with', plugins?.length, 'plugins');

		const listContainer = document.getElementById('pluginsList');
		const infoContainer = document.getElementById('plugins-info');

		// 更新插件列表
		if (listContainer) {
			listContainer.innerHTML = renderPluginsList(plugins);
		}

		// 更新信息栏
		if (infoContainer) {
			infoContainer.textContent = plugins.length + ' plugin(s) installed';
		}

		// 如果是刷新操作，恢复刷新按钮状态
		if (isRefresh) {
			const refreshBtn = document.getElementById('refresh-plugins-btn');
			if (refreshBtn) {
				refreshBtn.classList.remove('loading');
				refreshBtn.disabled = false;
			}
		}
	}

	/**
	 * 渲染插件列表
	 * @param {Array} plugins - 插件列表
	 * @returns {string} HTML 字符串
	 */
	function renderPluginsList(plugins) {
		if (!plugins || plugins.length === 0) {
			return '<div style="text-align: center; padding: 40px 20px; color: var(--vscode-descriptionForeground);">No plugins installed</div>';
		}

		return plugins.map(function(plugin) {
			const displayName = plugin.name || 'Unknown Plugin';
			const description = plugin.description || 'No description available';
			return '<div class="tool-item">' +
				'<input type="checkbox" checked disabled>' +
				'<label>' +
				'<div class="plugin-name">' + displayName + '</div>' +
				'<div class="plugin-description">' + description + '</div>' +
				'</label>' +
				'</div>';
		}).join('');
	}

	/**
	 * 处理刷新按钮点击
	 */
	function handleRefreshPlugins() {
		console.log('[Plugins] Refresh button clicked');
		const refreshBtn = document.getElementById('refresh-plugins-btn');
		if (refreshBtn) {
			// 显示加载状态
			refreshBtn.classList.add('loading');
			refreshBtn.disabled = true;
		}

		// 向后端发送刷新请求
		vscode.postMessage({ type: 'refreshPlugins' });
	}

	// 关闭插件模态框（点击背景）
	document.getElementById('pluginsModal').addEventListener('click', function(e) {
		if (e.target === document.getElementById('pluginsModal')) {
			hidePluginsModal();
		}
	});

	
		// Model selector functions
		let currentModel = 'opus'; // Default model

		function showModelSelector() {
			document.getElementById('modelModal').style.display = 'flex';
			// Select the current model radio button
			const radioButton = document.getElementById('model-' + currentModel);
			if (radioButton) {
				radioButton.checked = true;
			}
		}

		function hideModelModal() {
			document.getElementById('modelModal').style.display = 'none';
		}

		// 显示算力模式选择modal
		function showModeSelector() {
			document.getElementById('modeModal').style.display = 'flex';
			// 更新radio按钮选中状态
			const radioButton = document.getElementById('mode-' + currentMode);
			if (radioButton) {
				radioButton.checked = true;
			}
		}

		// 隐藏算力模式选择modal
		function hideModeModal() {
			document.getElementById('modeModal').style.display = 'none';
		}

		// 选择算力模式
		function selectMode(mode) {
			currentMode = mode;

			// 更新显示文本
			const displayNames = {
				'auto': 'Auto',
				'max': 'Max'
			};
			document.getElementById('selectedMode').textContent = displayNames[mode];

			// 更新radio按钮
			const radioButton = document.getElementById('mode-' + mode);
			if (radioButton) {
				radioButton.checked = true;
			}

			// 保存到localStorage
			localStorage.setItem('selectedMode', mode);

			// 通知后端（后端会显示通知）
			vscode.postMessage({
				type: 'selectMode',
				mode: mode
			});

			// 隐藏modal
			hideModeModal();
		}

		// 处理子代理增强开关（独立逻辑）
		function toggleEnhanceSubagents() {
			const checkbox = document.getElementById('enhance-subagents');
			if (!checkbox) return;

			const isChecked = checkbox.checked;

			// 保存到localStorage
			localStorage.setItem('enhanceSubagents', isChecked.toString());

			// 通知后端（独立消息）
			vscode.postMessage({
				type: 'updateSubagentMode',
				enabled: isChecked
			});
		}

		// Slash commands modal functions
		function showSlashCommandsModal() {
			document.getElementById('slashCommandsModal').style.display = 'flex';
			// Request custom commands from extension
			vscode.postMessage({ type: 'getCustomCommands' });
		}

		function hideSlashCommandsModal() {
			document.getElementById('slashCommandsModal').style.display = 'none';
		}

		// Thinking intensity modal functions
		function showThinkingIntensityModal() {
			// Request current settings from VS Code first
			vscode.postMessage({
				type: 'getSettings'
			});
			document.getElementById('thinkingIntensityModal').style.display = 'flex';
		}

		function hideThinkingIntensityModal() {
			document.getElementById('thinkingIntensityModal').style.display = 'none';
		}

		// Language modal functions
		function showLanguageModal() {
			// If already enabled and user clicks label, show modal again
			const labelElement = document.getElementById('languageModeLabel');
			if (labelElement && labelElement.textContent !== 'Language Mode') {
				document.getElementById('languageModal').style.display = 'flex';
				return;
			}
			
			// Request current settings from VS Code first
			vscode.postMessage({
				type: 'getSettings'
			});
			document.getElementById('languageModal').style.display = 'flex';
		}

		function hideLanguageModal() {
			const modal = document.getElementById('languageModal');
			modal.classList.add('modal-closing');
			setTimeout(() => {
				modal.style.display = 'none';
				modal.classList.remove('modal-closing');
			}, 200);
		}

		function selectLanguage(lang) {
			selectedLanguage = lang;
			const toggleLabel = document.getElementById('languageModeLabel');
			
			// Update label with selected language
			const languageNames = {
				'zh': '中文',
				'es': 'Español',
				'ar': 'العربية',
				'fr': 'Français',
				'de': 'Deutsch',
				'ja': '日本語',
				'ko': '한국어'
			};
			
			if (toggleLabel && languageNames[lang]) {
				toggleLabel.textContent = languageNames[lang];
			}
			
			// Check the radio button
			const radioElement = document.getElementById('language-' + lang);
			if (radioElement) {
				radioElement.checked = true;
			}
			
			// Save to settings
			vscode.postMessage({
				type: 'updateSettings',
				settings: {
					'language.enabled': true,
					'language.selected': lang
				}
			});
			
			hideLanguageModal();
		}

		function saveThinkingIntensity() {
			const thinkingSlider = document.getElementById('thinkingIntensitySlider');
			const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'sequential-thinking'];
			const thinkingIntensity = intensityValues[thinkingSlider.value] || 'think';
			
			// Send settings to VS Code
			vscode.postMessage({
				type: 'updateSettings',
				settings: {
					'thinking.intensity': thinkingIntensity
				}
			});
		}

		function updateThinkingModeToggleName(intensityValue) {
			const intensityNames = ['Think', 'Think Hard', 'Think Harder', 'Ultrathink', 'Sequential (MCP)'];
			const modeName = intensityNames[intensityValue] || 'Think';
			const toggleLabel = document.getElementById('thinkingModeLabel');
			if (toggleLabel) {
				toggleLabel.textContent = modeName + ' Mode';
			}
		}

		function updateThinkingIntensityDisplay(value) {
			// Update label highlighting for thinking intensity modal
			for (let i = 0; i < 5; i++) {
				const label = document.getElementById('thinking-label-' + i);
				if (i == value) {
					label.classList.add('active');
				} else {
					label.classList.remove('active');
				}
			}
			
			// Don't update toggle name until user confirms
		}

		function setThinkingIntensityValue(value) {
			// Set slider value for thinking intensity modal
			document.getElementById('thinkingIntensitySlider').value = value;
			
			// Update visual state
			updateThinkingIntensityDisplay(value);
		}

		function confirmThinkingIntensity() {
			// Get the current slider value
			const currentValue = document.getElementById('thinkingIntensitySlider').value;
			
			// Update the toggle name with confirmed selection
			updateThinkingModeToggleName(currentValue);
			
			// Save the current intensity setting
			saveThinkingIntensity();
			
			// Close the modal
			hideThinkingIntensityModal();
		}

		// WSL Alert functions
		function showWSLAlert() {
			const alert = document.getElementById('wslAlert');
			if (alert) {
				alert.style.display = 'block';
			}
		}

		function dismissWSLAlert() {
			const alert = document.getElementById('wslAlert');
			if (alert) {
				alert.style.display = 'none';
			}
			// Send dismiss message to extension to store in globalState
			vscode.postMessage({
				type: 'dismissWSLAlert'
			});
		}

		function openWSLSettings() {
			// Dismiss the alert
			dismissWSLAlert();
			
			// Open settings modal
			toggleSettings();
		}

		function executeSlashCommand(command) {
			// Hide command selection modal
			hideSlashCommandsModal();

			// Clear input field
			messageInput.value = '';

			// Send command to VS Code backend for execution
			vscode.postMessage({
				type: 'executeSlashCommand',
				command: command
			});

			// Don't show message here, backend will send output type message via _executeSlashCommand
		}

		function handleCustomCommandKeydown(event) {
			if (event.key === 'Enter') {
				event.preventDefault();
				const customCommand = event.target.value.trim();
				if (customCommand) {
					executeSlashCommand(customCommand);
					// Clear the input for next use
					event.target.value = '';
				}
			}
		}

		// Custom Commands Functions
		let customCommands = [];

		function showCustomCommandsModal() {
			document.getElementById('customCommandsModal').style.display = 'flex';
			// Request current custom commands from extension
			vscode.postMessage({ type: 'getCustomCommands' });
		}

		function hideCustomCommandsModal() {
			document.getElementById('customCommandsModal').style.display = 'none';
			clearCommandForm();
		}

		function clearCommandForm() {
			document.getElementById('commandId').value = '';
			document.getElementById('commandName').value = '';
			document.getElementById('commandDescription').value = '';
			document.getElementById('commandValue').value = '';
			document.getElementById('commandIcon').value = '';
		}

		function saveCustomCommand() {
			const command = {
				id: document.getElementById('commandId').value || null,
				name: document.getElementById('commandName').value.trim(),
				description: document.getElementById('commandDescription').value.trim(),
				command: document.getElementById('commandValue').value.trim(),
				icon: document.getElementById('commandIcon').value.trim() || '⚡'
			};

			// Validate inputs
			if (!command.name || !command.description || !command.command) {
				alert('Please fill in all required fields');
				return;
			}

			// Send to extension
			vscode.postMessage({
				type: 'saveCustomCommand',
				command: command
			});

			// Clear form
			clearCommandForm();
		}

		function editCustomCommand(commandId) {
			const command = customCommands.find(c => c.id === commandId);
			if (command) {
				document.getElementById('commandId').value = command.id;
				document.getElementById('commandName').value = command.name;
				document.getElementById('commandDescription').value = command.description;
				document.getElementById('commandValue').value = command.command;
				document.getElementById('commandIcon').value = command.icon || '';
			}
		}

		function deleteCustomCommand(commandId) {
			console.log('[deleteCustomCommand] Delete button clicked, command ID:', commandId);
			console.log('[deleteCustomCommand] Function type:', typeof deleteCustomCommand);
			console.log('[deleteCustomCommand] Function on window:', typeof window.deleteCustomCommand);

			try {
				// Direct delete without confirmation (for testing)
				console.log('[deleteCustomCommand] Sending delete message to backend');
				vscode.postMessage({
					type: 'deleteCustomCommand',
					commandId: commandId
				});
			} catch (error) {
				console.error('[deleteCustomCommand] Error deleting command:', error);
			}
		}

		function executeCustomCommand(command) {
			vscode.postMessage({
				type: 'executeCustomCommand',
				command: command
			});
			// Close modals
			hideSlashCommandsModal();
			addMessage('user', \`Executing custom command: \${command}. Check the terminal output and return when ready.\`, 'assistant');
		}

		function displayCustomCommands(commands) {
			customCommands = commands;
			
			// Update the list in the management modal
			const existingCommandsList = document.getElementById('existingCommandsList');
			if (existingCommandsList) {
				if (commands.length === 0) {
					existingCommandsList.innerHTML = '<p style="font-size: 11px; color: var(--vscode-descriptionForeground); text-align: center; padding: 20px;">No custom commands yet. Add your first command above!</p>';
				} else {
					existingCommandsList.innerHTML = commands.map(cmd => \`
						<div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; margin-bottom: 4px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px;">
							<div style="display: flex; align-items: center; gap: 8px;">
								<span style="font-size: 16px;">\${cmd.icon || '⚡'}</span>
								<div>
									<div style="font-size: 12px; font-weight: 600;">/\${cmd.name}</div>
									<div style="font-size: 11px; color: var(--vscode-descriptionForeground);">\${cmd.description}</div>
									<div style="font-size: 10px; color: var(--vscode-descriptionForeground); font-family: monospace; margin-top: 2px;">\${cmd.command}</div>
								</div>
							</div>
							<div style="display: flex; gap: 4px;">
								<button onclick="editCustomCommand('\${cmd.id}')" style="padding: 4px 8px; font-size: 11px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; cursor: pointer;">Edit</button>
								<button onclick="deleteCustomCommand('\${cmd.id}')" style="padding: 4px 8px; font-size: 11px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; cursor: pointer;">Delete</button>
							</div>
						</div>
					\`).join('');
				}
			}

			// Update the list in the slash commands modal
			const customCommandsList = document.getElementById('customCommandsList');
			const customCommandsSection = document.getElementById('customCommandsSection');
			if (customCommandsList && customCommandsSection) {
				if (commands.length > 0) {
					customCommandsSection.style.display = 'block';
					customCommandsList.innerHTML = commands.map(cmd => \`
						<div class="slash-command-item" onclick="executeCustomCommand('\${cmd.command}')">
							<div class="slash-command-icon">\${cmd.icon || '⚡'}</div>
							<div class="slash-command-content">
								<div class="slash-command-title">/\${cmd.name}</div>
								<div class="slash-command-description">\${cmd.description}</div>
							</div>
						</div>
					\`).join('');
				} else {
					customCommandsSection.style.display = 'none';
				}
			}
		}

		function openModelTerminal() {
			vscode.postMessage({
				type: 'openModelTerminal'
			});
			hideModelModal();
		}

		function selectModel(model, fromBackend = false) {
			currentModel = model;
			
			// Update the display text
			const displayNames = {
				'opus': 'Opus',
				'claude-opus-4-1-20250805': 'Opus 4.1',
				'sonnet': 'Sonnet',
				'claude-sonnet-4-5-20250929': 'Sonnet 4.5',    // Added
				'claude-haiku-4-5-20251001': 'Haiku 4.5',       // Added
				'default': 'Model'
			};
			document.getElementById('selectedModel').textContent = displayNames[model] || model;
			
			// Only send model selection to VS Code extension if not from backend
			if (!fromBackend) {
				vscode.postMessage({
					type: 'selectModel',
					model: model
				});
				
				// Save preference
				localStorage.setItem('selectedModel', model);
			}
			
			// Update radio button if modal is open
			// Special handling for long model names
			let radioId = 'model-' + model;
			if (model === 'claude-opus-4-1-20250805') {
				radioId = 'model-opus-4-1';
			}
			const radioButton = document.getElementById(radioId);
			if (radioButton) {
				radioButton.checked = true;
			}
			
			hideModelModal();
		}

		// Initialize model display without sending message
		currentModel = 'claude-sonnet-4-5-20250929';  // Default to Sonnet 4.5
		const displayNames = {
			'opus': 'Opus',
			'claude-opus-4-1-20250805': 'Opus 4.1',
			'sonnet': 'Sonnet',
			'claude-sonnet-4-5-20250929': 'Sonnet 4.5',    // Added
			'claude-haiku-4-5-20251001': 'Haiku 4.5',       // Added
			'default': 'Default'
		};
		document.getElementById('selectedModel').textContent = displayNames[currentModel];

		// Close model modal when clicking outside
		document.getElementById('modelModal').addEventListener('click', (e) => {
			if (e.target === document.getElementById('modelModal')) {
				hideModelModal();
			}
		});

		// Stop button functions
		function showStopButton() {
			document.getElementById('stopBtn').style.display = 'flex';
		}

		function hideStopButton() {
			document.getElementById('stopBtn').style.display = 'none';
		}

		function stopRequest() {
			vscode.postMessage({
				type: 'stopRequest'
			});
			// Don't hide immediately - wait for setProcessing(false) from backend
			// This ensures the button stays visible if the process is still running
		}

		// Disable/enable buttons during processing
		function disableButtons() {
			const sendBtn = document.getElementById('sendBtn');
			if (sendBtn) sendBtn.disabled = true;
		}

		function enableButtons() {
			const sendBtn = document.getElementById('sendBtn');
			if (sendBtn) sendBtn.disabled = false;
		}

		// Copy message content function
		function copyMessageContent(messageDiv) {
			const contentDiv = messageDiv.querySelector('.message-content');
			if (contentDiv) {
				// Get text content, preserving line breaks
				const text = contentDiv.innerText || contentDiv.textContent;
				
				// Copy to clipboard
				navigator.clipboard.writeText(text).then(() => {
					// Show brief feedback
					const copyBtn = messageDiv.querySelector('.copy-btn');
					const originalHtml = copyBtn.innerHTML;
					copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
					copyBtn.style.color = '#4caf50';
					
					setTimeout(() => {
						copyBtn.innerHTML = originalHtml;
						copyBtn.style.color = '';
					}, 1000);
				}).catch(err => {
					console.error('Failed to copy message:', err);
				});
			}
		}

		window.addEventListener('message', event => {
			const message = event.data;
			
			switch (message.type) {
				case 'ready':
					addMessage(message.data, 'system');
					updateStatusWithTotals();
					break;
					
				case 'output':
					if (message.data.trim()) {
						addMessage(parseSimpleMarkdown(message.data, imagePathMap), 'claude');
						// Removed token display per user request
					}
					updateStatusWithTotals();
					break;
					
				case 'userInput':
					if (message.data.trim()) {
						addMessage(parseSimpleMarkdown(message.data, imagePathMap), 'user');
					}
					break;
					
				case 'loading':
					addMessage(message.data, 'system');
					updateStatusWithTotals();
					break;
					
				case 'setProcessing':
					isProcessing = message.data;
					if (isProcessing) {
						startRequestTimer();
						showStopButton();
						disableButtons();
					} else {
						stopRequestTimer();
						hideStopButton();
						enableButtons();
					}
					updateStatusWithTotals();
					break;
					
				case 'clearLoading':
					// Remove the last loading message
					const messages = messagesDiv.children;
					if (messages.length > 0) {
						const lastMessage = messages[messages.length - 1];
						if (lastMessage.classList.contains('system')) {
							lastMessage.remove();
						}
					}
					updateStatusWithTotals();
					break;
					
				case 'error':
					if (message.data.trim()) {
						addMessage(message.data, 'error');
					}
					updateStatusWithTotals();
					break;
					
				case 'info':
					if (message.data.trim()) {
						addMessage(message.data, 'system');
					}
					updateStatusWithTotals();
					break;
					
				case 'toolUse':
					if (typeof message.data === 'object') {
						addToolUseMessage(message.data);
					} else if (message.data.trim()) {
						addMessage(message.data, 'tool');
					}
					break;
					
				case 'toolStatus':
					console.log('Received toolStatus message:', message.data);
					updateToolStatus(message.data);
					break;
					
				case 'toolResult':
							addToolResultMessage(message.data);
					break;
					
				case 'thinking':
					if (message.data.trim()) {
						addMessage('💡 Thinking...' + parseSimpleMarkdown(message.data), 'thinking');
					}
					break;
					
				case 'sessionInfo':
					console.log('Session info:', message.data);
					if (message.data.sessionId) {
						showSessionInfo(message.data.sessionId);
						// Show detailed session information
						const sessionDetails = [
							\`🆔 Session ID: \${message.data.sessionId}\`,
							\`🔧 Tools Available: \${message.data.tools.length}\`,
							\`🖥️ MCP Servers: \${message.data.mcpServers ? message.data.mcpServers.length : 0}\`
						];
						//addMessage(sessionDetails.join('\\n'), 'system');
					}
					break;
					
				case 'updateTokens':
					console.log('Tokens updated in real-time:', message.data);
					// Update token totals in real-time
					totalTokensInput = message.data.totalTokensInput || 0;
					totalTokensOutput = message.data.totalTokensOutput || 0;
					
					// Calculate actual context window usage
					lastContextTokens = (message.data.currentInputTokens || 0) + 
					                   (message.data.cacheReadTokens || 0);
					
					// Only update if this is higher than previous max (prevents jumping)
					if (lastContextTokens > maxContextTokensInSession) {
						maxContextTokensInSession = lastContextTokens;
						
						// Update Context Window indicator with correct usage
						const TOTAL_CONTEXT = 200000;
						const usedPercentage = (maxContextTokensInSession / TOTAL_CONTEXT) * 100;
						const remainingPercentage = Math.max(0, 100 - usedPercentage);
						
						updateTokenUsageIndicator({
							used: maxContextTokensInSession,
							total: TOTAL_CONTEXT,
							percentage: Math.round(remainingPercentage),
							inputTokens: message.data.currentInputTokens || 0,
							outputTokens: 0 // Not relevant for context window
						});
					}
					
					// Update status bar immediately with real-time token info
					updateStatusWithTotals();
					
					// Create or update a real-time token display
					// updateRealTimeTokenDisplay(message.data); // Disabled per user request
					break;
					
				case 'updateTotals':
					console.log('Totals updated:', message.data);
					console.log('Cost data received:', {
						totalCost: message.data.totalCost,
						currentCost: message.data.currentCost,
						previousTotalCost: totalCost
					});
					// Update local tracking variables
					totalCost = message.data.totalCost || 0;
					totalTokensInput = message.data.totalTokensInput || 0;
					totalTokensOutput = message.data.totalTokensOutput || 0;
					requestCount = message.data.requestCount || 0;
					
					// Update status bar with new totals
					updateStatusWithTotals();
					
					// Show current request info if available
					if (message.data.currentCost || message.data.currentDuration || message.data.currentTokensInput || message.data.currentTokensOutput) {
						const currentCostStr = message.data.currentCost ? \`$\${message.data.currentCost.toFixed(4)}\` : '$0.0000';
						const currentDurationStr = message.data.currentDuration ? \`\${(message.data.currentDuration / 1000).toFixed(1)}s\` : '0.0s';
						const inputTokens = message.data.currentTokensInput || 0;
						const outputTokens = message.data.currentTokensOutput || 0;
						const totalTokens = inputTokens + outputTokens;
						
						// Format similar to the token display but for the request
						const tokenHTML = '<div class="request-stats">' +
							'<span class="stats-icon">💰</span>' +
							'<span class="stats-text">' +
								'<span class="stats-input">' + inputTokens.toLocaleString() + ' in</span>' +
								'<span class="stats-separator">→</span>' +
								'<span class="stats-output">' + outputTokens.toLocaleString() + ' out</span>' +
								'<span class="stats-total">(' + totalTokens.toLocaleString() + ' total)</span>' +
								'<span class="stats-cost"><span class="stats-cost-value">' + currentCostStr + '</span></span>' +
								'<span class="stats-duration">' + currentDurationStr + '</span>' +
							'</span>' +
						'</div>';
						addMessage(tokenHTML, 'system');
					}
					break;
					
				case 'sessionResumed':
					console.log('Session resumed:', message.data);
					showSessionInfo(message.data.sessionId);
					addMessage(\`📝 Resumed previous session\\n🆔 Session ID: \${message.data.sessionId}\\n💡 Your conversation history is preserved\`, 'system');
					break;
					
				case 'sessionCleared':
					console.log('Session cleared');
					// Clear all messages from UI
					messagesDiv.innerHTML = '';
					hideSessionInfo();
					addMessage('🆕 Started new session', 'system');
					// Reset totals
					totalCost = 0;
					totalTokensInput = 0;
					totalTokensOutput = 0;
					requestCount = 0;
					lastContextTokens = 0; // Reset context window tracking
					maxContextTokensInSession = 0; // Reset max context tracking
					updateStatusWithTotals();
					break;
					
				case 'loginRequired':
					addMessage('🔐 Login Required\\n\\nYour Claude API key is invalid or expired.\\nA terminal has been opened - please run the login process there.\\n\\nAfter logging in, come back to this chat to continue.', 'error');
					updateStatus('Login Required', 'error');
					break;
					
				case 'showRestoreOption':
					console.log('Show restore option:', message.data);
					showRestoreContainer(message.data);
					break;
					
				case 'restoreProgress':
					addMessage('🔄 ' + message.data, 'system');
					break;
					
				case 'restoreSuccess':
					//hideRestoreContainer(message.data.commitSha);
					addMessage('✅ ' + message.data.message, 'system');
					break;
					
				case 'restoreError':
					addMessage('❌ ' + message.data, 'error');
					break;
					
				case 'workspaceFiles':
					filteredFiles = message.data;
					selectedFileIndex = -1;
					renderFileList();
					break;
					
				case 'imagePath':
					// Add the image path to the textarea
					const currentText = messageInput.value;
					const pathIndicator = \`@\${message.path} \`;
					messageInput.value = currentText + pathIndicator;
					messageInput.focus();
					adjustTextareaHeight();
					
					// 存储路径到webview URI的映射
					if (message.webviewUri) {
						imagePathMap.set(message.path, message.webviewUri);
					}
					break;
					
				case 'conversationList':
					displayConversationList(message.data);
					break;
				case 'statisticsData':
					displayStatistics(message.data);
					break;
				case 'clipboardText':
					handleClipboardText(message.data);
					break;
				case 'modelSelected':
					// Update the UI with the current model
					currentModel = message.model;
					selectModel(message.model, true);
					break;
				case 'terminalOpened':
					// Display notification about checking the terminal
					addMessage(message.data, 'system');
					break;
				case 'showWSLAlert':
					const wslAlert = document.getElementById('wslAlert');
					if (wslAlert) {
						wslAlert.style.display = 'block';
					}
					break;
				case 'configChanged':
					addMessage('system', event.data);
					break;
				case 'platformInfo':
					// Check if user is on Windows and show WSL alert if not dismissed and WSL not already enabled
					if (message.data.isWindows && !message.data.wslAlertDismissed && !message.data.wslEnabled) {
						// Small delay to ensure UI is ready
						setTimeout(() => {
							showWSLAlert();
						}, 1000);
					}
					break;
				case 'mcpStatus':
					updateMcpStatus(message.data);
					break;
				case 'mcpToolsData':
					displayMcpTools(message.data);
					break;
				case 'customCommands':
					displayCustomCommands(message.data);
					break;
				case 'pluginsList':
					// 接收插件列表并显示模态框
					updatePluginsList(message.data.plugins || [], message.data.refreshed);
					break;
				case 'operationHistory':
					// Update operation history UI and sync currentOperations
					const allOperations = [...(message.data.active || []), ...(message.data.undone || [])];
					currentOperations = allOperations;
					renderOperationHistory(message.data);
					break;
					
				case 'operationTracked':
					// Add new operation to history
					if (!currentOperations) {
						currentOperations = [];
					}
					// Check if operation already exists to avoid duplicates
					const exists = currentOperations.some(op => op.id === message.data.id);
					if (!exists) {
						currentOperations.push(message.data);
						updateOperationHistoryDisplay();
					}
					break;
					
				case 'operationChanged':
					// Update existing operation
					if (currentOperations) {
						const index = currentOperations.findIndex(op => op.id === message.data.id);
						if (index !== -1) {
							currentOperations[index] = message.data;
							updateOperationHistoryDisplay();
						}
					}
					break;
					
				case 'operationPreview':
					// Display operation preview
					displayOperationPreview(message.data);
					break;
					
				case 'tokenUsage':
					// Skip updating if we have lastContextTokens from updateTokens
					// The tokenUsage message uses incorrect calculation (input + output)
					// We only update if we haven't received proper context data yet
					if (lastContextTokens === 0) {
						updateTokenUsageIndicator(message.data);
					}
					break;
			}

			if (message.type === 'settingsData') {
				// Update UI with current settings
				const thinkingIntensity = message.data['thinking.intensity'] || 'think';
				const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'sequential-thinking'];
				const sliderValue = intensityValues.indexOf(thinkingIntensity);
				
				// Update thinking intensity modal if it exists
				const thinkingIntensitySlider = document.getElementById('thinkingIntensitySlider');
				if (thinkingIntensitySlider) {
					thinkingIntensitySlider.value = sliderValue >= 0 ? sliderValue : 0;
					updateThinkingIntensityDisplay(thinkingIntensitySlider.value);
				} else {
					// Update toggle name even if modal isn't open
					updateThinkingModeToggleName(sliderValue >= 0 ? sliderValue : 0);
				}
				
				// Update language mode settings
				const savedLanguageMode = message.data['language.enabled'] || false;
				const savedLanguage = message.data['language.selected'] || null;
				
				// Only update if the current state doesn't match the saved state
				if (savedLanguageMode && savedLanguage && !languageModeEnabled) {
					languageModeEnabled = true;
					selectedLanguage = savedLanguage;
					
					// Update UI
					const switchElement = document.getElementById('languageModeSwitch');
					if (switchElement && !switchElement.classList.contains('active')) {
						switchElement.classList.add('active');
					}
					
					const toggleLabel = document.getElementById('languageModeLabel');
					const languageNames = {
						'zh': '中文',
						'es': 'Español',
						'ar': 'العربية',
						'fr': 'Français',
						'de': 'Deutsch',
						'ja': '日本語',
						'ko': '한국어'
					};
					
					if (toggleLabel && languageNames[savedLanguage]) {
						toggleLabel.textContent = languageNames[savedLanguage];
					}
					
					// Check the radio button in modal if open
					const radioElement = document.getElementById('language-' + savedLanguage);
					if (radioElement) {
						radioElement.checked = true;
					}
				}
				
				// Skip WSL settings as those elements don't exist in the UI
				
				// Load MCP settings
				const mcpEnabledCheckbox = document.getElementById('mcp-enabled');
				const mcpOptionsDiv = document.getElementById('mcpOptions');
				
				if (mcpEnabledCheckbox) {
					mcpEnabledCheckbox.checked = message.data['mcp.enabled'] || false;
				}
				
				if (mcpOptionsDiv) {
					mcpOptionsDiv.style.display = message.data['mcp.enabled'] ? 'block' : 'none';
				}
				
				// Load MCP servers
				const mcpServers = message.data['mcp.servers'] || [];
				const serversList = document.getElementById('mcpServersList');
				serversList.innerHTML = ''; // Clear existing servers
				mcpServerCount = 0; // Reset counter
				mcpServerExpandStates.clear(); // Clear expansion states

				mcpServers.forEach(server => {
					// 根据服务器类型调用不同的函数
					if (server.type === 'http' || server.type === 'sse') {
						addHttpMcpServer(server);
					} else {
						addMcpServer(server);
					}
				});
				
				// Load API configuration
				document.getElementById('api-useCustomAPI').checked = message.data['api.useCustomAPI'] || false;
				document.getElementById('api-key').value = message.data['api.key'] || '';
				document.getElementById('api-baseUrl').value = message.data['api.baseUrl'] || 'https://api.anthropic.com';
				document.getElementById('apiOptions').style.display = message.data['api.useCustomAPI'] ? 'block' : 'none';
			}

			if (message.type === 'platformInfo') {
				// Check if user is on Windows and show WSL alert if not dismissed and WSL not already enabled
				if (message.data.isWindows && !message.data.wslAlertDismissed && !message.data.wslEnabled) {
					// Small delay to ensure UI is ready
					setTimeout(() => {
						showWSLAlert();
					}, 1000);
				}
			}
		});
		
		// Session management functions
		function newSession() {
			// Reset context window immediately
			lastContextTokens = 0;
			maxContextTokensInSession = 0;
			updateTokenUsageIndicator({
				used: 0,
				total: 200000,
				percentage: 100,
				inputTokens: 0,
				outputTokens: 0
			});
			
			vscode.postMessage({
				type: 'newSession'
			});
		}

		// 压缩对话功能
		function compactConversation() {
			// 添加按钮激活效果
			const compactBtn = document.getElementById('compactButton');
			if (compactBtn) {
				compactBtn.classList.add('active');
				// 2秒后移除激活状态
				setTimeout(() => {
					compactBtn.classList.remove('active');
				}, 2000);
			}
			
			// 发送压缩请求到后端，包含语言设置
			const languageModeSwitch = document.getElementById('languageModeSwitch');
			const isLanguageModeOn = languageModeSwitch ? languageModeSwitch.checked : false;
			
			vscode.postMessage({
				type: 'compactConversation',
				languageMode: isLanguageModeOn,
				selectedLanguage: selectedLanguage
			});
		}

		function restoreToCommit(commitSha) {
			console.log('Restore button clicked for commit:', commitSha);
			vscode.postMessage({
				type: 'restoreCommit',
				commitSha: commitSha
			});
		}

		function showRestoreContainer(data) {
			const restoreContainer = document.createElement('div');
			restoreContainer.className = 'restore-container';
			restoreContainer.id = \`restore-\${data.sha}\`;
			
			const timeAgo = new Date(data.timestamp).toLocaleTimeString();
			const shortSha = data.sha ? data.sha.substring(0, 8) : 'unknown';
			
			restoreContainer.innerHTML = \`
				<button class="restore-btn dark" onclick="restoreToCommit('\${data.sha}')">
					Restore checkpoint
				</button>
				<span class="restore-date">\${timeAgo}</span>
			\`;
			
			messagesDiv.appendChild(restoreContainer);
			messagesDiv.scrollTop = messagesDiv.scrollHeight;
		}

		function hideRestoreContainer(commitSha) {
			const container = document.getElementById(\`restore-\${commitSha}\`);
			if (container) {
				container.remove();
			}
		}
		
		function showSessionInfo(sessionId) {
			// const sessionInfo = document.getElementById('sessionInfo');
			// const sessionIdSpan = document.getElementById('sessionId');
			const sessionStatus = document.getElementById('sessionStatus');
			const newSessionBtn = document.getElementById('newSessionBtn');
			const historyBtn = document.getElementById('historyBtn');
			
			if (sessionStatus && newSessionBtn) {
				// sessionIdSpan.textContent = sessionId.substring(0, 8);
				// sessionIdSpan.title = \`Full session ID: \${sessionId} (click to copy)\`;
				// sessionIdSpan.style.cursor = 'pointer';
				// sessionIdSpan.onclick = () => copySessionId(sessionId);
				// sessionInfo.style.display = 'flex';
				sessionStatus.style.display = 'none';
				newSessionBtn.style.display = 'block';
				if (historyBtn) historyBtn.style.display = 'block';
			}
		}
		
		function copySessionId(sessionId) {
			navigator.clipboard.writeText(sessionId).then(() => {
				// Show temporary feedback
				const sessionIdSpan = document.getElementById('sessionId');
				if (sessionIdSpan) {
					const originalText = sessionIdSpan.textContent;
					sessionIdSpan.textContent = 'Copied!';
					setTimeout(() => {
						sessionIdSpan.textContent = originalText;
					}, 1000);
				}
			}).catch(err => {
				console.error('Failed to copy session ID:', err);
			});
		}
		
		function hideSessionInfo() {
			// const sessionInfo = document.getElementById('sessionInfo');
			const sessionStatus = document.getElementById('sessionStatus');
			const newSessionBtn = document.getElementById('newSessionBtn');
			const historyBtn = document.getElementById('historyBtn');
			
			if (sessionStatus && newSessionBtn) {
				// sessionInfo.style.display = 'none';
				sessionStatus.style.display = 'none';

				// Always show new session
				newSessionBtn.style.display = 'block';
				// Keep history button visible - don't hide it
				if (historyBtn) historyBtn.style.display = 'block';
			}
		}

		updateStatus('Initializing...', 'disconnected');
		
		// Initialize status immediately
		updateStatusWithTotals();
		
		// Request operation history on load
		vscode.postMessage({ type: 'getOperationHistory' });

		/**
		 * Convert file path patterns to clickable links
		 * Supports formats: file.ext:line or path/to/file.ext:line-endLine
		 * @param {string} content - Text content to process
		 * @returns {string} Processed HTML string
		 */
		function convertFileLinksToClickable(content) {
			try {
				// Supported file extensions
				const supportedExtensions = 'ts|js|tsx|jsx|py|java|cpp|cs|go|rs|vue|svelte|md|json|xml|yaml|yml|css|scss|html';

				// Regex pattern to match file path patterns
				// Matches: path/filename.ext:line or filename.ext:line-endLine
				const filePathPattern = new RegExp(
					'\\\\b([a-zA-Z0-9_\\\\-./\\\\\\\\]+\\\\.(' + supportedExtensions + ')):(\\\\d+)(?:-(\\\\d+))?\\\\b',
					'g'
				);

				return content.replace(filePathPattern, (match, filePath, ext, startLine, endLine) => {
					// Validate line numbers
					const lineNum = parseInt(startLine);
					const endLineNum = endLine ? parseInt(endLine) : lineNum;

					// Line number must be within reasonable range
					if (lineNum <= 0 || lineNum > 999999) {
						return match; // Invalid line number, return original text
					}

					// End line cannot be less than start line
					if (endLineNum < lineNum) {
						return match; // End line less than start line, return original text
					}

					// HTML escaping to prevent XSS attacks
					const escapedPath = filePath
						.replace(/"/g, '&quot;')
						.replace(/'/g, '&#39;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;');

					const lineRange = endLine ? startLine + '-' + endLine : startLine;

					// Return formatted link HTML
					return '<a href="#" class="file-link" data-file="' + escapedPath + '" data-line="' + startLine + '" ' +
						'data-end-line="' + endLineNum + '" title="Click to open ' + escapedPath + ':' + lineRange + '">' + match + '</a>';
				});
			} catch (error) {
				console.error('Failed to convert file links:', error);
				return content; // Return original content on error to prevent interruption
			}
		}

		function parseSimpleMarkdown(markdown) {
			const lines = markdown.split('\\n');
			let html = '';
			let inUnorderedList = false;
			let inOrderedList = false;

			for (let line of lines) {
				line = line.trim();

				// Bold
				line = line.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');

				// Italic - only apply when underscores are surrounded by whitespace or at beginning/end
				line = line.replace(/(?<!\\*)\\*(?!\\*)(.*?)\\*(?!\\*)/g, '<em>$1</em>');
				line = line.replace(/(^|\\s)_([^_\\s][^_]*[^_\\s]|[^_\\s])_(?=\\s|$)/g, '$1<em>$2</em>');

				// Headers
				if (/^####\\s+/.test(line)) {
				html += '<h4>' + line.replace(/^####\\s+/, '') + '</h4>';
				continue;
				} else if (/^###\\s+/.test(line)) {
				html += '<h3>' + line.replace(/^###\\s+/, '') + '</h3>';
				continue;
				} else if (/^##\\s+/.test(line)) {
				html += '<h2>' + line.replace(/^##\\s+/, '') + '</h2>';
				continue;
				} else if (/^#\\s+/.test(line)) {
				html += '<h1>' + line.replace(/^#\\s+/, '') + '</h1>';
				continue;
				}

				// Ordered list
				if (/^\\d+\\.\\s+/.test(line)) {
				if (!inOrderedList) {
					html += '<ol>';
					inOrderedList = true;
				}
				const item = line.replace(/^\\d+\\.\\s+/, '');
				html += '<li>' + item + '</li>';
				continue;
				}

				// Unordered list
				if (line.startsWith('- ')) {
				if (!inUnorderedList) {
					html += '<ul>';
					inUnorderedList = true;
				}
				html += '<li>' + line.slice(2) + '</li>';
				continue;
				}

				// Close lists
				if (inUnorderedList) {
				html += '</ul>';
				inUnorderedList = false;
				}
				if (inOrderedList) {
				html += '</ol>';
				inOrderedList = false;
				}

				// Horizontal rule
				if (line === '---' || line === '***' || line === '___') {
				html += '<hr>';
				continue;
				}

				// Paragraph or break
				if (line !== '') {
				html += '<p>' + line + '</p>';
				} else {
				html += '<br>';
				}
			}

			if (inUnorderedList) html += '</ul>';
			if (inOrderedList) html += '</ol>';

			return html;
		}

		// Conversation history functions
		function toggleConversationHistory() {
			const historyDiv = document.getElementById('conversationHistory');
			const chatContainer = document.getElementById('chatContainer');
			
			if (historyDiv.style.display === 'none') {
				// Show conversation history
				requestConversationList();
				historyDiv.style.display = 'block';
				chatContainer.style.display = 'none';
			} else {
				// Hide conversation history
				historyDiv.style.display = 'none';
				chatContainer.style.display = 'flex';
			}
		}

		function requestConversationList() {
			vscode.postMessage({
				type: 'getConversationList'
			});
		}

		function loadConversation(filename) {
			console.log('Loading conversation:', filename);
			vscode.postMessage({
				type: 'loadConversation',
				filename: filename
			});
			
			// Hide conversation history and show chat
			toggleConversationHistory();
		}

		// Statistics panel functions
		function toggleStats() {
			const statsPanel = document.getElementById('statsPanel');
			const chatContainer = document.getElementById('chatContainer');
			
			if (statsPanel.style.display === 'none') {
				// Show statistics panel
				statsPanel.style.display = 'block';
				chatContainer.style.display = 'none';
				loadStatistics('daily'); // Load daily stats by default
			} else {
				// Hide statistics panel
				statsPanel.style.display = 'none';
				chatContainer.style.display = 'flex';
			}
		}

		let currentStatsTab = 'daily';
		function switchStatsTab(tab) {
			currentStatsTab = tab;
			// Update active tab
			document.querySelectorAll('.stats-tab').forEach(btn => {
				btn.classList.remove('active');
			});
			event.target.classList.add('active');
			
			// Load statistics for the selected tab
			loadStatistics(tab);
		}

		function loadStatistics(type) {
			const statsContent = document.getElementById('statsContent');
			statsContent.innerHTML = '<div class="stats-loading">Loading ' + type + ' statistics...</div>';
			
			// Request statistics from extension
			vscode.postMessage({
				type: 'getStatistics',
				statsType: type
			});
		}

		// File picker functions
		function showFilePicker() {
			// Request initial file list from VS Code
			vscode.postMessage({
				type: 'getWorkspaceFiles',
				searchTerm: ''
			});
			
			// Show modal
			filePickerModal.style.display = 'flex';
			fileSearchInput.focus();
			selectedFileIndex = -1;
		}

		function hideFilePicker() {
			filePickerModal.style.display = 'none';
			fileSearchInput.value = '';
			selectedFileIndex = -1;
		}

		function getFileIcon(filename) {
			const ext = filename.split('.').pop()?.toLowerCase();
			switch (ext) {
				case 'js': case 'jsx': case 'ts': case 'tsx': return '📄';
				case 'html': case 'htm': return '🌐';
				case 'css': case 'scss': case 'sass': return '🎨';
				case 'json': return '📋';
				case 'md': return '📝';
				case 'py': return '🐍';
				case 'java': return '☕';
				case 'cpp': case 'c': case 'h': return '⚙️';
				case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': return '🖼️';
				case 'pdf': return '📄';
				case 'zip': case 'tar': case 'gz': return '📦';
				default: return '📄';
			}
		}

		function renderFileList() {
			fileList.innerHTML = '';
			
			filteredFiles.forEach((file, index) => {
				const fileItem = document.createElement('div');
				fileItem.className = 'file-item';
				if (index === selectedFileIndex) {
					fileItem.classList.add('selected');
				}
				
				fileItem.innerHTML = \`
					<span class="file-icon">\${getFileIcon(file.name)}</span>
					<div class="file-info">
						<div class="file-name">\${file.name}</div>
						<div class="file-path">\${file.path}</div>
					</div>
				\`;
				
				fileItem.addEventListener('click', () => {
					selectFile(file);
				});
				
				fileList.appendChild(fileItem);
			});
		}

		function selectFile(file) {
			// Insert file path at cursor position
			const cursorPos = messageInput.selectionStart;
			const textBefore = messageInput.value.substring(0, cursorPos);
			const textAfter = messageInput.value.substring(cursorPos);
			
			// Find the last @ symbol position
			const atIndex = textBefore.lastIndexOf('@');
			
			// If no @ found, just append the file path with @
			if (atIndex === -1) {
				const newText = textBefore + '@' + file.path + ' ' + textAfter;
				messageInput.value = newText;
				messageInput.focus();
				
				// Set cursor position after the inserted path
				const newCursorPos = textBefore.length + file.path.length + 2;
				messageInput.setSelectionRange(newCursorPos, newCursorPos);
			} else {
				// Replace the @ symbol with the file path
				const beforeAt = textBefore.substring(0, atIndex);
				const newText = beforeAt + '@' + file.path + ' ' + textAfter;
				
				messageInput.value = newText;
				messageInput.focus();
				
				// Set cursor position after the inserted path
				const newCursorPos = beforeAt.length + file.path.length + 2;
				messageInput.setSelectionRange(newCursorPos, newCursorPos);
			}
			
			hideFilePicker();
			adjustTextareaHeight();
		}

		function filterFiles(searchTerm) {
			// Send search request to backend instead of filtering locally
			vscode.postMessage({
				type: 'getWorkspaceFiles',
				searchTerm: searchTerm
			});
			selectedFileIndex = -1;
		}

		// Image handling functions
		function selectImage() {
			// Use VS Code's native file picker instead of browser file picker
			vscode.postMessage({
				type: 'selectImageFile'
			});
		}


		function showImageAddedFeedback(fileName) {
			// Create temporary feedback element
			const feedback = document.createElement('div');
			feedback.textContent = \`Added: \${fileName}\`;
			feedback.style.cssText = \`
				position: fixed;
				top: 20px;
				right: 20px;
				background: var(--vscode-notifications-background);
				color: var(--vscode-notifications-foreground);
				padding: 8px 12px;
				border-radius: 4px;
				font-size: 12px;
				z-index: 1000;
				opacity: 0;
				transition: opacity 0.3s ease;
			\`;
			
			document.body.appendChild(feedback);
			
			// Animate in
			setTimeout(() => feedback.style.opacity = '1', 10);
			
			// Animate out and remove
			setTimeout(() => {
				feedback.style.opacity = '0';
				setTimeout(() => feedback.remove(), 300);
			}, 2000);
		}

		function displayConversationList(conversations) {
			const listDiv = document.getElementById('conversationList');
			listDiv.innerHTML = '';

			if (conversations.length === 0) {
				listDiv.innerHTML = '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No conversations found</p>';
				return;
			}

			conversations.forEach(conv => {
				const item = document.createElement('div');
				item.className = 'conversation-item';
				item.onclick = () => loadConversation(conv.filename);

				const date = new Date(conv.startTime).toLocaleDateString();
				const time = new Date(conv.startTime).toLocaleTimeString();

				item.innerHTML = \`
					<div class="conversation-title">\${conv.firstUserMessage.substring(0, 60)}\${conv.firstUserMessage.length > 60 ? '...' : ''}</div>
					<div class="conversation-meta">\${date} at \${time} • \${conv.messageCount} messages • $\${conv.totalCost.toFixed(3)}</div>
					<div class="conversation-preview">Last: \${conv.lastUserMessage.substring(0, 80)}\${conv.lastUserMessage.length > 80 ? '...' : ''}</div>
				\`;

				listDiv.appendChild(item);
			});
		}

		function displayStatistics(data) {
			const statsContent = document.getElementById('statsContent');
			
			if (!data || data.error) {
				statsContent.innerHTML = '<div class="stats-error">Failed to load statistics: ' + (data?.error || 'Unknown error') + '</div>';
				return;
			}

			// Build statistics table
			let html = '<div class="stats-table-container">';
			const tableClass = currentStatsTab === 'blocks' ? 'stats-table blocks-view' : currentStatsTab === 'session' ? 'stats-table session-view' : 'stats-table';
			html += '<table class="' + tableClass + '">';
			
			// Headers based on current tab
			if (currentStatsTab === 'daily') {
				html += '<thead><tr><th>Date</th><th>Models</th><th>Cache Read</th><th>Input Tokens</th><th>Cache Creation</th><th>Output Tokens</th><th>Total Input Tokens</th><th>Total Output Tokens</th><th>Total Tokens</th><th>Cost</th></tr></thead>';
			} else if (currentStatsTab === 'monthly') {
				html += '<thead><tr><th>Month</th><th>Models</th><th>Cache Read</th><th>Input Tokens</th><th>Cache Creation</th><th>Output Tokens</th><th>Total Input Tokens</th><th>Total Output Tokens</th><th>Total Tokens</th><th>Cost</th></tr></thead>';
			} else if (currentStatsTab === 'blocks') {
				html += '<thead><tr><th>Block</th><th>Cache Read</th><th>Input Tokens</th><th>Cache Creation</th><th>Output Tokens</th><th>Total Input Tokens</th><th>Total Output Tokens</th><th>Total Tokens</th><th>Cost</th><th>Status</th></tr></thead>';
			} else if (currentStatsTab === 'session') {
				html += '<thead><tr><th>Project</th><th>Models</th><th>Cache Read</th><th>Input Tokens</th><th>Cache Creation</th><th>Output Tokens</th><th>Total Input Tokens</th><th>Total Output Tokens</th><th>Total Tokens</th><th>Cost</th><th>Last Activity</th></tr></thead>';
			}
			
			html += '<tbody>';
			
			// Add data rows
			if (data.rows && data.rows.length > 0) {
				data.rows.forEach(row => {
					html += '<tr>';
					if (currentStatsTab === 'blocks') {
						html += '<td>' + (row.block || '-') + '</td>';
						html += '<td>' + (row.cacheReadTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.inputTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.cacheCreationTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.outputTokens || 0).toLocaleString() + '</td>';
						// Total Input Tokens = Input Tokens + Cache Read
						const totalInputTokens = (row.inputTokens || 0) + (row.cacheReadTokens || 0);
						html += '<td><span class="stats-table-input-value">' + totalInputTokens.toLocaleString() + '</span></td>';
						// Total Output Tokens = Output Tokens + Cache Creation
						const totalOutputTokens = (row.outputTokens || 0) + (row.cacheCreationTokens || 0);
						html += '<td><span class="stats-table-output-value">' + totalOutputTokens.toLocaleString() + '</span></td>';
						html += '<td>' + (row.totalTokens || 0).toLocaleString() + '</td>';
						html += '<td><span class="stats-table-cost-value">$' + (row.cost || 0).toFixed(4) + '</span></td>';
						html += '<td class="status-' + (row.status || 'unknown') + '">' + (row.status || '-') + '</td>';
					} else if (currentStatsTab === 'daily' || currentStatsTab === 'monthly') {
						// Daily and Monthly views: Date/Month, Models, then numeric columns
						html += '<td>' + (row.date || row.month || '-') + '</td>';
						// Display models on separate lines
						if (row.models && row.models.length > 0) {
							const modelDisplay = row.models.map(model => {
								// Extract model name (remove version if present)
								const modelParts = model.split('-');
								if (modelParts[0] === 'claude' && modelParts.length > 2) {
									// Handle claude-3-opus, claude-3-5-sonnet, claude-opus-4, etc.
									if (modelParts[1] === '3' && modelParts[2] === '5') {
										// claude-3-5-sonnet -> Sonnet 3.5
										const modelName = modelParts[3];
										return modelName.charAt(0).toUpperCase() + modelName.slice(1) + ' 3.5';
									} else if (modelParts[1] === '3') {
										// claude-3-opus -> Opus 3, claude-3-haiku -> Haiku 3
										const modelName = modelParts[2];
										return modelName.charAt(0).toUpperCase() + modelName.slice(1) + ' 3';
									} else if (modelParts[1] === 'opus' && modelParts[2] === '4') {
										// 检查是否是opus-4-1
										if (modelParts[3] === '1') {
											return 'Opus 4.1'; // claude-opus-4-1-20250805 -> Opus 4.1
										}
										return 'Opus 4'; // claude-opus-4 -> Opus 4
									} else if (modelParts[1] === 'sonnet' && modelParts[2] === '4') {
										return 'Sonnet 4'; // claude-sonnet-4 -> Sonnet 4
									} else {
										return modelParts[1]; // fallback
									}
								}
								return model; // return as-is if doesn't match pattern
							}).join('<br>');
							html += '<td>' + modelDisplay + '</td>';
						} else {
							html += '<td>inactive</td>';
						}
						html += '<td>' + (row.cacheReadTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.inputTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.cacheCreationTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.outputTokens || 0).toLocaleString() + '</td>';
						// Total Input Tokens = Input Tokens + Cache Read
						const totalInputTokens = (row.inputTokens || 0) + (row.cacheReadTokens || 0);
						html += '<td><span class="stats-table-input-value">' + totalInputTokens.toLocaleString() + '</span></td>';
						// Total Output Tokens = Output Tokens + Cache Creation
						const totalOutputTokens = (row.outputTokens || 0) + (row.cacheCreationTokens || 0);
						html += '<td><span class="stats-table-output-value">' + totalOutputTokens.toLocaleString() + '</span></td>';
						html += '<td>' + (row.totalTokens || 0).toLocaleString() + '</td>';
						html += '<td><span class="stats-table-cost-value">$' + (row.cost || 0).toFixed(4) + '</span></td>';
					} else if (currentStatsTab === 'session') {
						// Session view: Project name only, Models, numeric columns, Cost, Last Activity
						const projectName = row.session || '-';
						html += '<td>' + projectName + '</td>';
						// Display models on separate lines (same logic as daily/monthly)
						if (row.models && row.models.length > 0) {
							const modelDisplay = row.models.map(model => {
								// Extract model name (remove version if present)
								const modelParts = model.split('-');
								if (modelParts[0] === 'claude' && modelParts.length > 2) {
									// Handle claude-3-opus, claude-3-5-sonnet, claude-opus-4, etc.
									if (modelParts[1] === '3' && modelParts[2] === '5') {
										// claude-3-5-sonnet -> Sonnet 3.5
										const modelName = modelParts[3];
										return modelName.charAt(0).toUpperCase() + modelName.slice(1) + ' 3.5';
									} else if (modelParts[1] === '3') {
										// claude-3-opus -> Opus 3, claude-3-haiku -> Haiku 3
										const modelName = modelParts[2];
										return modelName.charAt(0).toUpperCase() + modelName.slice(1) + ' 3';
									} else if (modelParts[1] === 'opus' && modelParts[2] === '4') {
										// 检查是否是opus-4-1
										if (modelParts[3] === '1') {
											return 'Opus 4.1'; // claude-opus-4-1-20250805 -> Opus 4.1
										}
										return 'Opus 4'; // claude-opus-4 -> Opus 4
									} else if (modelParts[1] === 'sonnet' && modelParts[2] === '4') {
										return 'Sonnet 4'; // claude-sonnet-4 -> Sonnet 4
									} else {
										return modelParts[1]; // fallback
									}
								}
								return model; // return as-is if doesn't match pattern
							}).join('<br>');
							html += '<td>' + modelDisplay + '</td>';
						} else {
							html += '<td>inactive</td>';
						}
						// 新列顺序：缓存读取、输入、缓存创建、输出、总输入、总输出、总tokens、成本、最后活动
						html += '<td>' + (row.cacheReadTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.inputTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.cacheCreationTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.outputTokens || 0).toLocaleString() + '</td>';
						// 计算总输入和总输出
						const totalInput = (row.inputTokens || 0) + (row.cacheReadTokens || 0);
						const totalOutput = (row.outputTokens || 0) + (row.cacheCreationTokens || 0);
						html += '<td><span class="stats-table-input-value">' + totalInput.toLocaleString() + '</span></td>';
						html += '<td><span class="stats-table-output-value">' + totalOutput.toLocaleString() + '</span></td>';
						html += '<td>' + (row.totalTokens || 0).toLocaleString() + '</td>';
						html += '<td><span class="stats-table-cost-value">$' + (row.cost || 0).toFixed(4) + '</span></td>';
						html += '<td>' + (row.lastActivity || '-') + '</td>';
					}
					html += '</tr>';
				});
				
				// Add totals row
				if (data.totals) {
					html += '<tr class="stats-totals">';
					html += '<td><strong>Total</strong></td>';
					
					if (currentStatsTab === 'daily' || currentStatsTab === 'monthly') {
						html += '<td><strong>-</strong></td>'; // Models column
						// 新列顺序：缓存读取、输入、缓存创建、输出、总输入、总输出、总tokens、成本
						html += '<td><strong>' + (data.totals.cacheReadTokens || 0).toLocaleString() + '</strong></td>';
						html += '<td><strong>' + (data.totals.inputTokens || 0).toLocaleString() + '</strong></td>';
						html += '<td><strong>' + (data.totals.cacheCreationTokens || 0).toLocaleString() + '</strong></td>';
						html += '<td><strong>' + (data.totals.outputTokens || 0).toLocaleString() + '</strong></td>';
						// 计算总输入和总输出
						const totalInputSum = (data.totals.inputTokens || 0) + (data.totals.cacheReadTokens || 0);
						const totalOutputSum = (data.totals.outputTokens || 0) + (data.totals.cacheCreationTokens || 0);
						html += '<td><strong><span class="stats-table-input-value">' + totalInputSum.toLocaleString() + '</span></strong></td>';
						html += '<td><strong><span class="stats-table-output-value">' + totalOutputSum.toLocaleString() + '</span></strong></td>';
						html += '<td><strong>' + (data.totals.totalTokens || 0).toLocaleString() + '</strong></td>';
						html += '<td><strong><span class="stats-table-cost-value">$' + (data.totals.cost || 0).toFixed(4) + '</span></strong></td>';
					} else if (currentStatsTab === 'session') {
						html += '<td><strong>-</strong></td>'; // Models column
						// Session视图的新列顺序
						html += '<td><strong>' + (data.totals.cacheReadTokens || 0).toLocaleString() + '</strong></td>';
						html += '<td><strong>' + (data.totals.inputTokens || 0).toLocaleString() + '</strong></td>';
						html += '<td><strong>' + (data.totals.cacheCreationTokens || 0).toLocaleString() + '</strong></td>';
						html += '<td><strong>' + (data.totals.outputTokens || 0).toLocaleString() + '</strong></td>';
						// 计算总输入和总输出
						const totalInputSum = (data.totals.inputTokens || 0) + (data.totals.cacheReadTokens || 0);
						const totalOutputSum = (data.totals.outputTokens || 0) + (data.totals.cacheCreationTokens || 0);
						html += '<td><strong><span class="stats-table-input-value">' + totalInputSum.toLocaleString() + '</span></strong></td>';
						html += '<td><strong><span class="stats-table-output-value">' + totalOutputSum.toLocaleString() + '</span></strong></td>';
						html += '<td><strong>' + (data.totals.totalTokens || 0).toLocaleString() + '</strong></td>';
						html += '<td><strong><span class="stats-table-cost-value">$' + (data.totals.cost || 0).toFixed(4) + '</span></strong></td>';
						html += '<td><strong>-</strong></td>'; // Last Activity column
					}
					
					if (currentStatsTab === 'blocks') {
						html += '<td><strong>-</strong></td>'; // Status column
					}
					
					html += '</tr>';
				}
			} else {
				const colspanValue = currentStatsTab === 'session' ? '11' : (currentStatsTab === 'daily' || currentStatsTab === 'monthly' ? '10' : '10');
				html += '<tr><td colspan="' + colspanValue + '" class="stats-empty">No data available</td></tr>';
			}
			
			html += '</tbody></table>';
			html += '</div>';
			
			statsContent.innerHTML = html;
		}

		function handleClipboardText(text) {
			if (!text) return;
			
			// Insert text at cursor position
			const start = messageInput.selectionStart;
			const end = messageInput.selectionEnd;
			const currentValue = messageInput.value;
			
			const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
			messageInput.value = newValue;
			
			// Set cursor position after pasted text
			const newCursorPos = start + text.length;
			messageInput.setSelectionRange(newCursorPos, newCursorPos);
			
			// Trigger input event to adjust height
			messageInput.dispatchEvent(new Event('input', { bubbles: true }));
		}

		// Settings functions

		function toggleSettings() {
			const settingsModal = document.getElementById('settingsModal');
			if (settingsModal.style.display === 'none') {
				// Request current settings from VS Code
				vscode.postMessage({
					type: 'getSettings'
				});
				settingsModal.style.display = 'flex';
				// Also check MCP status when opening settings
				setTimeout(() => {
					vscode.postMessage({
						type: 'testMcpConnection'
					});
				}, 100);
			} else {
				hideSettingsModal();
			}
		}

		function hideSettingsModal() {
			document.getElementById('settingsModal').style.display = 'none';
		}
		
		function testMcpConnection() {
			vscode.postMessage({
				type: 'testMcpConnection'
			});
		}
		
		function updateMcpStatus(data) {
			const statusElement = document.getElementById('mcpStatusValue');
			if (!statusElement) return;
			
			let statusText = '';
			let statusColor = '';
			
			switch (data.status) {
				case 'disabled':
					statusText = 'Disabled';
					statusColor = 'var(--vscode-descriptionForeground)';
					break;
				case 'configured':
					statusText = data.message || 'Configured';
					statusColor = 'var(--vscode-charts-blue)';
					break;
				case 'testing':
					statusText = data.message || 'Testing...';
					statusColor = 'var(--vscode-charts-yellow)';
					break;
				case 'connected':
					statusText = data.message || 'Connected';
					statusColor = 'var(--vscode-charts-green)';
					break;
				case 'error':
					statusText = data.message || 'Error';
					statusColor = 'var(--vscode-charts-red)';
					break;
				default:
					statusText = 'Unknown';
					statusColor = 'var(--vscode-descriptionForeground)';
			}
			
			statusElement.textContent = statusText;
			statusElement.style.color = statusColor;
			
			// If we have server details, we could display them
			if (data.servers && data.servers.length > 0) {
				console.log('MCP Servers:', data.servers);
			}
		}

		let mcpServerCount = 0;
		// Store expansion state for each server
		const mcpServerExpandStates = new Map();
		
		function addMcpServer(serverConfig = null) {
			mcpServerCount++;
			const serverId = 'mcp-server-' + mcpServerCount;
			const serversList = document.getElementById('mcpServersList');
			
			// 初始化为折叠状态
			mcpServerExpandStates.set(serverId, false);
			
			const serverDiv = document.createElement('div');
			serverDiv.className = 'mcp-server-item';
			serverDiv.id = serverId;
			serverDiv.style.cssText = 'border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 12px; overflow: hidden; transition: box-shadow 0.2s;';
			
			// 创建始终显示的header部分
			const headerDiv = document.createElement('div');
			headerDiv.className = 'mcp-server-header';
			headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; cursor: pointer; user-select: none; transition: background-color 0.2s;';
			
			// 添加鼠标悬停效果
			headerDiv.onmouseenter = () => {
				headerDiv.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
			};
			headerDiv.onmouseleave = () => {
				headerDiv.style.backgroundColor = 'transparent';
			};
			
			// 左侧：展开图标 + 服务器名称
			const titleSection = document.createElement('div');
			titleSection.style.cssText = 'display: flex; align-items: center; gap: 8px;';
			
			// 展开/折叠图标 - 使用绿色高亮
			const expandIcon = document.createElement('span');
			expandIcon.className = 'mcp-expand-icon';
			expandIcon.style.cssText = 'display: inline-block; width: 12px; transition: transform 0.2s; font-size: 10px; color: var(--vscode-charts-green);';
			expandIcon.textContent = '▶';
			
			// 服务器名称（动态更新）
			const serverNameDisplay = document.createElement('span');
			serverNameDisplay.className = 'mcp-server-name-display';
			serverNameDisplay.style.cssText = 'font-size: 13px; font-weight: 500;';
			serverNameDisplay.textContent = serverConfig?.name || 'MCP Server';
			
			titleSection.appendChild(expandIcon);
			titleSection.appendChild(serverNameDisplay);
			
			// 右侧：操作按钮
			const buttonsDiv = document.createElement('div');
			buttonsDiv.style.cssText = 'display: flex; gap: 4px;';
			
			const viewToolsBtn = document.createElement('button');
			viewToolsBtn.className = 'btn outlined';
			viewToolsBtn.style.cssText = 'font-size: 11px; padding: 3px 8px; min-height: 22px;';
			viewToolsBtn.textContent = 'View Tools';
			viewToolsBtn.onclick = (e) => {
				e.stopPropagation(); // 防止触发header的点击事件
				toggleMcpTools(serverId);
			};
			
			const removeBtn = document.createElement('button');
			removeBtn.className = 'btn outlined';
			removeBtn.style.cssText = 'font-size: 11px; padding: 3px 8px; min-height: 22px;';
			removeBtn.textContent = 'Remove';
			removeBtn.onclick = (e) => {
				e.stopPropagation(); // 防止触发header的点击事件
				removeMcpServer(serverId);
			};
			
			buttonsDiv.appendChild(viewToolsBtn);
			buttonsDiv.appendChild(removeBtn);
			
			headerDiv.appendChild(titleSection);
			headerDiv.appendChild(buttonsDiv);
			
			// 创建可折叠的详情部分
			const detailsDiv = document.createElement('div');
			detailsDiv.className = 'mcp-server-details';
			detailsDiv.style.cssText = 'max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out;';
			
			const detailsContent = document.createElement('div');
			detailsContent.style.cssText = 'padding: 0 12px 12px 12px;';
			
			const fieldsDiv = document.createElement('div');
			fieldsDiv.style.cssText = 'display: grid; gap: 8px;';
			
			// Name field
			const nameDiv = createField('Name', 'mcp-server-name', 'my-server', serverConfig?.name || '');
			// 监听名称变化，更新header显示
			const nameInput = nameDiv.querySelector('input');
			nameInput.oninput = () => {
				serverNameDisplay.textContent = nameInput.value || 'MCP Server';
			};
			
			// Command field
			const commandDiv = createField('Command', 'mcp-server-command', 'npx -y @modelcontextprotocol/server-sqlite', serverConfig?.command || '');
			// Args field
			const argsDiv = createField('Arguments (optional)', 'mcp-server-args', '--db path/to/database.db', serverConfig?.args?.join(' ') || '');
			// Env field
			const envDiv = createField('Environment Variables (optional)', 'mcp-server-env', '{"API_KEY": "xxx"} or API_KEY=xxx,OTHER=yyy', serverConfig?.env ? JSON.stringify(serverConfig.env) : '');
			
			fieldsDiv.appendChild(nameDiv);
			fieldsDiv.appendChild(commandDiv);
			fieldsDiv.appendChild(argsDiv);
			fieldsDiv.appendChild(envDiv);
			
			detailsContent.appendChild(fieldsDiv);
			
			// Tools section (作为details的一部分)
			const toolsSection = document.createElement('div');
			toolsSection.id = \`tools-\${serverId}\`;
			toolsSection.style.cssText = 'display: none; margin-top: 12px; padding: 12px; background: var(--vscode-editor-background); border-radius: 4px;';
			toolsSection.innerHTML = '<p style="text-align: center; color: var(--vscode-descriptionForeground);">Loading tools...</p>';
			
			detailsContent.appendChild(toolsSection);
			detailsDiv.appendChild(detailsContent);
			
			// 点击header切换展开/折叠
			headerDiv.onclick = (e) => {
				// 如果点击的是按钮，不处理
				if (e.target instanceof HTMLButtonElement) return;
				
				const isExpanded = mcpServerExpandStates.get(serverId);
				mcpServerExpandStates.set(serverId, !isExpanded);
				
				if (!isExpanded) {
					// 展开
					expandIcon.style.transform = 'rotate(90deg)';
					detailsDiv.style.maxHeight = detailsContent.scrollHeight + 'px';
					serverDiv.style.boxShadow = '0 0 0 1px var(--vscode-focusBorder)';
				} else {
					// 折叠
					expandIcon.style.transform = 'rotate(0deg)';
					detailsDiv.style.maxHeight = '0';
					serverDiv.style.boxShadow = 'none';
					// 如果工具列表是展开的，也要隐藏
					if (toolsSection.style.display !== 'none') {
						toolsSection.style.display = 'none';
						viewToolsBtn.textContent = 'View Tools';
					}
				}
			};
			
			// 支持键盘操作
			headerDiv.setAttribute('tabindex', '0');
			headerDiv.onkeydown = (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					headerDiv.click();
				}
			};
			
			serverDiv.appendChild(headerDiv);
			serverDiv.appendChild(detailsDiv);
			serversList.appendChild(serverDiv);
			
			function createField(label, className, placeholder, value) {
				const div = document.createElement('div');
				
				const labelEl = document.createElement('label');
				labelEl.style.cssText = 'display: block; margin-bottom: 4px; font-size: 11px; color: var(--vscode-descriptionForeground);';
				labelEl.textContent = label;
				
				const input = document.createElement('input');
				input.type = 'text';
				input.className = className + ' file-search-input';
				input.style.cssText = 'width: 100%; box-sizing: border-box;';
				input.placeholder = placeholder;
				input.value = value;
				input.onchange = updateSettings;
				
				div.appendChild(labelEl);
				div.appendChild(input);
				
				return div;
			}
		}

		// ===== HTTP/SSE MCP Server Functions =====
		function addHttpMcpServer(serverConfig = null) {
			mcpServerCount++;
			const serverId = 'mcp-server-' + mcpServerCount;
			const serversList = document.getElementById('mcpServersList');

			// Initialize to collapsed state
			mcpServerExpandStates.set(serverId, false);

			const serverDiv = document.createElement('div');
			serverDiv.className = 'mcp-server-item http-server';
			serverDiv.id = serverId;
			serverDiv.setAttribute('data-server-type', serverConfig?.type || 'http');
			serverDiv.style.cssText = 'border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 12px; overflow: hidden; transition: box-shadow 0.2s;';

			// Create always-visible header section
			const headerDiv = document.createElement('div');
			headerDiv.className = 'mcp-server-header';
			headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; cursor: pointer; user-select: none; transition: background-color 0.2s;';

			// Add mouse hover effect
			headerDiv.onmouseenter = () => {
				headerDiv.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
			};
			headerDiv.onmouseleave = () => {
				headerDiv.style.backgroundColor = 'transparent';
			};

			// Left side: expand icon + server name
			const titleSection = document.createElement('div');
			titleSection.style.cssText = 'display: flex; align-items: center; gap: 8px;';

			// Expand/collapse icon
			const expandIcon = document.createElement('span');
			expandIcon.className = 'mcp-expand-icon';
			expandIcon.style.cssText = 'display: inline-block; width: 12px; transition: transform 0.2s; font-size: 10px; color: var(--vscode-charts-green);';
			expandIcon.textContent = '▶';

			// Server name (dynamic update) - removed typeIcon
			const serverNameDisplay = document.createElement('span');
			serverNameDisplay.className = 'mcp-server-name-display';
			serverNameDisplay.style.cssText = 'font-size: 13px; font-weight: 500;';
			serverNameDisplay.textContent = serverConfig?.name || 'my-http-server';

			titleSection.appendChild(expandIcon);
			titleSection.appendChild(serverNameDisplay);

			// 右侧：操作按钮
			const buttonsDiv = document.createElement('div');
			buttonsDiv.style.cssText = 'display: flex; gap: 4px;';

			const viewToolsBtn = document.createElement('button');
			viewToolsBtn.className = 'btn outlined';
			viewToolsBtn.style.cssText = 'font-size: 11px; padding: 3px 8px; min-height: 22px;';
			viewToolsBtn.textContent = 'View Tools';
			viewToolsBtn.onclick = (e) => {
				e.stopPropagation();
				toggleMcpTools(serverId);
			};

			const removeBtn = document.createElement('button');
			removeBtn.className = 'btn outlined';
			removeBtn.style.cssText = 'font-size: 11px; padding: 3px 8px; min-height: 22px;';
			removeBtn.textContent = 'Remove';
			removeBtn.onclick = (e) => {
				e.stopPropagation();
				removeMcpServer(serverId);
			};

			buttonsDiv.appendChild(viewToolsBtn);
			buttonsDiv.appendChild(removeBtn);

			headerDiv.appendChild(titleSection);
			headerDiv.appendChild(buttonsDiv);

			// 创建可折叠的详情部分
			const detailsDiv = document.createElement('div');
			detailsDiv.className = 'mcp-server-details';
			detailsDiv.style.cssText = 'max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out;';

			const detailsContent = document.createElement('div');
			detailsContent.style.cssText = 'padding: 0 12px 12px 12px;';

			const fieldsDiv = document.createElement('div');
			fieldsDiv.style.cssText = 'display: grid; gap: 8px;';

			// Name field
			const nameDiv = createHttpField('Name', 'mcp-server-name', 'my-http-server', serverConfig?.name || '');
			const nameInput = nameDiv.querySelector('input');
			nameInput.oninput = () => {
				serverNameDisplay.textContent = nameInput.value || 'my-http-server';
			};

			// Transport Type field
			const typeDiv = createHttpTypeField(serverConfig?.type || 'http');

			// URL field
			const urlDiv = createHttpField('Server URL', 'mcp-server-url', 'http://example.com:3000/mcp', serverConfig?.url || '');

			fieldsDiv.appendChild(nameDiv);
			fieldsDiv.appendChild(typeDiv);
			fieldsDiv.appendChild(urlDiv);

			// Headers section
			const headersSection = document.createElement('div');
			headersSection.className = 'headers-section';
			headersSection.style.cssText = 'margin-top: 8px;';

			const headersLabel = document.createElement('label');
			headersLabel.style.cssText = 'display: block; margin-bottom: 4px; font-size: 11px; color: var(--vscode-descriptionForeground);';
			headersLabel.textContent = 'HTTP Headers (Optional)';

			const headersContainer = document.createElement('div');
			headersContainer.className = 'headers-container';
			headersContainer.style.cssText = 'display: grid; gap: 4px;';

			// If saved headers exist, render them
			if (serverConfig?.headers) {
				Object.entries(serverConfig.headers).forEach(([key, value]) => {
					addHeaderRow(headersContainer, key, value);
				});
			}

			const addHeaderBtn = document.createElement('button');
			addHeaderBtn.className = 'btn outlined';
			addHeaderBtn.style.cssText = 'font-size: 11px; padding: 4px 8px; margin-top: 4px;';
			addHeaderBtn.textContent = '+ Add Header';
			addHeaderBtn.onclick = () => addHeaderRow(headersContainer, '', '');

			headersSection.appendChild(headersLabel);
			headersSection.appendChild(headersContainer);
			headersSection.appendChild(addHeaderBtn);

			fieldsDiv.appendChild(headersSection);

			// Security warning
			const warningDiv = document.createElement('div');
			warningDiv.style.cssText = 'margin-top: 8px; padding: 8px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); border-radius: 4px; font-size: 11px;';
			warningDiv.innerHTML = '⚠️ Warning: Sensitive information (e.g., Authorization tokens) will be saved in your local settings.json file. Please keep it secure.';

			fieldsDiv.appendChild(warningDiv);
			detailsContent.appendChild(fieldsDiv);

			// Tools section
			const toolsSection = document.createElement('div');
			toolsSection.id = \`tools-\${serverId}\`;
			toolsSection.style.cssText = 'display: none; margin-top: 12px; padding: 12px; background: var(--vscode-editor-background); border-radius: 4px;';
			toolsSection.innerHTML = '<p style="text-align: center; color: var(--vscode-descriptionForeground);">Loading tools...</p>';

			detailsContent.appendChild(toolsSection);
			detailsDiv.appendChild(detailsContent);

			// Click header to toggle expand/collapse
			headerDiv.onclick = (e) => {
				if (e.target instanceof HTMLButtonElement) return;

				const isExpanded = mcpServerExpandStates.get(serverId);
				mcpServerExpandStates.set(serverId, !isExpanded);

				if (!isExpanded) {
					expandIcon.style.transform = 'rotate(90deg)';
					detailsDiv.style.maxHeight = detailsContent.scrollHeight + 'px';
					serverDiv.style.boxShadow = '0 0 0 1px var(--vscode-focusBorder)';
				} else {
					expandIcon.style.transform = 'rotate(0deg)';
					detailsDiv.style.maxHeight = '0';
					serverDiv.style.boxShadow = 'none';
					if (toolsSection.style.display !== 'none') {
						toolsSection.style.display = 'none';
						viewToolsBtn.textContent = 'View Tools';
					}
				}
			};

			// Support keyboard operation
			headerDiv.setAttribute('tabindex', '0');
			headerDiv.onkeydown = (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					headerDiv.click();
				}
			};

			serverDiv.appendChild(headerDiv);
			serverDiv.appendChild(detailsDiv);
			serversList.appendChild(serverDiv);

			// Helper functions
			function createHttpField(label, className, placeholder, value) {
				const div = document.createElement('div');

				const labelEl = document.createElement('label');
				labelEl.style.cssText = 'display: block; margin-bottom: 4px; font-size: 11px; color: var(--vscode-descriptionForeground);';
				labelEl.textContent = label;

				const input = document.createElement('input');
				input.type = 'text';
				input.className = className + ' file-search-input';
				input.style.cssText = 'width: 100%; box-sizing: border-box;';
				input.placeholder = placeholder;
				input.value = value;
				input.onchange = updateSettings;

				div.appendChild(labelEl);
				div.appendChild(input);

				return div;
			}

			function createHttpTypeField(selectedType) {
				const div = document.createElement('div');

				const labelEl = document.createElement('label');
				labelEl.style.cssText = 'display: block; margin-bottom: 4px; font-size: 11px; color: var(--vscode-descriptionForeground);';
				labelEl.textContent = 'Transport Type';

				const radioContainer = document.createElement('div');
				radioContainer.style.cssText = 'display: flex; gap: 16px;';

				['http', 'sse'].forEach(type => {
					const radioLabel = document.createElement('label');
					radioLabel.style.cssText = 'display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer;';

					const radio = document.createElement('input');
					radio.type = 'radio';
					radio.name = 'transport-type-' + serverId;
					radio.value = type;
					radio.className = 'mcp-transport-type';
					radio.checked = type === selectedType;
					radio.onchange = () => {
						serverDiv.setAttribute('data-server-type', type);
						updateSettings();
					};

					const text = document.createElement('span');
					text.textContent = type.toUpperCase();

					radioLabel.appendChild(radio);
					radioLabel.appendChild(text);
					radioContainer.appendChild(radioLabel);
				});

				div.appendChild(labelEl);
				div.appendChild(radioContainer);

				return div;
			}

			function addHeaderRow(container, key, value) {
				const rowDiv = document.createElement('div');
				rowDiv.style.cssText = 'display: flex; gap: 4px; align-items: center;';

				const keyInput = document.createElement('input');
				keyInput.type = 'text';
				keyInput.className = 'header-key file-search-input';
				keyInput.style.cssText = 'flex: 1;';
				keyInput.placeholder = 'Header name (e.g., Authorization)';
				keyInput.value = key;
				keyInput.onchange = updateSettings;

				const valueInput = document.createElement('input');
				valueInput.type = 'text';
				valueInput.className = 'header-value file-search-input';
				valueInput.style.cssText = 'flex: 2;';
				valueInput.placeholder = 'Header value (e.g., Bearer token...)';
				valueInput.value = value;
				valueInput.onchange = updateSettings;

				const removeBtn = document.createElement('button');
				removeBtn.className = 'btn outlined';
				removeBtn.style.cssText = 'font-size: 11px; padding: 3px 6px;';
				removeBtn.textContent = '×';
				removeBtn.onclick = () => {
					rowDiv.remove();
					updateSettings();
					// Recalculate expanded area height after removing header
					updateDetailsHeight();
				};

				rowDiv.appendChild(keyInput);
				rowDiv.appendChild(valueInput);
				rowDiv.appendChild(removeBtn);
				container.appendChild(rowDiv);

				// Recalculate expanded area height after adding header
				// Use setTimeout to ensure DOM update completes
				setTimeout(() => updateDetailsHeight(), 0);

				return rowDiv;
			}

			// Helper function: update expanded area height
			function updateDetailsHeight() {
				const isExpanded = mcpServerExpandStates.get(serverId);
				if (isExpanded) {
					// Only update height when expanded
					detailsDiv.style.maxHeight = detailsContent.scrollHeight + 'px';
				}
			}
		}

		function removeMcpServer(serverId) {
			const serverEl = document.getElementById(serverId);
			if (serverEl) {
				serverEl.remove();
				updateSettings();
			}
		}
		
		function toggleMcpTools(serverId) {
			const serverEl = document.getElementById(serverId);
			if (!serverEl) return;
			
			// 首先确保详情部分是展开的
			const isExpanded = mcpServerExpandStates.get(serverId);
			if (!isExpanded) {
				// 如果服务器配置是折叠的，先展开它
				const headerDiv = serverEl.querySelector('.mcp-server-header');
				headerDiv.click();
			}
			
			const toolsSection = document.getElementById(\`tools-\${serverId}\`);
			if (!toolsSection) return;
			
			const buttons = serverEl.querySelectorAll('button');
			const viewToolsBtn = buttons[0]; // First button is View Tools
			
			if (toolsSection.style.display === 'none') {
				// Show tools
				toolsSection.style.display = 'block';
				viewToolsBtn.textContent = 'Hide Tools';
				
				// 重新计算details的高度
				const detailsDiv = serverEl.querySelector('.mcp-server-details');
				const detailsContent = detailsDiv.querySelector('div');
				detailsDiv.style.maxHeight = detailsContent.scrollHeight + 'px';
				
				// Load tools if not already loaded
				if (!toolsSection.hasAttribute('data-loaded')) {
					const nameInput = serverEl.querySelector('.mcp-server-name');
					const serverName = nameInput?.value || 'Unknown Server';
					
					vscode.postMessage({
						type: 'getMcpTools',
						serverId: serverId,
						serverName: serverName
					});
				}
			} else {
				// Hide tools
				toolsSection.style.display = 'none';
				viewToolsBtn.textContent = 'View Tools';
				
				// 重新计算details的高度
				const detailsDiv = serverEl.querySelector('.mcp-server-details');
				const detailsContent = detailsDiv.querySelector('div');
				detailsDiv.style.maxHeight = detailsContent.scrollHeight + 'px';
			}
		}
		
		
		function displayMcpTools(data) {
			// Find which server this is for (data should include serverId)
			const serverElements = document.querySelectorAll('.mcp-server-item');
			let targetServerId = null;
			
			// Find the server by name
			serverElements.forEach(serverEl => {
				const nameInput = serverEl.querySelector('.mcp-server-name');
				if (nameInput && nameInput.value === data.serverName) {
					targetServerId = serverEl.id;
				}
			});
			
			if (!targetServerId) return;
			
			const toolsSection = document.getElementById(\`tools-\${targetServerId}\`);
			if (!toolsSection) return;
			
			toolsSection.setAttribute('data-loaded', 'true');
			
			if (data.error) {
				toolsSection.innerHTML = \`
					<div style="padding: 20px; color: var(--vscode-errorForeground);">
						<p style="font-weight: 600; margin-bottom: 8px;">Failed to get tool list</p>
						<p style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 12px;">\${data.error}</p>
						\${data.command ? \`<p style="font-size: 11px; font-family: 'Cascadia Mono', monospace; color: var(--vscode-descriptionForeground);">Command: <code>\${data.command}</code></p>\` : ''}
						<p style="font-size: 11px; margin-top: 12px; color: var(--vscode-descriptionForeground);">
							Please ensure the MCP server is installed and running correctly.
						</p>
					</div>
				\`;
				updateDetailsHeight(targetServerId);
				return;
			}
			
			const tools = data.tools || [];
			
			if (tools.length === 0) {
				toolsSection.innerHTML = \`
					<div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">
						<p>This server does not provide any tools</p>
					</div>
				\`;
				updateDetailsHeight(targetServerId);
				return;
			}
			
			toolsSection.innerHTML = \`
				<div style="border-top: 1px solid var(--vscode-panel-border); padding-top: 12px;">
					<p style="font-size: 11px; color: var(--vscode-charts-green); font-family: 'Cascadia Mono', 'Courier New', monospace; margin: 0 0 8px 0;">
						Successfully connected to \${tools.length} tool(s)
					</p>
					<div style="display: grid; gap: 8px; margin-top: 8px;">
						\${tools.map(tool => \`
							<div style="padding: 8px; background: var(--vscode-editor-background); border-radius: 4px;">
								<div style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">\${tool.name}</div>
								<div style="font-size: 11px; color: var(--vscode-descriptionForeground);">\${tool.description || 'No description available'}</div>
							</div>
						\`).join('')}
					</div>
				</div>
			\`;
			
			// 更新详情容器的高度
			updateDetailsHeight(targetServerId);
		}
		
		// 辅助函数：更新详情容器高度
		function updateDetailsHeight(serverId) {
			const serverEl = document.getElementById(serverId);
			if (!serverEl) return;
			
			const detailsDiv = serverEl.querySelector('.mcp-server-details');
			const detailsContent = detailsDiv.querySelector('div');
			if (detailsDiv && detailsContent) {
				// 使用setTimeout确保DOM已更新
				setTimeout(() => {
					detailsDiv.style.maxHeight = detailsContent.scrollHeight + 'px';
				}, 10);
			}
		}
		
		function addMcpFromTemplate() {
			const templateSelector = document.getElementById('mcpTemplateSelector');
			const templateValue = templateSelector.value;
			
			console.log('Template selected:', templateValue);
			
			if (!templateValue) return;
			
			const templates = {
				'sequential-thinking': {
					name: 'sequential-thinking',
					command: 'npx',
					args: ['-y', '@modelcontextprotocol/server-sequential-thinking@latest'],
					env: {}
				},
				'context7': {
					name: 'context7',
					command: 'npx',
					args: ['-y', '@upstash/context7-mcp@latest'],
					env: {}
				},
				'basic-memory': {
					name: 'basic-memory',
					command: 'uvx',
					args: ['basic-memory', 'mcp'],
					env: {
						'BASIC_MEMORY_HOME': '\${HOME}/.claude/memory'
					}
				},
				'playwright': {
					name: 'playwright',
					command: 'npx',
					args: ['-y', '@executeautomation/playwright-mcp-server'],
					env: {}
				},
				'n8n': {
					name: 'n8n',
					command: 'npx',
					args: ['n8n-mcp'],
					env: {
						// 必需的基础配置
						'MCP_MODE': 'stdio',
						'LOG_LEVEL': 'error',
						'DISABLE_CONSOLE_OUTPUT': 'true',
						// 可选：用户可以配置这两个环境变量来连接他们的n8n实例
						'N8N_API_URL': '', // 例如: https://your-n8n-instance.com 或 http://localhost:5678
						'N8N_API_KEY': ''  // 你的n8n API密钥
					}
				},
				'shadcn': {
					name: 'shadcn',
					command: 'npx',
					args: ['shadcn@latest', 'mcp'],
					env: {}
				}
			};
			
			const template = templates[templateValue];
			if (template) {
				console.log('Adding MCP server with template:', template);
				addMcpServer(template);
				// Reset selector
				templateSelector.value = '';
				// Trigger settings update after a delay
				setTimeout(() => {
					updateSettings();
					// Scroll to the new server
					const serversList = document.getElementById('mcpServersList');
					if (serversList && serversList.lastElementChild) {
						serversList.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
					}
					// Update MCP status to show configured
					updateMcpStatus({ 
						status: 'configured', 
						message: 'Server added. Click "Test Connection" to verify.' 
					});
				}, 100);
			}
		}

		function toggleApiOptions() {
			const useCustomAPI = document.getElementById('api-useCustomAPI').checked;
			document.getElementById('apiOptions').style.display = useCustomAPI ? 'block' : 'none';
			updateSettings();
		}

		function updateSettings() {
			console.log('updateSettings called');
			// Note: thinking intensity is now handled separately in the thinking intensity modal
			
			// Handle MCP settings
			const mcpEnabledCheckbox = document.getElementById('mcp-enabled');
			console.log('MCP checkbox element:', mcpEnabledCheckbox);
			
			if (mcpEnabledCheckbox) {
				const mcpEnabled = mcpEnabledCheckbox.checked;
				console.log('MCP enabled state:', mcpEnabled);
				
				// Update MCP options visibility
				const mcpOptions = document.getElementById('mcpOptions');
				console.log('MCP options element:', mcpOptions);
				
				if (mcpOptions) {
					mcpOptions.style.display = mcpEnabled ? 'block' : 'none';
					console.log('MCP options display set to:', mcpOptions.style.display);
				}
			}

			// Collect MCP servers configuration
			const mcpServers = [];
			const serverElements = document.querySelectorAll('.mcp-server-item');
			console.log('Found server elements:', serverElements.length);
			serverElements.forEach((serverEl) => {
				const serverType = serverEl.getAttribute('data-server-type');
				const nameInput = serverEl.querySelector('input.mcp-server-name');

				if (!nameInput || !nameInput.value) {
					console.log('Missing name input, skipping server');
					return;
				}

				const name = nameInput.value;

				// ===== HTTP/SSE mode =====
				if (serverType === 'http' || serverType === 'sse') {
					const urlInput = serverEl.querySelector('input.mcp-server-url');

					if (!urlInput || !urlInput.value) {
						console.log('HTTP/SSE server missing URL, skipping');
						return;
					}

					const server = {
						name: name,
						type: serverType,
						url: urlInput.value
					};

					// Collect headers
					const headerRows = serverEl.querySelectorAll('.headers-container > div');
					if (headerRows.length > 0) {
						const headers = {};
						headerRows.forEach(row => {
							const keyInput = row.querySelector('.header-key');
							const valueInput = row.querySelector('.header-value');
							if (keyInput && valueInput && keyInput.value && valueInput.value) {
								headers[keyInput.value] = valueInput.value;
							}
						});
						if (Object.keys(headers).length > 0) {
							server.headers = headers;
						}
					}

					mcpServers.push(server);
					console.log('Added HTTP/SSE server:', server);
				}
				// ===== stdio mode (original logic) =====
				else {
					const commandInput = serverEl.querySelector('input.mcp-server-command');
					const argsInput = serverEl.querySelector('input.mcp-server-args');
					const envInput = serverEl.querySelector('input.mcp-server-env');

					console.log('Server inputs found:', { nameInput, commandInput, argsInput, envInput });

					if (!commandInput) {
						console.log('Missing required command input, skipping server');
						return;
					}

					const command = commandInput.value;
					const args = argsInput ? argsInput.value : '';
					const env = envInput ? envInput.value : '';

					if (name && command) {
						const server = { name, command };
						if (args) server.args = args.split(' ').filter(arg => arg.trim());
						if (env) {
							try {
								server.env = JSON.parse(env);
							} catch (e) {
								// If JSON parsing fails, try key=value format
								server.env = {};
								env.split(',').forEach(pair => {
									const [key, value] = pair.split('=').map(s => s.trim());
									if (key && value) server.env[key] = value;
								});
							}
						}
						mcpServers.push(server);
						console.log('Added stdio server:', server);
					}
				}
			});

			// Collect API configuration
			const useCustomAPI = document.getElementById('api-useCustomAPI').checked;
			const apiKey = document.getElementById('api-key').value;
			const apiBaseUrl = document.getElementById('api-baseUrl').value;

			// Send settings to VS Code immediately
			console.log('Updating settings with MCP servers:', mcpServers);
			console.log('Updating API settings:', { useCustomAPI, hasKey: !!apiKey, baseUrl: apiBaseUrl });
			
			// Only send MCP settings since WSL elements don't exist in the UI
			if (mcpEnabledCheckbox) {
				vscode.postMessage({
					type: 'updateSettings',
					settings: {
						'mcp.enabled': mcpEnabledCheckbox.checked,
						'mcp.servers': mcpServers,
						'api.useCustomAPI': useCustomAPI,
						'api.key': apiKey,
						'api.baseUrl': apiBaseUrl
					}
				});
			}
		}


		// Close settings modal when clicking outside
		document.getElementById('settingsModal').addEventListener('click', (e) => {
			if (e.target === document.getElementById('settingsModal')) {
				hideSettingsModal();
			}
		});

		// Close thinking intensity modal when clicking outside
		document.getElementById('thinkingIntensityModal').addEventListener('click', (e) => {
			if (e.target === document.getElementById('thinkingIntensityModal')) {
				hideThinkingIntensityModal();
			}
		});

		// Close language modal when clicking outside
		document.getElementById('languageModal').addEventListener('click', (e) => {
			if (e.target === document.getElementById('languageModal')) {
				hideLanguageModal();
			}
		});

		// Close slash commands modal when clicking outside
		document.getElementById('slashCommandsModal').addEventListener('click', (e) => {
			if (e.target === document.getElementById('slashCommandsModal')) {
				hideSlashCommandsModal();
			}
		});

		// Add settings message handler to window message event
		const originalMessageHandler = window.onmessage;
		window.addEventListener('message', event => {
			const message = event.data;
			
			if (message.type === 'settingsData') {
				// Update UI with current settings
				const thinkingIntensity = message.data['thinking.intensity'] || 'think';
				const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'sequential-thinking'];
				const sliderValue = intensityValues.indexOf(thinkingIntensity);
				
				// Update thinking intensity modal if it exists
				const thinkingIntensitySlider = document.getElementById('thinkingIntensitySlider');
				if (thinkingIntensitySlider) {
					thinkingIntensitySlider.value = sliderValue >= 0 ? sliderValue : 0;
					updateThinkingIntensityDisplay(thinkingIntensitySlider.value);
				} else {
					// Update toggle name even if modal isn't open
					updateThinkingModeToggleName(sliderValue >= 0 ? sliderValue : 0);
				}
				
				// Update language mode settings
				const savedLanguageMode = message.data['language.enabled'] || false;
				const savedLanguage = message.data['language.selected'] || null;
				
				// Only update if the current state doesn't match the saved state
				if (savedLanguageMode && savedLanguage && !languageModeEnabled) {
					languageModeEnabled = true;
					selectedLanguage = savedLanguage;
					
					// Update UI
					const switchElement = document.getElementById('languageModeSwitch');
					if (switchElement && !switchElement.classList.contains('active')) {
						switchElement.classList.add('active');
					}
					
					const toggleLabel = document.getElementById('languageModeLabel');
					const languageNames = {
						'zh': '中文',
						'es': 'Español',
						'ar': 'العربية',
						'fr': 'Français',
						'de': 'Deutsch',
						'ja': '日本語',
						'ko': '한국어'
					};
					
					if (toggleLabel && languageNames[savedLanguage]) {
						toggleLabel.textContent = languageNames[savedLanguage];
					}
					
					// Check the radio button in modal if open
					const radioElement = document.getElementById('language-' + savedLanguage);
					if (radioElement) {
						radioElement.checked = true;
					}
				}
				
				// Skip WSL settings as those elements don't exist in the UI
				
				// Load MCP settings
				const mcpEnabledCheckbox = document.getElementById('mcp-enabled');
				const mcpOptionsDiv = document.getElementById('mcpOptions');
				
				if (mcpEnabledCheckbox) {
					mcpEnabledCheckbox.checked = message.data['mcp.enabled'] || false;
				}
				
				if (mcpOptionsDiv) {
					mcpOptionsDiv.style.display = message.data['mcp.enabled'] ? 'block' : 'none';
				}
				
				// Load MCP servers
				const mcpServers = message.data['mcp.servers'] || [];
				const serversList = document.getElementById('mcpServersList');
				serversList.innerHTML = ''; // Clear existing servers
				mcpServerCount = 0; // Reset counter
				mcpServerExpandStates.clear(); // Clear expansion states

				mcpServers.forEach(server => {
					// 根据服务器类型调用不同的函数
					if (server.type === 'http' || server.type === 'sse') {
						addHttpMcpServer(server);
					} else {
						addMcpServer(server);
					}
				});
				
				// Load API configuration
				document.getElementById('api-useCustomAPI').checked = message.data['api.useCustomAPI'] || false;
				document.getElementById('api-key').value = message.data['api.key'] || '';
				document.getElementById('api-baseUrl').value = message.data['api.baseUrl'] || 'https://api.anthropic.com';
				document.getElementById('apiOptions').style.display = message.data['api.useCustomAPI'] ? 'block' : 'none';
			}

			if (message.type === 'platformInfo') {
				// Check if user is on Windows and show WSL alert if not dismissed and WSL not already enabled
				if (message.data.isWindows && !message.data.wslAlertDismissed && !message.data.wslEnabled) {
					// Small delay to ensure UI is ready
					setTimeout(() => {
						showWSLAlert();
					}, 1000);
				}
			}
		});

		// Auto resize textarea
		const textarea = document.getElementById('messageInput');
		textarea.addEventListener('input', () => {
			adjustTextareaHeight();
		});

		// Expose functions to global scope for HTML onclick handlers
		window.updateSettings = updateSettings;
		window.addMcpServer = addMcpServer;
		window.testMcpConnection = testMcpConnection;
		window.addMcpFromTemplate = addMcpFromTemplate;
		window.showCustomCommandsModal = showCustomCommandsModal;
		window.hideCustomCommandsModal = hideCustomCommandsModal;
		window.saveCustomCommand = saveCustomCommand;
		window.clearCommandForm = clearCommandForm;
		window.editCustomCommand = editCustomCommand;
		window.deleteCustomCommand = deleteCustomCommand;
		window.executeCustomCommand = executeCustomCommand;
		window.executeSlashCommand = executeSlashCommand;

		// 验证自定义命令函数是否正确挂载
		console.log('[UI初始化] 自定义命令函数挂载状态:');
		console.log('  - editCustomCommand:', typeof window.editCustomCommand);
		console.log('  - deleteCustomCommand:', typeof window.deleteCustomCommand);
		console.log('  - executeCustomCommand:', typeof window.executeCustomCommand);
		window.hideModelModal = hideModelModal;
		window.hideSettingsModal = hideSettingsModal;
		window.hideSlashCommandsModal = hideSlashCommandsModal;
		window.hideThinkingIntensityModal = hideThinkingIntensityModal;
		window.hideLanguageModal = hideLanguageModal;
		window.showLanguageModal = showLanguageModal;
		window.selectLanguage = selectLanguage;
		window.hideToolsModal = hideToolsModal;
		window.newSession = newSession;
		window.compactConversation = compactConversation;
		window.selectImage = selectImage;
		window.selectModel = selectModel;
		window.sendMessage = sendMessage;
		window.setThinkingIntensityValue = setThinkingIntensityValue;
		window.showFilePicker = showFilePicker;
		window.showModelSelector = showModelSelector;
		window.showToolsModal = showToolsModal;
		window.showPluginsModal = showPluginsModal;
		window.stopRequest = stopRequest;
		window.switchStatsTab = switchStatsTab;
		window.toggleSettings = toggleSettings;
		window.toggleStats = toggleStats;
		window.toggleConversationHistory = toggleConversationHistory;
		window.toggleApiOptions = toggleApiOptions;
		// Operation History Functions
		let currentOperations = [];

		function toggleOperationHistory() {
			const historyPanel = document.getElementById('operationHistoryPanel');
			const chatContainer = document.getElementById('chatContainer');
			
			if (historyPanel.style.display === 'none') {
				// Show operation history panel
				historyPanel.style.display = 'block';
				chatContainer.style.display = 'none';
				
				// Request operation history from extension
				vscode.postMessage({
					type: 'getOperationHistory'
				});
			} else {
				// Hide operation history panel
				historyPanel.style.display = 'none';
				chatContainer.style.display = 'flex';
			}
		}

		function updateOperationHistoryDisplay() {
			// Convert currentOperations to the format expected by renderOperationHistory
			const activeOps = currentOperations.filter(op => !op.undone);
			const undoneOps = currentOperations.filter(op => op.undone);
			
			renderOperationHistory({
				active: activeOps,
				undone: undoneOps
			});
		}

		function renderOperationHistory(data) {
			const historyContent = document.getElementById('operationHistoryContent');
			const activeCountEl = document.getElementById('activeOperationsCount');
			const undoneCountEl = document.getElementById('undoneOperationsCount');
			
			// Sort operations by timestamp (newest first)
			const sortByTimestamp = (a, b) => {
				const timeA = new Date(a.timestamp).getTime();
				const timeB = new Date(b.timestamp).getTime();
				return timeB - timeA; // Descending order (newest first)
			};
			
			const activeOps = (data.active || []).sort(sortByTimestamp);
			const undoneOps = (data.undone || []).sort(sortByTimestamp);
			const allOps = [...activeOps, ...undoneOps];
			
			// Update stats
			if (activeCountEl) activeCountEl.textContent = activeOps.length;
			if (undoneCountEl) undoneCountEl.textContent = undoneOps.length;
			
			if (!historyContent) return;
			
			if (allOps.length === 0) {
				historyContent.innerHTML = \`
					<div class="operation-empty-state" style="text-align: center; padding: 40px 20px;">
						<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
							<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
						</svg>
						<p style="font-size: 14px; margin: 12px 0 4px 0; color: var(--vscode-foreground);">No Operation History</p>
						<span style="font-size: 12px; color: var(--vscode-descriptionForeground);">Operations will appear here when you perform file actions</span>
					</div>
				\`;
				return;
			}
			
			// Use two-column layout
			let html = '<div class="operation-history-list" style="display: flex; gap: 16px; height: 100%;">';
			
			// Left column - Active operations
			html += '<div class="operation-column" style="flex: 1; overflow-y: auto; max-height: 100%;">';
			html += '<h4 style="font-size: 13px; margin: 0 0 12px 0; color: var(--vscode-foreground); position: sticky; top: 0; background: var(--vscode-editor-background); padding: 8px 0; z-index: 10;">Active Operations (' + activeOps.length + ')</h4>';
			html += '<div class="operation-cards">';
			
			if (activeOps.length > 0) {
				activeOps.forEach((op, index) => {
					html += renderOperationCard(op, index, false);
				});
			} else {
				html += '<div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground); font-size: 12px;">No active operations</div>';
			}
			
			html += '</div></div>';
			
			// Right column - Undone operations
			html += '<div class="operation-column" style="flex: 1; overflow-y: auto; max-height: 100%; border-left: 1px solid var(--vscode-panel-border); padding-left: 16px;">';
			html += '<h4 style="font-size: 13px; margin: 0 0 12px 0; color: var(--vscode-foreground); position: sticky; top: 0; background: var(--vscode-editor-background); padding: 8px 0; z-index: 10;">Undone Operations (' + undoneOps.length + ')</h4>';
			html += '<div class="operation-cards">';
			
			if (undoneOps.length > 0) {
				undoneOps.forEach((op, index) => {
					html += renderOperationCard(op, index, true);
				});
			} else {
				html += '<div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground); font-size: 12px;">No undone operations</div>';
			}
			
			html += '</div></div>';
			
			html += '</div>';
			historyContent.innerHTML = html;
		}

		function renderOperationCard(op, index, isUndone) {
			// Format timestamp with date and time
			const date = new Date(op.timestamp);
			const dateStr = date.toLocaleDateString();
			const timeStr = date.toLocaleTimeString();
			const timestamp = dateStr + ' ' + timeStr;
			
			// 获取操作状态
			const status = op.status || (isUndone ? 'undone' : 'active');
			const statusIcon = getStatusIcon(status);
			const statusColor = getStatusColor(status);
			const statusLabel = getStatusLabel(status);
			
			return \`
				<div class="operation-card \${isUndone ? 'undone' : ''}" style="background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-left: 3px solid \${statusColor}; border-radius: 4px; padding: 12px; margin-bottom: 8px;">
					<div class="operation-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
						<div class="operation-info" style="display: flex; align-items: center; gap: 8px;">
							<span class="operation-status-icon" title="\${statusLabel}" style="font-size: 14px;">\${statusIcon}</span>
							<span class="operation-icon">\${getOperationIcon(op.type || op.toolName)}</span>
							<span class="operation-name" style="font-weight: 500;">\${getOperationLabel(op.type || op.toolName)}</span>
							<span class="operation-id" style="color: var(--vscode-descriptionForeground); font-size: 11px;">#\${op.id}</span>
							\${status === 'failed' && op.error ? \`<span class="error-indicator" title="\${op.error}" style="color: #F44336; font-size: 12px;">⚠️</span>\` : ''}
						</div>
						<div class="operation-timestamp" style="font-size: 11px; color: var(--vscode-descriptionForeground);">\${timestamp}</div>
					</div>
					<div class="operation-card-body" style="margin-bottom: 8px;">
						\${renderOperationDetails(op)}
					</div>
					<div class="operation-card-footer" style="display: flex; gap: 8px;">
						<button class="operation-action-btn" onclick="previewOperation('\${op.id}', '\${isUndone ? 'redo' : 'undo'}')" style="padding: 4px 12px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px;">
							<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
								<path d="M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm0-5c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
							</svg>
							Preview
						</button>
						\${isUndone ? 
							\`<button class="operation-action-btn redo" onclick="redoOperation('\${op.id}')" style="padding: 4px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px;">
								<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
									<path d="M12.5 8c0 2.5-2 4.5-4.5 4.5S3.5 10.5 3.5 8 5.5 3.5 8 3.5c1.3 0 2.5.6 3.3 1.5L9 7h4V3l-1.4 1.4C10.5 3 9.3 2.2 8 2.2c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6h-1.5z"/>
								</svg>
								Redo
							</button>\` : 
							\`<button class="operation-action-btn undo" onclick="undoOperation('\${op.id}')" style="padding: 4px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px;">
								<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
									<path d="M3.5 8c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5-2 4.5-4.5 4.5c-1.3 0-2.5-.6-3.3-1.5L7 9H3v4l1.4-1.4c1.1 1.4 2.8 2.2 4.6 2.2 3.3 0 6-2.7 6-6s-2.7-6-6-6-6 2.7-6 6h1.5z"/>
								</svg>
								Undo
							</button>\`
						}
					</div>
				</div>
			\`;
		}

		// 状态图标和颜色函数
		function getStatusIcon(status) {
			const iconMap = {
				'active': '✅',
				'undone': '↩️',
				'failed': '❌',
				'partial': '⚠️',
				'pending': '⏳'
			};
			return iconMap[status] || '❓';
		}
		
		function getStatusColor(status) {
			const colorMap = {
				'active': '#4CAF50',
				'undone': '#9E9E9E',
				'failed': '#F44336',
				'partial': '#FF9800',
				'pending': '#2196F3'
			};
			return colorMap[status] || '#757575';
		}
		
		function getStatusLabel(status) {
			const labelMap = {
				'active': '活跃',
				'undone': '已撤销',
				'failed': '失败',
				'partial': '部分成功',
				'pending': '等待中'
			};
			return labelMap[status] || '未知';
		}

		function getOperationIcon(type) {
			// Handle both old type format and new toolName format
			const iconMap = {
				'file_create': '📄',
				'file_edit': '✏️',
				'file_delete': '🗑️',
				'file_rename': '📝',
				'directory_create': '📁',
				'directory_delete': '📁',
				'bash_command': '⚡',
				'multi_edit': '📝',
				// New toolName format
				'Write': '📄',
				'Edit': '✏️',
				'MultiEdit': '📝',
				'Read': '👀',
				'Bash': '⚡'
			};
			return iconMap[type] || '📄';
		}

		function getOperationLabel(type) {
			// Handle both old type format and new toolName format
			const labelMap = {
				'file_create': 'Create File',
				'file_edit': 'Edit File',
				'file_delete': 'Delete File',
				'file_rename': 'Rename File',
				'directory_create': 'Create Directory',
				'directory_delete': 'Delete Directory',
				'bash_command': 'Bash Command',
				'multi_edit': 'Multi Edit',
				// New toolName format
				'Write': 'Write File',
				'Edit': 'Edit File',
				'MultiEdit': 'Multi Edit',
				'Read': 'Read File',
				'Bash': 'Bash Command'
			};
			return labelMap[type] || type;
		}

		function renderOperationDetails(operation) {
			// Handle both old format (data) and new format (params)
			const data = operation.data || operation.params || {};
			const type = operation.type || operation.toolName;
			
			switch (type) {
				// Old format
				case 'file_create':
				case 'file_edit':
				case 'file_delete':
				case 'multi_edit':
					return data.filePath ? \`<div style="font-size: 12px; color: var(--vscode-descriptionForeground);"><strong>File:</strong> \${escapeHtml(getFileName(data.filePath))}</div>\` : '';
					
				case 'file_rename':
					return data.oldPath && data.newPath 
						? \`<div style="font-size: 12px; color: var(--vscode-descriptionForeground);"><strong>Rename:</strong> \${escapeHtml(getFileName(data.oldPath))} → \${escapeHtml(getFileName(data.newPath))}</div>\`
						: '';
						
				case 'directory_create':
				case 'directory_delete':
					return data.dirPath ? \`<div style="font-size: 12px; color: var(--vscode-descriptionForeground);"><strong>Directory:</strong> \${escapeHtml(getFileName(data.dirPath))}</div>\` : '';
					
				case 'bash_command':
					return data.command ? \`<div style="font-size: 12px; color: var(--vscode-descriptionForeground);"><strong>Command:</strong> <code>\${escapeHtml(truncateCommand(data.command))}</code></div>\` : '';
					
				// New format
				case 'Write':
					return data.file_path ? \`<div style="font-size: 12px; color: var(--vscode-descriptionForeground);"><strong>File:</strong> \${escapeHtml(data.file_path)}</div>\` : '';
					
				case 'Edit':
				case 'MultiEdit':
					let details = '';
					if (data.file_path) {
						details += \`<div style="font-size: 12px; color: var(--vscode-descriptionForeground);"><strong>File:</strong> \${escapeHtml(data.file_path)}</div>\`;
					}
					if (data.replace_all !== undefined) {
						details += \`<div style="font-size: 12px; color: var(--vscode-descriptionForeground);"><strong>Mode:</strong> \${data.replace_all ? 'Replace All' : 'Single Replace'}</div>\`;
					}
					return details;
					
				case 'Read':
					return data.file_path ? \`<div style="font-size: 12px; color: var(--vscode-descriptionForeground);"><strong>File:</strong> \${escapeHtml(data.file_path)}</div>\` : '';
					
				case 'Bash':
					return data.command ? \`<div style="font-size: 12px; color: var(--vscode-descriptionForeground);"><strong>Command:</strong> <code>\${escapeHtml(data.command)}</code></div>\` : '';
					
				default:
					return \`<div style="font-size: 12px; color: var(--vscode-descriptionForeground);"><strong>Operation:</strong> \${escapeHtml(type)}</div>\`;
			}
		}

		function getFileName(path) {
			const parts = path.split(/[\\/]/);
			return parts[parts.length - 1] || path;
		}

		function truncateCommand(command, maxLength = 50) {
			return command.length > maxLength 
				? command.substring(0, maxLength) + '...'
				: command;
		}

		function formatOperationTime(timestamp) {
			const date = new Date(timestamp);
			const now = new Date();
			const diff = now.getTime() - date.getTime();
			
			if (diff < 60000) return 'Just now';
			if (diff < 3600000) return \`\${Math.floor(diff / 60000)} minutes ago\`;
			if (diff < 86400000) return \`\${Math.floor(diff / 3600000)} hours ago\`;
			
			return date.toLocaleDateString();
		}

		function undoOperation(operationId) {
			vscode.postMessage({
				type: 'undoOperation',
				operationId: operationId
			});
		}

		function redoOperation(operationId) {
			vscode.postMessage({
				type: 'redoOperation',
				operationId: operationId
			});
		}

		function previewOperation(operationId, action) {
			vscode.postMessage({
				type: 'previewOperation',
				operationId: operationId,
				action: action
			});
		}

		function displayOperationPreview(preview) {
			// Create modal for preview
			const modal = document.createElement('div');
			modal.className = 'preview-modal';
			modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';
			
			const content = document.createElement('div');
			content.className = 'preview-content';
			content.style.cssText = 'background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); border: 1px solid var(--vscode-panel-border); border-radius: 8px; max-width: 80%; max-height: 80%; overflow: auto; padding: 20px; position: relative;';
			
			// Add preview content
			let html = '<h3 style="margin-top: 0;">🔍 Operation Preview: ' + (preview.action === 'undo' ? 'Undo' : 'Redo') + '</h3>';
			html += '<div style="margin-bottom: 20px;">';
			html += '<strong>Operation Type:</strong> ' + getOperationLabel(preview.operation.type || preview.operation.toolName) + '<br>';
			html += '<strong>Operation ID:</strong> toolu_' + preview.operation.id + '<br>';
			html += '<strong>Time:</strong> ' + new Date(preview.operation.timestamp).toLocaleString();
			html += '</div>';
			
			// Add statistics if available
			if (preview.statistics) {
				html += '<div style="background: var(--vscode-editorWidget-background); padding: 12px; border-radius: 6px; margin-bottom: 20px;">';
				html += '<h4 style="margin: 0 0 8px 0; font-size: 13px;">📊 Statistics:</h4>';
				if (preview.statistics.additions !== undefined && preview.statistics.deletions !== undefined) {
					const totalChanges = preview.statistics.additions + preview.statistics.deletions;
					const addPercent = totalChanges > 0 ? (preview.statistics.additions / totalChanges) * 100 : 0;
					const delPercent = totalChanges > 0 ? (preview.statistics.deletions / totalChanges) * 100 : 0;
					
					html += '<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">';
					html += '<span style="color: #4CAF50; font-weight: 500;">+' + preview.statistics.additions + '</span>';
					html += '<span style="color: #F44336; font-weight: 500;">-' + preview.statistics.deletions + '</span>';
					// Add statistics bar
					html += '<div style="flex: 1; height: 8px; background: #2d2d2d; border-radius: 4px; overflow: hidden; max-width: 200px;">';
					html += '<div style="display: flex; height: 100%;">';
					html += '<div style="width: ' + addPercent + '%; background: #4CAF50;"></div>';
					html += '<div style="width: ' + delPercent + '%; background: #F44336;"></div>';
					html += '</div></div></div>';
				}
				if (preview.statistics.totalLines !== undefined) {
					html += '<div style="font-size: 12px; color: var(--vscode-descriptionForeground);">';
					html += '📄 ' + preview.statistics.totalLines + ' lines';
					if (preview.statistics.fileSize) {
						html += ', ' + preview.statistics.fileSize;
					}
					if (preview.statistics.affectedLines !== undefined) {
						html += ' | 🗒 ' + preview.statistics.affectedLines + ' lines changed';
					}
					html += '</div>';
				}
				html += '</div>';
			}
			
			// Add changes section
			if (preview.changes && preview.changes.length > 0) {
				html += '<h4>Changes to be Applied:</h4>';
				html += '<div style="font-family: monospace; font-size: 12px;">';
				preview.changes.forEach(change => {
					html += '<div style="margin-bottom: 10px; padding: 10px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px;">';
					html += '<strong>' + change.type + ':</strong> ' + change.path;
					if (change.diff) {
						html += '<pre style="margin-top: 10px; overflow-x: auto;">' + escapeHtml(change.diff) + '</pre>';
					}
					html += '</div>';
				});
				html += '</div>';
			}
			
			// Add diff preview if available
			if (preview.diff) {
				html += '<h4>Diff Preview:</h4>';
				html += '<div style="background: var(--vscode-editor-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; padding: 12px; margin-bottom: 20px; font-family: monospace; font-size: 12px;">';
				
				// Diff statistics
				if (preview.diff.additions !== undefined && preview.diff.deletions !== undefined) {
					html += '<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--vscode-editorWidget-border);">';
					html += '<span style="color: #4CAF50; font-weight: 500;">+' + preview.diff.additions + ' additions</span>';
					html += '<span style="color: #F44336; font-weight: 500;">-' + preview.diff.deletions + ' deletions</span>';
					html += '</div>';
				}
				
				// Diff hunks
				if (preview.diff.hunks) {
					preview.diff.hunks.forEach(hunk => {
						html += '<div style="margin-bottom: 16px;">';
						html += '<div style="color: #00ACC1; background: rgba(0, 172, 193, 0.1); padding: 4px 8px; margin-bottom: 4px;">@@ -' + hunk.oldStart + ',' + hunk.oldLines + ' +' + hunk.newStart + ',' + hunk.newLines + ' @@</div>';
						
						hunk.lines.forEach(line => {
							const bgColor = line.type === 'add' ? 'rgba(76, 175, 80, 0.1)' : line.type === 'delete' ? 'rgba(244, 67, 54, 0.1)' : 'transparent';
							const textColor = line.type === 'add' ? '#4CAF50' : line.type === 'delete' ? '#F44336' : 'inherit';
							const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
							
							html += '<div style="background: ' + bgColor + '; color: ' + textColor + '; padding: 2px 8px;">';
							if (line.oldLineNo || line.newLineNo) {
								html += '<span style="display: inline-block; width: 40px; text-align: right; color: var(--vscode-descriptionForeground); margin-right: 8px;">' + (line.oldLineNo || '') + '</span>';
							}
							html += '<span style="margin-right: 8px;">' + prefix + '</span>';
							html += '<span>' + escapeHtml(line.content) + '</span>';
							html += '</div>';
						});
						
						html += '</div>';
					});
				}
				
				html += '</div>';
			}
			
			// Add cascading operations
			if (preview.cascadingOps && preview.cascadingOps.length > 0) {
				html += '<h4>Cascading Operations (' + preview.cascadingOps.length + '):</h4>';
				html += '<ul>';
				preview.cascadingOps.forEach(op => {
					html += '<li>' + getOperationLabel(op.type || op.toolName) + ': ' + renderOperationDetails(op).replace(/<[^>]*>/g, '') + '</li>';
				});
				html += '</ul>';
			}
			
			// Add warnings
			if (preview.warnings && preview.warnings.length > 0) {
				html += '<h4 style="color: var(--vscode-editorWarning-foreground);">Warnings:</h4>';
				html += '<ul style="color: var(--vscode-editorWarning-foreground);">';
				preview.warnings.forEach(warning => {
					html += '<li>' + warning + '</li>';
				});
				html += '</ul>';
			}
			
			// Add action buttons
			html += '<div style="margin-top: 20px; text-align: right;">';
			html += '<button onclick="document.body.removeChild(document.querySelector(\\\'.preview-modal\\\'))" style="margin-right: 10px; padding: 6px 12px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 4px; cursor: pointer;">Cancel</button>';
			html += '<button onclick="executePreviewAction(\\\'' + preview.operation.id + '\\\', \\\'' + preview.action + '\\\'); document.body.removeChild(document.querySelector(\\\'.preview-modal\\\'))" style="padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer;">Confirm ' + (preview.action === 'undo' ? 'Undo' : 'Redo') + '</button>';
			html += '</div>';
			
			content.innerHTML += html;
			modal.appendChild(content);
			document.body.appendChild(modal);
			
			// Click outside to close
			modal.onclick = (e) => {
				if (e.target === modal) {
					document.body.removeChild(modal);
				}
			};
		}
		
		function executePreviewAction(operationId, action) {
			if (action === 'undo') {
				undoOperation(operationId);
			} else {
				redoOperation(operationId);
			}
		}
		
		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		window.togglePlanMode = togglePlanMode;
		window.toggleThinkingMode = toggleThinkingMode;
		window.toggleLanguageMode = toggleLanguageMode;
		window.handleLanguageLabelClick = handleLanguageLabelClick;
		window.confirmThinkingIntensity = confirmThinkingIntensity;
		window.toggleOperationHistory = toggleOperationHistory;
		window.undoOperation = undoOperation;
		window.redoOperation = redoOperation;
		window.previewOperation = previewOperation;
		window.executePreviewAction = executePreviewAction;
		window.updateThinkingIntensityDisplay = updateThinkingIntensityDisplay;
		window.openModelTerminal = openModelTerminal;
		window.handleCustomCommandKeydown = handleCustomCommandKeydown;
		window.openFileInEditor = openFileInEditor;
		window.toggleDiffExpansion = toggleDiffExpansion;
		window.toggleResultExpansion = toggleResultExpansion;

		// File link click event handler
		document.addEventListener('click', function(e) {
			// Check if clicked element is a file link
			const target = e.target;
			if (target && target.classList && target.classList.contains('file-link')) {
				e.preventDefault();

				// Extract file information
				const filePath = target.dataset.file;
				const line = parseInt(target.dataset.line) || 1;
				const endLine = parseInt(target.dataset.endLine) || line;

				// Add click feedback effect
				target.classList.add('clicked');
				setTimeout(() => {
					target.classList.remove('clicked');
				}, 300);

				// Show loading indicator
				const originalTitle = target.title;
				target.title = 'Opening file...';

				// Send message to VS Code
				vscode.postMessage({
					type: 'openFile',
					file: filePath,
					line: line,
					endLine: endLine
				});

				// Restore original tooltip
				setTimeout(() => {
					target.title = originalTitle;
				}, 1000);

				console.log('Opening file:', filePath, 'line:', line);
			}
		});

		// 关闭modal当点击外部时
		document.getElementById('modeModal').addEventListener('click', (e) => {
			if (e.target === document.getElementById('modeModal')) {
				hideModeModal();
			}
		});

		// 恢复保存的算力模式
		const savedMode = localStorage.getItem('selectedMode') || 'auto';
		currentMode = savedMode;
		const modeDisplayNames = {
			'auto': 'Auto',
			'max': 'Max'
		};
		document.getElementById('selectedMode').textContent = modeDisplayNames[savedMode];

		// 恢复Enhance Subagents设置（独立于模式）
		const enhanceSubagents = localStorage.getItem('enhanceSubagents') === 'true';
		const enhanceCheckbox = document.getElementById('enhance-subagents');
		if (enhanceCheckbox) {
			enhanceCheckbox.checked = enhanceSubagents;
		}

		// 如果是Max模式，通知后端恢复环境变量设置（固定使用Sonnet 4.5）
		if (savedMode === 'max') {
			vscode.postMessage({
				type: 'selectMode',
				mode: 'max'
			});
		}

		// 如果子代理增强已启用，通知后端恢复（独立设置）
		if (enhanceSubagents) {
			vscode.postMessage({
				type: 'updateSubagentMode',
				enabled: true
			});
		}

	`;