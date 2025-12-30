/**
 * Template Hub Validators
 * 模板验证工具函数
 */

import { TemplateCategory, Template, TemplateCreateInput } from '../types';
import { TemplateHubError, TemplateHubErrorCode } from '../types/errors';

/**
 * 验证结果接口
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 根据模板分类验证文件扩展名格式
 * - Skills, Commands, Agents: 使用 .md 格式
 * - Hooks: 使用 .json 格式
 * 
 * @param category 模板分类
 * @param extension 文件扩展名 (包含点号，如 '.md', '.json')
 * @returns 是否为有效格式
 */
export function validateTemplateFormat(
  category: TemplateCategory,
  extension: string
): boolean {
  const normalizedExt = extension.toLowerCase();
  
  if (category === TemplateCategory.HOOK) {
    return normalizedExt === '.json';
  }
  
  // Skills, Commands, Agents 使用 .md 格式
  return normalizedExt === '.md';
}

/**
 * 获取模板分类对应的有效文件扩展名
 * 
 * @param category 模板分类
 * @returns 有效的文件扩展名
 */
export function getValidExtensionForCategory(category: TemplateCategory): string {
  return category === TemplateCategory.HOOK ? '.json' : '.md';
}

/**
 * 验证模板内容
 * 检查模板是否包含所有必需字段且格式正确
 * 
 * @param template 要验证的模板或模板创建输入
 * @returns 验证结果
 */
export function validateTemplateContent(
  template: Partial<Template> | TemplateCreateInput
): ValidationResult {
  const errors: string[] = [];

  // 验证必需字段
  if (!template.name || typeof template.name !== 'string') {
    errors.push('Template name is required and must be a string');
  } else if (template.name.trim().length === 0) {
    errors.push('Template name cannot be empty');
  } else if (template.name.length > 100) {
    errors.push('Template name must be 100 characters or less');
  }

  if (!template.category) {
    errors.push('Template category is required');
  } else if (!Object.values(TemplateCategory).includes(template.category)) {
    errors.push(`Invalid template category: ${template.category}`);
  }

  if (!template.content || typeof template.content !== 'string') {
    errors.push('Template content is required and must be a string');
  } else if (template.content.trim().length === 0) {
    errors.push('Template content cannot be empty');
  }

  // 验证可选字段
  if (template.description !== undefined && typeof template.description !== 'string') {
    errors.push('Template description must be a string');
  }

  if (template.tags !== undefined) {
    if (!Array.isArray(template.tags)) {
      errors.push('Template tags must be an array');
    } else if (!template.tags.every(tag => typeof tag === 'string')) {
      errors.push('All template tags must be strings');
    }
  }

  // 针对 Hook 类型验证 JSON 格式
  if (template.category === TemplateCategory.HOOK && template.content) {
    try {
      JSON.parse(template.content);
    } catch {
      errors.push('Hook template content must be valid JSON');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 验证完整模板对象（包含元数据）
 * 
 * @param template 完整模板对象
 * @returns 验证结果
 */
export function validateFullTemplate(template: Partial<Template>): ValidationResult {
  const baseResult = validateTemplateContent(template);
  const errors = [...baseResult.errors];

  // 验证完整模板的额外字段
  if (!template.id || typeof template.id !== 'string') {
    errors.push('Template id is required and must be a string');
  }

  if (!template.version || typeof template.version !== 'string') {
    errors.push('Template version is required and must be a string');
  }

  if (!template.filePath || typeof template.filePath !== 'string') {
    errors.push('Template filePath is required and must be a string');
  }

  if (!template.targetSubdir || typeof template.targetSubdir !== 'string') {
    errors.push('Template targetSubdir is required and must be a string');
  }

  // 验证 targetSubdir 与 category 匹配
  if (template.category && template.targetSubdir) {
    const expectedSubdir = getCategorySubdir(template.category);
    if (template.targetSubdir !== expectedSubdir) {
      errors.push(`Template targetSubdir '${template.targetSubdir}' does not match category '${template.category}' (expected '${expectedSubdir}')`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 获取模板分类对应的目标子目录
 * 
 * @param category 模板分类
 * @returns 目标子目录名称
 */
export function getCategorySubdir(category: TemplateCategory): string {
  switch (category) {
    case TemplateCategory.SKILL:
      return 'skills';
    case TemplateCategory.COMMAND:
      return 'commands';
    case TemplateCategory.HOOK:
      return 'hooks';
    case TemplateCategory.AGENT:
      return 'agents';
    default:
      throw new TemplateHubError(
        TemplateHubErrorCode.TEMPLATE_INVALID_FORMAT,
        `Unknown template category: ${category}`
      );
  }
}

/**
 * 验证模板文件名
 * 
 * @param filename 文件名
 * @param category 模板分类
 * @returns 验证结果
 */
export function validateTemplateFilename(
  filename: string,
  category: TemplateCategory
): ValidationResult {
  const errors: string[] = [];

  if (!filename || typeof filename !== 'string') {
    errors.push('Filename is required and must be a string');
    return { valid: false, errors };
  }

  // 检查文件名是否包含非法字符
  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (invalidChars.test(filename)) {
    errors.push('Filename contains invalid characters');
  }

  // 检查扩展名
  const ext = filename.substring(filename.lastIndexOf('.'));
  if (!validateTemplateFormat(category, ext)) {
    const expectedExt = getValidExtensionForCategory(category);
    errors.push(`Invalid file extension '${ext}' for category '${category}'. Expected '${expectedExt}'`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
