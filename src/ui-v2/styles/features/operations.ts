/**
 * Operation History Styles
 */

export const operationStyles = `
    /* Operation Panel */
    .operation-panel {
        border-top: 1px solid var(--border-color);
        background: var(--bg-secondary);
        transition: all 0.3s ease;
    }

    .operation-panel.closed {
        height: 48px;
        overflow: hidden;
    }

    .operation-panel.open {
        height: auto;
        max-height: 400px;
        display: flex;
        flex-direction: column;
    }

    .operation-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        cursor: pointer;
        user-select: none;
        background: var(--bg-primary);
        border-bottom: 1px solid var(--border-color);
    }

    .operation-panel-header:hover {
        background: var(--bg-hover);
    }

    .operation-panel-header .header-content {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
    }

    .operation-panel-header .panel-title {
        font-weight: 500;
        font-size: 14px;
    }

    .operation-stats {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-left: auto;
        margin-right: 8px;
        font-size: 12px;
        color: var(--text-secondary);
    }

    .operation-stats .stat-item {
        padding: 2px 6px;
        background: var(--bg-tertiary);
        border-radius: 10px;
        font-weight: 500;
    }

    .operation-stats .divider {
        color: var(--text-disabled);
    }

    .operation-panel-content {
        flex: 1;
        overflow-y: auto;
        max-height: 350px;
    }

    /* Operation History */
    .operation-history {
        padding: 8px;
    }

    .operation-history.empty {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 16px;
    }

    .operation-history .empty-state {
        text-align: center;
        color: var(--text-secondary);
    }

    .operation-history .empty-state .icon {
        opacity: 0.3;
        margin-bottom: 16px;
    }

    .operation-history .empty-state p {
        margin: 0 0 8px;
        font-size: 14px;
        font-weight: 500;
    }

    .operation-history .empty-state .hint {
        font-size: 12px;
        color: var(--text-disabled);
    }

    .operation-history-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        margin-bottom: 8px;
    }

    .operation-history-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
    }

    .operation-count {
        font-size: 12px;
        color: var(--text-secondary);
    }

    /* Operation List */
    .operation-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .operation-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .operation-item:hover {
        background: var(--bg-hover);
        border-color: var(--border-hover);
    }

    .operation-item.selected {
        background: var(--bg-active);
        border-color: var(--accent-color);
    }

    .operation-item.undone {
        opacity: 0.6;
    }

    .operation-item.undone .operation-type {
        text-decoration: line-through;
    }

    .operation-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: var(--bg-tertiary);
        border-radius: 6px;
        color: var(--text-secondary);
    }

    .operation-content {
        flex: 1;
        min-width: 0;
    }

    .operation-type {
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 2px;
    }

    .operation-details {
        font-size: 12px;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .operation-time {
        font-size: 11px;
        color: var(--text-disabled);
        margin-top: 2px;
    }

    .operation-actions {
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.2s ease;
    }

    .operation-item:hover .operation-actions {
        opacity: 1;
    }

    /* Operation Preview */
    .operation-preview-panel {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        background: var(--bg-primary);
        border-left: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        z-index: 10;
        animation: slideInRight 0.3s ease;
    }

    @keyframes slideInRight {
        from {
            transform: translateX(100%);
        }
        to {
            transform: translateX(0);
        }
    }

    .preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid var(--border-color);
    }

    .preview-header h4 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
    }

    .preview-content {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
    }

    .preview-description {
        margin: 0 0 16px;
        font-size: 14px;
        color: var(--text-secondary);
    }

    .preview-warnings {
        background: rgba(255, 193, 7, 0.1);
        border: 1px solid rgba(255, 193, 7, 0.3);
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 16px;
    }

    .warning-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #ffc107;
    }

    .warning-item + .warning-item {
        margin-top: 8px;
    }

    .cascading-operations {
        background: var(--bg-secondary);
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 16px;
    }

    .cascading-operations h5 {
        margin: 0 0 8px;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-secondary);
    }

    .cascading-operations ul {
        margin: 0;
        padding-left: 20px;
        list-style: disc;
    }

    .cascading-operations li {
        font-size: 12px;
        color: var(--text-secondary);
        margin-bottom: 4px;
    }

    .preview-actions {
        display: flex;
        gap: 8px;
        padding: 16px;
        border-top: 1px solid var(--border-color);
    }

    /* Diff Preview */
    .diff-preview {
        background: var(--bg-secondary);
        border-radius: 6px;
        padding: 12px;
        font-family: var(--font-mono);
        font-size: 12px;
    }

    .diff-stats {
        display: flex;
        gap: 12px;
        margin-bottom: 12px;
        font-size: 13px;
    }

    .diff-stats .additions {
        color: var(--success-color);
    }

    .diff-stats .deletions {
        color: var(--error-color);
    }

    .diff-content {
        overflow-x: auto;
    }

    .diff-line {
        display: flex;
        padding: 2px 0;
        white-space: pre;
    }

    .diff-line.add {
        background: rgba(87, 171, 90, 0.1);
        color: var(--success-color);
    }

    .diff-line.delete {
        background: rgba(229, 83, 75, 0.1);
        color: var(--error-color);
    }

    .diff-line .line-no {
        width: 40px;
        text-align: right;
        padding-right: 8px;
        color: var(--text-disabled);
        user-select: none;
    }

    .diff-line .prefix {
        width: 20px;
        text-align: center;
        user-select: none;
    }

    .diff-line .content {
        flex: 1;
    }
`;