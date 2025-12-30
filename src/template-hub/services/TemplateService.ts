/**
 * Template Service
 * 模板业务服务 - 处理部署、导入导出等核心业务逻辑
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Template,
  TemplateCategory,
  DeployOptions,
  DeployResult,
  DeployValidation,
  ImportResult,
  InitWizardResult,
  ProjectType,
  SyncToClaudeMdResult
} from '../types';
import { TemplateHubError, TemplateHubErrorCode } from '../types/errors';
import { TemplateStorageManager } from './TemplateStorageManager';
import { ProjectDetectorService } from './ProjectDetectorService';

/**
 * 默认部署选项
 */
const DEFAULT_DEPLOY_OPTIONS: DeployOptions = {
  overwriteExisting: false,
  createBackup: true,
  dryRun: false
};

/**
 * 模板业务服务
 * 处理部署、导入导出等核心业务逻辑
 */
export class TemplateService {
  constructor(
    private _storageManager: TemplateStorageManager,
    private _projectDetector: ProjectDetectorService
  ) {}

  // ==================== 部署相关 ====================

  /**
   * 验证部署操作
   * 检查目标路径是否可写，以及是否存在冲突文件
   * @param templateIds 要部署的模板 ID 列表
   * @param targetPath 目标项目路径
   * @returns 部署验证结果
   */
  async validateDeployment(
    templateIds: string[],
    targetPath: string
  ): Promise<DeployValidation> {
    const validation: DeployValidation = {
      valid: true,
      conflicts: [],
      warnings: []
    };

    // 检查目标路径是否存在
    if (!fs.existsSync(targetPath)) {
      validation.valid = false;
      validation.warnings.push(`Target path does not exist: ${targetPath}`);
      return validation;
    }

    // 检查目标路径是否可写
    try {
      fs.accessSync(targetPath, fs.constants.W_OK);
    } catch {
      validation.valid = false;
      validation.warnings.push(`Target path is not writable: ${targetPath}`);
      return validation;
    }

    // 检查每个模板是否存在冲突
    for (const templateId of templateIds) {
      const template = await this._storageManager.getTemplateById(templateId);
      if (!template) {
        validation.warnings.push(`Template not found: ${templateId}`);
        continue;
      }

      const targetFilePath = this._getDeployTargetPath(template, targetPath);
      if (fs.existsSync(targetFilePath)) {
        validation.conflicts.push({
          templateId,
          existingFile: targetFilePath
        });
      }
    }

    // 如果有冲突，标记为需要用户确认（但仍然有效）
    if (validation.conflicts.length > 0) {
      validation.warnings.push(
        `${validation.conflicts.length} file(s) already exist and may be overwritten`
      );
    }

    return validation;
  }

