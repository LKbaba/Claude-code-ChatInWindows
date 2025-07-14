/**
 * Modal Component
 * Base modal component with overlay and content area
 */

import { Component } from '../Component';
import { ModalProps } from '../../types';
import { IconButton } from '../base/Button';

interface ModalState {
  isOpen: boolean;
  isAnimating: boolean;
}

export class Modal extends Component<ModalProps, ModalState> {
  public getState(): ModalState {
    return this.state;
  }
  
  public getElement(): HTMLElement | null {
    return this.element;
  }
  
  public getProps(): ModalProps {
    return this.props;
  }
  
  private previousActiveElement: HTMLElement | null = null;
  private boundHandleEsc: (e: KeyboardEvent) => void;
  private boundHandleOverlayClick: (e: MouseEvent) => void;

  constructor(props: ModalProps) {
    super(props);
    this.boundHandleEsc = this.handleEsc.bind(this);
    this.boundHandleOverlayClick = this.handleOverlayClick.bind(this);
  }

  protected getDefaultProps(): Partial<ModalProps> {
    return {
      isOpen: false,
      size: 'medium',
      closeOnOverlay: true,
      closeOnEsc: true,
      showCloseButton: true,
      animate: true
    };
  }

  protected getInitialState(): ModalState {
    return {
      isOpen: this.props.isOpen,
      isAnimating: false
    };
  }

  protected onMount(): void {
    // Mount child components
    this.mountContent();
    this.mountFooter();
    
    // Mount close button
    if (this.props.showCloseButton) {
      this.mountCloseButton();
    }

    // Setup event listeners
    this.setupEventListeners();

    // Handle initial open state
    if (this.state.isOpen) {
      this.open();
    }
  }

  protected onUnmount(): void {
    this.removeEventListeners();
  }

  protected onUpdate(prevProps: ModalProps): void {
    if (prevProps.isOpen !== this.props.isOpen) {
      if (this.props.isOpen) {
        this.open();
      } else {
        this.close();
      }
    }
  }

  private mountContent(): void {
    const content = this.props.content;
    if (content && typeof content !== 'string') {
      const container = this.element?.querySelector('.modal-body');
      if (container) {
        content.mount(container as HTMLElement);
      }
    }
  }

  private mountFooter(): void {
    const footer = this.props.footer;
    if (footer && typeof footer !== 'string') {
      const container = this.element?.querySelector('.modal-footer');
      if (container) {
        footer.mount(container as HTMLElement);
      }
    }
  }

  private mountCloseButton(): void {
    const container = this.element?.querySelector('.modal-close-container');
    if (container && this.props.onClose) {
      const closeButton = new IconButton({
        icon: 'close',
        title: 'Close modal',
        onClick: this.props.onClose
      });
      closeButton.mount(container as HTMLElement);
    }
  }

  private setupEventListeners(): void {
    const overlay = this.element?.querySelector('.modal-overlay');
    if (overlay && this.props.closeOnOverlay) {
      overlay.addEventListener('click', this.boundHandleOverlayClick as EventListener);
    }
  }

  private removeEventListeners(): void {
    const overlay = this.element?.querySelector('.modal-overlay');
    if (overlay) {
      overlay.removeEventListener('click', this.boundHandleOverlayClick as EventListener);
    }
    
    if (this.props.closeOnEsc) {
      document.removeEventListener('keydown', this.boundHandleEsc);
    }
  }

