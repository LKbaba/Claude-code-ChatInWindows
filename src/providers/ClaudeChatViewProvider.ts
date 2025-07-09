import * as vscode from 'vscode';

export class ClaudeChatViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	constructor(
		private extensionUri: vscode.Uri,
		private context: vscode.ExtensionContext
	) { }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): vscode.TreeItem[] {
		const items: vscode.TreeItem[] = [];

		// Get extension version
		const extension = vscode.extensions.getExtension('lkbaba.claude-code-chatui');
		const version = extension?.packageJSON?.version || '1.2.0';

		// Add version info item
		const versionItem = new vscode.TreeItem(`v${version}`, vscode.TreeItemCollapsibleState.None);
		versionItem.description = 'Claude Code Chat';
		versionItem.tooltip = `Claude Code Chat for Windows v${version}`;
		versionItem.contextValue = 'version';
		versionItem.iconPath = new vscode.ThemeIcon('info');
		items.push(versionItem);

		// Add "Open Claude Code Chat" item
		const openChatItem = new vscode.TreeItem('Open Chat', vscode.TreeItemCollapsibleState.None);
		openChatItem.command = {
			command: 'claude-code-chatui.openChat',
			title: 'Open Claude Code Chat'
		};
		openChatItem.iconPath = vscode.Uri.joinPath(this.extensionUri, 'icon.png');
		openChatItem.tooltip = 'Open Claude Code Chat (Ctrl+Shift+C)';
		items.push(openChatItem);

		// Add conversation history items
		const conversationIndex = this.context.workspaceState.get('claude.conversationIndex', []) as any[];

		if (conversationIndex.length > 0) {
			// Add separator
			const separatorItem = new vscode.TreeItem('Recent Conversations', vscode.TreeItemCollapsibleState.None);
			separatorItem.description = '';
			separatorItem.tooltip = 'Click on any conversation to load it';
			items.push(separatorItem);

			// Add conversation items (show only last 5 for cleaner UI)
			conversationIndex.slice(0, 20).forEach((conv, index) => {
				const item = new vscode.TreeItem(
					conv.firstUserMessage.substring(0, 50) + (conv.firstUserMessage.length > 50 ? '...' : ''),
					vscode.TreeItemCollapsibleState.None
				);
				item.description = new Date(conv.startTime).toLocaleDateString();
				item.tooltip = `First: ${conv.firstUserMessage}\nLast: ${conv.lastUserMessage}\nMessages: ${conv.messageCount}, Cost: $${conv.totalCost.toFixed(3)}`;
				item.command = {
					command: 'claude-code-chatui.loadConversation',
					title: 'Load Conversation',
					arguments: [conv.filename]
				};
				item.iconPath = new vscode.ThemeIcon('comment-discussion');
				items.push(item);
			});
		}

		return items;
	}
}