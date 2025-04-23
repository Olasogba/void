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
export * from './storage/cacheStrategy';
export * from './storage/indexStructure';

// Export query modules
export * from './query/queryProcessor';

// Export performance modules
export * from './performance/optimizations';

// Export processing modules
export * from './processing/pipeline';

// Export utility modules
export * from './utils/cancellation';

/**
 * Version of the library
 */
export const VERSION = '0.1.0';
