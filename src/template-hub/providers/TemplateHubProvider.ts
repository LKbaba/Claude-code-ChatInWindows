/**
 * Template Hub Provider
 * 模板管理中心的 WebviewViewProvider 实现
 * 负责 UI 渲染和消息处理
 */

import * as vscode from 'vscode';
import {
  Template,
  TemplateCategory,
  TemplateHubMessage,
  TemplateHubResponse,
  DeployOptions,
  TemplateCreateInput,
  ProjectAnalysis,
  InitWizardResult,
  SyncToClaudeMdResult
} from '../types';
import { TemplateStorageManager } from '../services/TemplateStorageManager';
import { TemplateService } from '../services/TemplateService';
import { ProjectDetectorService } from '../services/ProjectDetectorService';
import { getTemplateHubHtml } from '../ui/templateHubHtml';

/**
 * Template Hub 的主 WebviewViewProvider
 * 负责 UI 渲染和消息处理
 */
export class TemplateHubProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'templateHub.view';

  private _view?: vscode.WebviewView;
  private _storageManager: TemplateStorageManager;
  private _templateService: TemplateService;
  private _projectDetector: ProjectDetectorService;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {
    // Initialize services
    this._storageManager = new TemplateStorageManager(_context.extensionPath);
    this._projectDetector = new ProjectDetectorService();
    this._templateService = new TemplateService(this._storageManager, this._projectDetector);
  }

  /**
   * WebviewViewProvider 接口实现
   * 当视图首次可见时调用
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // Set HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(
      async (message: TemplateHubMessage) => {
        await this._handleMessage(message);
      }
    );

    // Send initial data when view becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._sendTemplateList();
      }
    });

    // Send initial template list
    this._sendTemplateList();
  }

  /**
   * 刷新视图
   */
  public refresh(): void {
    if (this._view) {
      this._sendTemplateList();
    }
  }

  /**
   * 显示初始化向导
   */
  public async showInitWizard(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Please open a workspace folder first.');
      return;
    }

    try {
      const analysis = await this._projectDetector.analyzeProject(workspaceFolder.uri.fsPath);
      this._sendResponse({
        type: 'initWizardData',
        data: analysis
      });
    } catch (error) {
      this._sendResponse({
        type: 'error',
        message: `Failed to analyze project: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 处理来自 webview 的消息
   */
  private async _handleMessage(message: TemplateHubMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'getTemplates':
          await this._sendTemplateList();
          break;

        case 'getTemplatePreview':
          await this._sendTemplatePreview(message.templateId);
          break;

        case 'deployTemplates':
          await this._handleDeployTemplates(message.templateIds, message.options);
          break;

        case 'createTemplate':
          await this._handleCreateTemplate(message.data);
          break;

        case 'updateTemplate':
          await this._handleUpdateTemplate(message.templateId, message.data);
          break;

        case 'deleteTemplate':
          await this._handleDeleteTemplate(message.templateId);
          break;

        case 'importTemplates':
          await this._handleImportTemplates(message.source);
          break;

        case 'exportTemplates':
          await this._handleExportTemplates(message.templateIds);
          break;

        case 'runInitWizard':
          await this.showInitWizard();
          break;

        case 'wizardDeploy':
          await this._handleWizardDeploy(message.templateIds, message.quickSetup);
          break;

        case 'searchTemplates':
          await this._handleSearchTemplates(message.query);
          break;

        case 'filterTemplates':
          await this._handleFilterTemplates(message.category, message.tags);
          break;

        case 'syncToClaudeMd':
          await this._handleSyncToClaudeMd();
          break;

        default:
          console.warn('[TemplateHubProvider] Unknown message type:', (message as any).type);
      }
    } catch (error) {
      console.error('[TemplateHubProvider] Error handling message:', error);
      this._sendResponse({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 发送模板列表到 webview
   */
  private async _sendTemplateList(): Promise<void> {
    try {
      const templates = await this._storageManager.getAllTemplates();
      this._sendResponse({
        type: 'templateList',
        data: templates
      });
    } catch (error) {
      this._sendResponse({
        type: 'error',
        message: `Failed to load templates: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 发送模板预览到 webview
   */
  private async _sendTemplatePreview(templateId: string): Promise<void> {
    try {
      const template = await this._storageManager.getTemplateById(templateId);
      if (template) {
        this._sendResponse({
          type: 'templatePreview',
          data: template
        });
      } else {
        this._sendResponse({
          type: 'error',
          message: `Template not found: ${templateId}`
        });
      }
    } catch (error) {
      this._sendResponse({
        type: 'error',
        message: `Failed to load template preview: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 处理模板部署
   */
  private async _handleDeployTemplates(templateIds: string[], options: DeployOptions): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this._sendResponse({
        type: 'error',
        message: 'Please open a workspace folder first.'
      });
      return;
    }

    try {
      const result = await this._templateService.deployTemplates(
        templateIds,
        workspaceFolder.uri.fsPath,
        options
      );
      this._sendResponse({
        type: 'deployResult',
        data: result
      });

      if (result.success) {
        vscode.window.showInformationMessage(
          `Successfully deployed ${result.deployedTemplates.length} template(s).`
        );
      }
    } catch (error) {
      this._sendResponse({
        type: 'error',
        message: `Deployment failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 处理创建模板
   */
  private async _handleCreateTemplate(data: TemplateCreateInput): Promise<void> {
    try {
      const template = await this._storageManager.saveUserTemplate(data);
      this._sendResponse({
        type: 'operationResult',
        success: true,
        message: `Template "${template.name}" created successfully.`
      });
      // Refresh template list
      await this._sendTemplateList();
    } catch (error) {
      this._sendResponse({
        type: 'operationResult',
        success: false,
        message: `Failed to create template: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 处理更新模板
   */
  private async _handleUpdateTemplate(templateId: string, data: Partial<Template>): Promise<void> {
    try {
      await this._storageManager.updateUserTemplate(templateId, data);
      this._sendResponse({
        type: 'operationResult',
        success: true,
        message: 'Template updated successfully.'
      });
      // Refresh template list
      await this._sendTemplateList();
    } catch (error) {
      this._sendResponse({
        type: 'operationResult',
        success: false,
        message: `Failed to update template: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 处理删除模板
   */
  private async _handleDeleteTemplate(templateId: string): Promise<void> {
    try {
      await this._storageManager.deleteUserTemplate(templateId);
      this._sendResponse({
        type: 'operationResult',
        success: true,
        message: 'Template deleted successfully.'
      });
      // Refresh template list
      await this._sendTemplateList();
    } catch (error) {
      this._sendResponse({
        type: 'operationResult',
        success: false,
        message: `Failed to delete template: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 处理导入模板
   */
  private async _handleImportTemplates(source: string): Promise<void> {
    try {
      // If source is empty, show file picker
      let filePath = source;
      if (!filePath) {
        const fileUris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            'Template Files': ['md', 'json'],
            'All Files': ['*']
          },
          title: 'Select Template File to Import'
        });

        if (!fileUris || fileUris.length === 0) {
          return;
        }
        filePath = fileUris[0].fsPath;
      }

      const result = await this._templateService.importTemplates(filePath);
      
      if (result.success) {
        this._sendResponse({
          type: 'operationResult',
          success: true,
          message: `Successfully imported ${result.importedTemplates.length} template(s).`
        });
        // Refresh template list
        await this._sendTemplateList();
      } else {
        this._sendResponse({
          type: 'operationResult',
          success: false,
          message: `Import failed: ${result.errors.join(', ')}`
        });
      }
    } catch (error) {
      this._sendResponse({
        type: 'operationResult',
        success: false,
        message: `Import failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 处理导出模板
   */
  private async _handleExportTemplates(templateIds: string[]): Promise<void> {
    try {
      // Show save dialog
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('templates-export.json'),
        filters: {
          'JSON Files': ['json']
        },
        title: 'Export Templates'
      });

      if (!saveUri) {
        return;
      }

      const targetDir = require('path').dirname(saveUri.fsPath);
      const exportPath = await this._templateService.exportTemplates(templateIds, targetDir);

      this._sendResponse({
        type: 'operationResult',
        success: true,
        message: `Templates exported to: ${exportPath}`
      });

      // Open the exported file
      vscode.window.showInformationMessage(
        `Templates exported successfully!`,
        'Open File'
      ).then(selection => {
        if (selection === 'Open File') {
          vscode.workspace.openTextDocument(exportPath).then(doc => {
            vscode.window.showTextDocument(doc);
          });
        }
      });
    } catch (error) {
      this._sendResponse({
        type: 'operationResult',
        success: false,
        message: `Export failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 处理搜索模板
   */
  private async _handleSearchTemplates(query: string): Promise<void> {
    try {
      const templates = await this._storageManager.searchTemplates(query);
      this._sendResponse({
        type: 'templateList',
        data: templates
      });
    } catch (error) {
      this._sendResponse({
        type: 'error',
        message: `Search failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 处理过滤模板
   */
  private async _handleFilterTemplates(category?: TemplateCategory, tags?: string[]): Promise<void> {
    try {
      let templates: Template[];

      if (category) {
        templates = await this._storageManager.filterByCategory(category);
      } else if (tags && tags.length > 0) {
        templates = await this._storageManager.filterByTags(tags);
      } else {
        templates = await this._storageManager.getAllTemplates();
      }

      this._sendResponse({
        type: 'templateList',
        data: templates
      });
    } catch (error) {
      this._sendResponse({
        type: 'error',
        message: `Filter failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * 处理向导部署
   */
  private async _handleWizardDeploy(templateIds: string[], quickSetup: boolean): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this._sendResponse({
        type: 'wizardDeployResult',
        data: {
          success: false,
          deployedTemplates: [],
          claudeMdCreated: false,
          errors: ['Please open a workspace folder first.']
        }
      });
      return;
    }

    try {
      const result = await this._templateService.runInitWizard(
        workspaceFolder.uri.fsPath,
        templateIds,
        quickSetup
      );

      this._sendResponse({
        type: 'wizardDeployResult',
        data: result
      });

      if (result.success) {
        const message = result.claudeMdCreated
          ? `Successfully initialized Claude Code with ${result.deployedTemplates.length} template(s) and created CLAUDE.md`
          : `Successfully deployed ${result.deployedTemplates.length} template(s)`;
        vscode.window.showInformationMessage(message);
      }
    } catch (error) {
      this._sendResponse({
        type: 'wizardDeployResult',
        data: {
          success: false,
          deployedTemplates: [],
          claudeMdCreated: false,
          errors: [error instanceof Error ? error.message : String(error)]
        }
      });
    }
  }

  /**
   * 处理同步到 CLAUDE.md
   */
  private async _handleSyncToClaudeMd(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this._sendResponse({
        type: 'syncToClaudeMdResult',
        data: {
          success: false,
          syncedCategories: [],
          claudeMdPath: '',
          errors: ['Please open a workspace folder first.']
        }
      });
      return;
    }

    try {
      const result = await this._templateService.syncToClaudeMd(workspaceFolder.uri.fsPath);

      this._sendResponse({
        type: 'syncToClaudeMdResult',
        data: result
      });

      if (result.success) {
        const categoriesText = result.syncedCategories.length > 0
          ? result.syncedCategories.join(', ')
          : 'no templates';
        
        vscode.window.showInformationMessage(
          `Successfully synced ${categoriesText} to CLAUDE.md`,
          'Open CLAUDE.md'
        ).then(selection => {
          if (selection === 'Open CLAUDE.md') {
            vscode.workspace.openTextDocument(result.claudeMdPath).then(doc => {
              vscode.window.showTextDocument(doc);
            });
          }
        });
      } else {
        vscode.window.showErrorMessage(`Sync failed: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      this._sendResponse({
        type: 'syncToClaudeMdResult',
        data: {
          success: false,
          syncedCategories: [],
          claudeMdPath: '',
          errors: [error instanceof Error ? error.message : String(error)]
        }
      });
    }
  }

  /**
   * 发送响应到 webview
   */
  private _sendResponse(response: TemplateHubResponse): void {
    if (this._view) {
      this._view.webview.postMessage(response);
    }
  }

  /**
   * 生成 webview HTML
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    return getTemplateHubHtml(webview, this._extensionUri);
  }
}
