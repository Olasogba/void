/**
 * Processing pipeline implementation.
 * This module provides utilities for creating text processing pipelines.
 */

import { CancellationToken } from '../utils/cancellation';

/**
 * Represents a token after tokenization.
 */
export interface Token {
	text: string;
	position: number;
	type?: string;
	metadata?: Record<string, any>;
}

/**
 * Represents a normalized token.
 */
export interface NormalizedToken extends Token {
	normalized: string;
}

/**
 * Represents a filtered token.
 */
export interface FilteredToken extends NormalizedToken {
	importance: number;
}

/**
 * Represents extracted features from tokens.
 */
export interface Features {
	tokens: FilteredToken[];
	ngrams: string[];
	entities: string[];
	keywords: string[];
}

/**
 * Represents embeddings computed from features.
 */
export interface Embeddings {
	vector: number[];
	sparseVector: Record<string, number>;
	tokens: FilteredToken[];
}

/**
 * Represents a processed result with relevance ranking.
 */
export interface RankedResult {
	text: string;
	score: number;
	features: Features;
	highlights: [number, number][]; // Start and end positions
}

/**
 * Represents a pipeline stage.
 */
export interface PipelineStage<I, O> {
	process(input: I, token?: CancellationToken): Promise<O>;
}

/**
 * Text preprocessing stage.
 */
export class PreProcessor implements PipelineStage<string, FilteredToken[]> {
	/**
	 * Process text into filtered tokens.
	 */
	async process(text: string, token?: CancellationToken): Promise<FilteredToken[]> {
		// Tokenize
		const tokens = this.tokenize(text);
		if (token?.isCancellationRequested) {
			return [];
		}

		// Normalize
		const normalizedTokens = this.normalize(tokens);
		if (token?.isCancellationRequested) {
			return [];
		}

		// Filter
		const filteredTokens = this.filter(normalizedTokens);

		return filteredTokens;
	}

	/**
	 * Tokenize text into tokens.
	 */
	private tokenize(text: string): Token[] {
		const tokens: Token[] = [];

		// Simple word tokenization
		const regex = /\b\w+\b/g;
		let match;
		while ((match = regex.exec(text)) !== null) {
			tokens.push({
				text: match[0],
				position: match.index
			});
		}

		return tokens;
	}

	/**
	 * Normalize tokens.
	 */
	private normalize(tokens: Token[]): NormalizedToken[] {
		return tokens.map(token => ({
			...token,
			normalized: token.text.toLowerCase()
		}));
	}

	/**
	 * Filter tokens.
	 */
	private filter(tokens: NormalizedToken[]): FilteredToken[] {
		// Skip common stop words
		const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or']);

		return tokens
			.filter(token => !stopWords.has(token.normalized) && token.normalized.length > 1)
			.map(token => ({
				...token,
				importance: this.calculateImportance(token)
			}));
	}

	/**
	 * Calculate token importance.
	 */
	private calculateImportance(token: NormalizedToken): number {
		// Simple importance: longer words are more important
		return Math.min(1.0, token.normalized.length / 10);
	}
}

/**
 * Feature extraction stage.
 */
export class FeatureExtractor implements PipelineStage<FilteredToken[], Features> {
	/**
	 * Extract features from tokens.
	 */
	async process(tokens: FilteredToken[], token?: CancellationToken): Promise<Features> {
		// Extract n-grams
		const ngrams = this.extractNgrams(tokens, 2);
		if (token?.isCancellationRequested) {
			return { tokens, ngrams: [], entities: [], keywords: [] };
		}

		// Extract entities (simplified)
		const entities = this.extractEntities(tokens);
		if (token?.isCancellationRequested) {
			return { tokens, ngrams, entities: [], keywords: [] };
		}

		// Extract keywords
		const keywords = this.extractKeywords(tokens);

		return {
			tokens,
			ngrams,
			entities,
			keywords
		};
	}

	/**
	 * Extract n-grams from tokens.
	 */
	private extractNgrams(tokens: FilteredToken[], n: number): string[] {
		const ngrams: string[] = [];

		for (let i = 0; i <= tokens.length - n; i++) {
			const ngram = tokens.slice(i, i + n).map(t => t.normalized).join(' ');
			ngrams.push(ngram);
		}

		return ngrams;
	}

	/**
	 * Extract potential entities from tokens.
	 * Simplified implementation.
	 */
	private extractEntities(tokens: FilteredToken[]): string[] {
		// Look for capitalized words as potential entities
		return tokens
			.filter(token => token.text[0] === token.text[0].toUpperCase() && token.text.length > 1)
			.map(token => token.text);
	}

	/**
	 * Extract keywords based on token importance.
	 */
	private extractKeywords(tokens: FilteredToken[]): string[] {
		// Get top 33% important tokens
		return tokens
			.sort((a, b) => b.importance - a.importance)
			.slice(0, Math.max(1, Math.ceil(tokens.length / 3)))
			.map(token => token.normalized);
	}
}

/**
 * Embedding computation stage.
 */
