/**
 * Advanced context ranking system.
 * This module provides a sophisticated context ranking system with multi-factor scoring.
 */

import { CancellationToken } from '../utils/cancellation';
import { ASTNode } from '../ast/astParser';
import { TfIdfScore, NormalizedTfIdfScore, normalizeTfIdfScores } from '../index/tfIdf';
import { CodeSnippet } from '../context/localContext';

/**
 * Represents the factors used in ranking.
 */
export interface RankingFactors {
	tfIdfScore: number;
	fuzzyScore: number;
	proximityScore: number;
	semanticScore: number;
	astRelevance: number;
}

/**
 * Represents a scored context item.
 */
export interface ScoredContext<T> {
	item: T;
	score: number;
	factors: RankingFactors;
}

/**
 * Options for the context ranker.
 */
export interface RankerOptions {
	tfIdfWeight: number;
	fuzzyWeight: number;
	proximityWeight: number;
	semanticWeight: number;
	astWeight: number;
	minScore: number;
	normalizationStrategy: 'minMax' | 'softmax' | 'none';
}

/**
 * Advanced context ranker that combines multiple scoring factors.
 */
export class ContextRanker {
	private options: RankerOptions;

	constructor(options: Partial<RankerOptions> = {}) {
		this.options = {
			tfIdfWeight: 0.4,
			fuzzyWeight: 0.2,
			proximityWeight: 0.15,
			semanticWeight: 0.15,
			astWeight: 0.1,
			minScore: 0.2,
			normalizationStrategy: 'minMax',
			...options
		};
	}

	/**
	 * Rank context items using multiple factors.
	 * @param items The items to rank
	 * @param query The query to rank against
	 * @param token Optional cancellation token
	 */
	async rankItems<T>(
		items: T[],
		query: string,
		scoreFn: (item: T, query: string) => Promise<RankingFactors>,
		token?: CancellationToken
	): Promise<ScoredContext<T>[]> {
		if (token?.isCancellationRequested) {
			return [];
		}

		// Score all items
		const scoredItems: ScoredContext<T>[] = [];

		for (const item of items) {
			if (token?.isCancellationRequested) {
				return [];
			}

			// Calculate scores for each factor
			const factors = await scoreFn(item, query);

			// Calculate weighted score
			const score = this.calculateWeightedScore(factors);

			scoredItems.push({
				item,
				score,
				factors
			});
		}

		// Normalize scores if needed
		const normalizedItems = this.normalizeScores(scoredItems);

		// Filter by minimum score
		const filteredItems = normalizedItems.filter(item => item.score >= this.options.minScore);

		// Sort by score (descending)
		filteredItems.sort((a, b) => b.score - a.score);

		return filteredItems;
	}

	/**
	 * Rank code snippets using multiple factors.
	 * @param snippets The code snippets to rank
	 * @param query The query to rank against
	 * @param token Optional cancellation token
	 */
	async rankCodeSnippets(
		snippets: CodeSnippet[],
		query: string,
		token?: CancellationToken
	): Promise<ScoredContext<CodeSnippet>[]> {
		return this.rankItems(
			snippets,
			query,
			async (snippet, query) => this.scoreCodeSnippet(snippet, query),
			token
		);
	}

	/**
	 * Rank AST nodes using multiple factors.
	 * @param nodes The AST nodes to rank
	 * @param query The query to rank against
	 * @param token Optional cancellation token
	 */
	async rankASTNodes(
		nodes: ASTNode[],
		query: string,
		token?: CancellationToken
	): Promise<ScoredContext<ASTNode>[]> {
		return this.rankItems(
			nodes,
			query,
			async (node, query) => this.scoreASTNode(node, query),
			token
		);
	}

	/**
	 * Score a code snippet using multiple factors.
	 * @param snippet The code snippet
	 * @param query The query to score against
	 */
	private async scoreCodeSnippet(snippet: CodeSnippet, query: string): Promise<RankingFactors> {
		// Combine built-in relevance with other factors
		const tfIdfScore = await this.calculateTfIdfScore(snippet.content, query);
		const fuzzyScore = this.calculateFuzzyScore(snippet.content, query);
		const proximityScore = snippet.relevance; // Use the snippet's built-in relevance for proximity
		const semanticScore = await this.calculateSemanticScore(snippet.content, query);

		// AST relevance is 0 since we're not using AST info for code snippets in this function
		const astRelevance = 0;

		return {
			tfIdfScore,
			fuzzyScore,
			proximityScore,
			semanticScore,
			astRelevance
		};
	}

	/**
	 * Score an AST node using multiple factors.
	 * @param node The AST node
	 * @param query The query to score against
	 */
	private async scoreASTNode(node: ASTNode, query: string): Promise<RankingFactors> {
		// For this implementation, we'll assume the node has a 'value' that can be used for text-based scoring
		const nodeText = node.value || node.type;

		const tfIdfScore = await this.calculateTfIdfScore(nodeText, query);
		const fuzzyScore = this.calculateFuzzyScore(nodeText, query);

		// Proximity is based on node type - give higher scores to more specific node types
		const proximityScore = this.getNodeTypeProximityScore(node.type);

		const semanticScore = await this.calculateSemanticScore(nodeText, query);

		// AST relevance is high since we're using AST info
		const astRelevance = this.calculateASTRelevance(node, query);

		return {
			tfIdfScore,
			fuzzyScore,
			proximityScore,
			semanticScore,
			astRelevance
		};
	}

