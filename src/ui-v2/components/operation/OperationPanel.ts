/**
 * Operation Panel Component
 * A collapsible panel for operation history
 */

import { Component } from '../Component';
import { Button } from '../base/Button';
import { Icon } from '../base/Icon';
import { OperationHistory } from './OperationHistory';
import { Operation } from '../../../types/Operation';
import { DetailedOperationPreview } from '../../../services/OperationPreview';

export interface OperationPanelProps {
    isOpen?: boolean;
    operations?: Operation[];
    onToggle?: () => void;
    onUndo?: (operationId: string) => void;
    onRedo?: (operationId: string) => void;
    onPreview?: (operationId: string, action: 'undo' | 'redo') => void;
}

export class OperationPanel extends Component<OperationPanelProps> {
    private operationHistory: OperationHistory | null = null;

    render(): string {
        const { isOpen = false, operations = [] } = this.props;
        const undoableCount = operations.filter(op => !op.undone).length;
        const redoableCount = operations.filter(op => op.undone).length;

        return `
            <div class="operation-panel ${isOpen ? 'open' : 'closed'}">
                <div class="operation-panel-header" data-action="toggle">
                    <div class="header-content">
                        ${new Icon({ name: 'history', size: 'small' }).render()}
                        <span class="panel-title">操作历史</span>
                        ${operations.length > 0 ? `
                            <span class="operation-stats">
                                <span class="stat-item" title="可撤销">${undoableCount}</span>
                                <span class="divider">/</span>
                                <span class="stat-item" title="可重做">${redoableCount}</span>
                            </span>
                        ` : ''}
                    </div>
                    ${new Button({
                        label: '',
                        icon: isOpen ? 'chevron-down' : 'chevron-right',
                        size: 'small',
                        variant: 'text',
                        onClick: () => this.handleToggle()
                    }).render()}
                </div>
                ${isOpen ? `
                    <div class="operation-panel-content">
                        ${new OperationHistory({
                            operations: operations,
                            onUndo: this.props.onUndo,
                            onRedo: this.props.onRedo,
                            onPreview: this.props.onPreview
                        }).render()}
                    </div>
                ` : ''}
            </div>
        `;
    }

    private handleToggle(): void {
        if (this.props.onToggle) {
            this.props.onToggle();
        }
    }

    public setPreviewData(preview: DetailedOperationPreview | null): void {
        if (this.operationHistory) {
            this.operationHistory.setPreviewData(preview);
        }
    }

    protected setupEventListeners(): void {
        // Toggle panel on header click
        const header = this.element?.querySelector('.operation-panel-header');
        header?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            // Only toggle if clicking on header itself, not buttons
            if (!target.closest('button')) {
                this.handleToggle();
            }
        });

        // Setup operation history component
        if (this.props.isOpen) {
            const historyElement = this.element?.querySelector('.operation-panel-content');
            if (historyElement) {
                this.operationHistory = new OperationHistory({
                    operations: this.props.operations || [],
                    onUndo: this.props.onUndo,
                    onRedo: this.props.onRedo,
                    onPreview: this.props.onPreview
                });
                this.operationHistory.mount(historyElement as HTMLElement);
            }
        }
    }

    public updateOperations(operations: Operation[]): void {
        this.props.operations = operations;
        // Since updateProps doesn't exist, we need to re-render the component
        this.update();
    }
}