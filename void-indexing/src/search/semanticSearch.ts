import { CancellationToken } from '../utils/cancellation';
import { EmbeddingsService } from '../embeddings/embeddingService';

/**
 * Result of a semantic search operation.
 */
export interface SemanticSearchResult {
	id: string;
	score: number;
	content: string;
	metadata?: Record<string, any>;
}

/**
 * Options for semantic search operations.
 */
export interface SemanticSearchOptions {
	topK?: number;
	threshold?: number;
	includeSimilarity?: boolean;
	includeContent?: boolean;
	includeMetadata?: boolean;
}

/**
 * Engine for performing semantic search using vector embeddings.
 */
export class SemanticSearchEngine {
	private embeddingService: EmbeddingsService;
	private documents: Map<string, {
		text: string;
		embedding: number[];
		metadata?: Record<string, any>;
	}> = new Map();

	/**
	 * Create a new semantic search engine.
	 * @param embeddingService The embedding service to use
	 */
	constructor(embeddingService: EmbeddingsService) {
		this.embeddingService = embeddingService;
	}

	/**
	 * Add a document to the search index.
	 * @param id Unique ID for the document
	 * @param text Text content of the document
	 * @param providerId ID of the embedding provider to use
	 * @param metadata Optional metadata for the document
	 */
	async addDocument(
		id: string,
		text: string,
		providerId: string,
		metadata?: Record<string, any>,
		token?: CancellationToken
	): Promise<void> {
		if (token?.isCancellationRequested) {
			return;
		}

		const [embedding] = await this.embeddingService.computeEmbeddings(providerId, [text], token);
		this.documents.set(id, { text, embedding, metadata });
	}

	/**
	 * Add multiple documents to the search index.
	 * @param documents Array of document objects
	 * @param providerId ID of the embedding provider to use
	 */
	async addDocuments(
		documents: Array<{ id: string, text: string, metadata?: Record<string, any> }>,
		providerId: string,
		token?: CancellationToken
	): Promise<void> {
		if (token?.isCancellationRequested || documents.length === 0) {
			return;
		}

		const texts = documents.map(doc => doc.text);
		const embeddings = await this.embeddingService.computeEmbeddings(providerId, texts, token);

		for (let i = 0; i < documents.length; i++) {
			if (token?.isCancellationRequested) {
				return;
			}

			const { id, text, metadata } = documents[i];
			this.documents.set(id, {
				text,
				embedding: embeddings[i],
				metadata
			});
		}
	}

	/**
	 * Remove a document from the search index.
	 * @param id The ID of the document to remove
	 * @returns True if the document was removed, false otherwise
	 */
	removeDocument(id: string): boolean {
		return this.documents.delete(id);
	}

	/**
	 * Search for documents similar to the query.
	 * @param query The query text
	 * @param providerId ID of the embedding provider to use
	 * @param options Search options
	 * @param token Optional cancellation token
	 */
	async search(
		query: string,
		providerId: string,
		options: SemanticSearchOptions = {},
		token?: CancellationToken
	): Promise<SemanticSearchResult[]> {
		if (token?.isCancellationRequested) {
			return [];
		}

		const topK = options.topK ?? 5;
		const threshold = options.threshold ?? 0.0;
		const includeSimilarity = options.includeSimilarity ?? true;
		const includeContent = options.includeContent ?? true;
		const includeMetadata = options.includeMetadata ?? true;

		const [queryEmbedding] = await this.embeddingService.computeEmbeddings(
			providerId,
			[query],
			token
		);

		if (token?.isCancellationRequested) {
			return [];
		}

		const results = Array.from(this.documents.entries())
			.map(([id, doc]) => {
				const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
				return {
					id,
					score,
					content: includeContent ? doc.text : '',
					metadata: includeMetadata ? doc.metadata : undefined
				};
			})
			.filter(result => result.score >= threshold)
			.sort((a, b) => b.score - a.score)
			.slice(0, topK);

		// Remove similarity scores if not requested
		if (!includeSimilarity) {
			results.forEach(result => {
				result.score = 0;
			});
		}

		return results;
	}

	/**
	 * Get the number of documents in the index.
	 */
	getDocumentCount(): number {
		return this.documents.size;
	}

	/**
	 * Get all document IDs in the index.
	 */
	getDocumentIds(): string[] {
		return Array.from(this.documents.keys());
	}

	/**
	 * Clear all documents from the index.
	 */
	clearDocuments(): void {
		this.documents.clear();
	}

	/**
	 * Calculate the cosine similarity between two vectors.
	 * @param a First vector
	 * @param b Second vector
	 * @returns Cosine similarity (between -1 and 1)
	 */
	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) {
			throw new Error('Vectors must have the same dimensions');
		}

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		if (normA === 0 || normB === 0) {
			return 0;
		}

		return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
	}
}
