/**
 * Template Storage Manager
 * 模板存储管理器 - 负责模板文件的读写和索引维护
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  Template,
  TemplateMetadata,
  TemplateIndex,
  TemplateCategory,
  TemplateSource,
  TemplateCreateInput
} from '../types';
import { TemplateHubError, TemplateHubErrorCode } from '../types/errors';

/**
 * 模板存储管理器
 * 负责模板文件的读写和索引维护
 */
export class TemplateStorageManager {
  private _builtInTemplatesPath: string;
  private _userTemplatesPath: string;
  private _builtInIndex: TemplateIndex | null = null;
  private _userIndex: TemplateIndex | null = null;

  constructor(extensionPath: string) {
    this._builtInTemplatesPath = path.join(extensionPath, 'resources', 'templates');
    this._userTemplatesPath = path.join(os.homedir(), '.claude-code-chat', 'templates');
  }

  /**
   * 获取内置模板路径
   */
  get builtInTemplatesPath(): string {
    return this._builtInTemplatesPath;
  }

  /**
   * 获取用户模板路径
   */
  get userTemplatesPath(): string {
    return this._userTemplatesPath;
  }

  /**
   * 获取所有模板（内置 + 用户）
   */
  async getAllTemplates(): Promise<Template[]> {
    const [builtIn, user] = await Promise.all([
      this.getBuiltInTemplates(),
      this.getUserTemplates()
    ]);
    return [...builtIn, ...user];
  }

  /**
   * 获取所有内置模板
   */
  async getBuiltInTemplates(): Promise<Template[]> {
    const index = await this._loadBuiltInIndex();
    const templates: Template[] = [];

    for (const id of Object.keys(index.templates)) {
      const template = await this._loadTemplateFromIndex(id, index, this._builtInTemplatesPath, TemplateSource.BUILT_IN);
      if (template) {
        templates.push(template);
      }
    }

    return templates;
  }

  /**
   * 获取所有用户模板
   */
  async getUserTemplates(): Promise<Template[]> {
    const index = await this._loadUserIndex();
    if (!index) {
      return [];
    }

    const templates: Template[] = [];
    for (const id of Object.keys(index.templates)) {
      const template = await this._loadTemplateFromIndex(id, index, this._userTemplatesPath, TemplateSource.USER);
      if (template) {
        templates.push(template);
      }
    }

    return templates;
  }


  /**
   * 根据 ID 获取模板
   */
  async getTemplateById(id: string): Promise<Template | undefined> {
    // 先查找内置模板
    const builtInIndex = await this._loadBuiltInIndex();
    if (builtInIndex.templates[id]) {
      return this._loadTemplateFromIndex(id, builtInIndex, this._builtInTemplatesPath, TemplateSource.BUILT_IN);
    }

    // 再查找用户模板
    const userIndex = await this._loadUserIndex();
    if (userIndex?.templates[id]) {
      return this._loadTemplateFromIndex(id, userIndex, this._userTemplatesPath, TemplateSource.USER);
    }

    return undefined;
  }

  /**
   * 获取模板内容
   */
  async getTemplateContent(id: string): Promise<string> {
    const template = await this.getTemplateById(id);
    if (!template) {
      throw new TemplateHubError(
        TemplateHubErrorCode.TEMPLATE_NOT_FOUND,
        `Template with id '${id}' not found`
      );
    }
    return template.content;
  }

  /**
   * 保存用户模板
   */
  async saveUserTemplate(input: TemplateCreateInput): Promise<Template> {
    await this._ensureUserTemplatesDir();

    const id = this._generateTemplateId(input.name, input.category);
    const targetSubdir = this._getCategorySubdir(input.category);
    const fileName = this._getTemplateFileName(input.name, input.category);
    const filePath = path.join(targetSubdir, fileName);
    const fullPath = path.join(this._userTemplatesPath, filePath);

    // 确保子目录存在
    const subDirPath = path.join(this._userTemplatesPath, targetSubdir);
    if (!fs.existsSync(subDirPath)) {
      fs.mkdirSync(subDirPath, { recursive: true });
    }

    const now = new Date().toISOString();
    const template: Template = {
      id,
      name: input.name,
      description: input.description,
      category: input.category,
      source: TemplateSource.USER,
      tags: input.tags || [],
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      content: input.content,
      filePath,
      targetSubdir
    };

    // 写入模板文件
    const fileContent = this._serializeTemplate(template);
    fs.writeFileSync(fullPath, fileContent, 'utf-8');

    // 更新索引
    await this._updateUserIndex(template);

    return template;
  }

