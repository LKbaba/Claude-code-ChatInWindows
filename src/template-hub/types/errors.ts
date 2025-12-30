/**
 * Template Hub Error Types
 * 模板管理中心错误类型定义
 */

/**
 * Template Hub 错误代码枚举
 */
export enum TemplateHubErrorCode {
  // 存储错误
  STORAGE_READ_ERROR = 'STORAGE_READ_ERROR',
  STORAGE_WRITE_ERROR = 'STORAGE_WRITE_ERROR',
  INDEX_CORRUPTED = 'INDEX_CORRUPTED',

  // 模板错误
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  TEMPLATE_INVALID_FORMAT = 'TEMPLATE_INVALID_FORMAT',
  TEMPLATE_VALIDATION_FAILED = 'TEMPLATE_VALIDATION_FAILED',

  // 部署错误
  DEPLOY_TARGET_NOT_WRITABLE = 'DEPLOY_TARGET_NOT_WRITABLE',
  DEPLOY_CONFLICT = 'DEPLOY_CONFLICT',
  DEPLOY_PARTIAL_FAILURE = 'DEPLOY_PARTIAL_FAILURE',

  // 导入导出错误
  IMPORT_INVALID_FILE = 'IMPORT_INVALID_FILE',
  IMPORT_PARSE_ERROR = 'IMPORT_PARSE_ERROR',
  EXPORT_WRITE_ERROR = 'EXPORT_WRITE_ERROR',

  // 权限错误
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  BUILTIN_MODIFICATION_DENIED = 'BUILTIN_MODIFICATION_DENIED'
}

/**
 * Template Hub 自定义错误类
 */
export class TemplateHubError extends Error {
  public readonly code: TemplateHubErrorCode;
  public readonly details?: unknown;

  constructor(code: TemplateHubErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'TemplateHubError';
    this.code = code;
    this.details = details;

    // 确保原型链正确
    Object.setPrototypeOf(this, TemplateHubError.prototype);
  }
}
