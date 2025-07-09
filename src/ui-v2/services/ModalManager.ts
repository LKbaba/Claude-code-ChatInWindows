/**
 * Modal Manager Service
 * Manages modal state and lifecycle
 */

import { Modal } from '../components/modal/Modal';
import { ModalType } from '../types';

export class ModalManager {
    private activeModals: Map<ModalType, Modal> = new Map();
    private modalStack: ModalType[] = [];

    /**
     * Open a modal
     */
    open(type: ModalType, modal?: Modal): void {
        // If modal already exists and is open, bring to front
        if (this.activeModals.has(type)) {
            const existingModal = this.activeModals.get(type)!;
            if (existingModal.getState().isOpen) {
                this.bringToFront(type);
                return;
            }
        }

        // Add to active modals if provided
        if (modal) {
            this.activeModals.set(type, modal);
        }

        // Add to stack if not already there
        if (!this.modalStack.includes(type)) {
            this.modalStack.push(type);
        }

        // Open the modal
        const modalInstance = this.activeModals.get(type);
        if (modalInstance) {
            modalInstance.open();
        }
    }

    /**
     * Close a modal
     */
    close(type?: ModalType): void {
        if (!type) {
            // Close topmost modal
            const topModal = this.modalStack[this.modalStack.length - 1];
            if (topModal) {
                this.close(topModal);
            }
            return;
        }

        const modal = this.activeModals.get(type);
        if (modal) {
            modal.close();
            // Remove from stack
            this.modalStack = this.modalStack.filter(t => t !== type);
        }
    }

    /**
     * Close all modals
     */
    closeAll(): void {
        // Close in reverse order
        [...this.modalStack].reverse().forEach(type => {
            this.close(type);
        });
    }

    /**
     * Check if a modal is open
     */
    isOpen(type: ModalType): boolean {
        const modal = this.activeModals.get(type);
        return modal ? modal.getState().isOpen : false;
    }

    /**
     * Toggle a modal
     */
    toggle(type: ModalType, modal?: Modal): void {
        if (this.isOpen(type)) {
            this.close(type);
        } else {
            this.open(type, modal);
        }
    }

    /**
     * Register a modal instance
     */
    register(type: ModalType, modal: Modal): void {
        this.activeModals.set(type, modal);
    }

    /**
     * Unregister a modal instance
     */
    unregister(type: ModalType): void {
        this.activeModals.delete(type);
        this.modalStack = this.modalStack.filter(t => t !== type);
    }

    /**
     * Get the current modal stack
     */
    getStack(): ModalType[] {
        return [...this.modalStack];
    }

    /**
     * Get active modal of a type
     */
    getModal(type: ModalType): Modal | undefined {
        return this.activeModals.get(type);
    }

    /**
     * Bring a modal to front
     */
    private bringToFront(type: ModalType): void {
        // Remove from current position
        this.modalStack = this.modalStack.filter(t => t !== type);
        // Add to end (top)
        this.modalStack.push(type);
        
        // Update z-index if needed
        const modal = this.activeModals.get(type);
        if (modal) {
            const element = modal.getElement();
            if (element) {
                // Set z-index based on position in stack
                const zIndex = 1000 + this.modalStack.indexOf(type) * 10;
                element.style.zIndex = zIndex.toString();
            }
        }
    }

    /**
     * Handle escape key for topmost modal
     */
    handleEscape(): boolean {
        if (this.modalStack.length > 0) {
            const topModal = this.modalStack[this.modalStack.length - 1];
            const modal = this.activeModals.get(topModal);
            if (modal && modal.getProps().closeOnEsc !== false) {
                this.close(topModal);
                return true;
            }
        }
        return false;
    }
}

// Create singleton instance
export const modalManager = new ModalManager();

// Factory function
export const createModalManager = () => new ModalManager();