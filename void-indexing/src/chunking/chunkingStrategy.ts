import { CancellationToken } from '../utils/cancellation';

/**
 * Types of chunking strategies available.
 */
export enum ChunkingStrategyType {
	FixedSize,  // Split by fixed character or token count
	Semantic,   // Split on semantic boundaries like sentences, paragraphs
	AST,        // Split based on AST nodes (functions, classes, etc.)
	Hybrid      // Combination of multiple strategies
}

/**
 * Options for chunking operations.
 */
export interface ChunkingOptions {
	maxChunkSize: number;       // Maximum size of each chunk
	minChunkSize?: number;      // Minimum size of each chunk (to avoid tiny chunks)
	overlap?: number;           // Number of characters/tokens to overlap between chunks
	strategy: ChunkingStrategyType;
	delimiter?: string | RegExp; // Delimiter for semantic chunking
	respectCodeBlocks?: boolean; // Whether to avoid splitting inside code blocks
	preserveStructure?: boolean; // Whether to preserve structure (paragraphs, lists)
}

/**
 * Represents a chunk of content.
 */
export interface Chunk {
	id: string;             // Unique identifier for the chunk
	content: string;        // The actual content of the chunk
	metadata: {
		startLine: number;    // Starting line in the original content
		endLine: number;      // Ending line in the original content
		parentId?: string;    // ID of the parent chunk (if hierarchical)
		type?: string;        // Type of the chunk (e.g., "function", "class")
		language?: string;    // Programming language of the chunk
		[key: string]: any;   // Additional metadata
	};
}

/**
 * Abstract base class for chunking strategies.
 */
export abstract class ChunkingStrategy {
	protected options: ChunkingOptions;

	constructor(options: Partial<ChunkingOptions>) {
		this.options = {
			maxChunkSize: 1000,
			minChunkSize: 100,
			overlap: 0,
			strategy: ChunkingStrategyType.FixedSize,
			respectCodeBlocks: true,
			preserveStructure: true,
			...options
		};
	}

	/**
	 * Chunk the provided content into smaller pieces.
	 * @param content The content to chunk
	 * @param metadata Additional metadata about the content
	 * @param token Optional cancellation token
	 * @returns Array of chunks
	 */
	abstract chunk(
		content: string,
		metadata?: Record<string, any>,
		token?: CancellationToken
	): Promise<Chunk[]>;

	/**
	 * Generate a unique ID for a chunk.
	 * @param content The chunk content
	 * @param index The index of the chunk
	 * @param metadata Additional metadata
	 */
	protected generateChunkId(content: string, index: number, metadata?: Record<string, any>): string {
		// Create a simple hash of the content
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}

		// Create a unique ID using the hash and metadata
		const prefix = metadata?.type || 'chunk';
		const fileInfo = metadata?.fileName ? `-${metadata.fileName.replace(/[^a-zA-Z0-9]/g, '_')}` : '';

		return `${prefix}${fileInfo}-${index}-${Math.abs(hash).toString(16)}`;
	}

	/**
	 * Count the estimated number of tokens in a string.
	 * This is a simple approximation based on whitespace.
	 * @param text The text to count tokens in
	 * @returns Estimated token count
	 */
	protected estimateTokenCount(text: string): number {
		// Simple estimation: count words and add a multiplier for punctuation and special tokens
		return Math.ceil(text.split(/\s+/).length * 1.3);
	}

	/**
	 * Calculate the line number at a character offset.
	 * @param content The full content
	 * @param offset Character offset
	 * @returns Line number (0-indexed)
	 */
	protected getLineNumberAtOffset(content: string, offset: number): number {
		const lines = content.slice(0, offset).split('\n');
		return lines.length - 1;
	}
}

/**
 * Fixed-size chunking strategy that splits content based on character count.
 */
export class FixedSizeChunkingStrategy extends ChunkingStrategy {
	constructor(options: Partial<ChunkingOptions> = {}) {
		super({
			...options,
			strategy: ChunkingStrategyType.FixedSize
		});
	}