  private handleEsc(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.state.isOpen && this.props.onClose) {
      this.props.onClose();
    }
  }

  private handleOverlayClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.classList.contains('modal-overlay') && this.props.onClose) {
      this.props.onClose();
    }
  }

  public open(): void {
    // Store current focus
    this.previousActiveElement = document.activeElement as HTMLElement;

    // Add event listeners
    if (this.props.closeOnEsc) {
      document.addEventListener('keydown', this.boundHandleEsc);
    }

    // Update state
    this.setState({ isOpen: true, isAnimating: true });

    // Focus trap
    requestAnimationFrame(() => {
      this.focusFirstElement();
    });

    // Animation complete
    if (this.props.animate) {
      setTimeout(() => {
        this.setState({ isAnimating: false });
      }, 300);
    }

    // Callback
    if (this.props.onOpen) {
      this.props.onOpen();
    }
  }

  public close(): void {
    // Remove event listeners
    if (this.props.closeOnEsc) {
      document.removeEventListener('keydown', this.boundHandleEsc);
    }

    // Update state
    this.setState({ isOpen: false, isAnimating: true });

    // Restore focus
    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
    }

    // Animation complete
    if (this.props.animate) {
      setTimeout(() => {
        this.setState({ isAnimating: false });
      }, 300);
    }
  }

  private focusFirstElement(): void {
    const focusableElements = this.element?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements && focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    }
  }

  render(): string {
    const {
      title,
      content,
      footer,
      size,
      showCloseButton,
      className,
      id
    } = this.props;

    const { isOpen, isAnimating } = this.state;

    if (!isOpen && !isAnimating) {
      return '';
    }

    const classes = this.getClassNames(
      'modal',
      size && `modal-${size}`,
      isOpen && 'modal-open',
      isAnimating && 'modal-animating',
      className
    );

    return `
      <div ${id ? `id="${id}"` : ''} class="${classes}">
        <div class="modal-overlay"></div>
        <div class="modal-container">
          <div class="modal-content">
            ${title || showCloseButton ? `
              <div class="modal-header">
                ${title ? `<h3 class="modal-title">${this.escapeHtml(title)}</h3>` : ''}
                ${showCloseButton ? '<div class="modal-close-container"></div>' : ''}
              </div>
            ` : ''}
            
            <div class="modal-body">
              ${typeof content === 'string' ? content : ''}
            </div>
            
            ${footer ? `
              <div class="modal-footer">
                ${typeof footer === 'string' ? footer : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }
}

/**
 * Confirm Dialog Component
 * Modal for confirmation actions
 */
export interface ConfirmDialogProps extends ModalProps {
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonVariant?: 'primary' | 'danger' | 'warning';
  onConfirm?: () => void;
  onCancel?: () => void;
}

export class ConfirmDialog extends Modal {
  protected getDefaultProps(): Partial<ConfirmDialogProps> {
    return {
      ...super.getDefaultProps(),
      size: 'small',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      confirmButtonVariant: 'primary',
      showCloseButton: false
    };
  }

  render(): string {
    const {
      title,
      message,
      confirmText,
      cancelText,
      confirmButtonVariant,
      onConfirm,
      onCancel
    } = this.props as ConfirmDialogProps;

    const footerContent = `
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="${this.componentId}_cancel()">
          ${cancelText}
        </button>
        <button class="btn btn-${confirmButtonVariant}" onclick="${this.componentId}_confirm()">
          ${confirmText}
        </button>
      </div>
      <script>
        function ${this.componentId}_cancel() {
          ${onCancel ? onCancel.toString() : ''}();
          ${this.props.onClose ? this.props.onClose.toString() : ''}();
        }
        function ${this.componentId}_confirm() {
          ${onConfirm ? onConfirm.toString() : ''}();
          ${this.props.onClose ? this.props.onClose.toString() : ''}();
        }
      </script>
    `;

    return super.render.call({
      ...this,
      props: {
        ...this.props,
        title: title || 'Confirm',
        content: `<p class="confirm-message">${this.escapeHtml(message)}</p>`,
        footer: footerContent
      }
    });
  }
}

/**
 * Alert Dialog Component
 * Modal for displaying alerts
 */
export interface AlertDialogProps extends ModalProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  dismissText?: string;
}

export class AlertDialog extends Modal {
  protected getDefaultProps(): Partial<AlertDialogProps> {
    return {
      ...super.getDefaultProps(),
      size: 'small',
      type: 'info',
      dismissText: 'OK',
      showCloseButton: false
    };
  }

  render(): string {
    const {
      title,
      message,
      type,
      dismissText
    } = this.props as AlertDialogProps;

    const typeIcons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };

    const footerContent = `
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="${this.componentId}_dismiss()">
          ${dismissText}
        </button>
      </div>
      <script>
        function ${this.componentId}_dismiss() {
          ${this.props.onClose ? this.props.onClose.toString() : ''}();
        }
      </script>
    `;

    return super.render.call({
      ...this,
      props: {
        ...this.props,
        title: title || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Alert'),
        content: `
          <div class="alert-content alert-${type}">
            <span class="alert-icon">${typeIcons[type || 'info']}</span>
            <p class="alert-message">${this.escapeHtml(message)}</p>
          </div>
        `,
        footer: footerContent,
        className: this.getClassNames('alert-dialog', `alert-${type}`, this.props.className)
      }
    });
  }
}