// Export main API
export * from './voidIndexing';

// Export indexing modules
export * from './index/tfIdf';

// Export context modules
export * from './context/contextKey';
export * from './context/localContext';

// Export AST modules
export * from './ast/astParser';

// Export ranking modules
export * from './ranking/contextRanker';

// Export storage modules
export * from './storage/storageAdapter';
export * from './storage/indexStructure';

// Export query modules
export * from './query/queryProcessor';

// Export performance modules
export * from './performance/optimizations';

// Export processing modules
export * from './processing/pipeline';

// Export utility modules
export * from './utils/cancellation';

// Export embedding modules
export * from './embeddings/embeddingService';

// Export search modules
export * from './search/semanticSearch';

// Export chunking modules
export * from './chunking/chunkingStrategy';
export * from './chunking/astChunkingStrategy';

// Export prompt modules
export * from './prompts/promptBuilder';

/**
 * Version of the library
 */
export const VERSION = '0.1.0';
