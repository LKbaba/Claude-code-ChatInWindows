/**
 * Operation Strategy Registry
 * Manages registration and retrieval of operation strategies
 */

import { OperationType } from '../../types/Operation';
import { IOperationStrategy } from './IOperationStrategy';
import { FileCreateStrategy } from './strategies/FileCreateStrategy';
import { FileEditStrategy } from './strategies/FileEditStrategy';
import { FileDeleteStrategy } from './strategies/FileDeleteStrategy';
import { FileRenameStrategy } from './strategies/FileRenameStrategy';
import { DirectoryCreateStrategy } from './strategies/DirectoryCreateStrategy';
import { DirectoryDeleteStrategy } from './strategies/DirectoryDeleteStrategy';
import { BashCommandStrategy } from './strategies/BashCommandStrategy';

export class OperationStrategyRegistry {
    private strategies = new Map<OperationType, IOperationStrategy>();

    constructor() {
        this.registerStrategies();
    }

    /**
     * Register all operation strategies
     */
    private registerStrategies(): void {
        // File operations
        this.strategies.set(OperationType.FILE_CREATE, new FileCreateStrategy());
        this.strategies.set(OperationType.FILE_EDIT, new FileEditStrategy());
        this.strategies.set(OperationType.MULTI_EDIT, new FileEditStrategy()); // Same strategy handles both
        this.strategies.set(OperationType.FILE_DELETE, new FileDeleteStrategy());
        this.strategies.set(OperationType.FILE_RENAME, new FileRenameStrategy());
        
        // Directory operations
        this.strategies.set(OperationType.DIRECTORY_CREATE, new DirectoryCreateStrategy());
        this.strategies.set(OperationType.DIRECTORY_DELETE, new DirectoryDeleteStrategy());
        
        // Command operations
        this.strategies.set(OperationType.BASH_COMMAND, new BashCommandStrategy());
    }

    /**
     * Get strategy for a specific operation type
     */
    getStrategy(type: OperationType): IOperationStrategy | undefined {
        return this.strategies.get(type);
    }

    /**
     * Check if a strategy exists for the given operation type
     */
    hasStrategy(type: OperationType): boolean {
        return this.strategies.has(type);
    }
}