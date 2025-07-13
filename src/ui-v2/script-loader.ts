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
		
		// Undo/Redo history management
		let inputHistory = [''];
		let historyPosition = 0;
		let isUpdatingFromHistory = false;

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
				contentDiv.innerHTML = content;
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
				contentDiv.innerHTML = parseSimpleMarkdown(content);
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
					result += '<div class="diff-file-path" onclick="openFileInEditor(\\\'' + escapeHtml(valueStr) + '\\\')">' + formattedPath + '</div>';
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
			let result = '<div class="diff-file-path" onclick="openFileInEditor(\\\'' + escapeHtml(input.file_path) + '\\\')">' + formattedPath + '</div>\\n';
			
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
			let result = '<div class="diff-file-path" onclick="openFileInEditor(\\\'' + escapeHtml(input.file_path) + '\\\')">' + formattedPath + '</div>\\n';
			
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
			let result = '<div class="diff-file-path" onclick="openFileInEditor(\\\'' + escapeHtml(input.file_path) + '\\\')">' + formattedPath + '</div>\\n';
			
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
					thinkingMode: thinkingModeEnabled
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


		let totalCost = 0;
		let totalTokensInput = 0;
		let totalTokensOutput = 0;
		let requestCount = 0;
		let isProcessing = false;
		let requestStartTime = null;
		let requestTimer = null;
		let spinnerFrame = 0;
		const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
		
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

		function saveThinkingIntensity() {
			const thinkingSlider = document.getElementById('thinkingIntensitySlider');
			const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink'];
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
			const intensityNames = ['Thinking', 'Think Hard', 'Think Harder', 'Ultrathink'];
			const modeName = intensityNames[intensityValue] || 'Thinking';
			const toggleLabel = document.getElementById('thinkingModeLabel');
			if (toggleLabel) {
				toggleLabel.textContent = modeName + ' Mode';
			}
		}

		function updateThinkingIntensityDisplay(value) {
			// Update label highlighting for thinking intensity modal
			for (let i = 0; i < 4; i++) {
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
			// Hide the modal
			hideSlashCommandsModal();
			
			// Clear the input since user selected a command
			messageInput.value = '';
			
			// Send command to VS Code to execute in terminal
			vscode.postMessage({
				type: 'executeSlashCommand',
				command: command
			});
			
			// Show user feedback
			addMessage('user', \`Executing /\${command} command in terminal. Check the terminal output and return when ready.\`, 'assistant');
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
			if (confirm('Are you sure you want to delete this custom command?')) {
				vscode.postMessage({
					type: 'deleteCustomCommand',
					commandId: commandId
				});
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
				'sonnet': 'Sonnet',
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
			const radioButton = document.getElementById('model-' + model);
			if (radioButton) {
				radioButton.checked = true;
			}
			
			hideModelModal();
		}

		// Initialize model display without sending message
		currentModel = 'opus';
		const displayNames = {
			'opus': 'Opus',
			'sonnet': 'Sonnet',
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
						addMessage(parseSimpleMarkdown(message.data), 'claude');
						// Removed token display per user request
					}
					updateStatusWithTotals();
					break;
					
				case 'userInput':
					if (message.data.trim()) {
						addMessage(parseSimpleMarkdown(message.data), 'user');
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
								'<span class="stats-cost">' + currentCostStr + '</span>' +
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
			}

			if (message.type === 'settingsData') {
				// Update UI with current settings
				const thinkingIntensity = message.data['thinking.intensity'] || 'think';
				const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink'];
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
				
				mcpServers.forEach(server => {
					addMcpServer(server);
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
			vscode.postMessage({
				type: 'newSession'
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
				html += '<thead><tr><th>Date</th><th>Models</th><th>Input Tokens</th><th>Output Tokens</th><th>Cache Creation</th><th>Cache Read</th><th>Total Tokens</th><th>Cost</th></tr></thead>';
			} else if (currentStatsTab === 'monthly') {
				html += '<thead><tr><th>Month</th><th>Models</th><th>Input Tokens</th><th>Output Tokens</th><th>Cache Creation</th><th>Cache Read</th><th>Total Tokens</th><th>Cost</th></tr></thead>';
			} else if (currentStatsTab === 'blocks') {
				html += '<thead><tr><th>Block</th><th>Input Tokens</th><th>Output Tokens</th><th>Cache Creation</th><th>Cache Read</th><th>Total Tokens</th><th>Cost</th><th>Status</th></tr></thead>';
			} else if (currentStatsTab === 'session') {
				html += '<thead><tr><th>Project</th><th>Models</th><th>Input Tokens</th><th>Output Tokens</th><th>Cache Creation</th><th>Cache Read</th><th>Total Tokens</th><th>Cost</th><th>Last Activity</th></tr></thead>';
			}
			
			html += '<tbody>';
			
			// Add data rows
			if (data.rows && data.rows.length > 0) {
				data.rows.forEach(row => {
					html += '<tr>';
					if (currentStatsTab === 'blocks') {
						html += '<td>' + (row.block || '-') + '</td>';
						html += '<td>' + (row.inputTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.outputTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.cacheCreationTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.cacheReadTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.totalTokens || 0).toLocaleString() + '</td>';
						html += '<td>$' + (row.cost || 0).toFixed(4) + '</td>';
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
										return modelParts[3]; // claude-3-5-sonnet -> sonnet
									} else if (modelParts[1] === '3') {
										return modelParts[2]; // claude-3-opus -> opus
									} else if (modelParts[1] === 'opus' && modelParts[2] === '4') {
										return 'opus-4'; // claude-opus-4 -> opus-4
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
						html += '<td>' + (row.inputTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.outputTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.cacheCreationTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.cacheReadTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.totalTokens || 0).toLocaleString() + '</td>';
						html += '<td>$' + (row.cost || 0).toFixed(4) + '</td>';
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
										return modelParts[3]; // claude-3-5-sonnet -> sonnet
									} else if (modelParts[1] === '3') {
										return modelParts[2]; // claude-3-opus -> opus
									} else if (modelParts[1] === 'opus' && modelParts[2] === '4') {
										return 'opus-4'; // claude-opus-4 -> opus-4
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
						html += '<td>' + (row.inputTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.outputTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.cacheCreationTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.cacheReadTokens || 0).toLocaleString() + '</td>';
						html += '<td>' + (row.totalTokens || 0).toLocaleString() + '</td>';
						html += '<td>$' + (row.cost || 0).toFixed(4) + '</td>';
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
					} else if (currentStatsTab === 'session') {
						html += '<td><strong>-</strong></td>'; // Models column
					}
					
					html += '<td><strong>' + (data.totals.inputTokens || 0).toLocaleString() + '</strong></td>';
					html += '<td><strong>' + (data.totals.outputTokens || 0).toLocaleString() + '</strong></td>';
					html += '<td><strong>' + (data.totals.cacheCreationTokens || 0).toLocaleString() + '</strong></td>';
					html += '<td><strong>' + (data.totals.cacheReadTokens || 0).toLocaleString() + '</strong></td>';
					html += '<td><strong>' + (data.totals.totalTokens || 0).toLocaleString() + '</strong></td>';
					html += '<td><strong>$' + (data.totals.cost || 0).toFixed(4) + '</strong></td>';
					
					if (currentStatsTab === 'blocks') {
						html += '<td><strong>-</strong></td>'; // Status column
					} else if (currentStatsTab === 'session') {
						html += '<td><strong>-</strong></td>'; // Last Activity column
					}
					
					html += '</tr>';
				}
			} else {
				const colspanValue = currentStatsTab === 'session' ? '9' : '8';
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
		
		function addMcpServer(serverConfig = null) {
			mcpServerCount++;
			const serverId = 'mcp-server-' + mcpServerCount;
			const serversList = document.getElementById('mcpServersList');
			
			const serverDiv = document.createElement('div');
			serverDiv.className = 'mcp-server-item';
			serverDiv.id = serverId;
			serverDiv.style.cssText = 'border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; margin-bottom: 12px;';
			
			const headerDiv = document.createElement('div');
			headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
			
			const title = document.createElement('h4');
			title.style.cssText = 'margin: 0; font-size: 12px; font-weight: 600;';
			title.textContent = 'MCP Server';
			
			const buttonsDiv = document.createElement('div');
			buttonsDiv.style.cssText = 'display: flex; gap: 4px;';
			
			const viewToolsBtn = document.createElement('button');
			viewToolsBtn.className = 'btn outlined';
			viewToolsBtn.style.cssText = 'font-size: 11px; padding: 2px 6px;';
			viewToolsBtn.textContent = 'View Tools';
			viewToolsBtn.onclick = () => toggleMcpTools(serverId);
			
			const removeBtn = document.createElement('button');
			removeBtn.className = 'btn outlined';
			removeBtn.style.cssText = 'font-size: 11px; padding: 2px 6px;';
			removeBtn.textContent = 'Remove';
			removeBtn.onclick = () => removeMcpServer(serverId);
			
			buttonsDiv.appendChild(viewToolsBtn);
			buttonsDiv.appendChild(removeBtn);
			
			headerDiv.appendChild(title);
			headerDiv.appendChild(buttonsDiv);
			
			const fieldsDiv = document.createElement('div');
			fieldsDiv.style.cssText = 'display: grid; gap: 8px;';
			
			// Name field
			const nameDiv = createField('Name', 'mcp-server-name', 'my-server', serverConfig?.name || '');
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
			
			serverDiv.appendChild(headerDiv);
			serverDiv.appendChild(fieldsDiv);
			
			// Tools section (initially hidden)
			const toolsSection = document.createElement('div');
			toolsSection.id = \`tools-\${serverId}\`;
			toolsSection.style.cssText = 'display: none; margin-top: 12px; padding: 12px; background: var(--vscode-editor-background); border-radius: 4px;';
			toolsSection.innerHTML = '<p style="text-align: center; color: var(--vscode-descriptionForeground);">Loading tools...</p>';
			
			serverDiv.appendChild(toolsSection);
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
			
			const toolsSection = document.getElementById(\`tools-\${serverId}\`);
			if (!toolsSection) return;
			
			const buttons = serverEl.querySelectorAll('button');
			const viewToolsBtn = buttons[0]; // First button is View Tools
			
			if (toolsSection.style.display === 'none') {
				// Show tools
				toolsSection.style.display = 'block';
				viewToolsBtn.textContent = 'Hide Tools';
				
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
					<div style="text-align: center; padding: 20px; color: var(--vscode-errorForeground);">
						<p>Failed to get tool list</p>
						<p style="font-size: 12px; margin-top: 8px;">\${data.error}</p>
					</div>
				\`;
				return;
			}
			
			const tools = data.tools || [];
			if (tools.length === 0) {
				toolsSection.innerHTML = \`
					<div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">
						<p>This server does not provide any tools</p>
					</div>
				\`;
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
					args: ['--from', 'basic-memory', 'basic-memory', 'mcp'],
					env: {
						'BASIC_MEMORY_HOME': 'C:\\Users\\LiuKe\\.claude\\memory'
					}
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
				const nameInput = serverEl.querySelector('input.mcp-server-name');
				const commandInput = serverEl.querySelector('input.mcp-server-command');
				const argsInput = serverEl.querySelector('input.mcp-server-args');
				const envInput = serverEl.querySelector('input.mcp-server-env');
				
				console.log('Server inputs found:', { nameInput, commandInput, argsInput, envInput });
				
				if (!nameInput || !commandInput) {
					console.log('Missing required inputs, skipping server');
					return;
				}
				
				const name = nameInput.value;
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

		// Close slash commands modal when clicking outside
		document.getElementById('slashCommandsModal').addEventListener('click', (e) => {
			if (e.target === document.getElementById('slashCommandsModal')) {
				hideSlashCommandsModal();
			}
		});

		// Detect slash commands input
		messageInput.addEventListener('input', (e) => {
			const value = messageInput.value;
			// Only trigger when "/" is the very first and only character
			if (value === '/') {
				showSlashCommandsModal();
			}
		});

		// Add settings message handler to window message event
		const originalMessageHandler = window.onmessage;
		window.addEventListener('message', event => {
			const message = event.data;
			
			if (message.type === 'settingsData') {
				// Update UI with current settings
				const thinkingIntensity = message.data['thinking.intensity'] || 'think';
				const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink'];
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
				
				mcpServers.forEach(server => {
					addMcpServer(server);
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
		window.executeSlashCommand = executeSlashCommand;
		window.hideModelModal = hideModelModal;
		window.hideSettingsModal = hideSettingsModal;
		window.hideSlashCommandsModal = hideSlashCommandsModal;
		window.hideThinkingIntensityModal = hideThinkingIntensityModal;
		window.hideToolsModal = hideToolsModal;
		window.newSession = newSession;
		window.selectImage = selectImage;
		window.selectModel = selectModel;
		window.sendMessage = sendMessage;
		window.setThinkingIntensityValue = setThinkingIntensityValue;
		window.showFilePicker = showFilePicker;
		window.showModelSelector = showModelSelector;
		window.showToolsModal = showToolsModal;
		window.stopRequest = stopRequest;
		window.switchStatsTab = switchStatsTab;
		window.toggleSettings = toggleSettings;
		window.toggleStats = toggleStats;
		window.toggleConversationHistory = toggleConversationHistory;
		window.toggleApiOptions = toggleApiOptions;
		window.togglePlanMode = togglePlanMode;
		window.toggleThinkingMode = toggleThinkingMode;
		window.confirmThinkingIntensity = confirmThinkingIntensity;
		window.updateThinkingIntensityDisplay = updateThinkingIntensityDisplay;
		window.openModelTerminal = openModelTerminal;
		window.handleCustomCommandKeydown = handleCustomCommandKeydown;
		window.openFileInEditor = openFileInEditor;
		window.toggleDiffExpansion = toggleDiffExpansion;
		window.toggleResultExpansion = toggleResultExpansion;

	`;