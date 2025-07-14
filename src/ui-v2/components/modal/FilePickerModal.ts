/**
 * FilePickerModal Component
 * A modal dialog for browsing and selecting files from the workspace.
 */

import { Modal } from './Modal';
import { Component } from '../Component';
import { Icon } from '../base/Icon';
import { Button } from '../base/Button';
import { FilePickerModalProps, VsCodeFile } from '../../types';

interface FilePickerModalState {
  isOpen: boolean;
  isAnimating: boolean;
  currentPath: string;
  files: VsCodeFile[];
  isLoading: boolean;
  error: string | null;
  selectedFile: string | null;
}

export class FilePickerModal extends Modal {
  protected declare state: FilePickerModalState;

  constructor(props: FilePickerModalProps) {
    super({
      ...props,
      title: 'Select a File',
      size: 'large',
      footer: `
        <div class="modal-footer-buttons">
          <button class="btn btn-secondary" onclick="this.closest('.modal').dispatchEvent(new Event('close'))">Cancel</button>
          <button class="btn btn-primary" id="file-select-btn" disabled onclick="this.dispatchEvent(new Event('select-file'))">Select</button>
        </div>
      `
    });
    this.state = this.getInitialState();
  }

  protected getInitialState(): FilePickerModalState {
    return {
      ...super.getInitialState(),
      currentPath: this.props.initialPath || '.',
      files: [],
      isLoading: true,
      error: null,
      selectedFile: null,
    };
  }

  protected onMount(): void {
    super.onMount();
    this.fetchDirectoryListing();
    this.setupFilePickerEventListeners();
  }
  
  private setupFilePickerEventListeners(): void {
      if (!this.element) return;
      this.element.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const fileItem = target.closest<HTMLElement>('[data-path]');
        if (fileItem) {
            this.handleItemClick(fileItem.dataset.path!, fileItem.dataset.type as 'file' | 'directory');
        }
      });
  }

  private async fetchDirectoryListing(): Promise<void> {
    this.setState({ isLoading: true, error: null } as Partial<FilePickerModalState>);
    try {
      // @ts-ignore - vscode is available in the webview context
      const vscode = window.vscode || { postMessage: () => Promise.resolve([]) };
      const files = await vscode.postMessage({
        command: 'listDirectory',
        path: this.state.currentPath,
      });
      
      this.setState({
        files: (files as VsCodeFile[]).sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        }),
        isLoading: false,
      } as Partial<FilePickerModalState>);
    } catch (err: any) {
      this.setState({
        error: `Failed to load directory: ${err.message}`,
        isLoading: false,
      } as Partial<FilePickerModalState>);
    }
  }

  private handleItemClick(path: string, type: 'file' | 'directory'): void {
    if (type === 'directory') {
      this.setState({ currentPath: path } as Partial<FilePickerModalState>);
      this.fetchDirectoryListing();
    } else {
      this.setState({ selectedFile: path } as Partial<FilePickerModalState>);
      // Update footer buttons
      const selectBtn = this.element?.querySelector('#file-select-btn') as HTMLButtonElement;
      if (selectBtn) {
        selectBtn.disabled = false;
      }
    }
  }
  
  private handleGoUp(): void {
    const parts = this.state.currentPath.split('/').filter(p => p);
    parts.pop();
    const parentPath = parts.length > 0 ? parts.join('/') : '.';
    this.setState({ currentPath: parentPath } as Partial<FilePickerModalState>);
    this.fetchDirectoryListing();
  }

  private handleSelectFile(): void {
    if (this.state.selectedFile && this.props.onFileSelect) {
      this.props.onFileSelect(this.state.selectedFile);
    }
  }
  
  protected renderContent(): string {
    const { isLoading, error, files, currentPath, selectedFile } = this.state;

    if (isLoading) {
      return `<div class="loading-spinner">Loading files...</div>`;
    }

    if (error) {
      return `<div class="error-message">${this.escapeHtml(error)}</div>`;
    }

    const fileItems = files.map(file => {
      const isSelected = selectedFile === `${currentPath}/${file.name}`;
      return `
        <li
          class="file-item ${isSelected ? 'selected' : ''}"
          data-path="${currentPath}/${file.name}"
          data-type="${file.type}"
          tabindex="0"
        >
          ${new Icon({ name: file.type === 'directory' ? 'folder' : 'file' }).render()}
          <span class="file-name">${this.escapeHtml(file.name)}</span>
        </li>
      `;
    }).join('');

    return `
      <div class="file-picker">
        <div class="file-picker-header">
          <button class="icon-button" id="go-up-btn" title="Go up a directory">
            ${new Icon({ name: 'arrow-up' }).render()}
          </button>
          <span class="current-path">${this.escapeHtml(currentPath)}</span>
        </div>
        <ul class="file-list">
          ${fileItems}
        </ul>
      </div>
    `;
  }
  
  public render(): string {
    // Override the base modal render to inject our content
    this.props.content = this.renderContent();
    return super.render();
  }
}