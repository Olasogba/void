import { CancellationToken } from './utils/cancellation';
import { EmbeddingProvider, EmbeddingsService } from './embeddings/embeddingService';
import { SemanticSearchEngine, SemanticSearchOptions } from './search/semanticSearch';
import { LocalContextGatherer } from './context/localContext';
import { ASTParser } from './ast/astParser';
import { ChunkingStrategy, ChunkingStrategyType, Chunk, ChunkingOptions } from './chunking/chunkingStrategy';
import { FixedSizeChunkingStrategy } from './chunking/chunkingStrategy';
import { SemanticChunkingStrategy } from './chunking/chunkingStrategy';
import { ASTChunkingStrategy } from './chunking/astChunkingStrategy';
import { PromptBuilder, PromptTemplate, PromptContext, PromptResult } from './prompts/promptBuilder';
import { StorageAdapter, InMemoryStorageAdapter } from './storage/storageAdapter';
import { TfIdfCalculator } from './index/tfIdf';

/**
 * Configuration options for the void-indexing library.
 */
export interface VoidIndexingConfig {
	/**
	 * Embedding provider to use for semantic search.
	 */
	embeddingProvider?: EmbeddingProvider;

	/**
	 * Storage adapter to use for persisting data.
	 */
	storageAdapter?: StorageAdapter;

	/**
	 * Template for building prompts.
	 */
	promptTemplate?: Partial<PromptTemplate>;

	/**
	 * Options for chunking files.
	 */
	chunkingOptions?: Partial<ChunkingOptions>;

	/**
	 * AST parser to use.
	 */
	astParser?: ASTParser;
}

/**
 * Options for indexing files.
 */
export interface IndexingOptions {
	/**
	 * File patterns to include.
	 */
	includePatterns?: string[];

	/**
	 * File patterns to exclude.
	 */
	excludePatterns?: string[];

	/**
	 * Chunking strategy to use.
	 */
	chunkingStrategy?: ChunkingStrategyType;

	/**
	 * ID of the embedding provider to use.
	 */
	providerId?: string;

	/**
	 * Whether to extract and store metadata from the files.
	 */
	extractMetadata?: boolean;
}

/**
 * Repository indexing result.
 */
export interface IndexingResult {
	/**
	 * Number of files processed.
	 */
	filesProcessed: number;

	/**
	 * Number of chunks created.
	 */
	chunksCreated: number;

	/**
	 * Any errors that occurred during indexing.
	 */
	errors: { file: string; error: string }[];
}

/**
 * Search result item.
 */
export interface SearchResult {
	/**
	 * ID of the result.
	 */
	id: string;

	/**
	 * Content of the result.
	 */
	content: string;

	/**
	 * Similarity score of the result.
	 */
	score: number;

	/**
	 * Metadata about the result.
	 */
	metadata: Record<string, any>;
}

/**
 * Main class for the void-indexing library.
 */
export class VoidIndexing {
	private embeddingService: EmbeddingsService;
	private semanticSearch: SemanticSearchEngine;
	private contextGatherer: LocalContextGatherer;
	private chunkingStrategies: Map<ChunkingStrategyType, ChunkingStrategy>;
	private promptBuilder: PromptBuilder;
	private storage: StorageAdapter;
	private tfIdfCalculator: TfIdfCalculator;
	private defaultProviderId: string = 'default';

	/**
	 * Create a new instance of the void-indexing library.
	 * @param config Configuration options
	 */
	constructor(config: VoidIndexingConfig = {}) {
		// Initialize embedding service
		this.embeddingService = new EmbeddingsService();

		if (config.embeddingProvider) {
			this.embeddingService.registerProvider(this.defaultProviderId, config.embeddingProvider);
		}

		// Initialize semantic search engine
		this.semanticSearch = new SemanticSearchEngine(this.embeddingService);

		// Initialize context gatherer
		this.contextGatherer = new LocalContextGatherer();

		// Initialize chunking strategies
		this.chunkingStrategies = new Map();

		this.chunkingStrategies.set(
			ChunkingStrategyType.FixedSize,
			new FixedSizeChunkingStrategy(config.chunkingOptions)
		);

		this.chunkingStrategies.set(
			ChunkingStrategyType.Semantic,
			new SemanticChunkingStrategy(config.chunkingOptions)
		);

		// If an AST parser is provided, set up AST-based chunking
		if (config.astParser) {
			this.chunkingStrategies.set(
				ChunkingStrategyType.AST,
				new ASTChunkingStrategy(config.astParser, config.chunkingOptions)
			);
		}

		// Initialize prompt builder
		this.promptBuilder = new PromptBuilder(config.promptTemplate);

		// Initialize storage
		this.storage = config.storageAdapter || new InMemoryStorageAdapter();

		// Initialize TF-IDF calculator
		this.tfIdfCalculator = new TfIdfCalculator();
	}

