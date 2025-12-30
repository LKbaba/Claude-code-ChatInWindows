/**
 * Template Hub Core Types
 * 模板管理中心核心类型定义
 */

/**
 * 模板分类枚举
 */
export enum TemplateCategory {
  SKILL = 'skill',
  COMMAND = 'command',
  HOOK = 'hook',
  AGENT = 'agent'
}

/**
 * 模板来源枚举
 */
export enum TemplateSource {
  BUILT_IN = 'built-in',
  USER = 'user',
  IMPORTED = 'imported'
}

/**
 * 模板元数据接口
 */
export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  source: TemplateSource;
  tags: string[];
  version: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 完整模板接口
 */
export interface Template extends TemplateMetadata {
  content: string;
  filePath: string;
  targetSubdir: string;
}

/**
 * 模板创建输入
 */
export interface TemplateCreateInput {
  name: string;
  description: string;
  category: TemplateCategory;
  content: string;
  tags?: string[];
}


/**
 * 模板索引 (用于快速查找)
 */
export interface TemplateIndex {
  version: number;
  lastUpdated: string;
  templates: {
    [id: string]: TemplateMetadata;
  };
  byCategory: {
    [category: string]: string[];
  };
  byTag: {
    [tag: string]: string[];
  };
}

/**
 * 部署选项
 */
export interface DeployOptions {
  overwriteExisting: boolean;
  createBackup: boolean;
  dryRun: boolean;
}

/**
 * 部署验证结果
 */
export interface DeployValidation {
  valid: boolean;
  conflicts: Array<{
    templateId: string;
    existingFile: string;
  }>;
  warnings: string[];
}

/**
 * 部署结果
 */
export interface DeployResult {
  success: boolean;
  deployedTemplates: Array<{
    templateId: string;
    targetPath: string;
  }>;
  skippedTemplates: Array<{
    templateId: string;
    reason: string;
  }>;
  errors: string[];
}

/**
 * 项目类型枚举
 */
export enum ProjectType {
  FRONTEND = 'frontend',
  BACKEND = 'backend',
  FULLSTACK = 'fullstack',
  LIBRARY = 'library',
  CLI = 'cli',
  UNKNOWN = 'unknown'
}

/**
 * 项目分析结果
 */
export interface ProjectAnalysis {
  type: ProjectType;
  frameworks: string[];
  languages: string[];
  hasClaudeConfig: boolean;
  recommendedTemplates: string[];
}


/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  importedTemplates: Template[];
  errors: string[];
}

/**
 * 初始化向导结果
 */
export interface InitWizardResult {
  success: boolean;
  deployedTemplates: string[];
  claudeMdCreated: boolean;
  errors: string[];
}

/**
 * 同步到 CLAUDE.md 的结果
 */
export interface SyncToClaudeMdResult {
  success: boolean;
  syncedCategories: string[];
  claudeMdPath: string;
  errors: string[];
}

/**
 * Template Hub 消息类型
 */
export type TemplateHubMessage =
  | { type: 'getTemplates' }
  | { type: 'getTemplatePreview'; templateId: string }
  | { type: 'deployTemplates'; templateIds: string[]; options: DeployOptions }
  | { type: 'createTemplate'; data: TemplateCreateInput }
  | { type: 'updateTemplate'; templateId: string; data: Partial<Template> }
  | { type: 'deleteTemplate'; templateId: string }
  | { type: 'importTemplates'; source: string }
  | { type: 'exportTemplates'; templateIds: string[] }
  | { type: 'runInitWizard' }
  | { type: 'wizardDeploy'; templateIds: string[]; quickSetup: boolean }
  | { type: 'searchTemplates'; query: string }
  | { type: 'filterTemplates'; category?: TemplateCategory; tags?: string[] }
  | { type: 'syncToClaudeMd' };

/**
 * Template Hub 响应类型
 */
export type TemplateHubResponse =
  | { type: 'templateList'; data: Template[] }
  | { type: 'templatePreview'; data: Template }
  | { type: 'deployResult'; data: DeployResult }
  | { type: 'operationResult'; success: boolean; message: string }
  | { type: 'initWizardData'; data: ProjectAnalysis }
  | { type: 'wizardDeployResult'; data: InitWizardResult }
  | { type: 'syncToClaudeMdResult'; data: SyncToClaudeMdResult }
  | { type: 'error'; message: string };
