import { CancellationToken } from '../utils/cancellation';

type SparseEmbedding = Record</* word */ string, /* weight */number>;
type TermFrequencies = Map</* word */ string, /*occurrences*/ number>;
type DocumentOccurrences = Map</* word */ string, /*documentOccurrences*/ number>;

/**
 * Creates a map counting occurrences of each value in an iterable.
 */
function countMapFrom<K>(values: Iterable<K>): Map<K, number> {
	const map = new Map<K, number>();
	for (const value of values) {
		map.set(value, (map.get(value) ?? 0) + 1);
	}
	return map;
}

/**
 * Represents a chunk of a document with its term frequency data.
 */
interface DocumentChunkEntry {
	readonly text: string;
	readonly tf: TermFrequencies;
}

/**
 * Represents a document for TF-IDF calculation.
 */
export interface TfIdfDocument {
	readonly key: string;
	readonly textChunks: readonly string[];
}

/**
 * Represents a document score from TF-IDF calculation.
 */
export interface TfIdfScore {
	readonly key: string;
	/**
	 * An unbounded number.
	 */
	readonly score: number;
}

/**
 * Represents a normalized document score from TF-IDF calculation.
 */
export interface NormalizedTfIdfScore {
	readonly key: string;
	/**
	 * A number between 0 and 1.
	 */
	readonly score: number;
}

/**
 * Implementation of tf-idf (term frequency-inverse document frequency) for a set of
 * documents where each document contains one or more chunks of text.
 * Each document is identified by a key, and the score for each document is computed
 * by taking the max score over all the chunks in the document.
 */
export class TfIdfCalculator {
	/**
	 * Calculate scores for documents based on the given query.
	 */
	calculateScores(query: string, token: CancellationToken): TfIdfScore[] {
		const embedding = this.computeEmbedding(query);
		const idfCache = new Map<string, number>();
		const scores: TfIdfScore[] = [];

		// For each document, generate one score
		for (const [key, doc] of this.documents) {
			if (token.isCancellationRequested) {
				return [];
			}

			for (const chunk of doc.chunks) {
				const score = this.computeSimilarityScore(chunk, embedding, idfCache);
				if (score > 0) {
					scores.push({ key, score });
				}
			}
		}

		return scores;
	}

	/**
	 * Count how many times each term (word) appears in a string.
	 */
	private static termFrequencies(input: string): TermFrequencies {
		return countMapFrom(TfIdfCalculator.splitTerms(input));
	}

	/**
	 * Break a string into terms (words).
	 */
	private static *splitTerms(input: string): Iterable<string> {
		const normalize = (word: string) => word.toLowerCase();

		// Only match on words that are at least 3 characters long and start with a letter
		for (const [word] of input.matchAll(/\b\p{Letter}[\p{Letter}\d]{2,}\b/gu)) {
			yield normalize(word);

			const camelParts = word.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/g);
			if (camelParts.length > 1) {
				for (const part of camelParts) {
					// Require at least 3 letters in the parts of a camel case word
					if (part.length > 2 && /\p{Letter}{3,}/gu.test(part)) {
						yield normalize(part);
					}
				}
			}
		}
	}

	/**
	 * Total number of chunks
	 */
	private chunkCount = 0;

	/**
	 * Map of terms to the number of chunks they appear in
	 */
	private readonly chunkOccurrences: DocumentOccurrences = new Map</* word */ string, /*documentOccurrences*/ number>();

	/**
	 * Map of document keys to document data
	 */
	private readonly documents = new Map</* key */ string, {
		readonly chunks: ReadonlyArray<DocumentChunkEntry>;
	}>();

	/**
	 * Update the documents in the calculator.
	 */
	updateDocuments(documents: ReadonlyArray<TfIdfDocument>): this {
		for (const { key } of documents) {
			this.deleteDocument(key);
		}

		for (const doc of documents) {
			const chunks: Array<{ text: string; tf: TermFrequencies }> = [];
			for (const text of doc.textChunks) {
				const tf = TfIdfCalculator.termFrequencies(text);

				// Update occurrences list
				for (const term of tf.keys()) {
					this.chunkOccurrences.set(term, (this.chunkOccurrences.get(term) ?? 0) + 1);
				}

				chunks.push({ text, tf });
			}

			this.chunkCount += chunks.length;
			this.documents.set(doc.key, { chunks });
		}
		return this;
	}

	/**
	 * Delete a document from the calculator.
	 */
	deleteDocument(key: string) {
		const doc = this.documents.get(key);
		if (!doc) {
			return;
		}

		this.documents.delete(key);
		this.chunkCount -= doc.chunks.length;

		// Update term occurrences for the document
		for (const chunk of doc.chunks) {
			for (const term of chunk.tf.keys()) {
				const currentOccurrences = this.chunkOccurrences.get(term);
				if (typeof currentOccurrences === 'number') {
					const newOccurrences = currentOccurrences - 1;
					if (newOccurrences <= 0) {
						this.chunkOccurrences.delete(term);
					} else {
						this.chunkOccurrences.set(term, newOccurrences);
					}
				}
			}
		}
	}

	/**
	 * Compute similarity score between a chunk and a query embedding.
	 */
	private computeSimilarityScore(chunk: DocumentChunkEntry, queryEmbedding: SparseEmbedding, idfCache: Map<string, number>): number {
		// Compute the dot product between the chunk's embedding and the query embedding
		let sum = 0;
		for (const [term, termTfidf] of Object.entries(queryEmbedding)) {
			const chunkTf = chunk.tf.get(term);
			if (!chunkTf) {
				// Term does not appear in chunk so it has no contribution
				continue;
			}

			let chunkIdf = idfCache.get(term);
			if (typeof chunkIdf !== 'number') {
				chunkIdf = this.computeIdf(term);
				idfCache.set(term, chunkIdf);
			}

			const chunkTfidf = chunkTf * chunkIdf;
			sum += chunkTfidf * termTfidf;
		}
		return sum;
	}

	/**
	 * Compute an embedding for the given input string.
	 */
	private computeEmbedding(input: string): SparseEmbedding {
		const tf = TfIdfCalculator.termFrequencies(input);
		return this.computeTfidf(tf);
	}

	/**
	 * Compute the IDF (inverse document frequency) for a term.
	 */
	private computeIdf(term: string): number {
		const chunkOccurrences = this.chunkOccurrences.get(term) ?? 0;
		return chunkOccurrences > 0
			? Math.log((this.chunkCount + 1) / chunkOccurrences)
			: 0;
	}

	/**
	 * Compute the TF-IDF for the given term frequencies.
	 */
	private computeTfidf(termFrequencies: TermFrequencies): SparseEmbedding {
		const embedding = Object.create(null);
		for (const [word, occurrences] of termFrequencies) {
			const idf = this.computeIdf(word);
			if (idf > 0) {
				embedding[word] = occurrences * idf;
			}
		}
		return embedding;
	}
}

/**
 * Normalize the scores to be between 0 and 1 and sort them decending.
 * @param scores array of scores from {@link TfIdfCalculator.calculateScores}
 * @returns normalized scores
 */
export function normalizeTfIdfScores(scores: TfIdfScore[]): NormalizedTfIdfScore[] {
	// copy of scores
	const result = scores.slice(0) as { score: number }[];

	// sort descending
	result.sort((a, b) => b.score - a.score);

	// normalize
	const max = result[0]?.score ?? 0;
	if (max > 0) {
		for (const score of result) {
			score.score /= max;
		}
	}

	return result as TfIdfScore[];
}