	/**
	 * Register an embedding provider.
	 * @param id ID to register the provider under
	 * @param provider The embedding provider
	 */
	registerEmbeddingProvider(id: string, provider: EmbeddingProvider): void {
		this.embeddingService.registerProvider(id, provider);
	}

	/**
	 * Set the default provider ID.
	 * @param id The provider ID to use by default
	 */
	setDefaultProviderId(id: string): void {
		if (!this.embeddingService.getProvider(id)) {
			throw new Error(`No embedding provider found with id: ${id}`);
		}
		this.defaultProviderId = id;
	}

	/**
	 * Get the default provider ID.
	 * @returns The default provider ID
	 */
	getDefaultProviderId(): string {
		return this.defaultProviderId;
	}

	/**
	 * Register an AST parser and enable AST-based chunking.
	 * @param astParser The AST parser to register
	 * @param options Chunking options for AST-based chunking
	 */
	registerASTParser(astParser: ASTParser, options?: Partial<ChunkingOptions>): void {
		this.chunkingStrategies.set(
			ChunkingStrategyType.AST,
			new ASTChunkingStrategy(astParser, options)
		);
	}

	/**
	 * Index a single file.
	 * @param filePath Path to the file
	 * @param content Content of the file
	 * @param options Indexing options
	 * @param token Cancellation token
	 * @returns Array of chunks created from the file
	 */
	async indexFile(
		filePath: string,
		content: string,
		options: IndexingOptions = {},
		token?: CancellationToken
	): Promise<Chunk[]> {
		if (token?.isCancellationRequested) {
			return [];
		}

		// Extract file metadata
		const fileName = filePath.split('/').pop() || '';
		const fileExtension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';

		const language = this.getLanguageFromExtension(fileExtension);

		// Create metadata for the file
		const metadata: Record<string, any> = {
			fileName,
			filePath,
			language,
			fileExtension,
			indexedAt: new Date().toISOString()
		};

		// Select chunking strategy
		const strategy = options.chunkingStrategy || ChunkingStrategyType.Semantic;
		const chunkingStrategy = this.chunkingStrategies.get(strategy) ||
			this.chunkingStrategies.get(ChunkingStrategyType.FixedSize)!;

		// Chunk the content
		const chunks = await chunkingStrategy.chunk(content, metadata, token);

		if (token?.isCancellationRequested) {
			return [];
		}

		// Get the provider ID for embedding
		const providerId = options.providerId || this.defaultProviderId;
		const provider = this.embeddingService.getProvider(providerId);

		if (!provider) {
			throw new Error(`No embedding provider found with id: ${providerId}`);
		}

		// Store each chunk
		for (const chunk of chunks) {
			if (token?.isCancellationRequested) {
				return [];
			}

			// Compute embedding for the chunk
			const [embedding] = await this.embeddingService.computeEmbeddings(
				providerId,
				[chunk.content],
				token
			);

			// Store in storage adapter
			await this.storage.storeDocument(
				chunk.id,
				chunk.content,
				embedding,
				chunk.metadata
			);
		}

		return chunks;
	}