  /**
   * 部署模板到项目
   * @param templateIds 要部署的模板 ID 列表
   * @param targetPath 目标项目路径
   * @param options 部署选项
   * @returns 部署结果
   */
  async deployTemplates(
    templateIds: string[],
    targetPath: string,
    options: Partial<DeployOptions> = {}
  ): Promise<DeployResult> {
    const mergedOptions: DeployOptions = { ...DEFAULT_DEPLOY_OPTIONS, ...options };
    
    const result: DeployResult = {
      success: true,
      deployedTemplates: [],
      skippedTemplates: [],
      errors: []
    };

    // 验证部署
    const validation = await this.validateDeployment(templateIds, targetPath);
    if (!validation.valid) {
      result.success = false;
      result.errors = validation.warnings;
      return result;
    }

    // 如果是 dry run，只返回验证结果
    if (mergedOptions.dryRun) {
      for (const templateId of templateIds) {
        const template = await this._storageManager.getTemplateById(templateId);
        if (template) {
          const targetFilePath = this._getDeployTargetPath(template, targetPath);
          result.deployedTemplates.push({
            templateId,
            targetPath: targetFilePath
          });
        }
      }
      return result;
    }

    // 确保 .claude 目录存在
    const claudeDir = path.join(targetPath, '.claude');
    await this._ensureDirectory(claudeDir);

    // 收集 hooks 配置（稍后合并到 settings.json）
    const hooksToMerge: Array<{ template: Template; content: any }> = [];

    // 部署每个模板
    for (const templateId of templateIds) {
      try {
        const template = await this._storageManager.getTemplateById(templateId);
        if (!template) {
          result.skippedTemplates.push({
            templateId,
            reason: 'Template not found'
          });
          continue;
        }

        // Hooks 需要特殊处理 - 合并到 settings.json
        if (template.category === TemplateCategory.HOOK) {
          try {
            const hookContent = JSON.parse(template.content);
            hooksToMerge.push({ template, content: hookContent });
            result.deployedTemplates.push({
              templateId,
              targetPath: path.join(claudeDir, 'settings.json')
            });
          } catch (e) {
            result.errors.push(`Invalid JSON in hook template ${templateId}`);
          }
          continue;
        }

        const targetFilePath = this._getDeployTargetPath(template, targetPath);
        const fileExists = fs.existsSync(targetFilePath);

        // 处理冲突
        if (fileExists && !mergedOptions.overwriteExisting) {
          result.skippedTemplates.push({
            templateId,
            reason: 'File already exists'
          });
          continue;
        }

        // 创建备份
        if (fileExists && mergedOptions.createBackup) {
          await this._createBackup(targetFilePath);
        }

        // 确保目标子目录存在
        const targetDir = path.dirname(targetFilePath);
        await this._ensureDirectory(targetDir);

        // 写入模板文件
        const content = this._prepareTemplateContent(template);
        fs.writeFileSync(targetFilePath, content, 'utf-8');

        result.deployedTemplates.push({
          templateId,
          targetPath: targetFilePath
        });
      } catch (error) {
        result.errors.push(
          `Failed to deploy template ${templateId}: ${error instanceof Error ? error.message : String(error)}`
        );
        result.success = false;
      }
    }

    // 合并 hooks 到 settings.json
    if (hooksToMerge.length > 0) {
      try {
        await this._mergeHooksToSettings(claudeDir, hooksToMerge, mergedOptions);
      } catch (error) {
        result.errors.push(
          `Failed to merge hooks to settings.json: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // 如果有部分失败，标记为部分成功
    if (result.errors.length > 0 && result.deployedTemplates.length > 0) {
      result.success = true; // 部分成功仍然算成功
    }

    return result;
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 获取模板部署的目标路径
   * 根据 Claude Code 官方目录结构：
   * - Skills: .claude/skills/<skill-name>/SKILL.md
   * - Commands: .claude/commands/<command-name>.md
   * - Hooks: 配置到 .claude/settings.json
   * - Agents: .claude/skills/<agent-name>/SKILL.md (agents 也是 skills)
   * 
   * @param template 模板
   * @param projectPath 项目路径
   * @returns 完整的目标文件路径
   */
  private _getDeployTargetPath(template: Template, projectPath: string): string {
    const claudeDir = path.join(projectPath, '.claude');
    
    if (template.category === TemplateCategory.SKILL || template.category === TemplateCategory.AGENT) {
      // Skills 和 Agents 需要独立目录，文件名必须是 SKILL.md
      const skillDirName = this._getSkillDirectoryName(template);
      return path.join(claudeDir, 'skills', skillDirName, 'SKILL.md');
    } else if (template.category === TemplateCategory.COMMAND) {
      // Commands 直接放在 commands 目录下
      const fileName = this._getDeployFileName(template);
      return path.join(claudeDir, 'commands', fileName);
    } else if (template.category === TemplateCategory.HOOK) {
      // Hooks 配置到 settings.json
      return path.join(claudeDir, 'settings.json');
    }
    
    // 默认情况
    const fileName = this._getDeployFileName(template);
    return path.join(claudeDir, fileName);
  }

  /**
   * 获取 Skill 目录名称
   * @param template 模板
   * @returns 目录名称
   */
  private _getSkillDirectoryName(template: Template): string {
    return template.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * 获取分类对应的部署子目录
   * @param category 模板分类
   * @returns 子目录名称
   */
  private _getCategoryDeploySubdir(category: TemplateCategory): string {
    const subdirs: Record<TemplateCategory, string> = {
      [TemplateCategory.SKILL]: 'skills',
      [TemplateCategory.COMMAND]: 'commands',
      [TemplateCategory.HOOK]: '', // Hooks 不需要子目录，配置在 settings.json
      [TemplateCategory.AGENT]: 'skills' // Agents 也放在 skills 目录
    };
    return subdirs[category];
  }

  /**
   * 获取部署文件名
   * @param template 模板
   * @returns 文件名
   */
  private _getDeployFileName(template: Template): string {
    const baseName = template.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    // Commands 使用 .md 扩展名
    return `${baseName}.md`;
  }

  /**
   * 准备模板内容用于部署
   * 对于 Skills 和 Agents，需要转换为 SKILL.md 格式（带 frontmatter）
   * @param template 模板
   * @returns 准备好的内容
   */
  private _prepareTemplateContent(template: Template): string {
    if (template.category === TemplateCategory.SKILL || template.category === TemplateCategory.AGENT) {
      // Skills 和 Agents 需要 SKILL.md 格式的 frontmatter
      return this._prepareSkillContent(template);
    }

    if (template.category === TemplateCategory.COMMAND) {
      // Commands 直接返回内容（可能已经有 frontmatter）
      return template.content;
    }

    // 其他类型直接返回内容
    return template.content;
  }

  /**
   * 准备 Skill 内容（SKILL.md 格式）
   * @param template 模板
   * @returns SKILL.md 格式的内容
   */
  private _prepareSkillContent(template: Template): string {
    // 检查内容是否已经有 frontmatter
    if (template.content.trim().startsWith('---')) {
      // 已有 frontmatter，检查是否需要更新
      const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
      const match = template.content.match(frontmatterRegex);
      
      if (match) {
        const existingFrontmatter = match[1];
        const body = match[2];
        
        // 检查是否已有 name 和 description
        if (existingFrontmatter.includes('name:') && existingFrontmatter.includes('description:')) {
          return template.content;
        }
      }
    }

    // 生成 SKILL.md 格式的 frontmatter
    const skillName = template.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    const frontmatter = `---
name: ${skillName}
description: ${template.description}
---

`;

    // 如果原内容有 frontmatter，去掉它
    let body = template.content;
    const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
    body = body.replace(frontmatterRegex, '').trim();

    return frontmatter + body;
  }

  /**
   * 合并 hooks 配置到 settings.json
   * @param claudeDir .claude 目录路径
   * @param hooks 要合并的 hooks
   * @param options 部署选项
   */
  private async _mergeHooksToSettings(
    claudeDir: string,
    hooks: Array<{ template: Template; content: any }>,
    options: DeployOptions
  ): Promise<void> {
    const settingsPath = path.join(claudeDir, 'settings.json');
    
    // 读取现有的 settings.json（如果存在）
    let settings: any = {};
    if (fs.existsSync(settingsPath)) {
      if (options.createBackup) {
        await this._createBackup(settingsPath);
      }
      try {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        // 如果解析失败，使用空对象
        settings = {};
      }
    }

    // 确保 hooks 数组存在
    if (!settings.hooks) {
      settings.hooks = [];
    }

    // 合并新的 hooks
    for (const { template, content } of hooks) {
      // 检查是否已存在同名 hook
      const existingIndex = settings.hooks.findIndex(
        (h: any) => h.name === content.name || h.id === content.id
      );

      const hookConfig = {
        name: content.name || template.name,
        description: content.description || template.description,
        event: content.hook?.event || content.event || 'manual',
        command: content.hook?.command || content.command || '',
        ...content.hook,
        ...content.config
      };

      if (existingIndex >= 0) {
        if (options.overwriteExisting) {
          settings.hooks[existingIndex] = hookConfig;
        }
      } else {
        settings.hooks.push(hookConfig);
      }
    }

    // 写入 settings.json
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  /**
   * 确保目录存在
   * @param dirPath 目录路径
   */
  private async _ensureDirectory(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * 创建文件备份
   * @param filePath 文件路径
   */
  private async _createBackup(filePath: string): Promise<void> {
    const backupPath = `${filePath}.backup.${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
  }

  // ==================== 导入导出相关 ====================

  /**
   * 导入模板
   * 支持单文件 (.md, .json) 和 zip 包导入
   * @param source 源文件路径
   * @returns 导入结果
   */
  async importTemplates(source: string): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      importedTemplates: [],
      errors: []
    };

    if (!fs.existsSync(source)) {
      result.success = false;
      result.errors.push(`Source file not found: ${source}`);
      return result;
    }

    const ext = path.extname(source).toLowerCase();

    try {
      if (ext === '.zip') {
        // 导入 zip 包
        return await this._importFromZip(source);
      } else if (ext === '.md' || ext === '.json') {
        // 导入单个文件
        return await this._importSingleFile(source);
      } else {
        result.success = false;
        result.errors.push(`Unsupported file format: ${ext}. Supported formats: .md, .json, .zip`);
        return result;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return result;
    }
  }

  /**
   * 导出模板
   * 将选定的模板导出为 zip 文件
   * @param templateIds 要导出的模板 ID 列表
   * @param targetPath 目标路径（不含文件名）
   * @returns 导出的 zip 文件路径
   */
  async exportTemplates(templateIds: string[], targetPath: string): Promise<string> {
    if (templateIds.length === 0) {
      throw new TemplateHubError(
        TemplateHubErrorCode.EXPORT_WRITE_ERROR,
        'No templates selected for export'
      );
    }

    // 确保目标目录存在
    await this._ensureDirectory(targetPath);

    // 生成导出文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportFileName = `templates-export-${timestamp}.zip`;
    const exportFilePath = path.join(targetPath, exportFileName);

    // 收集要导出的模板
    const templates: Template[] = [];
    for (const templateId of templateIds) {
      const template = await this._storageManager.getTemplateById(templateId);
      if (template) {
        templates.push(template);
      }
    }

    if (templates.length === 0) {
      throw new TemplateHubError(
        TemplateHubErrorCode.TEMPLATE_NOT_FOUND,
        'No valid templates found for export'
      );
    }

    // 创建导出包（简单的 JSON 格式，因为 Node.js 原生不支持 zip）
    // 实际项目中应使用 archiver 或 jszip 库
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        tags: t.tags,
        version: t.version,
        author: t.author,
        content: t.content
      }))
    };