	/**
	 * Calculate TF-IDF score.
	 * Note: In a real implementation, you would use the actual TfIdfCalculator class.
	 */
	private async calculateTfIdfScore(text: string, query: string): Promise<number> {
		// Simplified implementation - in reality, you'd use the TfIdfCalculator
		const queryTerms = query.toLowerCase().split(/\s+/);
		const textTerms = text.toLowerCase().split(/\s+/);

		// Count term frequency
		const termFrequency = new Map<string, number>();
		for (const term of textTerms) {
			termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
		}

		// Calculate simplified score
		let score = 0;
		for (const term of queryTerms) {
			if (termFrequency.has(term)) {
				score += termFrequency.get(term)! / textTerms.length;
			}
		}

		return Math.min(1, score);
	}

	/**
	 * Calculate fuzzy matching score.
	 */
	private calculateFuzzyScore(text: string, query: string): number {
		const queryLower = query.toLowerCase();
		const textLower = text.toLowerCase();

		// Simple implementation: check if query is a substring
		if (textLower.includes(queryLower)) {
			return 1.0;
		}

		// Check for partial matches
		const queryTerms = queryLower.split(/\s+/);
		let matchedTerms = 0;

		for (const term of queryTerms) {
			if (textLower.includes(term)) {
				matchedTerms++;
			}
		}

		return matchedTerms / queryTerms.length;
	}

	/**
	 * Calculate semantic similarity score.
	 * Note: In a real implementation, this would use proper embedding models or semantic analysis.
	 */
	private async calculateSemanticScore(text: string, query: string): Promise<number> {
		// This is a simplified stub implementation
		// In a real system, you would use a language model or embedding similarity

		// For now, use a simple word overlap metric
		const queryTerms = new Set(query.toLowerCase().split(/\s+/));
		const textTerms = new Set(text.toLowerCase().split(/\s+/));

		const intersection = new Set([...queryTerms].filter(x => textTerms.has(x)));
		const union = new Set([...queryTerms, ...textTerms]);

		return intersection.size / union.size;
	}

	/**
	 * Calculate the AST relevance of a node to a query.
	 */
	private calculateASTRelevance(node: ASTNode, query: string): number {
		// Higher scores for more specific constructs like functions, classes, etc.

		// Score based on node type
		const typeScore = this.getNodeTypeProximityScore(node.type);

		// Score based on node value matching query
		const valueScore = node.value
			? this.calculateFuzzyScore(node.value, query)
			: 0;

		// Combine scores
		return Math.max(typeScore, valueScore);
	}

	/**
	 * Get a proximity score based on node type.
	 */
	private getNodeTypeProximityScore(nodeType: string): number {
		// Higher scores for more specific/important node types
		const highValueTypes = [
			'FunctionDeclaration',
			'ClassDeclaration',
			'MethodDefinition',
			'VariableDeclaration'
		];

		const mediumValueTypes = [
			'BlockStatement',
			'ExpressionStatement',
			'ReturnStatement',
			'IfStatement'
		];

		if (highValueTypes.includes(nodeType)) {
			return 1.0;
		} else if (mediumValueTypes.includes(nodeType)) {
			return 0.7;
		} else {
			return 0.4;
		}
	}

	/**
	 * Calculate a weighted score from the ranking factors.
	 */
	private calculateWeightedScore(factors: RankingFactors): number {
		return (
			factors.tfIdfScore * this.options.tfIdfWeight +
			factors.fuzzyScore * this.options.fuzzyWeight +
			factors.proximityScore * this.options.proximityWeight +
			factors.semanticScore * this.options.semanticWeight +
			factors.astRelevance * this.options.astWeight
		);
	}

	/**
	 * Normalize scores across all items.
	 */
	private normalizeScores<T>(items: ScoredContext<T>[]): ScoredContext<T>[] {
		if (items.length === 0) {
			return [];
		}

		// Clone to avoid modifying originals
		const result = [...items];

		switch (this.options.normalizationStrategy) {
			case 'minMax': {
				const min = Math.min(...result.map(item => item.score));
				const max = Math.max(...result.map(item => item.score));

				if (max === min) {
					// All scores are the same, normalize to 1.0
					result.forEach(item => item.score = 1.0);
				} else {
					// Normalize to [0, 1]
					result.forEach(item => {
						item.score = (item.score - min) / (max - min);
					});
				}
				break;
			}

			case 'softmax': {
				// Apply softmax function
				const expScores = result.map(item => Math.exp(item.score));
				const sumExp = expScores.reduce((sum, exp) => sum + exp, 0);

				result.forEach((item, index) => {
					item.score = expScores[index] / sumExp;
				});
				break;
			}

			case 'none':
			default:
				// No normalization
				break;
		}

		return result;
	}
}
