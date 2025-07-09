/**
 * Statistics Feature Styles
 * Styles for usage statistics, metrics display, and charts
 */

export const statsStyles = `
/* ===================================
 * Statistics Features
 * =================================== */

/* Stats Container */
.stats-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Stats Header */
.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-lg);
  border-bottom: 1px solid var(--vscode-panel-border);
  background-color: var(--vscode-editor-background);
}

.stats-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--vscode-foreground);
}

.stats-period {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
}

/* Stats Tabs */
.stats-tabs {
  display: flex;
  gap: var(--space-xs);
  padding: 0 var(--space-lg);
  background-color: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border);
}

.stats-tab {
  padding: var(--space-md) var(--space-lg);
  background-color: transparent;
  color: var(--vscode-foreground);
  border: none;
  border-bottom: 2px solid transparent;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  opacity: 0.7;
}

.stats-tab:hover {
  opacity: 1;
  background-color: var(--color-hover-bg);
}

.stats-tab.active {
  opacity: 1;
  color: var(--grad-primary-start);
  border-bottom-color: var(--grad-primary-start);
}

/* Stats Content */
.stats-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-xl);
  background-color: var(--vscode-editor-background);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

/* Stat Card */
.stat-card {
  background: color-mix(in srgb, var(--vscode-editor-foreground) 3%, var(--vscode-editor-background));
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: color-mix(in srgb, var(--grad-primary-start) 30%, var(--vscode-panel-border));
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--grad-primary);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--transition-normal);
}

.stat-card:hover::before {
  transform: scaleX(1);
}

/* Stat Card Content */
.stat-label {
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
  margin-bottom: var(--space-sm);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.stat-value {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--vscode-foreground);
  margin-bottom: var(--space-sm);
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
}

.stat-value-unit {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-normal);
  color: var(--vscode-descriptionForeground);
}

.stat-change {
  font-size: var(--font-size-sm);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.stat-change.positive {
  color: var(--vscode-testing-iconPassed);
}

.stat-change.negative {
  color: var(--vscode-testing-iconFailed);
}

.stat-change-icon {
  font-size: var(--font-size-xs);
}

/* Stat Icons */
.stat-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--grad-primary);
  color: white;
  border-radius: var(--radius-md);
  font-size: 16px;
  margin-bottom: var(--space-md);
}

/* Chart Container */
.chart-container {
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-lg);
}

.chart-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--vscode-foreground);
}

.chart-options {
  display: flex;
  gap: var(--space-sm);
}

.chart-option-btn {
  padding: var(--space-xs) var(--space-md);
  background-color: transparent;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.chart-option-btn:hover {
  background-color: var(--color-hover-bg);
}

.chart-option-btn.active {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
}

/* Bar Chart */
.bar-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 200px;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.bar-chart-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.bar-chart-bar {
  width: 100%;
  background: var(--grad-primary);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  transition: height var(--transition-normal);
  position: relative;
}

.bar-chart-bar:hover {
  opacity: 0.8;
}

.bar-chart-value {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: var(--font-size-xs);
  color: var(--vscode-foreground);
  white-space: nowrap;
}

.bar-chart-label {
  font-size: var(--font-size-xs);
  color: var(--vscode-descriptionForeground);
  text-align: center;
}

/* Progress Stats */
.progress-stat {
  margin-bottom: var(--space-lg);
}

.progress-stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.progress-stat-label {
  font-size: var(--font-size-sm);
  color: var(--vscode-foreground);
}

.progress-stat-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--grad-primary-start);
}

.progress-bar {
  height: 8px;
  background-color: var(--vscode-progressBar-background);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--grad-primary);
  border-radius: var(--radius-full);
  transition: width var(--transition-normal) ease-out;
}

/* Cost Breakdown */
.cost-breakdown {
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.cost-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md) 0;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.cost-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.cost-label {
  font-size: var(--font-size-sm);
  color: var(--vscode-foreground);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.cost-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--vscode-foreground);
}

.cost-total {
  padding-top: var(--space-md);
  margin-top: var(--space-md);
  border-top: 2px solid var(--vscode-panel-border);
}

.cost-total .cost-label {
  font-weight: var(--font-weight-semibold);
}

.cost-total .cost-value {
  font-size: var(--font-size-lg);
  color: var(--grad-primary-start);
}

/* Token Usage */
.token-usage {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.token-type {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.token-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}

.token-icon.input {
  background: color-mix(in srgb, var(--grad-info) 20%, var(--vscode-editor-background));
  color: #4ECDC4;
}

.token-icon.output {
  background: color-mix(in srgb, var(--grad-success) 20%, var(--vscode-editor-background));
  color: #23CE6B;
}

.token-icon.cache {
  background: color-mix(in srgb, var(--grad-warning) 20%, var(--vscode-editor-background));
  color: #FFC857;
}

.token-details {
  flex: 1;
}

.token-label {
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
  margin-bottom: var(--space-xs);
}

.token-count {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--vscode-foreground);
}

/* Empty Stats */
.stats-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  padding: var(--space-2xl);
}

.stats-empty-icon {
  font-size: 48px;
  opacity: 0.3;
  margin-bottom: var(--space-lg);
}

.stats-empty-text {
  font-size: var(--font-size-md);
  margin-bottom: var(--space-sm);
}

/* Export Options */
.stats-export {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-lg);
  background-color: var(--vscode-editor-background);
  border-top: 1px solid var(--vscode-panel-border);
}

.export-btn {
  flex: 1;
  padding: var(--space-md);
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
}

.export-btn:hover {
  background-color: var(--vscode-button-hoverBackground);
}

/* Responsive Stats */
@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .stats-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .bar-chart {
    height: 150px;
  }
  
  .stats-export {
    flex-direction: column;
  }
  
  .export-btn {
    width: 100%;
  }
}
`;