/**
 * Operation History Component
 * Displays operation history with undo/redo capabilities
 */

import { Component } from '../Component';
import { Button } from '../base/Button';
import { Icon } from '../base/Icon';
import { Operation, OperationType } from '../../../types/Operation';
import { DetailedOperationPreview } from '../../../services/OperationPreview';

export interface OperationHistoryProps {
    operations: Operation[];
    onUndo?: (operationId: string) => void;
    onRedo?: (operationId: string) => void;
    onPreview?: (operationId: string, action: 'undo' | 'redo') => void;
    onSelectOperation?: (operationId: string) => void;
}

export class OperationHistory extends Component<OperationHistoryProps> {
    private selectedOperationId: string | null = null;
    private previewData: DetailedOperationPreview | null = null;

    render(): string {
        const { operations } = this.props;
        
        if (!operations || operations.length === 0) {
            return this.renderEmptyState();
        }

        return `
            <div class="operation-history">
                <div class="operation-history-header">
                    <h3>操作历史</h3>
                    <span class="operation-count">${operations.length} 个操作</span>
                </div>
                <div class="operation-list">
                    ${operations.map(op => this.renderOperation(op)).join('')}
                </div>
                ${this.previewData ? this.renderPreview() : ''}
            </div>
        `;
    }

    private renderEmptyState(): string {
        return `
            <div class="operation-history empty">
                <div class="empty-state">
                    ${new Icon({ name: 'history', size: 'xlarge' }).render()}
                    <p>暂无操作记录</p>
                    <span class="hint">当您执行文件操作时，将在此处显示</span>
                </div>
            </div>
        `;
    }

    private renderOperation(operation: Operation): string {
        const isSelected = this.selectedOperationId === operation.id;
        const canUndo = !operation.undone;
        const canRedo = operation.undone;
        
        return `
            <div class="operation-item ${operation.undone ? 'undone' : ''} ${isSelected ? 'selected' : ''}" 
                 data-operation-id="${operation.id}">
                <div class="operation-icon">
                    ${this.getOperationIcon(operation.type)}
                </div>
                <div class="operation-content">
                    <div class="operation-type">${this.getOperationLabel(operation.type)}</div>
                    <div class="operation-details">${this.getOperationDetails(operation)}</div>
                    <div class="operation-time">${this.formatTime(operation.timestamp.getTime())}</div>
                </div>
                <div class="operation-actions">
                    ${canUndo ? `
                        ${new Button({
                            label: '',
                            icon: 'undo',
                            size: 'small',
                            variant: 'text',
                            title: '撤销此操作',
                            onClick: () => this.handleUndo(operation.id)
                        }).render()}
                    ` : ''}
                    ${canRedo ? `
                        ${new Button({
                            label: '',
                            icon: 'redo',
                            size: 'small',
                            variant: 'text',
                            title: '重做此操作',
                            onClick: () => this.handleRedo(operation.id)
                        }).render()}
                    ` : ''}
                    ${new Button({
                        label: '',
                        icon: 'eye',
                        size: 'small',
                        variant: 'text',
                        title: '预览操作',
                        onClick: () => this.handlePreview(operation.id, canUndo ? 'undo' : 'redo')
                    }).render()}
                </div>
            </div>
        `;
    }