export class EmbeddingComputer implements PipelineStage<Features, Embeddings> {
	/**
	 * Compute embeddings from features.
	 */
	async process(features: Features, token?: CancellationToken): Promise<Embeddings> {
		// Create a sparse vector representation
		const sparseVector: Record<string, number> = {};

		// Add tokens with their importance
		for (const token of features.tokens) {
			sparseVector[token.normalized] = token.importance;
		}

		// Add ngrams with lower weight
		for (const ngram of features.ngrams) {
			sparseVector[`ngram:${ngram}`] = 0.5;
		}

		// Add entities with higher weight
		for (const entity of features.entities) {
			sparseVector[`entity:${entity.toLowerCase()}`] = 1.5;
		}

		// Add keywords with higher weight
		for (const keyword of features.keywords) {
			sparseVector[`keyword:${keyword}`] = 1.2;
		}

		// Convert to dense vector (simplified)
		// In a real implementation, this would use a proper embedding model
		const vector = this.createDummyDenseVector(sparseVector, 64);

		return {
			vector,
			sparseVector,
			tokens: features.tokens
		};
	}

	/**
	 * Create a dummy dense vector.
	 * In a real implementation, this would use a proper embedding model.
	 */
	private createDummyDenseVector(sparseVector: Record<string, number>, dimensions: number): number[] {
		// This is just a placeholder for demonstration
		// In a real implementation, you would use word embeddings and proper vector operations
		const vector = new Array(dimensions).fill(0);

		// Hash each key into the vector
		Object.entries(sparseVector).forEach(([key, value]) => {
			const hashCode = this.hashString(key);
			const position = hashCode % dimensions;
			vector[position] += value;
		});

		// Normalize vector
		const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
		if (magnitude > 0) {
			for (let i = 0; i < vector.length; i++) {
				vector[i] /= magnitude;
			}
		}

		return vector;
	}

	/**
	 * Simple string hash function.
	 */
	private hashString(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash);
	}
}

/**
 * Results ranking stage.
 */
export class ResultRanker implements PipelineStage<{ query: Embeddings; documents: Embeddings[] }, RankedResult[]> {
	/**
	 * Rank results based on embedding similarity.
	 */
	async process(input: { query: Embeddings; documents: Embeddings[] }, token?: CancellationToken): Promise<RankedResult[]> {
		const { query, documents } = input;
		const results: RankedResult[] = [];

		for (const doc of documents) {
			if (token?.isCancellationRequested) {
				break;
			}

			// Calculate similarity
			const similarity = this.calculateCosineSimilarity(query.vector, doc.vector);

			// Find highlights
			const highlights = this.findHighlights(query, doc);

			// Convert tokens back to text (simplified)
			const text = doc.tokens.map(t => t.text).join(' ');

			// Create features
			const features: Features = {
				tokens: doc.tokens,
				ngrams: [],
				entities: [],
				keywords: []
			};

			results.push({
				text,
				score: similarity,
				features,
				highlights
			});
		}

		// Sort by score (descending)
		results.sort((a, b) => b.score - a.score);

		return results;
	}

	/**
	 * Calculate cosine similarity between two vectors.
	 */
	private calculateCosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) {
			throw new Error('Vectors must have the same dimensions');
		}

		let dotProduct = 0;
		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
		}

		return dotProduct;
	}

	/**
	 * Find highlights in the document.
	 */
	private findHighlights(query: Embeddings, doc: Embeddings): [number, number][] {
		const highlights: [number, number][] = [];

		// Get query terms
		const queryTerms = new Set(Object.keys(query.sparseVector)
			.filter(k => !k.startsWith('ngram:') && !k.startsWith('entity:') && !k.startsWith('keyword:'))
		);

		// Find matches in document tokens
		for (const token of doc.tokens) {
			if (queryTerms.has(token.normalized)) {
				highlights.push([token.position, token.position + token.text.length]);
			}
		}

		return highlights;
	}
}

/**
 * Complete processing pipeline.
 */
export class ProcessingPipeline {
	private preProcessor = new PreProcessor();
	private featureExtractor = new FeatureExtractor();
	private embeddingComputer = new EmbeddingComputer();
	private resultRanker = new ResultRanker();

	/**
	 * Process a query and documents through the entire pipeline.
	 */
	async process(
		query: string,
		documents: string[],
		token?: CancellationToken
	): Promise<RankedResult[]> {
		// Process query
		const queryTokens = await this.preProcessor.process(query, token);
		if (token?.isCancellationRequested || queryTokens.length === 0) {
			return [];
		}

		const queryFeatures = await this.featureExtractor.process(queryTokens, token);
		if (token?.isCancellationRequested) {
			return [];
		}

		const queryEmbedding = await this.embeddingComputer.process(queryFeatures, token);
		if (token?.isCancellationRequested) {
			return [];
		}

		// Process documents
		const documentEmbeddings: Embeddings[] = [];

		for (const document of documents) {
			if (token?.isCancellationRequested) {
				break;
			}

			const docTokens = await this.preProcessor.process(document, token);
			if (token?.isCancellationRequested) {
				break;
			}

			const docFeatures = await this.featureExtractor.process(docTokens, token);
			if (token?.isCancellationRequested) {
				break;
			}

			const docEmbedding = await this.embeddingComputer.process(docFeatures, token);
			if (token?.isCancellationRequested) {
				break;
			}

			documentEmbeddings.push(docEmbedding);
		}

		if (token?.isCancellationRequested || documentEmbeddings.length === 0) {
			return [];
		}

		// Rank results
		return this.resultRanker.process({
			query: queryEmbedding,
			documents: documentEmbeddings
		}, token);
	}
}
