/**
 * UI Version 2 - Main Entry Point
 * Modular UI system with extracted services
 */

import { StateManager } from './services/StateManager';
import { MessageRenderer } from './services/MessageRenderer';
import { ModalManager } from './services/ModalManager';
import { EventHandlers } from './services/EventHandlers';
import { formatDiff } from './utils/formatters/diff-formatter';
import { formatToolInputUI as formatToolInput } from './utils/formatters/tool-formatter';
import { parseMarkdown } from './utils/markdown';
import { VscodeApi } from './types';
import { getCombinedStyles } from './styles';
import { getBodyContent } from './getBodyContent';
import { uiScript } from './script-loader';

// Import components
import { Layout, Header, Panel } from './components/layout';
import { MessageList } from './components/message/MessageList';
import { InputArea } from './components/message/InputArea';
import { SettingsModal } from './components/modal/SettingsModal';
import { Button } from './components/base/Button';

// Generate the main UI HTML
export function generateUIHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Code Chat</title>
    ${getStyles()}
</head>
<body>
    ${getBodyContent()}
    <script>${getScript()}</script>
</body>
</html>`;
}

function getStyles(): string {
  // 渐进式改进：保持布局稳定，逐步引入视觉增强
  return `<style>${getStylesWithEnhancements()}</style>`;
}

// 渐进式样式改进 - 在原有样式基础上逐步添加增强效果
function getStylesWithEnhancements(): string {
  // 第一步：定义和谐的深色主题渐变色系统
  const colorVariables = `
    :root {
      /* 主渐变色 - 深靛蓝到深紫（更柔和） */
      --grad-primary: linear-gradient(90deg, #3730a3 0%, #4c1d95 100%);
      --grad-primary-start: #3730a3;
      --grad-primary-end: #4c1d95;
      --grad-primary-mid: #4338ca;
      
      /* 语义渐变色 - 全部调整为深色系 */
      --grad-success: linear-gradient(135deg, #166534 0%, #14532d 100%);
      --grad-warning: linear-gradient(135deg, #a16207 0%, #854d0e 100%);
      --grad-error: linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%);
      --grad-info: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
      
      /* 工具渐变色 */
      --grad-tool: linear-gradient(135deg, #5b21b6 0%, #4c1d95 100%);
      --grad-tool-result: linear-gradient(135deg, #115e59 0%, #134e4a 100%);
      
      /* 焦点颜色（用于输入框等） */
      --color-focus-soft: rgba(99, 102, 241, 0.25);
      --color-focus-medium: rgba(99, 102, 241, 0.4);
    }
  `;
  
  // 第二步：只改primary按钮的背景色为渐变
  const primaryButtonEnhancement = `
    /* Primary按钮渐变背景 - New Chat按钮 */
    .btn.primary {
      background: var(--grad-primary);
      color: white;
      border: none;
    }
    
    .btn.primary:hover {
      background: var(--grad-primary);
      opacity: 0.9;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(67, 56, 202, 0.25);  /* 使用主色调的阴影 */
    }
  `;
  
  // 第三步：Send按钮渐变
  const sendButtonEnhancement = `
    /* Send按钮渐变背景 */
    .send-btn {
      background: var(--grad-primary);
      color: white;
      border: none;
      padding: 3px 7px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    
    .send-btn:hover {
      background: var(--grad-primary);
      opacity: 0.9;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(67, 56, 202, 0.25);  /* 使用主色调的阴影 */
    }
    
    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: linear-gradient(90deg, #cccccc 0%, #aaaaaa 100%);
    }
  `;
  
  // 第四步：Outlined按钮悬停效果增强
  const outlinedButtonEnhancement = `
    /* Outlined按钮增强效果 - Settings、Stats等按钮 */
    .btn.outlined {
      background-color: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }
    
    /* 添加渐变边框效果 */
    .btn.outlined::before {
      content: '';
      position: absolute;
      top: -1px;
      left: -1px;
      right: -1px;
      bottom: -1px;
      background: var(--grad-primary);
      border-radius: 4px;
      opacity: 0;
      z-index: -1;
      transition: opacity 0.3s ease;
    }
    
    .btn.outlined:hover {
      background-color: rgba(67, 56, 202, 0.05);  /* 使用主色调的透明版本 */
      border-color: transparent;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(67, 56, 202, 0.15);  /* 更柔和的阴影 */
    }
    
    .btn.outlined:hover::before {
      opacity: 1;
    }
    
    /* 内部内容确保在渐变边框之上 */
    .btn.outlined > * {
      position: relative;
      z-index: 1;
    }
  `;
  
  // 第五步：消息边框渐变和标签背景（和谐深色版本）
  const messageEnhancement = `
    /* 消息边框渐变 - 使用新的和谐色系 */
    .message.user::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--grad-info);
    }
    
    .message.claude::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--grad-success);
    }
    
    .message.error::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--grad-error);
    }
    
    /* 标签样式 - 使用新的和谐色系 */
    .message-label {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .message.user .message-label {
      background: var(--grad-info);
      color: white;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
    
    .message.claude .message-label {
      background: var(--grad-success);
      color: white;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
    
    .message.error .message-label {
      background: var(--grad-error);
      color: white;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
    
    /* 图标样式调整 - 移除此处定义，使用后面的定义 */
    
    /* 工具消息渐变 */
    .message.tool::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--grad-tool);
    }
    
    .message.tool-result::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--grad-tool-result);
    }
    
    /* 工具消息标签样式 - 修正为只有标签有背景 */
    .message.tool {
      background-color: transparent !important;
    }
    
    .message.tool-result {
      background-color: transparent !important;
    }
    
    /* 工具消息标签 */
    .message.tool .message-label {
      background: var(--grad-tool);
      color: white;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
    
    .message.tool-result .message-label {
      background: var(--grad-tool-result);
      color: white;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
    
    /* 工具名称标签样式 */
    .tool-name {
      display: inline-block;
      padding: 2px 8px;
      background: var(--grad-tool);
      color: white;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-right: 8px;
    }
  `;
  
  // 第六步：输入框焦点动画（柔和版本）
  const inputFocusEnhancement = `
    /* 输入框焦点效果 - 更柔和 */
    .textarea-wrapper {
      position: relative;
      transition: box-shadow 0.3s ease;
    }
    
    /* 使用柔和的阴影代替强烈的渐变边框 */
    .textarea-wrapper:focus-within {
      box-shadow: 0 0 0 2px var(--color-focus-soft);
    }
    
    /* 输入框本身的样式调整 */
    .input-field {
      transition: background-color 0.3s ease;
    }
    
    .input-field:focus {
      outline: none;
      background-color: var(--vscode-input-background);
    }
    
    /* 发送按钮在焦点时的微妙光晕 */
    .textarea-wrapper:focus-within .send-btn {
      box-shadow: 0 2px 8px rgba(67, 56, 202, 0.2);
    }
  `;
  
  // 第七步：滚动条和状态灯增强
  const scrollbarAndStatusEnhancement = `
    /* 自定义滚动条样式 - 应用到消息容器和聊天容器 */
    .messages::-webkit-scrollbar,
    .chat-container::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }
    
    .messages::-webkit-scrollbar-track,
    .chat-container::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.03);
      border-radius: 6px;
      margin: 4px;
    }
    
    .messages::-webkit-scrollbar-thumb,
    .chat-container::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, #6366f1 0%, #8b5cf6 100%);
      border-radius: 6px;
      border: 2px solid var(--vscode-editor-background);
      background-clip: padding-box;
    }
    
    .messages::-webkit-scrollbar-thumb:hover,
    .chat-container::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, #818cf8 0%, #a78bfa 100%);
      border: 2px solid var(--vscode-editor-background);
      background-clip: padding-box;
    }
    
    /* 确保滚动条在所有容器中可见 */
    .messages,
    .chat-container {
      scrollbar-width: thin;
      scrollbar-color: #6366f1 rgba(255, 255, 255, 0.03);
    }
    
    /* 状态指示器脉冲动画 */
    @keyframes greenPulse {
      0% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.7;
        transform: scale(1.1);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    /* 应用脉冲动画到ready状态 */
    .status.ready .status-indicator {
      animation: greenPulse 2s ease-in-out infinite;
    }
  `;
  
  // 返回原始样式 + 颜色变量 + 所有增强
  return colorVariables + getStylesOld() + primaryButtonEnhancement + sendButtonEnhancement + outlinedButtonEnhancement + messageEnhancement + inputFocusEnhancement + scrollbarAndStatusEnhancement;
}

// Original inline styles from ui-styles.ts to match the old UI exactly
function getStylesOld(): string {
  // Remove the <style> tags from the original since we add them in getStyles()
  return `
    body {
        font-family: var(--vscode-font-family);
        background-color: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        margin: 0;
        padding: 0;
        height: 100vh;
        display: flex;
        flex-direction: column;
    }

    .header {
        padding: 14px 20px;
        border-bottom: 1px solid var(--vscode-panel-border);
        background-color: var(--vscode-panel-background);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .header h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
        color: var(--vscode-foreground);
        letter-spacing: -0.3px;
    }

    .controls {
        display: flex;
        gap: 6px;
        align-items: center;
    }

    .btn {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: 1px solid var(--vscode-panel-border);
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 400;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .btn:hover {
        background-color: var(--vscode-button-background);
        border-color: var(--vscode-focusBorder);
    }

    .btn.outlined {
        background-color: transparent;
        color: var(--vscode-foreground);
        border-color: var(--vscode-panel-border);
    }

    .btn.outlined:hover {
        background-color: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder);
    }

    .btn.stop {
        background-color: transparent;
        color: var(--vscode-descriptionForeground);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 12px;
        font-weight: 400;
        opacity: 0.7;
    }

    .btn.stop:hover {
        background-color: rgba(231, 76, 60, 0.1);
        color: #e74c3c;
        border-color: rgba(231, 76, 60, 0.3);
        opacity: 1;
    }

    /* WSL Alert */
    .wsl-alert {
        margin: 8px 12px;
        background-color: rgba(135, 206, 235, 0.1);
        border: 2px solid rgba(135, 206, 235, 0.3);
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(4px);
        animation: slideUp 0.3s ease;
    }

    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .wsl-alert-content {
        display: flex;
        align-items: center;
        padding: 14px 18px;
        gap: 14px;
    }

    .wsl-alert-icon {
        font-size: 22px;
        flex-shrink: 0;
    }

    .wsl-alert-text {
        flex: 1;
        font-size: 13px;
        line-height: 1.4;
        color: var(--vscode-foreground);
    }

    .wsl-alert-text strong {
        font-weight: 600;
        color: var(--vscode-foreground);
    }

    .wsl-alert-actions {
        display: flex;
        gap: 10px;
        flex-shrink: 0;
    }

    .wsl-alert-actions .btn {
        padding: 6px 14px;
        font-size: 12px;
        border-radius: 6px;
    }

    .wsl-alert-actions .btn:first-child {
        background-color: rgba(135, 206, 235, 0.2);
        border-color: rgba(135, 206, 235, 0.4);
    }

    .wsl-alert-actions .btn:first-child:hover {
        background-color: rgba(135, 206, 235, 0.3);
        border-color: rgba(135, 206, 235, 0.6);
    }

    .chat-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .messages {
        flex: 1;
        padding: 10px;
        overflow-y: auto;
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        line-height: 1.4;
    }

    .message {
        margin-bottom: 10px;
        padding: 8px;
        border-radius: 4px;
    }

    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* Enhanced code display in messages */
    .message code {
        background-color: rgba(255, 255, 255, 0.06);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: var(--vscode-editor-font-family);
        font-size: 0.9em;
        color: #e06c75;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .message code.file-path {
        color: #61afef;
        cursor: pointer;
        text-decoration: underline;
        text-decoration-style: dotted;
        text-underline-offset: 2px;
    }

    .message code.file-path:hover {
        color: #40a5ff;
        background-color: rgba(64, 165, 255, 0.1);
    }

    .message.user {
        border: 1px solid rgba(64, 165, 255, 0.2);
        border-radius: 8px;
        color: var(--vscode-editor-foreground);
        font-family: var(--vscode-editor-font-family);
        position: relative;
        overflow: hidden;
    }

    .message.user::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(180deg, #40a5ff 0%, #0078d4 100%);
    }

    .message.claude {
        border: 1px solid rgba(46, 204, 113, 0.1);
        border-radius: 8px;
        color: var(--vscode-editor-foreground);
        position: relative;
        overflow: hidden;
    }

    .message.claude::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(180deg, #2ecc71 0%, #27ae60 100%);
    }

    .message.error {
        border: 1px solid rgba(231, 76, 60, 0.3);
        border-radius: 8px;
        color: var(--vscode-editor-foreground);
        position: relative;
        overflow: hidden;
    }

    .message.error::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(180deg, #e74c3c 0%, #c0392b 100%);
    }

    .message.system {
        background-color: var(--vscode-panel-background);
        color: var(--vscode-descriptionForeground);
        font-style: italic;
    }

    .message.tool {
        border: 1px solid rgba(120, 139, 237, 0.12);
        border-radius: 8px;
        color: var(--vscode-editor-foreground);
        position: relative;
        overflow: hidden;
    }

    .message.tool::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(180deg, #7c8bed 0%, #5d6fe1 100%);
    }

    .message.tool-result {
        border: 1px solid rgba(28, 192, 140, 0.2);
        border-radius: 8px;
        color: var(--vscode-editor-foreground);
        font-family: var(--vscode-editor-font-family);
        white-space: pre-wrap;
        position: relative;
        overflow: hidden;
    }

    .message.tool-result::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(180deg, #1cc08c 0%, #16a974 100%);
    }

    .message.thinking {
        border: 1px solid rgba(186, 85, 211, 0.2);
        border-radius: 8px;
        color: var(--vscode-editor-foreground);
        font-family: var(--vscode-editor-font-family);
        font-style: italic;
        opacity: 0.9;
        position: relative;
        overflow: hidden;
    }

    .message.thinking::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(180deg, #ba55d3 0%, #9932cc 100%);
    }

    .tool-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .tool-icon {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        background: linear-gradient(135deg, #7c8bed 0%, #5d6fe1 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: white;
        font-weight: 600;
        flex-shrink: 0;
        margin-left: 6px;
    }

    .tool-info {
        font-weight: 500;
        font-size: 13px;
        color: var(--vscode-editor-foreground);
        opacity: 0.9;
    }

    .message-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        position: relative;
    }

    .copy-btn {
        background: transparent;
        border: none;
        color: var(--vscode-descriptionForeground);
        cursor: pointer;
        padding: 2px;
        border-radius: 3px;
        opacity: 0;
        transition: opacity 0.2s ease;
        margin-left: auto;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .message:hover .copy-btn {
        opacity: 0.7;
    }

    .copy-btn:hover {
        opacity: 1;
        background-color: var(--vscode-list-hoverBackground);
    }

    .message-icon {
        width: 18px;
        height: 18px;
        border-radius: 3px;
        display: inline-flex;  /* 使用inline-flex确保正确对齐 */
        align-items: center;
        justify-content: center;
        font-size: 12px;  /* 调整emoji大小 */
        color: white;
        font-weight: 600;
        flex-shrink: 0;
        margin-left: 6px;
        line-height: 1;  /* 确保行高正确 */
        vertical-align: middle;  /* 垂直对齐中间 */
    }

    .message-icon.user {
        background: linear-gradient(135deg, #40a5ff 0%, #0078d4 100%);
    }

    .message-icon.claude {
        background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
    }

    .message-icon.system {
        background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
    }

    .message-icon.error {
        background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    }

    .message-label {
        font-weight: 500;
        font-size: 12px;
        opacity: 0.8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .message-content {
        padding-left: 6px;
    }

    .priority-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-left: 6px;
    }

    .priority-badge.high {
        background: rgba(231, 76, 60, 0.15);
        color: #e74c3c;
        border: 1px solid rgba(231, 76, 60, 0.3);
    }

    .priority-badge.medium {
        background: rgba(243, 156, 18, 0.15);
        color: #f39c12;
        border: 1px solid rgba(243, 156, 18, 0.3);
    }

    .priority-badge.low {
        background: rgba(149, 165, 166, 0.15);
        color: #95a5a6;
        border: 1px solid rgba(149, 165, 166, 0.3);
    }

    .tool-input {
        padding: 6px;
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        line-height: 1.4;
        white-space: pre-line;
    }

    .tool-input-label {
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        font-weight: 500;
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .tool-input-content {
        color: var(--vscode-editor-foreground);
        opacity: 0.95;
    }

    /* Token display */
    .token-display {
        position: fixed;
        bottom: 80px;
        right: 20px;
        z-index: 100;
        padding: 10px 14px;
        background: linear-gradient(135deg, rgba(124, 139, 237, 0.1) 0%, rgba(93, 111, 225, 0.1) 100%);
        border: 1px solid rgba(124, 139, 237, 0.2);
        border-radius: 6px;
        font-size: 12px;
        animation: slideIn 0.3s ease-out;
    }

    .token-display-content {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .token-icon {
        font-size: 16px;
        animation: bounce 2s ease-in-out infinite;
    }

    .token-text {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .token-input {
        color: var(--vscode-charts-blue);
        font-weight: 500;
    }

    .token-separator {
        color: var(--vscode-descriptionForeground);
        opacity: 0.6;
    }

    .token-output {
        color: var(--vscode-charts-green);
        font-weight: 500;
    }

    .token-total {
        color: var(--vscode-foreground);
        opacity: 0.8;
        font-size: 11px;
    }

    .token-cache {
        color: var(--vscode-charts-orange);
        font-size: 11px;
        opacity: 0.8;
        margin-left: 4px;
    }

    @keyframes slideIn {
        from {
            transform: translateY(-10px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
    }

    /* Diff display styles for Edit tool */
    .diff-container {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        overflow: hidden;
    }

    .diff-header {
        background-color: var(--vscode-panel-background);
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 600;
        color: var(--vscode-foreground);
        border-bottom: 1px solid var(--vscode-panel-border);
    }

    .diff-removed,
    .diff-added {
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        line-height: 1.4;
    }

    .diff-line {
        padding: 2px 12px;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .diff-line.removed {
        background-color: rgba(244, 67, 54, 0.1);
        border-left: 3px solid rgba(244, 67, 54, 0.6);
        color: var(--vscode-foreground);
    }

    .diff-line.added {
        background-color: rgba(76, 175, 80, 0.1);
        border-left: 3px solid rgba(76, 175, 80, 0.6);
        color: var(--vscode-foreground);
    }

    .diff-line.removed::before {
        content: '';
        color: rgba(244, 67, 54, 0.8);
        font-weight: 600;
        margin-right: 8px;
    }

    .diff-line.added::before {
        content: '';
        color: rgba(76, 175, 80, 0.8);
        font-weight: 600;
        margin-right: 8px;
    }

    .diff-expand-container {
        padding: 8px 12px;
        text-align: center;
        border-top: 1px solid var(--vscode-panel-border);
        background-color: var(--vscode-editor-background);
    }

    .diff-expand-btn {
        background: linear-gradient(135deg, rgba(64, 165, 255, 0.15) 0%, rgba(64, 165, 255, 0.1) 100%);
        border: 1px solid rgba(64, 165, 255, 0.3);
        color: #40a5ff;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s ease;
    }

    .diff-expand-btn:hover {
        background: linear-gradient(135deg, rgba(64, 165, 255, 0.25) 0%, rgba(64, 165, 255, 0.15) 100%);
        border-color: rgba(64, 165, 255, 0.5);
    }

    .diff-expand-btn:active {
        transform: translateY(1px);
    }

    /* MultiEdit specific styles */
    .single-edit {
        margin-bottom: 12px;
    }

    .edit-number {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: var(--vscode-descriptionForeground);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        margin-top: 6px;
        display: inline-block;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .diff-edit-separator {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        margin: 12px 0;
    }

    /* File path display styles */
    .diff-file-path {
        padding: 8px 12px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .diff-file-path:hover {
        background-color: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder);
    }

    .diff-file-path:active {
        transform: translateY(1px);
    }

    .file-path-short,
    .file-path-truncated {
        font-family: var(--vscode-editor-font-family);
        color: var(--vscode-foreground);
        font-weight: 500;
    }

    .file-path-truncated {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        padding: 2px 4px;
        border-radius: 3px;
    }

    .file-path-truncated .file-icon {
        font-size: 14px;
        opacity: 0.7;
        transition: opacity 0.2s ease;
    }

    .file-path-truncated:hover {
        color: var(--vscode-textLink-foreground);
        background-color: var(--vscode-list-hoverBackground);
    }

    .file-path-truncated:hover .file-icon {
        opacity: 1;
    }

    .file-path-truncated:active {
        transform: translateY(1px);
    }

    .expand-btn {
        background: linear-gradient(135deg, rgba(64, 165, 255, 0.15) 0%, rgba(64, 165, 255, 0.1) 100%);
        border: 1px solid rgba(64, 165, 255, 0.3);
        color: #40a5ff;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        margin-left: 6px;
        display: inline-block;
        transition: all 0.2s ease;
    }

    .expand-btn:hover {
        background: linear-gradient(135deg, rgba(64, 165, 255, 0.25) 0%, rgba(64, 165, 255, 0.15) 100%);
        border-color: rgba(64, 165, 255, 0.5);
        transform: translateY(-1px);
    }

    .expanded-content {
        margin-top: 8px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        position: relative;
    }

    .expanded-content::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: linear-gradient(180deg, #40a5ff 0%, #0078d4 100%);
        border-radius: 0 0 0 6px;
    }

    .expanded-content pre {
        margin: 0;
        white-space: pre-wrap;
        word-wrap: break-word;
    }

    .input-container {
        padding: 10px;
        border-top: 1px solid var(--vscode-panel-border);
        background-color: var(--vscode-panel-background);
        display: flex;
        flex-direction: column;
        position: relative;
    }

    .input-modes {
        display: flex;
        gap: 16px;
        align-items: center;
        padding-bottom: 5px;
        font-size: 9.5px;
    }

    .mode-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--vscode-foreground);
        opacity: 0.8;
        transition: opacity 0.2s ease;
    }

    .mode-toggle span {
        cursor: pointer;
        transition: opacity 0.2s ease;
    }

    .mode-toggle span:hover {
        opacity: 1;
    }

    .mode-toggle:hover {
        opacity: 1;
    }

    .mode-switch {
        position: relative;
        width: 26px;
        height: 14px;
        background-color: var(--vscode-panel-border);
        border-radius: 7px;
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .mode-switch.active {
        background-color: var(--vscode-button-background);
    }

    .mode-switch::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 10px;
        height: 10px;
        background-color: var(--vscode-foreground);
        border-radius: 50%;
        transition: transform 0.2s ease;
    }

    .mode-switch.active::after {
        transform: translateX(10px);
        background-color: var(--vscode-button-foreground);
    }

    .textarea-container {
        display: flex;
        gap: 10px;
        align-items: flex-end;
    }

    .textarea-wrapper {
        flex: 1;
        background-color: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
        overflow: hidden;
    }

    .textarea-wrapper:focus-within {
        border-color: var(--vscode-focusBorder);
    }

    .input-field {
        width: 100%;
        background-color: transparent;
        color: var(--vscode-input-foreground);
        border: none;
        padding: 12px;
        outline: none;
        font-family: var(--vscode-editor-font-family);
        min-height: 20px;
        line-height: 1.4;
        overflow-y: hidden;
        resize: none;
    }

    .input-field:focus {
        border: none;
        outline: none;
    }

    .input-field::placeholder {
        color: var(--vscode-input-placeholderForeground);
        border: none;
        outline: none;
    }

    .input-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 2px 4px;
        border-top: 1px solid var(--vscode-panel-border);
        background-color: var(--vscode-input-background);
    }

    .left-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-left: 4px;
    }

    .model-selector {
        background-color: rgba(128, 128, 128, 0.15);
        color: var(--vscode-foreground);
        border: none;
        padding: 3px 7px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s ease;
        opacity: 0.9;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .model-selector:hover {
        background-color: rgba(128, 128, 128, 0.25);
        opacity: 1;
    }

    .tools-btn {
        background-color: rgba(128, 128, 128, 0.15);
        color: var(--vscode-foreground);
        border: none;
        padding: 3px 7px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s ease;
        opacity: 0.9;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .tools-btn:hover {
        background-color: rgba(128, 128, 128, 0.25);
        opacity: 1;
    }

    .at-btn {
        background-color: transparent;
        color: var(--vscode-foreground);
        border: none;
        padding: 4px 6px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.2s ease;
    }

    .at-btn:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    .image-btn {
        background-color: transparent;
        color: var(--vscode-foreground);
        border: none;
        padding: 4px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        transition: all 0.2s ease;
        padding-top: 6px;
    }

    .image-btn:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    .send-btn {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 3px 7px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s ease;
    }

    .send-btn div {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 2px;
    }

    .send-btn span {
        line-height: 1;
    }

    .send-btn:hover {
        background-color: var(--vscode-button-hoverBackground);
    }

    .send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .secondary-button {
        background-color: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.2));
        color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
        border: 1px solid var(--vscode-panel-border);
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s ease;
        white-space: nowrap;
    }

    .secondary-button:hover {
        background-color: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.3));
        border-color: var(--vscode-focusBorder);
    }

    .right-controls {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .beta-warning {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        text-align: center;
        font-style: italic;
        background-color: var(--vscode-panel-background);
        padding: 4px;
    }

    .file-picker-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .file-picker-content {
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        width: 400px;
        max-height: 500px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .file-picker-header {
        padding: 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .file-picker-header span {
        font-weight: 500;
        color: var(--vscode-foreground);
    }

    .file-search-input {
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        padding: 6px 8px;
        border-radius: 3px;
        outline: none;
        font-size: 13px;
    }

    .file-search-input:focus {
        border-color: var(--vscode-focusBorder);
    }

    .file-list {
        max-height: 400px;
        overflow-y: auto;
        padding: 4px;
    }

    .file-item {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 3px;
        font-size: 13px;
        gap: 8px;
    }

    .file-item:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    .file-item.selected {
        background-color: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    .file-icon {
        font-size: 16px;
        flex-shrink: 0;
    }

    .file-info {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .file-name {
        font-weight: 500;
    }

    .file-path {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
    }

    .file-thumbnail {
        width: 32px;
        height: 32px;
        border-radius: 4px;
        overflow: hidden;
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .thumbnail-img {
        max-width: 100%;
        max-height: 100%;
        object-fit: cover;
    }

    .tools-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .tools-modal-content {
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        width: 600px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .tools-modal-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--vscode-panel-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .tools-modal-header span {
        font-weight: 600;
        font-size: 14px;
        color: var(--vscode-foreground);
    }

    .tools-close-btn {
        background: none;
        border: none;
        color: var(--vscode-foreground);
        cursor: pointer;
        font-size: 16px;
        padding: 4px;
    }

    .tools-beta-warning {
        padding: 12px 16px;
        background-color: var(--vscode-notifications-warningBackground);
        color: var(--vscode-notifications-warningForeground);
        font-size: 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
    }

    .tools-list {
        padding: 20px;
        overflow-y: auto;
    }

    .tool-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px 0;
        cursor: pointer;
        border-radius: 6px;
        transition: background-color 0.2s ease;
    }

    .tool-item:last-child {
        border-bottom: none;
    }

    .tool-item:hover {
        background-color: var(--vscode-list-hoverBackground);
        padding: 16px 12px;
        margin: 0 -12px;
    }

    .tool-item input[type="checkbox"], 
    .tool-item input[type="radio"] {
        margin: 0;
        margin-top: 2px;
        flex-shrink: 0;
    }

    .tool-item label {
        color: var(--vscode-foreground);
        font-size: 13px;
        cursor: pointer;
        flex: 1;
        line-height: 1.4;
    }

    .tool-item input[type="checkbox"]:disabled + label {
        opacity: 0.7;
    }

    /* Model selection specific styles */
    .model-explanatory-text {
        padding: 20px;
        padding-bottom: 0px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        line-height: 1.4;
    }

    .model-title {
        font-weight: 600;
        margin-bottom: 4px;
    }

    .model-description {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        line-height: 1.3;
    }

    .model-option-content {
        flex: 1;
    }

    .default-model-layout {
        cursor: pointer;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        width: 100%;
    }

    .configure-button {
        margin-left: 12px;
        flex-shrink: 0;
        align-self: flex-start;
    }

    /* Thinking intensity slider */
    .thinking-slider-container {
        position: relative;
        padding: 0px 16px;
        margin: 12px 0;
    }

    .thinking-slider {
        width: 100%;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: var(--vscode-panel-border);
        outline: none !important;
        border: none;
        cursor: pointer;
        border-radius: 2px;
    }

    .thinking-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        background: var(--vscode-foreground);
        cursor: pointer;
        border-radius: 50%;
        transition: transform 0.2s ease;
    }

    .thinking-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
    }

    .thinking-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: var(--vscode-foreground);
        cursor: pointer;
        border-radius: 50%;
        border: none;
        transition: transform 0.2s ease;
    }

    .thinking-slider::-moz-range-thumb:hover {
        transform: scale(1.2);
    }

    .slider-labels {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
        padding: 0 8px;
    }

    .slider-label {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        opacity: 0.7;
        transition: all 0.2s ease;
        text-align: center;
        width: 100px;
        cursor: pointer;
    }

    .slider-label:hover {
        opacity: 1;
        color: var(--vscode-foreground);
    }

    .slider-label.active {
        opacity: 1;
        color: var(--vscode-foreground);
        font-weight: 500;
    }

    .slider-label:first-child {
        margin-left: -50px;
    }

    .slider-label:last-child {
        margin-right: -50px;
    }

    .settings-group {
        padding-bottom: 20px;
        margin-bottom: 40px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .settings-group h3 {
        margin: 0 0 12px 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--vscode-foreground);
    }


    /* Thinking intensity modal */
    .thinking-modal-description {
        padding: 0px 20px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        line-height: 1.5;
        text-align: center;
        margin: 20px;
        margin-bottom: 0px;
    }

    .thinking-modal-actions {
        padding-top: 20px;
        text-align: right;
        border-top: 1px solid var(--vscode-widget-border);
    }

    .confirm-btn {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: 1px solid var(--vscode-panel-border);
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 400;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 5px;
    }

    .confirm-btn:hover {
        background-color: var(--vscode-button-background);
        border-color: var(--vscode-focusBorder);
    }

    /* Slash commands modal */
    .slash-commands-info {
        padding: 12px 16px;
        background-color: rgba(255, 149, 0, 0.1);
        border: 1px solid rgba(255, 149, 0, 0.2);
        border-radius: 4px;
        margin-bottom: 16px;
    }

    .slash-commands-info p {
        margin: 0;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        text-align: center;
        opacity: 0.9;
    }

    .slash-commands-list {
        display: grid;
        gap: 8px;
        max-height: 400px;
        overflow-y: auto;
    }

    .slash-command-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid transparent;
    }

    .slash-command-item:hover {
        background-color: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder);
    }

    .slash-command-icon {
        font-size: 18px;
        min-width: 24px;
        text-align: center;
    }

    .slash-command-content {
        flex: 1;
    }

    .slash-command-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--vscode-foreground);
        margin-bottom: 2px;
    }

    .slash-command-description {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        opacity: 0.8;
    }

    /* Custom command input */
    .custom-command-item {
        cursor: default;
    }

    .custom-command-input-container {
        display: flex;
        align-items: center;
        gap: 2px;
        margin-top: 4px;
    }

    .command-prefix {
        font-size: 12px;
        color: var(--vscode-foreground);
        font-weight: 500;
    }

    .custom-command-input {
        background-color: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        color: var(--vscode-input-foreground);
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 11px;
        outline: none;
        min-width: 120px;
        font-family: var(--vscode-editor-font-family);
    }

    .custom-command-input:focus {
        border-color: var(--vscode-focusBorder);
        box-shadow: 0 0 0 1px var(--vscode-focusBorder);
    }

    .custom-command-input::placeholder {
        color: var(--vscode-input-placeholderForeground);
        opacity: 0.7;
    }

    .status {
        padding: 8px 12px;
        background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
        color: #e1e1e1;
        font-size: 12px;
        border-top: 1px solid var(--vscode-panel-border);
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
    }

    .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .status.ready .status-indicator {
        background-color: #00d26a;
        box-shadow: 0 0 6px rgba(0, 210, 106, 0.5);
    }

    .status.processing .status-indicator {
        background-color: #ff9500;
        box-shadow: 0 0 6px rgba(255, 149, 0, 0.5);
        animation: pulse 1.5s ease-in-out infinite;
    }

    .status.error .status-indicator {
        background-color: #ff453a;
        box-shadow: 0 0 6px rgba(255, 69, 58, 0.5);
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.1); }
    }

    .status-text {
        flex: 1;
    }

    pre {
        white-space: pre-wrap;
        word-wrap: break-word;
        margin: 0;
    }

    .session-badge {
        margin-left: 16px;
        background-color: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 4px;
        transition: background-color 0.2s, transform 0.1s;
    }

    .session-badge:hover {
        background-color: var(--vscode-button-hoverBackground);
        transform: scale(1.02);
    }

    .session-icon {
        font-size: 10px;
    }

    .session-label {
        opacity: 0.8;
        font-size: 10px;
    }

    .session-status {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        padding: 2px 6px;
        border-radius: 4px;
        background-color: var(--vscode-badge-background);
        border: 1px solid var(--vscode-panel-border);
    }

    .session-status.active {
        color: var(--vscode-terminal-ansiGreen);
        background-color: rgba(0, 210, 106, 0.1);
        border-color: var(--vscode-terminal-ansiGreen);
    }

    /* Markdown content styles */
    .message h1, .message h2, .message h3, .message h4 {
        margin: 0.8em 0 0.4em 0;
        font-weight: 600;
        line-height: 1.3;
    }

    .message h1 {
        font-size: 1.5em;
        border-bottom: 2px solid var(--vscode-panel-border);
        padding-bottom: 0.3em;
    }

    .message h2 {
        font-size: 1.3em;
        border-bottom: 1px solid var(--vscode-panel-border);
        padding-bottom: 0.2em;
    }

    .message h3 {
        font-size: 1.1em;
    }

    .message h4 {
        font-size: 1.05em;
    }

    .message strong {
        font-weight: 600;
        color: var(--vscode-terminal-ansiBrightWhite);
    }

    .message em {
        font-style: italic;
    }

    .message ul, .message ol {
        margin: 0.6em 0;
        padding-left: 1.5em;
    }

    .message li {
        margin: 0.3em 0;
        line-height: 1.4;
    }

    .message ul li {
        list-style-type: disc;
    }

    .message ol li {
        list-style-type: decimal;
    }

    .message p {
        margin: 0.5em 0;
        line-height: 1.6;
    }

    .message p:first-child {
        margin-top: 0;
    }

    .message p:last-child {
        margin-bottom: 0;
    }

    .message br {
        line-height: 1.2;
    }

    .restore-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px
    }

    .restore-btn {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
    }

    .restore-btn.dark {
        background-color: #2d2d30;
        color: #999999;
    }

    .restore-btn:hover {
        background-color: var(--vscode-button-hoverBackground);
    }

    .restore-btn.dark:hover {
        background-color: #3e3e42;
    }

    .restore-date {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        opacity: 0.8;
    }

    .conversation-history {
        position: absolute;
        top: 60px;
        left: 0;
        right: 0;
        bottom: 60px;
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-widget-border);
        z-index: 1000;
    }

    .conversation-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--vscode-widget-border);
    }

    .conversation-header h3 {
        margin: 0;
        font-size: 16px;
    }

    .conversation-list {
        padding: 8px;
        overflow-y: auto;
        height: calc(100% - 60px);
    }

    .conversation-item {
        padding: 12px;
        margin: 4px 0;
        border: 1px solid var(--vscode-widget-border);
        border-radius: 6px;
        cursor: pointer;
        background-color: var(--vscode-list-inactiveSelectionBackground);
    }

    .conversation-item:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    .conversation-title {
        font-weight: 500;
        margin-bottom: 4px;
    }

    .conversation-meta {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 4px;
    }

    .conversation-preview {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        opacity: 0.8;
    }

    /* Tool loading animation */
    .tool-loading {
        padding: 16px 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        background-color: var(--vscode-panel-background);
        border-top: 1px solid var(--vscode-panel-border);
    }

    .loading-spinner {
        display: flex;
        gap: 4px;
    }

    .loading-ball {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--vscode-button-background);
        animation: bounce 1.4s ease-in-out infinite both;
    }

    .loading-ball:nth-child(1) { animation-delay: -0.32s; }
    .loading-ball:nth-child(2) { animation-delay: -0.16s; }
    .loading-ball:nth-child(3) { animation-delay: 0s; }

    @keyframes bounce {
        0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.5;
        }
        40% {
            transform: scale(1);
            opacity: 1;
        }
    }

    .loading-text {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        font-style: italic;
    }

    /* Tool completion indicator */
    .tool-completion {
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 6px;
        background-color: rgba(76, 175, 80, 0.1);
        border-top: 1px solid rgba(76, 175, 80, 0.2);
        font-size: 12px;
    }

    .completion-icon {
        color: #4caf50;
        font-weight: bold;
    }

    .completion-text {
        color: var(--vscode-foreground);
        opacity: 0.8;
    }

    /* Request Stats Styles */
    .request-stats {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: 12px;
        padding: 4px 0;
    }

    .stats-icon {
        font-size: 14px;
        font-style: normal;
    }

    .stats-text {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--vscode-descriptionForeground);
    }

    .stats-input,
    .stats-output,
    .stats-total {
        font-weight: 500;
    }

    .stats-separator {
        opacity: 0.6;
    }

    .stats-cost {
        font-weight: 600;
        color: var(--vscode-foreground);
    }

    .stats-duration {
        opacity: 0.7;
    }

    /* Statistics Panel Styles */
    .stats-panel {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--vscode-editor-background);
        z-index: 100;
        display: flex;
        flex-direction: column;
    }

    .stats-header {
        padding: 14px 20px;
        border-bottom: 1px solid var(--vscode-panel-border);
        background-color: var(--vscode-panel-background);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .stats-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
        color: var(--vscode-foreground);
    }

    .stats-tabs {
        display: flex;
        gap: 0;
        padding: 0 20px;
        background-color: var(--vscode-panel-background);
        border-bottom: 1px solid var(--vscode-panel-border);
    }

    .stats-tab {
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--vscode-foreground);
        padding: 10px 20px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s ease;
        opacity: 0.7;
    }

    .stats-tab:hover {
        opacity: 1;
        background-color: var(--vscode-list-hoverBackground);
    }

    .stats-tab.active {
        opacity: 1;
        border-bottom-color: var(--vscode-focusBorder);
        color: var(--vscode-focusBorder);
    }

    .stats-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
    }

    .stats-loading {
        text-align: center;
        padding: 40px;
        color: var(--vscode-descriptionForeground);
    }

    .stats-error {
        text-align: center;
        padding: 40px;
        color: var(--vscode-errorForeground);
    }

    .stats-table-container {
        overflow-x: auto;
    }

    .stats-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        font-family: var(--vscode-editor-font-family);
        font-size: 13px;
    }

    .stats-table th,
    .stats-table td {
        padding: 6px 10px;
        text-align: left;
        border-bottom: 1px solid var(--vscode-panel-border);
    }

    .stats-table th {
        background-color: var(--vscode-panel-background);
        color: var(--vscode-foreground);
        font-weight: 600;
        position: sticky;
        top: 0;
        z-index: 10;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.5px;
    }

    .stats-table td {
        color: var(--vscode-foreground);
        font-variant-numeric: tabular-nums;
    }

    /* Right-align numeric columns for all views */
    .stats-table th:nth-child(2),
    .stats-table th:nth-child(3),
    .stats-table th:nth-child(4),
    .stats-table th:nth-child(5),
    .stats-table th:nth-child(6),
    .stats-table th:nth-child(7) {
        text-align: right;
    }
    
    .stats-table td:nth-child(2),
    .stats-table td:nth-child(3),
    .stats-table td:nth-child(4),
    .stats-table td:nth-child(5),
    .stats-table td:nth-child(6),
    .stats-table td:nth-child(7) {
        text-align: right;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
    }
    
    /* For blocks view status column */
    .stats-table.blocks-view th:nth-child(8),
    .stats-table.blocks-view td:nth-child(8) {
        text-align: center;
    }
    
    /* For session view last activity column */
    .stats-table.session-view th:nth-child(9),
    .stats-table.session-view td:nth-child(9) {
        text-align: left;
        font-family: var(--vscode-editor-font-family);
    }

    .stats-table tr:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    .stats-totals td {
        border-top: 2px solid var(--vscode-panel-border);
        background-color: var(--vscode-panel-background);
        font-weight: 600;
    }

    .stats-empty {
        text-align: center;
        color: var(--vscode-descriptionForeground);
        padding: 40px !important;
    }

    /* Status column styling for blocks view */
    .stats-table .status-active,
    .stats-table .status-inactive {
        text-align: center;
    }

    .stats-table .status-active {
        color: var(--vscode-testing-runAction);
        font-weight: 500;
    }

    .stats-table .status-inactive {
        color: var(--vscode-descriptionForeground);
        opacity: 0.7;
    }

    /* MCP template buttons */
    .mcp-template-btn {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s ease;
    }

    .mcp-template-btn:hover {
        background-color: var(--vscode-button-hoverBackground);
    }

    /* Custom slash command item in list */
    .custom-slash-command {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid transparent;
    }

    .custom-slash-command:hover {
        background-color: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder);
    }

    .manage-btn {
        background-color: transparent;
        color: var(--vscode-button-foreground);
        border: 1px solid var(--vscode-button-border);
        padding: 2px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s ease;
    }

    .manage-btn:hover {
        background-color: var(--vscode-button-hoverBackground);
        border-color: var(--vscode-focusBorder);
    }
`;
}

// getBodyContent function is now imported from ./getBodyContent

function getScript(): string {
  // Return the UI script from script-loader
  return uiScript;
}

// Export the generated HTML string as default
// Use IIFE to ensure we export a string, not a function
export default (() => {
  const html = generateUIHtml();
  console.log('[UI-V2] Generated HTML length:', html.length);
  return html;
})();