/**
 * Input Component Styles
 * Styles for form inputs, textareas, selects, and related elements
 */

export const inputStyles = `
/* ===================================
 * Input Components
 * =================================== */

/* Base Input Styles */
.input,
.input-field,
input[type="text"],
input[type="email"],
input[type="password"],
input[type="number"],
input[type="search"],
input[type="url"],
input[type="tel"],
input[type="date"],
input[type="time"],
textarea,
select {
  width: 100%;
  padding: var(--space-md);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: var(--radius-md);
  font-family: var(--vscode-font-family);
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  transition: all var(--transition-fast);
  -webkit-appearance: none;
  appearance: none;
}

/* Input Focus States */
.input:focus,
.input-field:focus,
input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--grad-primary-mid) 20%, transparent);
}

/* Input Hover States */
.input:hover:not(:disabled):not(:focus),
input:hover:not(:disabled):not(:focus),
textarea:hover:not(:disabled):not(:focus),
select:hover:not(:disabled):not(:focus) {
  border-color: color-mix(in srgb, var(--vscode-focusBorder) 50%, var(--vscode-input-border));
}

/* Disabled Inputs */
.input:disabled,
input:disabled,
textarea:disabled,
select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: var(--vscode-input-background);
}

/* Textarea Specific */
textarea {
  min-height: 80px;
  resize: vertical;
  font-family: var(--vscode-font-family);
}

.textarea-wrapper {
  position: relative;
  width: 100%;
}

.textarea-auto {
  resize: none;
  overflow: hidden;
  min-height: 40px;
  max-height: 200px;
}

/* Message Input Area */
.message-input {
  position: relative;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  resize: none;
  overflow-y: auto;
  min-height: 44px;
  max-height: 200px;
  width: 100%;
  transition: all var(--transition-fast);
}

.message-input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--grad-primary-mid) 20%, transparent);
}

.message-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
  opacity: 0.8;
}

/* Select Dropdown */
select {
  padding-right: var(--space-2xl);
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg width='14' height='8' viewBox='0 0 14 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M1 1L7 7L13 1' stroke='%23999999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right var(--space-md) center;
  background-size: 12px;
}

/* Checkbox and Radio */
input[type="checkbox"],
input[type="radio"] {
  width: auto;
  height: 16px;
  width: 16px;
  margin: 0;
  cursor: pointer;
  vertical-align: middle;
}

input[type="checkbox"] {
  border-radius: var(--radius-sm);
}

input[type="radio"] {
  border-radius: var(--radius-full);
}

input[type="checkbox"]:checked,
input[type="radio"]:checked {
  background-color: var(--vscode-focusBorder);
  border-color: var(--vscode-focusBorder);
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  transition: all var(--transition-fast);
  border-radius: var(--radius-full);
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--vscode-foreground);
  transition: all var(--transition-fast);
  border-radius: var(--radius-full);
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--vscode-button-background);
  border-color: var(--vscode-button-background);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(20px);
  background-color: white;
}

.toggle-switch input:focus + .toggle-slider {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--grad-primary-mid) 20%, transparent);
}

/* Input Groups */
.input-group {
  display: flex;
  align-items: stretch;
  width: 100%;
}

.input-group .input {
  border-radius: 0;
  flex: 1;
}

.input-group .input:first-child {
  border-top-left-radius: var(--radius-md);
  border-bottom-left-radius: var(--radius-md);
}

.input-group .input:last-child {
  border-top-right-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-md);
}

.input-group .input:not(:first-child) {
  border-left: 0;
}

.input-group-addon {
  display: flex;
  align-items: center;
  padding: 0 var(--space-md);
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-input-border);
  color: var(--vscode-descriptionForeground);
  font-size: var(--font-size-sm);
}

.input-group-addon:first-child {
  border-right: 0;
  border-radius: var(--radius-md) 0 0 var(--radius-md);
}

.input-group-addon:last-child {
  border-left: 0;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}

/* Form Groups */
.form-group {
  margin-bottom: var(--space-lg);
}

.form-label {
  display: block;
  margin-bottom: var(--space-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--vscode-foreground);
}

.form-label.required::after {
  content: " *";
  color: var(--vscode-errorForeground);
}

.form-hint {
  display: block;
  margin-top: var(--space-xs);
  font-size: var(--font-size-xs);
  color: var(--vscode-descriptionForeground);
}

/* Input with Icon */
.input-with-icon {
  position: relative;
}

.input-with-icon .input {
  padding-left: var(--space-3xl);
}

.input-icon {
  position: absolute;
  left: var(--space-md);
  top: 50%;
  transform: translateY(-50%);
  color: var(--vscode-descriptionForeground);
  pointer-events: none;
}

/* Search Input */
.search-input {
  padding-left: var(--space-3xl);
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z' fill='%23999999'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: var(--space-md) center;
  background-size: 16px;
}

/* Input Validation States */
.input.error,
.input-error {
  border-color: var(--vscode-inputValidation-errorBorder);
  background-color: var(--vscode-inputValidation-errorBackground);
}

.input.error:focus,
.input-error:focus {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-inputValidation-errorBorder) 20%, transparent);
}

.input.warning,
.input-warning {
  border-color: var(--vscode-inputValidation-warningBorder);
  background-color: var(--vscode-inputValidation-warningBackground);
}

.input.warning:focus,
.input-warning:focus {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-inputValidation-warningBorder) 20%, transparent);
}

.input.success,
.input-success {
  border-color: var(--vscode-testing-iconPassed);
  background-color: color-mix(in srgb, var(--vscode-testing-iconPassed) 5%, var(--vscode-input-background));
}

.input.success:focus,
.input-success:focus {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-testing-iconPassed) 20%, transparent);
}

/* Form Validation Messages */
.form-error {
  display: block;
  margin-top: var(--space-xs);
  font-size: var(--font-size-xs);
  color: var(--vscode-errorForeground);
}

.form-warning {
  display: block;
  margin-top: var(--space-xs);
  font-size: var(--font-size-xs);
  color: var(--vscode-editorWarning-foreground);
}

.form-success {
  display: block;
  margin-top: var(--space-xs);
  font-size: var(--font-size-xs);
  color: var(--vscode-testing-iconPassed);
}

/* File Input */
input[type="file"] {
  padding: var(--space-sm);
  background-color: var(--vscode-editor-background);
  cursor: pointer;
}

input[type="file"]::-webkit-file-upload-button {
  padding: var(--space-sm) var(--space-md);
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--vscode-font-family);
  font-size: var(--font-size-sm);
  cursor: pointer;
  margin-right: var(--space-md);
  transition: all var(--transition-fast);
}

input[type="file"]::-webkit-file-upload-button:hover {
  background-color: var(--vscode-button-hoverBackground);
}

/* Range Input */
input[type="range"] {
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
}

input[type="range"]::-webkit-slider-track {
  width: 100%;
  height: 4px;
  background: var(--vscode-input-background);
  border-radius: var(--radius-full);
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--vscode-button-background);
  border-radius: var(--radius-full);
  cursor: pointer;
  margin-top: -6px;
  transition: all var(--transition-fast);
}

input[type="range"]::-webkit-slider-thumb:hover {
  background: var(--vscode-button-hoverBackground);
  transform: scale(1.2);
}

/* Drag and Drop Styles */
.message-input.drag-over,
textarea.drag-over {
  border-color: var(--vscode-focusBorder);
  background-color: color-mix(in srgb, var(--vscode-focusBorder) 10%, var(--vscode-input-background));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--grad-primary-mid) 30%, transparent);
}

.message-input.drag-over::after,
textarea.drag-over::after {
  content: "Drop image here";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 90%, transparent);
  color: var(--vscode-focusBorder);
  font-weight: var(--font-weight-medium);
  pointer-events: none;
  border-radius: var(--radius-md);
}

/* Attached Image Display */
.attached-image-container {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm);
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-md);
  margin-top: var(--space-sm);
}

.attached-image-preview {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
}

.attached-image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.attached-image-name {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Inline Editable Text */
.editable-text {
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: text;
  transition: all var(--transition-fast);
}

.editable-text:hover {
  background-color: var(--vscode-input-background);
  border-color: var(--vscode-input-border);
}

.editable-text:focus {
  outline: none;
  background-color: var(--vscode-input-background);
  border-color: var(--vscode-focusBorder);
  cursor: text;
}

/* Responsive Input Styles */
@media (max-width: 768px) {
  .input-group {
    flex-direction: column;
  }
  
  .input-group .input:not(:first-child) {
    border-left: 1px solid var(--vscode-input-border);
    border-top: 0;
  }
  
  .input-group .input:first-child {
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }
  
  .input-group .input:last-child {
    border-radius: 0 0 var(--radius-md) var(--radius-md);
  }
}
`;