    private renderPreview(): string {
        if (!this.previewData) return '';
        
        const preview = this.previewData;
        return `
            <div class="operation-preview-panel">
                <div class="preview-header">
                    <h4>${preview.title}</h4>
                    ${new Button({
                        label: '',
                        icon: 'x',
                        size: 'small',
                        variant: 'text',
                        onClick: () => this.closePreview()
                    }).render()}
                </div>
                <div class="preview-content">
                    <p class="preview-description">${preview.description}</p>
                    ${preview.warnings.length > 0 ? `
                        <div class="preview-warnings">
                            ${preview.warnings.map(w => `
                                <div class="warning-item">
                                    ${new Icon({ name: 'alert-triangle', size: 'small' }).render()}
                                    <span>${w}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    ${preview.cascadingOperations.length > 0 ? `
                        <div class="cascading-operations">
                            <h5>级联操作 (${preview.cascadingOperations.length})</h5>
                            <ul>
                                ${preview.cascadingOperations.map(op => `
                                    <li>${this.getOperationLabel(op.type)}: ${this.getOperationDetails(op)}</li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    ${preview.diff ? this.renderDiff(preview.diff) : ''}
                </div>
                <div class="preview-actions">
                    ${preview.canUndo ? `
                        ${new Button({
                            label: '执行撤销',
                            icon: 'undo',
                            variant: 'primary',
                            onClick: () => this.executeUndo(preview.operation.id)
                        }).render()}
                    ` : ''}
                    ${preview.canRedo ? `
                        ${new Button({
                            label: '执行重做',
                            icon: 'redo',
                            variant: 'primary',
                            onClick: () => this.executeRedo(preview.operation.id)
                        }).render()}
                    ` : ''}
                    ${new Button({
                        label: '取消',
                        variant: 'text',
                        onClick: () => this.closePreview()
                    }).render()}
                </div>
            </div>
        `;
    }

    private renderDiff(diff: any): string {
        return `
            <div class="diff-preview">
                <div class="diff-stats">
                    <span class="additions">+${diff.additions}</span>
                    <span class="deletions">-${diff.deletions}</span>
                </div>
                <div class="diff-content">
                    <!-- Diff content would be rendered here -->
                </div>
            </div>
        `;
    }

    private getOperationIcon(type: OperationType): string {
        const iconMap: Record<OperationType, string> = {
            [OperationType.FILE_CREATE]: 'file-plus',
            [OperationType.FILE_EDIT]: 'edit',
            [OperationType.FILE_DELETE]: 'trash-2',
            [OperationType.FILE_RENAME]: 'file-text',
            [OperationType.DIRECTORY_CREATE]: 'folder-plus',
            [OperationType.DIRECTORY_DELETE]: 'folder-minus',
            [OperationType.BASH_COMMAND]: 'terminal',
            [OperationType.MULTI_EDIT]: 'edit-3'
        };

        return new Icon({ 
            name: iconMap[type] || 'file', 
            size: 'small' 
        }).render();
    }

    private getOperationLabel(type: OperationType): string {
        const labelMap: Record<OperationType, string> = {
            [OperationType.FILE_CREATE]: '创建文件',
            [OperationType.FILE_EDIT]: '编辑文件',
            [OperationType.FILE_DELETE]: '删除文件',
            [OperationType.FILE_RENAME]: '重命名文件',
            [OperationType.DIRECTORY_CREATE]: '创建目录',
            [OperationType.DIRECTORY_DELETE]: '删除目录',
            [OperationType.BASH_COMMAND]: 'Bash 命令',
            [OperationType.MULTI_EDIT]: '批量编辑'
        };

        return labelMap[type] || type;
    }

    private getOperationDetails(operation: Operation): string {
        const data = operation.data;
        
        switch (operation.type) {
            case OperationType.FILE_CREATE:
            case OperationType.FILE_EDIT:
            case OperationType.FILE_DELETE:
            case OperationType.MULTI_EDIT:
                return data.filePath ? this.getFileName(data.filePath) : '';
                
            case OperationType.FILE_RENAME:
                return data.oldPath && data.newPath 
                    ? `${this.getFileName(data.oldPath)} → ${this.getFileName(data.newPath)}`
                    : '';
                    
            case OperationType.DIRECTORY_CREATE:
            case OperationType.DIRECTORY_DELETE:
                return data.dirPath ? this.getFileName(data.dirPath) : '';
                
            case OperationType.BASH_COMMAND:
                return data.command ? this.truncateCommand(data.command) : '';
                
            default:
                return '';
        }
    }

    private getFileName(path: string): string {
        const parts = path.split(/[\\/]/);
        return parts[parts.length - 1] || path;
    }

    private truncateCommand(command: string, maxLength: number = 50): string {
        return command.length > maxLength 
            ? command.substring(0, maxLength) + '...'
            : command;
    }

    private formatTime(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
        
        return date.toLocaleDateString();
    }

    private handleUndo(operationId: string): void {
        if (this.props.onUndo) {
            this.props.onUndo(operationId);
        }
    }

    private handleRedo(operationId: string): void {
        if (this.props.onRedo) {
            this.props.onRedo(operationId);
        }
    }

    private handlePreview(operationId: string, action: 'undo' | 'redo'): void {
        this.selectedOperationId = operationId;
        if (this.props.onPreview) {
            this.props.onPreview(operationId, action);
        }
    }

    private executeUndo(operationId: string): void {
        this.closePreview();
        this.handleUndo(operationId);
    }

    private executeRedo(operationId: string): void {
        this.closePreview();
        this.handleRedo(operationId);
    }

    private closePreview(): void {
        this.previewData = null;
        this.selectedOperationId = null;
        this.update();
    }

    public setPreviewData(preview: DetailedOperationPreview | null): void {
        this.previewData = preview;
        this.update();
    }

    public selectOperation(operationId: string): void {
        this.selectedOperationId = operationId;
        if (this.props.onSelectOperation) {
            this.props.onSelectOperation(operationId);
        }
        this.update();
    }

    protected setupEventListeners(): void {
        // 操作项点击事件
        this.element?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const operationItem = target.closest('.operation-item');
            
            if (operationItem) {
                const operationId = operationItem.getAttribute('data-operation-id');
                if (operationId) {
                    this.selectOperation(operationId);
                }
            }
        });
    }
}