  /**
   * 更新用户模板
   */
  async updateUserTemplate(id: string, updates: Partial<Template>): Promise<Template> {
    const template = await this.getTemplateById(id);
    if (!template) {
      throw new TemplateHubError(
        TemplateHubErrorCode.TEMPLATE_NOT_FOUND,
        `Template with id '${id}' not found`
      );
    }

    if (template.source === TemplateSource.BUILT_IN) {
      throw new TemplateHubError(
        TemplateHubErrorCode.BUILTIN_MODIFICATION_DENIED,
        'Cannot modify built-in templates'
      );
    }

    const updatedTemplate: Template = {
      ...template,
      ...updates,
      id, // ID 不可更改
      source: TemplateSource.USER, // 来源不可更改
      updatedAt: new Date().toISOString()
    };

    // 写入更新后的模板文件
    const fullPath = path.join(this._userTemplatesPath, template.filePath);
    const fileContent = this._serializeTemplate(updatedTemplate);
    fs.writeFileSync(fullPath, fileContent, 'utf-8');

    // 更新索引
    await this._updateUserIndex(updatedTemplate);

    return updatedTemplate;
  }

  /**
   * 删除用户模板
   */
  async deleteUserTemplate(id: string): Promise<void> {
    const template = await this.getTemplateById(id);
    if (!template) {
      throw new TemplateHubError(
        TemplateHubErrorCode.TEMPLATE_NOT_FOUND,
        `Template with id '${id}' not found`
      );
    }

    if (template.source === TemplateSource.BUILT_IN) {
      throw new TemplateHubError(
        TemplateHubErrorCode.BUILTIN_MODIFICATION_DENIED,
        'Cannot delete built-in templates'
      );
    }

    // 删除模板文件
    const fullPath = path.join(this._userTemplatesPath, template.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    // 从索引中移除
    await this._removeFromUserIndex(id);
  }


  /**
   * 重建索引
   */
  async rebuildIndex(): Promise<void> {
    // 重建用户模板索引
    await this._rebuildUserIndex();
  }

  /**
   * 搜索模板（按名称或描述）
   */
  async searchTemplates(query: string): Promise<Template[]> {
    const allTemplates = await this.getAllTemplates();
    const lowerQuery = query.toLowerCase();

    return allTemplates.filter(template =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 按分类过滤模板
   */
  async filterByCategory(category: TemplateCategory): Promise<Template[]> {
    const allTemplates = await this.getAllTemplates();
    return allTemplates.filter(template => template.category === category);
  }

  /**
   * 按标签过滤模板
   */
  async filterByTags(tags: string[]): Promise<Template[]> {
    const allTemplates = await this.getAllTemplates();
    return allTemplates.filter(template =>
      tags.some(tag => template.tags.includes(tag))
    );
  }

  // ==================== 私有方法 ====================

  /**
   * 加载内置模板索引
   */
  private async _loadBuiltInIndex(): Promise<TemplateIndex> {
    if (this._builtInIndex) {
      return this._builtInIndex;
    }

    const indexPath = path.join(this._builtInTemplatesPath, 'index.json');
    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      this._builtInIndex = JSON.parse(content) as TemplateIndex;
      return this._builtInIndex;
    } catch (error) {
      throw new TemplateHubError(
        TemplateHubErrorCode.INDEX_CORRUPTED,
        'Failed to load built-in template index',
        error
      );
    }
  }

  /**
   * 加载用户模板索引
   */
  private async _loadUserIndex(): Promise<TemplateIndex | null> {
    if (this._userIndex) {
      return this._userIndex;
    }

    const indexPath = path.join(this._userTemplatesPath, 'index.json');
    if (!fs.existsSync(indexPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      this._userIndex = JSON.parse(content) as TemplateIndex;
      return this._userIndex;
    } catch (error) {
      // 索引损坏，尝试重建
      await this._rebuildUserIndex();
      return this._userIndex;
    }
  }

  /**
   * 从索引加载模板
   */
  private async _loadTemplateFromIndex(
    id: string,
    index: TemplateIndex,
    basePath: string,
    source: TemplateSource
  ): Promise<Template | undefined> {
    const metadata = index.templates[id];
    if (!metadata) {
      return undefined;
    }

    const filePath = (metadata as any).filePath;
    const fullPath = path.join(basePath, filePath);

    if (!fs.existsSync(fullPath)) {
      return undefined;
    }

    try {
      const fileContent = fs.readFileSync(fullPath, 'utf-8');
      const { content } = this._parseTemplateFile(fileContent);

      return {
        ...metadata,
        source,
        content,
        filePath,
        targetSubdir: (metadata as any).targetSubdir || this._getCategorySubdir(metadata.category as TemplateCategory),
        createdAt: metadata.createdAt || new Date().toISOString(),
        updatedAt: metadata.updatedAt || new Date().toISOString()
      } as Template;
    } catch (error) {
      throw new TemplateHubError(
        TemplateHubErrorCode.STORAGE_READ_ERROR,
        `Failed to read template file: ${fullPath}`,
        error
      );
    }
  }

  /**
   * 解析模板文件（提取 frontmatter 和内容）
   */
  private _parseTemplateFile(fileContent: string): { metadata: Partial<TemplateMetadata>; content: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = fileContent.match(frontmatterRegex);

    if (!match) {
      // 没有 frontmatter，整个文件就是内容
      return { metadata: {}, content: fileContent };
    }

    const frontmatter = match[1];
    const content = match[2].trim();

    // 简单解析 YAML frontmatter
    const metadata: Partial<TemplateMetadata> = {};
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

    return { metadata, content };
  }


  /**
   * 序列化模板为文件内容
   */
  private _serializeTemplate(template: Template): string {
    const isHook = template.category === TemplateCategory.HOOK;

    if (isHook) {
      // Hooks 使用 JSON 格式
      return JSON.stringify({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        tags: template.tags,
        version: template.version,
        author: template.author,
        content: template.content
      }, null, 2);
    }

    // 其他类型使用 Markdown + frontmatter
    const tagsYaml = template.tags.length > 0
      ? `tags:\n${template.tags.map(t => `  - ${t}`).join('\n')}`
      : 'tags: []';

    const frontmatter = `---
id: ${template.id}
name: ${template.name}
description: ${template.description}
category: ${template.category}
${tagsYaml}
version: "${template.version}"
${template.author ? `author: ${template.author}` : ''}
---`;

    return `${frontmatter}\n\n${template.content}`;
  }

  /**
   * 确保用户模板目录存在
   */
  private async _ensureUserTemplatesDir(): Promise<void> {
    if (!fs.existsSync(this._userTemplatesPath)) {
      fs.mkdirSync(this._userTemplatesPath, { recursive: true });
    }

    // 确保子目录存在
    const subdirs = ['skills', 'commands', 'hooks', 'agents'];
    for (const subdir of subdirs) {
      const subdirPath = path.join(this._userTemplatesPath, subdir);
      if (!fs.existsSync(subdirPath)) {
        fs.mkdirSync(subdirPath, { recursive: true });
      }
    }
  }

  /**
   * 生成模板 ID
   */
  private _generateTemplateId(name: string, category: TemplateCategory): string {
    const prefix = this._getCategoryPrefix(category);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${prefix}-${slug}-${Date.now()}`;
  }

  /**
   * 获取分类前缀
   */
  private _getCategoryPrefix(category: TemplateCategory): string {
    const prefixes: Record<TemplateCategory, string> = {
      [TemplateCategory.SKILL]: 'skill',
      [TemplateCategory.COMMAND]: 'cmd',
      [TemplateCategory.HOOK]: 'hook',
      [TemplateCategory.AGENT]: 'agent'
    };
    return prefixes[category];
  }

  /**
   * 获取分类子目录
   */
  private _getCategorySubdir(category: TemplateCategory): string {
    const subdirs: Record<TemplateCategory, string> = {
      [TemplateCategory.SKILL]: 'skills',
      [TemplateCategory.COMMAND]: 'commands',
      [TemplateCategory.HOOK]: 'hooks',
      [TemplateCategory.AGENT]: 'agents'
    };
    return subdirs[category];
  }

  /**
   * 获取模板文件名
   */
  private _getTemplateFileName(name: string, category: TemplateCategory): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const extension = category === TemplateCategory.HOOK ? 'json' : 'md';
    return `${slug}.${extension}`;
  }

  /**
   * 更新用户索引
   */
  private async _updateUserIndex(template: Template): Promise<void> {
    await this._ensureUserTemplatesDir();

    let index = await this._loadUserIndex();
    if (!index) {
      index = {
        version: 1,
        lastUpdated: new Date().toISOString(),
        templates: {},
        byCategory: {},
        byTag: {}
      };
    }

    // 更新模板元数据
    const metadata: TemplateMetadata & { filePath: string; targetSubdir: string } = {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      source: template.source,
      tags: template.tags,
      version: template.version,
      author: template.author,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      filePath: template.filePath,
      targetSubdir: template.targetSubdir
    };

    index.templates[template.id] = metadata;
    index.lastUpdated = new Date().toISOString();

    // 更新分类索引
    if (!index.byCategory[template.category]) {
      index.byCategory[template.category] = [];
    }
    if (!index.byCategory[template.category].includes(template.id)) {
      index.byCategory[template.category].push(template.id);
    }

    // 更新标签索引
    for (const tag of template.tags) {
      if (!index.byTag[tag]) {
        index.byTag[tag] = [];
      }
      if (!index.byTag[tag].includes(template.id)) {
        index.byTag[tag].push(template.id);
      }
    }

    // 写入索引文件
    const indexPath = path.join(this._userTemplatesPath, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');

    // 更新缓存
    this._userIndex = index;
  }

  /**
   * 从用户索引中移除模板
   */
  private async _removeFromUserIndex(id: string): Promise<void> {
    const index = await this._loadUserIndex();
    if (!index) {
      return;
    }

    const template = index.templates[id];
    if (!template) {
      return;
    }

    // 从模板列表中移除
    delete index.templates[id];

    // 从分类索引中移除
    const category = template.category;
    if (index.byCategory[category]) {
      index.byCategory[category] = index.byCategory[category].filter(tid => tid !== id);
    }

    // 从标签索引中移除
    for (const tag of template.tags) {
      if (index.byTag[tag]) {
        index.byTag[tag] = index.byTag[tag].filter(tid => tid !== id);
      }
    }

    index.lastUpdated = new Date().toISOString();

    // 写入索引文件
    const indexPath = path.join(this._userTemplatesPath, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');

    // 更新缓存
    this._userIndex = index;
  }

  /**
   * 重建用户模板索引
   */
  private async _rebuildUserIndex(): Promise<void> {
    await this._ensureUserTemplatesDir();

    const index: TemplateIndex = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      templates: {},
      byCategory: {},
      byTag: {}
    };

    const categories: TemplateCategory[] = [
      TemplateCategory.SKILL,
      TemplateCategory.COMMAND,
      TemplateCategory.HOOK,
      TemplateCategory.AGENT
    ];

    for (const category of categories) {
      const subdir = this._getCategorySubdir(category);
      const subdirPath = path.join(this._userTemplatesPath, subdir);

      if (!fs.existsSync(subdirPath)) {
        continue;
      }

      const files = fs.readdirSync(subdirPath);
      for (const file of files) {
        const filePath = path.join(subdirPath, file);
        const stat = fs.statSync(filePath);

        if (!stat.isFile()) {
          continue;
        }

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const { metadata, content: templateContent } = this._parseTemplateFile(content);

          const id = metadata.id || `user-${category}-${path.basename(file, path.extname(file))}`;
          const template: TemplateMetadata & { filePath: string; targetSubdir: string } = {
            id,
            name: metadata.name || path.basename(file, path.extname(file)),
            description: metadata.description || '',
            category,
            source: TemplateSource.USER,
            tags: metadata.tags || [],
            version: metadata.version || '1.0.0',
            author: metadata.author,
            createdAt: metadata.createdAt || stat.birthtime.toISOString(),
            updatedAt: metadata.updatedAt || stat.mtime.toISOString(),
            filePath: path.join(subdir, file),
            targetSubdir: subdir
          };

          index.templates[id] = template;

          // 更新分类索引
          if (!index.byCategory[category]) {
            index.byCategory[category] = [];
          }
          index.byCategory[category].push(id);

          // 更新标签索引
          for (const tag of template.tags) {
            if (!index.byTag[tag]) {
              index.byTag[tag] = [];
            }
            index.byTag[tag].push(id);
          }
        } catch (error) {
          // 跳过无法解析的文件
          console.error(`Failed to parse template file: ${filePath}`, error);
        }
      }
    }

    // 写入索引文件
    const indexPath = path.join(this._userTemplatesPath, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');

    // 更新缓存
    this._userIndex = index;
  }
}