	async chunk(
		content: string,
		metadata?: Record<string, any>,
		token?: CancellationToken
	): Promise<Chunk[]> {
		if (token?.isCancellationRequested) {
			return [];
		}

		const chunks: Chunk[] = [];
		const maxChunkSize = this.options.maxChunkSize;
		const minChunkSize = this.options.minChunkSize || 100;
		const overlap = this.options.overlap || 0;

		// If content is smaller than max chunk size, return it as a single chunk
		if (content.length <= maxChunkSize) {
			chunks.push({
				id: this.generateChunkId(content, 0, metadata),
				content,
				metadata: {
					startLine: 0,
					endLine: this.getLineNumberAtOffset(content, content.length),
					...metadata
				}
			});
			return chunks;
		}

		// Split into chunks with overlap
		let currentPosition = 0;
		let chunkIndex = 0;

		while (currentPosition < content.length) {
			if (token?.isCancellationRequested) {
				return chunks;
			}

			// Calculate end position for this chunk
			let endPosition = Math.min(
				currentPosition + maxChunkSize,
				content.length
			);

			// Try to find a good split point (newline, period, etc.)
			if (endPosition < content.length) {
				// Look for newlines, periods, or other natural breaks
				const breakpoints = ['\n\n', '\n', '. ', ', ', ' '];

				for (const breakpoint of breakpoints) {
					// Look for the breakpoint within a reasonable range
					const searchStart = Math.max(endPosition - 100, currentPosition + minChunkSize);
					const searchEnd = Math.min(endPosition + 100, content.length);
					const searchText = content.substring(searchStart, searchEnd);

					const breakpointIndex = searchText.lastIndexOf(breakpoint);
					if (breakpointIndex !== -1 && (searchStart + breakpointIndex) > currentPosition + minChunkSize) {
						endPosition = searchStart + breakpointIndex + breakpoint.length;
						break;
					}
				}
			}

			// Extract the chunk
			const chunkContent = content.substring(currentPosition, endPosition);

			chunks.push({
				id: this.generateChunkId(chunkContent, chunkIndex, metadata),
				content: chunkContent,
				metadata: {
					startLine: this.getLineNumberAtOffset(content, currentPosition),
					endLine: this.getLineNumberAtOffset(content, endPosition),
					...metadata
				}
			});

			// Move to next position, accounting for overlap
			currentPosition = endPosition - overlap;
			chunkIndex++;
		}

		return chunks;
	}
}

/**
 * Semantic chunking strategy that splits content based on semantic boundaries.
 */
export class SemanticChunkingStrategy extends ChunkingStrategy {
	constructor(options: Partial<ChunkingOptions> = {}) {
		super({
			...options,
			strategy: ChunkingStrategyType.Semantic
		});
	}

	async chunk(
		content: string,
		metadata?: Record<string, any>,
		token?: CancellationToken
	): Promise<Chunk[]> {
		if (token?.isCancellationRequested) {
			return [];
		}

		const chunks: Chunk[] = [];
		const delimiter = this.options.delimiter || /(?<=\.|\?|\!|\n)\s+/g;
		const maxChunkSize = this.options.maxChunkSize;

		// Split content into semantic units (e.g., sentences, paragraphs)
		const semanticUnits = content.split(delimiter)
			.filter(unit => unit.trim().length > 0);

		if (semanticUnits.length === 0) {
			return chunks;
		}

		let currentChunk = '';
		let currentStartLine = 0;
		let currentPosition = 0;
		let chunkIndex = 0;

		for (const unit of semanticUnits) {
			if (token?.isCancellationRequested) {
				return chunks;
			}

			// If adding this unit would exceed max size, create a new chunk
			if (currentChunk.length > 0 &&
				(currentChunk.length + unit.length) > maxChunkSize) {

				// Add the current chunk
				chunks.push({
					id: this.generateChunkId(currentChunk, chunkIndex, metadata),
					content: currentChunk,
					metadata: {
						startLine: currentStartLine,
						endLine: this.getLineNumberAtOffset(content, currentPosition),
						...metadata
					}
				});

				// Start a new chunk
				chunkIndex++;
				currentChunk = '';
				currentStartLine = this.getLineNumberAtOffset(content, currentPosition);
			}

			// Add the unit to the current chunk
			if (currentChunk.length > 0) {
				currentChunk += ' ';
			}
			currentChunk += unit;

			// Update position
			currentPosition += unit.length + 1; // +1 for the delimiter
		}

		// Add the final chunk if there's anything left
		if (currentChunk.length > 0) {
			chunks.push({
				id: this.generateChunkId(currentChunk, chunkIndex, metadata),
				content: currentChunk,
				metadata: {
					startLine: currentStartLine,
					endLine: this.getLineNumberAtOffset(content, content.length),
					...metadata
				}
			});
		}

		return chunks;
	}
}