	/**
	 * Index content directly.
	 * @param content Content to index
	 * @param metadata Metadata for the content
	 * @param options Indexing options
	 * @param token Cancellation token
	 * @returns The created chunk
	 */
	async indexContent(
		content: string,
		metadata: Record<string, any> = {},
		options: IndexingOptions = {},
		token?: CancellationToken
	): Promise<Chunk | null> {
		if (token?.isCancellationRequested) {
			return null;
		}

		// Select chunking strategy
		const strategy = options.chunkingStrategy || ChunkingStrategyType.Semantic;
		const chunkingStrategy = this.chunkingStrategies.get(strategy) ||
			this.chunkingStrategies.get(ChunkingStrategyType.FixedSize)!;

		// Chunk the content (will be just one chunk most likely)
		const chunks = await chunkingStrategy.chunk(content, metadata, token);

		if (token?.isCancellationRequested || chunks.length === 0) {
			return null;
		}

		const chunk = chunks[0];

		// Get the provider ID for embedding
		const providerId = options.providerId || this.defaultProviderId;

		// Compute embedding for the chunk
		const [embedding] = await this.embeddingService.computeEmbeddings(
			providerId,
			[chunk.content],
			token
		);

		// Store in storage adapter
		await this.storage.storeDocument(
			chunk.id,
			chunk.content,
			embedding,
			chunk.metadata
		);

		return chunk;
	}

	/**
	 * Search for relevant content.
	 * @param query Search query
	 * @param options Search options
	 * @param token Cancellation token
	 * @returns Array of search results
	 */
	async search(
		query: string,
		options: SemanticSearchOptions = {},
		token?: CancellationToken
	): Promise<SearchResult[]> {
		if (token?.isCancellationRequested) {
			return [];
		}

		// Get the provider ID for embedding
		const providerId = this.defaultProviderId;

		// Perform semantic search
		const searchResults = await this.semanticSearch.search(
			query,
			providerId,
			options,
			token
		);

		return searchResults.map(result => ({
			id: result.id,
			content: result.content,
			score: result.score,
			metadata: result.metadata || {}
		}));
	}

	/**
	 * Build a prompt with relevant context.
	 * @param query User query
	 * @param options Options for building the prompt
	 * @param token Cancellation token
	 * @returns The built prompt
	 */
	async buildPrompt(
		query: string,
		options: {
			maxContextItems?: number;
			searchThreshold?: number;
			modelCapabilities?: {
				contextWindow: number;
				supportsSystemMessage: boolean;
				maxOutputTokens?: number;
			};
			systemInfo?: Record<string, any>;
		} = {},
		token?: CancellationToken
	): Promise<PromptResult> {
		if (token?.isCancellationRequested) {
			return {
				userMessage: query,
				metadata: {
					includedSnippets: 0,
					totalSnippets: 0,
					estimatedTokens: 0
				}
			};
		}

		// Search for relevant context
		const results = await this.search(
			query,
			{
				topK: options.maxContextItems || 5,
				threshold: options.searchThreshold || 0.7
			},
			token
		);

		if (token?.isCancellationRequested) {
			return {
				userMessage: query,
				metadata: {
					includedSnippets: 0,
					totalSnippets: 0,
					estimatedTokens: 0
				}
			};
		}

		// Convert search results to code snippets
		const snippets = results.map(result => ({
			content: result.content,
			startLine: result.metadata.startLine || 0,
			endLine: result.metadata.endLine || 0,
			relevance: result.score,
			type: 0,
			metadata: {
				fileName: result.metadata.fileName || 'unknown',
				language: result.metadata.language || 'plaintext'
			}
		}));

		// Build prompt with context
		return this.promptBuilder.buildPrompt({
			query,
			codeSnippets: snippets,
			systemInfo: options.systemInfo,
			modelCapabilities: options.modelCapabilities
		});
	}

	/**
	 * Map file extensions to languages.
	 * @param extension File extension
	 * @returns Language name
	 */
	private getLanguageFromExtension(extension: string): string {
		const extensionMap: Record<string, string> = {
			'js': 'javascript',
			'ts': 'typescript',
			'jsx': 'javascript',
			'tsx': 'typescript',
			'py': 'python',
			'java': 'java',
			'c': 'c',
			'cpp': 'cpp',
			'cs': 'csharp',
			'go': 'go',
			'rs': 'rust',
			'php': 'php',
			'rb': 'ruby',
			'swift': 'swift',
			'kt': 'kotlin',
			'scala': 'scala',
			'sh': 'shell',
			'html': 'html',
			'css': 'css',
			'scss': 'scss',
			'json': 'json',
			'md': 'markdown',
			'yaml': 'yaml',
			'yml': 'yaml',
			'xml': 'xml',
			'sql': 'sql'
		};

		return extensionMap[extension.toLowerCase()] || 'plaintext';
	}
}