    // 由于没有 zip 库，我们使用 JSON 格式导出
    // 文件扩展名改为 .json
    const jsonExportPath = exportFilePath.replace('.zip', '.json');
    fs.writeFileSync(jsonExportPath, JSON.stringify(exportData, null, 2), 'utf-8');

    return jsonExportPath;
  }

  /**
   * 从单个文件导入模板
   * @param filePath 文件路径
   * @returns 导入结果
   */
  private async _importSingleFile(filePath: string): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      importedTemplates: [],
      errors: []
    };

    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath, ext);

    try {
      let category: TemplateCategory;
      let templateContent: string;
      let metadata: Partial<Template> = {};

      if (ext === '.json') {
        // JSON 文件 - 可能是 hook 或导出包
        const parsed = JSON.parse(content);
        
        // 检查是否是导出包格式
        if (parsed.version && parsed.templates && Array.isArray(parsed.templates)) {
          return await this._importFromExportPackage(parsed);
        }

        // 单个 hook 模板
        category = TemplateCategory.HOOK;
        templateContent = content;
        metadata = {
          name: parsed.name || fileName,
          description: parsed.description || '',
          tags: parsed.tags || []
        };
      } else {
        // Markdown 文件 - skill, command, 或 agent
        const { metadata: parsedMeta, content: parsedContent } = this._parseMarkdownTemplate(content);
        
        // 根据元数据或文件名推断分类
        category = this._inferCategory(parsedMeta.category, fileName);
        templateContent = parsedContent;
        metadata = {
          name: parsedMeta.name || fileName,
          description: parsedMeta.description || '',
          tags: parsedMeta.tags || []
        };
      }

      // 保存为用户模板
      const template = await this._storageManager.saveUserTemplate({
        name: metadata.name || fileName,
        description: metadata.description || '',
        category,
        content: templateContent,
        tags: metadata.tags
      });

      result.importedTemplates.push(template);
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Failed to import ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return result;
  }

  /**
   * 从 zip 文件导入模板
   * @param zipPath zip 文件路径
   * @returns 导入结果
   */
  private async _importFromZip(zipPath: string): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      importedTemplates: [],
      errors: ['ZIP import requires additional dependencies. Please use JSON export format instead.']
    };

    // 尝试读取为 JSON（如果实际上是 JSON 文件被错误命名为 .zip）
    try {
      const content = fs.readFileSync(zipPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.version && parsed.templates) {
        return await this._importFromExportPackage(parsed);
      }
    } catch {
      // 不是 JSON 格式，确实是 zip
    }

    return result;
  }

  /**
   * 从导出包导入模板
   * @param exportData 导出包数据
   * @returns 导入结果
   */
  private async _importFromExportPackage(exportData: {
    version: number;
    templates: Array<{
      name: string;
      description: string;
      category: string;
      tags?: string[];
      content: string;
    }>;
  }): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      importedTemplates: [],
      errors: []
    };

    for (const templateData of exportData.templates) {
      try {
        const category = this._inferCategory(templateData.category, templateData.name);
        
        const template = await this._storageManager.saveUserTemplate({
          name: templateData.name,
          description: templateData.description,
          category,
          content: templateData.content,
          tags: templateData.tags
        });

        result.importedTemplates.push(template);
      } catch (error) {
        result.errors.push(
          `Failed to import template "${templateData.name}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (result.importedTemplates.length === 0 && result.errors.length > 0) {
      result.success = false;
    }

    return result;
  }

  /**
   * 解析 Markdown 模板文件
   * @param content 文件内容
   * @returns 解析后的元数据和内容
   */
  private _parseMarkdownTemplate(content: string): {
    metadata: Partial<Template>;
    content: string;
  } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { metadata: {}, content };
    }

    const frontmatter = match[1];
    const templateContent = match[2].trim();

    // 简单解析 YAML frontmatter
    const metadata: Partial<Template> = {};
    const lines = frontmatter.split('\n');
    let currentKey = '';
    let inArray = false;
    const arrayValues: string[] = [];

    for (const line of lines) {
      if (line.startsWith('  - ') && inArray) {
        arrayValues.push(line.substring(4).trim());
      } else if (line.includes(':')) {
        if (inArray && currentKey) {
          (metadata as any)[currentKey] = arrayValues.slice();
          arrayValues.length = 0;
          inArray = false;
        }

        const colonIndex = line.indexOf(':');
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        if (value === '') {
          currentKey = key;
          inArray = true;
        } else {
          (metadata as any)[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    if (inArray && currentKey) {
      (metadata as any)[currentKey] = arrayValues;
    }

    return { metadata, content: templateContent };
  }

  /**
   * 推断模板分类
   * @param categoryStr 分类字符串
   * @param fileName 文件名
   * @returns 模板分类
   */
  private _inferCategory(categoryStr: string | undefined, fileName: string): TemplateCategory {
    if (categoryStr) {
      const normalized = categoryStr.toLowerCase();
      if (normalized === 'skill' || normalized === 'skills') {
        return TemplateCategory.SKILL;
      }
      if (normalized === 'command' || normalized === 'commands') {
        return TemplateCategory.COMMAND;
      }
      if (normalized === 'hook' || normalized === 'hooks') {
        return TemplateCategory.HOOK;
      }
      if (normalized === 'agent' || normalized === 'agents') {
        return TemplateCategory.AGENT;
      }
    }

    // 根据文件名推断
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('hook')) {
      return TemplateCategory.HOOK;
    }
    if (lowerName.includes('agent') || lowerName.includes('expert')) {
      return TemplateCategory.AGENT;
    }
    if (lowerName.includes('command') || lowerName.includes('cmd')) {
      return TemplateCategory.COMMAND;
    }

    // 默认为 skill
    return TemplateCategory.SKILL;
  }

  // ==================== 初始化向导相关 ====================

  /**
   * 运行初始化向导
   * 检测项目类型，推荐模板，部署选定模板，创建 CLAUDE.md 文件
   * @param workspacePath 工作区路径
   * @param selectedTemplateIds 可选的用户选择的模板 ID（如果为空则使用推荐模板）
   * @param quickSetup 是否使用快速设置（自动部署推荐模板）
   * @returns 初始化向导结果
   */
  async runInitWizard(
    workspacePath: string,
    selectedTemplateIds?: string[],
    quickSetup: boolean = false
  ): Promise<InitWizardResult> {
    const result: InitWizardResult = {
      success: true,
      deployedTemplates: [],
      claudeMdCreated: false,
      errors: []
    };

    try {
      // 1. 检测项目类型
      const projectAnalysis = await this._projectDetector.analyzeProject(workspacePath);

      // 2. 确定要部署的模板
      let templateIds: string[];
      if (selectedTemplateIds && selectedTemplateIds.length > 0) {
        templateIds = selectedTemplateIds;
      } else if (quickSetup) {
        // 快速设置：使用推荐模板
        templateIds = projectAnalysis.recommendedTemplates;
      } else {
        // 返回推荐但不部署（等待用户选择）
        result.deployedTemplates = [];
        return result;
      }

      // 3. 部署模板
      if (templateIds.length > 0) {
        const deployResult = await this.deployTemplates(templateIds, workspacePath, {
          overwriteExisting: false,
          createBackup: true,
          dryRun: false
        });

        result.deployedTemplates = deployResult.deployedTemplates.map(d => d.templateId);
        
        if (!deployResult.success) {
          result.errors.push(...deployResult.errors);
        }
      }

      // 4. 创建 CLAUDE.md 文件
      const claudeMdPath = path.join(workspacePath, 'CLAUDE.md');
      if (!fs.existsSync(claudeMdPath)) {
        const claudeMdContent = this._generateClaudeMd(projectAnalysis, result.deployedTemplates);
        fs.writeFileSync(claudeMdPath, claudeMdContent, 'utf-8');
        result.claudeMdCreated = true;
      }

      result.success = result.errors.length === 0;
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Wizard failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return result;
  }

  /**
   * 获取推荐模板
   * 根据项目类型返回推荐的模板列表
   * @param projectType 项目类型
   * @returns 推荐的模板列表
   */
  async getRecommendedTemplates(projectType: ProjectType): Promise<Template[]> {
    const allTemplates = await this._storageManager.getAllTemplates();
    const recommendedIds = this._getRecommendedTemplateIds(projectType);

    // 按推荐 ID 过滤模板
    const recommended: Template[] = [];
    for (const id of recommendedIds) {
      // 尝试精确匹配
      let template = allTemplates.find(t => t.id === id);
      
      // 如果没有精确匹配，尝试模糊匹配（名称包含 ID）
      if (!template) {
        template = allTemplates.find(t => 
          t.name.toLowerCase().includes(id.toLowerCase()) ||
          t.id.toLowerCase().includes(id.toLowerCase())
        );
      }

      if (template) {
        recommended.push(template);
      }
    }

    return recommended;
  }

  /**
   * 获取推荐模板 ID 列表
   * @param projectType 项目类型
   * @returns 推荐的模板 ID 列表
   */
  private _getRecommendedTemplateIds(projectType: ProjectType): string[] {
    const recommendations: string[] = [];

    // 通用推荐（所有项目类型）
    const commonTemplates = [
      'code-review',
      'refactoring',
      'testing',
      'fix-bug',
      'add-comments'
    ];
    recommendations.push(...commonTemplates);

    // 根据项目类型添加特定推荐
    switch (projectType) {
      case ProjectType.FRONTEND:
        recommendations.push(
          'frontend-expert',
          'optimize'
        );
        break;

      case ProjectType.BACKEND:
        recommendations.push(
          'backend-expert',
          'security-expert',
          'security-audit'
        );
        break;

      case ProjectType.FULLSTACK:
        recommendations.push(
          'frontend-expert',
          'backend-expert',
          'security-expert',
          'security-audit'
        );
        break;

      case ProjectType.LIBRARY:
        recommendations.push(
          'documentation',
          'generate-docs',
          'write-tests'
        );
        break;

      case ProjectType.CLI:
        recommendations.push(
          'documentation',
          'generate-docs'
        );
        break;

      case ProjectType.UNKNOWN:
      default:
        // 对于未知类型，只使用通用推荐
        break;
    }

    // 去重
    return Array.from(new Set(recommendations));
  }

  /**
   * 生成 CLAUDE.md 文件内容
   * @param projectAnalysis 项目分析结果
   * @param deployedTemplates 已部署的模板 ID
   * @returns CLAUDE.md 文件内容
   */
  private _generateClaudeMd(
    projectAnalysis: { type: ProjectType; frameworks: string[]; languages: string[] },
    deployedTemplates: string[]
  ): string {
    const projectTypeNames: Record<ProjectType, string> = {
      [ProjectType.FRONTEND]: 'Frontend',
      [ProjectType.BACKEND]: 'Backend',
      [ProjectType.FULLSTACK]: 'Full-Stack',
      [ProjectType.LIBRARY]: 'Library',
      [ProjectType.CLI]: 'CLI Tool',
      [ProjectType.UNKNOWN]: 'General'
    };

    const projectTypeName = projectTypeNames[projectAnalysis.type];
    const frameworks = projectAnalysis.frameworks.length > 0
      ? projectAnalysis.frameworks.join(', ')
      : 'None detected';
    const languages = projectAnalysis.languages.length > 0
      ? projectAnalysis.languages.join(', ')
      : 'Not specified';

    return `# Project Configuration for Claude

## Project Overview

This is a ${projectTypeName} project.

**Detected Frameworks:** ${frameworks}
**Languages:** ${languages}

## Guidelines

- Follow the project's existing code style and conventions
- Write clean, maintainable, and well-documented code
- Consider performance and security implications
- Write tests for new functionality

## Deployed Templates

${deployedTemplates.length > 0 
  ? deployedTemplates.map(id => `- ${id}`).join('\n')
  : '- No templates deployed yet'}

## Custom Instructions

Add your project-specific instructions here:

- 
- 
- 

---
*Generated by Template Hub on ${new Date().toISOString().split('T')[0]}*
`;
  }

  // ==================== 同步到 CLAUDE.md ====================

  /**
   * 同步 .claude 目录下的模板内容到 CLAUDE.md
   * 扫描 .claude 目录下的所有模板文件，将其内容整合到 CLAUDE.md 中
   * 
   * Claude Code 官方目录结构：
   * .claude/
   * ├── settings.json          ← hooks 配置在这里
   * ├── skills/
   * │   ├── <skill-name>/
   * │   │   └── SKILL.md
   * │   └── ...
   * ├── commands/
   * │   ├── <command>.md
   * │   └── ...
   * └── README.md
   * 
   * @param workspacePath 工作区路径
   * @returns 同步结果
   */
  async syncToClaudeMd(workspacePath: string): Promise<SyncToClaudeMdResult> {
    const result: SyncToClaudeMdResult = {
      success: true,
      syncedCategories: [],
      claudeMdPath: path.join(workspacePath, 'CLAUDE.md'),
      errors: []
    };

    const claudeDir = path.join(workspacePath, '.claude');
    
    // 检查 .claude 目录是否存在
    if (!fs.existsSync(claudeDir)) {
      result.success = false;
      result.errors.push('.claude directory not found. Please deploy templates first.');
      return result;
    }

    try {
      // 收集各类模板内容（使用新的目录结构）
      const skillsContent = await this._collectSkillsContent(claudeDir);
      const commandsContent = await this._collectCommandsContent(claudeDir);
      const hooksContent = await this._collectHooksFromSettings(claudeDir);
      // Agents 也在 skills 目录中，已包含在 skillsContent

      // 记录同步的分类
      if (skillsContent) result.syncedCategories.push('skills');
      if (commandsContent) result.syncedCategories.push('commands');
      if (hooksContent) result.syncedCategories.push('hooks');

      // 检测项目信息
      const projectAnalysis = await this._projectDetector.analyzeProject(workspacePath);

      // 生成新的 CLAUDE.md 内容
      const claudeMdContent = this._generateSyncedClaudeMd(
        projectAnalysis,
        skillsContent,
        commandsContent,
        hooksContent
      );

      // 备份现有的 CLAUDE.md（如果存在）
      if (fs.existsSync(result.claudeMdPath)) {
        await this._createBackup(result.claudeMdPath);
      }

      // 写入新的 CLAUDE.md
      fs.writeFileSync(result.claudeMdPath, claudeMdContent, 'utf-8');

      result.success = true;
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Sync failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return result;
  }

  /**
   * 收集 skills 目录下的所有 SKILL.md 内容
   * 新结构：.claude/skills/<skill-name>/SKILL.md
   * @param claudeDir .claude 目录路径
   * @returns 合并后的内容，如果目录为空则返回 null
   */
  private async _collectSkillsContent(claudeDir: string): Promise<string | null> {
    const skillsDir = path.join(claudeDir, 'skills');
    
    if (!fs.existsSync(skillsDir)) {
      return null;
    }

    const entries = fs.readdirSync(skillsDir);
    if (entries.length === 0) {
      return null;
    }

    const contents: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(skillsDir, entry);
      const stat = fs.statSync(entryPath);
      
      // 每个 skill 应该是一个目录
      if (!stat.isDirectory()) continue;

      const skillMdPath = path.join(entryPath, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const { content: templateContent, metadata } = this._parseMarkdownTemplate(content);
      const title = (metadata as any).name || entry;
      const description = (metadata as any).description || '';
      
      contents.push(`### ${title}\n\n${description ? `*${description}*\n\n` : ''}${templateContent}`);
    }

    return contents.length > 0 ? contents.join('\n\n---\n\n') : null;
  }

  /**
   * 收集 commands 目录下的所有命令内容
   * 结构：.claude/commands/<command>.md
   * @param claudeDir .claude 目录路径
   * @returns 合并后的内容，如果目录为空则返回 null
   */
  private async _collectCommandsContent(claudeDir: string): Promise<string | null> {
    const commandsDir = path.join(claudeDir, 'commands');
    
    if (!fs.existsSync(commandsDir)) {
      return null;
    }

    const files = fs.readdirSync(commandsDir);
    if (files.length === 0) {
      return null;
    }

    const contents: string[] = [];

    for (const file of files) {
      const filePath = path.join(commandsDir, file);
      const stat = fs.statSync(filePath);
      
      if (!stat.isFile()) continue;

      const ext = path.extname(file).toLowerCase();
      if (ext !== '.md') continue;

      const fileName = path.basename(file, ext);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { content: templateContent, metadata } = this._parseMarkdownTemplate(content);
      const title = (metadata as any).name || fileName;
      const description = (metadata as any).description || '';
      
      contents.push(`### /${fileName}\n\n${description ? `*${description}*\n\n` : ''}${templateContent}`);
    }

    return contents.length > 0 ? contents.join('\n\n---\n\n') : null;
  }

  /**
   * 从 settings.json 收集 hooks 配置
   * 新结构：hooks 配置在 .claude/settings.json 中
   * @param claudeDir .claude 目录路径
   * @returns 合并后的内容，如果没有 hooks 则返回 null
   */
  private async _collectHooksFromSettings(claudeDir: string): Promise<string | null> {
    const settingsPath = path.join(claudeDir, 'settings.json');
    
    if (!fs.existsSync(settingsPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      
      if (!settings.hooks || !Array.isArray(settings.hooks) || settings.hooks.length === 0) {
        return null;
      }

      const contents: string[] = [];

      for (const hook of settings.hooks) {
        const name = hook.name || 'Unnamed Hook';
        const description = hook.description || '';
        const event = hook.event || 'manual';
        const command = hook.command || '';
        
        let hookInfo = `### ${name}\n\n`;
        if (description) hookInfo += `*${description}*\n\n`;
        hookInfo += `- **Event:** \`${event}\`\n`;
        if (command) hookInfo += `- **Command:** \`${command}\`\n`;
        
        contents.push(hookInfo);
      }

      return contents.length > 0 ? contents.join('\n---\n\n') : null;
    } catch {
      return null;
    }
  }

  /**
   * 收集指定分类目录下的所有模板内容（旧方法，保留兼容性）
   * @param claudeDir .claude 目录路径
   * @param category 分类名称
   * @returns 合并后的内容，如果目录为空则返回 null
   * @deprecated 使用 _collectSkillsContent, _collectCommandsContent, _collectHooksFromSettings 代替
   */
  private async _collectCategoryContent(claudeDir: string, category: string): Promise<string | null> {
    const categoryDir = path.join(claudeDir, category);
    
    if (!fs.existsSync(categoryDir)) {
      return null;
    }

    const files = fs.readdirSync(categoryDir);
    if (files.length === 0) {
      return null;
    }

    const contents: string[] = [];

    for (const file of files) {
      const filePath = path.join(categoryDir, file);
      const stat = fs.statSync(filePath);
      
      if (!stat.isFile()) continue;

      const ext = path.extname(file).toLowerCase();
      const fileName = path.basename(file, ext);
      const content = fs.readFileSync(filePath, 'utf-8');

      if (ext === '.json') {
        // JSON 文件（hooks）- 提取描述和配置
        try {
          const jsonContent = JSON.parse(content);
          contents.push(`### ${jsonContent.name || fileName}\n\n${jsonContent.description || ''}\n\n\`\`\`json\n${JSON.stringify(jsonContent, null, 2)}\n\`\`\``);
        } catch {
          contents.push(`### ${fileName}\n\n\`\`\`json\n${content}\n\`\`\``);
        }
      } else if (ext === '.md') {
        // Markdown 文件 - 提取内容（去除 frontmatter）
        const { content: templateContent, metadata } = this._parseMarkdownTemplate(content);
        const title = (metadata as any).name || fileName;
        const description = (metadata as any).description || '';
        
        contents.push(`### ${title}\n\n${description ? `*${description}*\n\n` : ''}${templateContent}`);
      }
    }

    return contents.length > 0 ? contents.join('\n\n---\n\n') : null;
  }

  /**
   * 生成同步后的 CLAUDE.md 内容
   */
  private _generateSyncedClaudeMd(
    projectAnalysis: { type: ProjectType; frameworks: string[]; languages: string[] },
    skillsContent: string | null,
    commandsContent: string | null,
    hooksContent: string | null
  ): string {
    const projectTypeNames: Record<ProjectType, string> = {
      [ProjectType.FRONTEND]: 'Frontend',
      [ProjectType.BACKEND]: 'Backend',
      [ProjectType.FULLSTACK]: 'Full-Stack',
      [ProjectType.LIBRARY]: 'Library',
      [ProjectType.CLI]: 'CLI Tool',
      [ProjectType.UNKNOWN]: 'General'
    };

    const projectTypeName = projectTypeNames[projectAnalysis.type];
    const frameworks = projectAnalysis.frameworks.length > 0
      ? projectAnalysis.frameworks.join(', ')
      : 'None detected';
    const languages = projectAnalysis.languages.length > 0
      ? projectAnalysis.languages.join(', ')
      : 'Not specified';

    let content = `# Project Configuration for Claude

## Project Overview

This is a **${projectTypeName}** project.

- **Frameworks:** ${frameworks}
- **Languages:** ${languages}

## Guidelines

- Follow the project's existing code style and conventions
- Write clean, maintainable, and well-documented code
- Consider performance and security implications
- Write tests for new functionality

`;

    // 添加 Skills 部分（包含 agents，因为 agents 也是 skills）
    if (skillsContent) {
      content += `## 🎯 Skills

The following skills are available for this project:

${skillsContent}

`;
    }

    // 添加 Commands 部分
    if (commandsContent) {
      content += `## ⚡ Commands

The following commands are available:

${commandsContent}

`;
    }

    // 添加 Hooks 部分
    if (hooksContent) {
      content += `## 🔗 Hooks

The following automation hooks are configured:

${hooksContent}

`;
    }

    content += `## Custom Instructions

Add your project-specific instructions here:

- 
- 
- 

---
*Synced by Template Hub on ${new Date().toISOString().split('T')[0]}*
`;

    return content;
  }
}
