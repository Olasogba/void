/**
 * Interface for storage adapters.
 * Storage adapters provide a way to store and retrieve documents, embeddings, and metadata.
 * This allows client applications to implement their own storage solutions.
 */
export interface StorageAdapter {
	/**
	 * Store a document with its embeddings and metadata.
	 * @param id Unique ID for the document
	 * @param content Text content of the document
	 * @param embedding Vector embedding of the document
	 * @param metadata Additional metadata for the document
	 */
	storeDocument(
		id: string,
		content: string,
		embedding: number[],
		metadata: Record<string, any>
	): Promise<void>;

	/**
	 * Retrieve a document by ID.
	 * @param id ID of the document to retrieve
	 * @returns The document or null if not found
	 */
	retrieveDocument(id: string): Promise<{
		content: string;
		embedding: number[];
		metadata: Record<string, any>;
	} | null>;

	/**
	 * Find documents by vector similarity.
	 * @param embedding Query vector embedding
	 * @param limit Maximum number of results to return
	 * @param threshold Minimum similarity score threshold
	 * @returns Array of matching documents with similarity scores
	 */
	findSimilar(
		embedding: number[],
		limit: number,
		threshold?: number
	): Promise<Array<{
		id: string;
		content: string;
		metadata: Record<string, any>;
		score: number;
	}>>;

	/**
	 * Delete a document.
	 * @param id ID of the document to delete
	 * @returns True if the document was deleted, false otherwise
	 */
	deleteDocument(id: string): Promise<boolean>;

	/**
	 * Clear all data from storage.
	 */
	clear(): Promise<void>;
}

/**
 * In-memory implementation of the storage adapter.
 * This is a simple implementation that stores everything in memory.
 * It's useful for testing or small applications, but not for production use
 * with large datasets.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
	/**
	 * Map of document IDs to document data.
	 */
	private documents = new Map<string, {
		content: string;
		embedding: number[];
		metadata: Record<string, any>;
	}>();

	/**
	 * Store a document in memory.
	 */
	async storeDocument(
		id: string,
		content: string,
		embedding: number[],
		metadata: Record<string, any>
	): Promise<void> {
		this.documents.set(id, { content, embedding, metadata });
	}

	/**
	 * Retrieve a document from memory.
	 */
	async retrieveDocument(id: string) {
		return this.documents.get(id) || null;
	}

	/**
	 * Find documents in memory by vector similarity.
	 */
	async findSimilar(
		embedding: number[],
		limit: number,
		threshold: number = 0.7
	) {
		const results = Array.from(this.documents.entries())
			.map(([id, doc]) => ({
				id,
				content: doc.content,
				metadata: doc.metadata,
				score: this.cosineSimilarity(embedding, doc.embedding)
			}))
			.filter(result => result.score >= threshold)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);

		return results;
	}

	/**
	 * Delete a document from memory.
	 */
	async deleteDocument(id: string): Promise<boolean> {
		return this.documents.delete(id);
	}

	/**
	 * Clear all documents from memory.
	 */
	async clear(): Promise<void> {
		this.documents.clear();
	}

	/**
	 * Calculate cosine similarity between two vectors.
	 * @param a First vector
	 * @param b Second vector
	 * @returns Similarity score between -1 and 1
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
