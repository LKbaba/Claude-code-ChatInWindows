/**
 * Template Hub Version Utilities
 * 模板版本比较和更新检测工具
 */

import { Template, TemplateMetadata } from '../types';

/**
 * 版本比较结果
 * -1: v1 < v2 (v1 较旧)
 *  0: v1 = v2 (相同版本)
 *  1: v1 > v2 (v1 较新)
 */
export type VersionCompareResult = -1 | 0 | 1;

/**
 * 模板更新信息
 */
export interface TemplateUpdateInfo {
  templateId: string;
  templateName: string;
  currentVersion: string;
  newVersion: string;
  changelog?: string;
}

/**
 * 更新检测结果
 */
export interface UpdateCheckResult {
  hasUpdates: boolean;
  updates: TemplateUpdateInfo[];
  checkedAt: string;
}

/**
 * 比较两个语义化版本号
 * 支持格式: major.minor.patch (如 1.0.0, 2.1.3)
 * 
 * @param v1 第一个版本号
 * @param v2 第二个版本号
 * @returns -1 如果 v1 < v2, 0 如果相等, 1 如果 v1 > v2
 * 
 * @example
 * compareVersions('1.0.0', '1.0.1') // returns -1
 * compareVersions('2.0.0', '1.9.9') // returns 1
 * compareVersions('1.0.0', '1.0.0') // returns 0
 */
export function compareVersions(v1: string, v2: string): VersionCompareResult {
  // 处理空值或无效输入
  if (!v1 && !v2) {
    return 0;
  }
  if (!v1) {
    return -1;
  }
  if (!v2) {
    return 1;
  }

  // 清理版本号字符串（移除前导 v 或空格）
  const cleanV1 = v1.trim().replace(/^v/i, '');
  const cleanV2 = v2.trim().replace(/^v/i, '');

  // 解析版本号为数字数组
  const parts1 = parseVersionParts(cleanV1);
  const parts2 = parseVersionParts(cleanV2);

  // 比较每个部分
  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 < p2) {
      return -1;
    }
    if (p1 > p2) {
      return 1;
    }
  }

  return 0;
}

/**
 * 解析版本号字符串为数字数组
 * 
 * @param version 版本号字符串
 * @returns 版本号各部分的数字数组
 */
function parseVersionParts(version: string): number[] {
  // 分割版本号，处理预发布标签（如 1.0.0-beta.1）
  const mainVersion = version.split('-')[0];
  
  return mainVersion
    .split('.')
    .map(part => {
      const num = parseInt(part, 10);
      return isNaN(num) ? 0 : num;
    });
}

/**
 * 检查版本是否为有效的语义化版本格式
 * 
 * @param version 版本号字符串
 * @returns 是否为有效版本格式
 */
export function isValidVersion(version: string): boolean {
  if (!version || typeof version !== 'string') {
    return false;
  }

  const cleaned = version.trim().replace(/^v/i, '');
  
  // 基本语义化版本格式: major.minor.patch
  // 可选预发布标签: -alpha, -beta, -rc.1 等
  const semverRegex = /^\d+(\.\d+)*(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;
  
  return semverRegex.test(cleaned);
}

/**
 * 检查是否有更新可用
 * 
 * @param currentVersion 当前版本
 * @param newVersion 新版本
 * @returns 是否有更新
 */
export function hasNewerVersion(currentVersion: string, newVersion: string): boolean {
  return compareVersions(currentVersion, newVersion) === -1;
}

/**
 * 检查内置模板更新
 * 比较当前内置模板与新版本模板，返回有更新的模板列表
 * 
 * @param currentTemplates 当前模板列表
 * @param newTemplates 新版本模板列表
 * @returns 更新检测结果
 */
export function checkForUpdates(
  currentTemplates: Array<Pick<TemplateMetadata, 'id' | 'name' | 'version'>>,
  newTemplates: Array<Pick<TemplateMetadata, 'id' | 'name' | 'version'>>
): UpdateCheckResult {
  const updates: TemplateUpdateInfo[] = [];

  // 创建新模板的映射以便快速查找
  const newTemplateMap = new Map<string, Pick<TemplateMetadata, 'id' | 'name' | 'version'>>();
  for (const template of newTemplates) {
    newTemplateMap.set(template.id, template);
  }

  // 检查每个当前模板是否有更新
  for (const current of currentTemplates) {
    const newTemplate = newTemplateMap.get(current.id);
    
    if (newTemplate && hasNewerVersion(current.version, newTemplate.version)) {
      updates.push({
        templateId: current.id,
        templateName: current.name,
        currentVersion: current.version,
        newVersion: newTemplate.version
      });
    }
  }

  return {
    hasUpdates: updates.length > 0,
    updates,
    checkedAt: new Date().toISOString()
  };
}

/**
 * 获取新增的模板
 * 返回在新版本中存在但当前版本中不存在的模板
 * 
 * @param currentTemplates 当前模板列表
 * @param newTemplates 新版本模板列表
 * @returns 新增模板的 ID 列表
 */
export function getNewTemplates(
  currentTemplates: Array<Pick<TemplateMetadata, 'id'>>,
  newTemplates: Array<Pick<TemplateMetadata, 'id'>>
): string[] {
  const currentIds = new Set(currentTemplates.map(t => t.id));
  return newTemplates
    .filter(t => !currentIds.has(t.id))
    .map(t => t.id);
}

/**
 * 获取已移除的模板
 * 返回在当前版本中存在但新版本中不存在的模板
 * 
 * @param currentTemplates 当前模板列表
 * @param newTemplates 新版本模板列表
 * @returns 已移除模板的 ID 列表
 */
export function getRemovedTemplates(
  currentTemplates: Array<Pick<TemplateMetadata, 'id'>>,
  newTemplates: Array<Pick<TemplateMetadata, 'id'>>
): string[] {
  const newIds = new Set(newTemplates.map(t => t.id));
  return currentTemplates
    .filter(t => !newIds.has(t.id))
    .map(t => t.id);
}

/**
 * 增加版本号
 * 根据指定的类型增加版本号
 * 
 * @param version 当前版本号
 * @param type 增加类型: 'major' | 'minor' | 'patch'
 * @returns 新版本号
 */
export function incrementVersion(
  version: string,
  type: 'major' | 'minor' | 'patch'
): string {
  const cleaned = version.trim().replace(/^v/i, '');
  const parts = parseVersionParts(cleaned);
  
  // 确保至少有三个部分
  while (parts.length < 3) {
    parts.push(0);
  }

  switch (type) {
    case 'major':
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case 'minor':
      parts[1]++;
      parts[2] = 0;
      break;
    case 'patch':
      parts[2]++;
      break;
  }

  return parts.slice(0, 3).join('.');
}
