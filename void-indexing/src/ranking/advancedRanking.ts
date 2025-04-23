import { DocumentSymbol, SymbolUsage } from '../symbols/symbolProvider';
import { TreeSitterNode } from '../parsing/treeSitterParser';

/**
 * Ranking factor types for scoring chunks.
 */
export enum RankingFactorType {
	// Similarity factors
	SemanticSimilarity = 'semanticSimilarity',
	KeywordMatch = 'keywordMatch',
	ExactPhraseMatch = 'exactPhraseMatch',

	// Code-specific factors
	SymbolRelevance = 'symbolRelevance',
	SymbolUsageCount = 'symbolUsageCount',
	DefinitionProximity = 'definitionProximity',
	CodeStructureRelevance = 'codeStructureRelevance',

	// Document structure factors
	FileImportance = 'fileImportance',
	LocationInFile = 'locationInFile',
	DocumentSectionRelevance = 'documentSectionRelevance',

	// Context factors
	RecentEdits = 'recentEdits',
	UserInteractionHistory = 'userInteractionHistory',
	TimeRelevance = 'timeRelevance',

	// Custom factor
	Custom = 'custom'
}

/**
 * Ranking factor configuration.
 */
export interface RankingFactor {
	/**
	 * Type of ranking factor.
	 */
	type: RankingFactorType;

	/**
	 * Weight of this factor (0-1).
	 */
	weight: number;

	/**
	 * Scoring function for this factor.
	 */
	scoreFn?: (params: RankingParams) => number;

	/**
	 * Metadata for this factor.
	 */
	metadata?: Record<string, any>;
}

/**
 * Parameters for ranking calculation.
 */
export interface RankingParams {
	/**
	 * Query text.
	 */
	query: string;

	/**
	 * Chunk text.
	 */
	chunkText: string;

	/**
	 * File path.
	 */
	filePath?: string;

	/**
	 * Semantic similarity score (if available).
	 */
	semanticScore?: number;

	/**
	 * Symbols in the chunk (if available).
	 */
	symbols?: DocumentSymbol[];

	/**
	 * Symbol usages (if available).
	 */
	symbolUsages?: Map<string, SymbolUsage>;

	/**
	 * AST node (if available).
	 */
	node?: TreeSitterNode;

	/**
	 * Additional context.
	 */
	context?: Record<string, any>;
}

/**
 * Result of a ranking calculation.
 */
export interface RankingResult {
	/**
	 * Overall score (0-1).
	 */
	score: number;

	/**
	 * Individual factor scores.
	 */
	factorScores: Map<RankingFactorType, number>;

	/**
	 * Explanation of the ranking (if enabled).
	 */
	explanation?: string;
}

/**
 * Configuration for the advanced ranking engine.
 */
export interface AdvancedRankingConfig {
	/**
	 * Factors to use in ranking.
	 */
	factors: RankingFactor[];

	/**
	 * Whether to generate explanations.
	 */
	generateExplanations?: boolean;

	/**
	 * Custom normalization function.
	 */
	normalizeScores?: (scores: Map<RankingFactorType, number>) => Map<RankingFactorType, number>;

	/**
	 * Custom aggregation function.
	 */
	aggregateScores?: (scores: Map<RankingFactorType, number>, factors: RankingFactor[]) => number;
}

/**
 * Advanced ranking engine for sophisticated retrieval.
 */
export class AdvancedRankingEngine {
	private config: AdvancedRankingConfig;

	constructor(config: AdvancedRankingConfig) {
		this.config = {
			...config,
			factors: config.factors.map(factor => ({
				...factor,
				// Ensure weights are normalized between 0 and 1
				weight: Math.max(0, Math.min(1, factor.weight))
			}))
		};
	}

	/**
	 * Rank a chunk using the configured factors.
	 * @param params Parameters for ranking
	 * @returns Ranking result
	 */
	public rank(params: RankingParams): RankingResult {
		// Calculate scores for each factor
		const factorScores = new Map<RankingFactorType, number>();

		// Apply each factor's scoring function
		for (const factor of this.config.factors) {
			let score = 0;

			// Use custom scoring function if provided
			if (factor.scoreFn) {
				score = factor.scoreFn(params);
			} else {
				// Use built-in scoring functions
				score = this.calculateFactorScore(factor.type, params);
			}

			// Ensure score is between 0 and 1
			score = Math.max(0, Math.min(1, score));
			factorScores.set(factor.type, score);
		}

		// Apply custom normalization if provided
		const normalizedScores = this.config.normalizeScores
			? this.config.normalizeScores(factorScores)
			: factorScores;

		// Calculate aggregate score
		const aggregateScore = this.config.aggregateScores
			? this.config.aggregateScores(normalizedScores, this.config.factors)
			: this.defaultAggregateScores(normalizedScores);

		// Generate explanation if requested
		let explanation: string | undefined;
		if (this.config.generateExplanations) {
			explanation = this.generateExplanation(normalizedScores, aggregateScore);
		}

		return {
			score: aggregateScore,
			factorScores: normalizedScores,
			explanation
		};
	}

	/**
	 * Calculate score for a single ranking factor.
	 * @param factorType Type of factor
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateFactorScore(factorType: RankingFactorType, params: RankingParams): number {
		switch (factorType) {
			case RankingFactorType.SemanticSimilarity:
				return params.semanticScore ?? 0;

			case RankingFactorType.KeywordMatch:
				return this.calculateKeywordMatchScore(params);

			case RankingFactorType.ExactPhraseMatch:
				return this.calculateExactPhraseMatchScore(params);

			case RankingFactorType.SymbolRelevance:
				return this.calculateSymbolRelevanceScore(params);

			case RankingFactorType.SymbolUsageCount:
				return this.calculateSymbolUsageCountScore(params);

			case RankingFactorType.DefinitionProximity:
				return this.calculateDefinitionProximityScore(params);

			case RankingFactorType.CodeStructureRelevance:
				return this.calculateCodeStructureRelevanceScore(params);

			case RankingFactorType.FileImportance:
				return this.calculateFileImportanceScore(params);

			case RankingFactorType.LocationInFile:
				return this.calculateLocationInFileScore(params);

			case RankingFactorType.DocumentSectionRelevance:
				return this.calculateDocumentSectionRelevanceScore(params);

			case RankingFactorType.RecentEdits:
				return this.calculateRecentEditsScore(params);

			case RankingFactorType.UserInteractionHistory:
				return this.calculateUserInteractionHistoryScore(params);

			case RankingFactorType.TimeRelevance:
				return this.calculateTimeRelevanceScore(params);

			default:
				return 0;
		}
	}

	/**
	 * Default aggregation function (weighted average).
	 * @param scores Normalized factor scores
	 * @returns Aggregated score
	 */
	private defaultAggregateScores(scores: Map<RankingFactorType, number>): number {
		let weightedSum = 0;
		let totalWeight = 0;

		for (const factor of this.config.factors) {
			const score = scores.get(factor.type) ?? 0;
			weightedSum += score * factor.weight;
			totalWeight += factor.weight;
		}

		return totalWeight > 0 ? weightedSum / totalWeight : 0;
	}

	/**
	 * Generate human-readable explanation of the ranking.
	 * @param scores Factor scores
	 * @param aggregateScore Final score
	 * @returns Explanation text
	 */
	private generateExplanation(scores: Map<RankingFactorType, number>, aggregateScore: number): string {
		const parts: string[] = [
			`Final score: ${aggregateScore.toFixed(4)} (${Math.round(aggregateScore * 100)}%)`
		];

		// Add explanations for each factor
		for (const factor of this.config.factors) {
			const score = scores.get(factor.type) ?? 0;
			const contribution = score * factor.weight;

			parts.push(`- ${factor.type}: ${score.toFixed(4)} * ${factor.weight.toFixed(2)} = ${contribution.toFixed(4)}`);
		}

		return parts.join('\n');
	}

	/**
	 * Calculate keyword match score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateKeywordMatchScore(params: RankingParams): number {
		const { query, chunkText } = params;

		// Extract keywords
		const keywords = query.toLowerCase()
			.split(/\s+/)
			.filter(word => word.length > 2)
			.map(word => word.replace(/[^\w]/g, ''));

		if (keywords.length === 0) {
			return 0;
		}

		// Count keyword matches
		const chunkLower = chunkText.toLowerCase();
		let matchCount = 0;

		for (const keyword of keywords) {
			if (chunkLower.includes(keyword)) {
				matchCount++;
			}
		}

		return matchCount / keywords.length;
	}

	/**
	 * Calculate exact phrase match score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateExactPhraseMatchScore(params: RankingParams): number {
		const { query, chunkText } = params;

		// Clean up query
		const cleanQuery = query.replace(/\s+/g, ' ').trim().toLowerCase();
		const cleanChunk = chunkText.replace(/\s+/g, ' ').toLowerCase();

		if (cleanChunk.includes(cleanQuery)) {
			// Exact match gets full score
			return 1;
		}

		// Check for partial phrase matches
		const phrases = cleanQuery.split(/[.!?;]+/).filter(p => p.trim().length > 0);

		if (phrases.length === 0) {
			return 0;
		}

		let matchCount = 0;
		for (const phrase of phrases) {
			if (cleanChunk.includes(phrase.trim())) {
				matchCount++;
			}
		}

		return matchCount / phrases.length;
	}

	/**
	 * Calculate symbol relevance score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateSymbolRelevanceScore(params: RankingParams): number {
		const { query, symbols } = params;

		if (!symbols || symbols.length === 0) {
			return 0;
		}

		// Extract potential symbol names from query
		const potentialSymbols = query.split(/\W+/).filter(s => s.length > 1);

		if (potentialSymbols.length === 0) {
			return 0;
		}

		// Check for symbol name matches
		let matchCount = 0;
		for (const potentialSymbol of potentialSymbols) {
			for (const symbol of symbols) {
				if (symbol.name.includes(potentialSymbol) ||
					potentialSymbol.includes(symbol.name)) {
					matchCount++;
					break;
				}
			}
		}

		return matchCount / potentialSymbols.length;
	}

	/**
	 * Calculate symbol usage count score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateSymbolUsageCountScore(params: RankingParams): number {
		const { symbolUsages, symbols } = params;

		if (!symbolUsages || !symbols || symbols.length === 0) {
			return 0;
		}

		let totalUsageScore = 0;
		let symbolCount = 0;

		// Calculate usage score for each symbol
		for (const symbol of symbols) {
			const usage = symbolUsages.get(symbol.id);

			if (usage) {
				// Normalize by capping at 10 usages (diminishing returns)
				// Use the appropriate property based on the SymbolUsage interface
				const usageCount = Math.min(usage.references?.length || 0, 10);
				totalUsageScore += usageCount / 10;
				symbolCount++;
			}
		}

		return symbolCount > 0 ? totalUsageScore / symbolCount : 0;
	}

	/**
	 * Calculate definition proximity score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateDefinitionProximityScore(params: RankingParams): number {
		const { symbols, symbolUsages } = params;

		if (!symbols || !symbolUsages || symbols.length === 0) {
			return 0;
		}

		let hasDefinition = false;

		// Check if the chunk contains any symbol definitions
		for (const symbol of symbols) {
			const usage = symbolUsages.get(symbol.id);

			if (usage && usage.definitions && usage.definitions.length > 0) {
				hasDefinition = true;
				break;
			}
		}

		return hasDefinition ? 1 : 0;
	}

	/**
	 * Calculate code structure relevance score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateCodeStructureRelevanceScore(params: RankingParams): number {
		const { node } = params;

		if (!node) {
			return 0;
		}

		// Higher scores for more relevant code structures
		// This is a simplistic implementation - in practice, you'd want more sophisticated logic
		const importantNodeTypes = [
			'class_declaration',
			'method_definition',
			'function_declaration',
			'interface_declaration',
			'export_declaration',
			'import_declaration',
			'variable_declaration'
		];

		if (importantNodeTypes.includes(node.type)) {
			return 1;
		}

		const secondaryNodeTypes = [
			'if_statement',
			'for_statement',
			'while_statement',
			'switch_statement',
			'return_statement',
			'try_statement'
		];

		if (secondaryNodeTypes.includes(node.type)) {
			return 0.7;
		}

		// Other node types get a lower score
		return 0.3;
	}

	/**
	 * Calculate file importance score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateFileImportanceScore(params: RankingParams): number {
		const { filePath } = params;

		if (!filePath) {
			return 0;
		}

		// Score based on file path patterns
		// Higher scores for more important files

		// Entry points and core files
		if (/\b(index|main|app|core)\.[jt]sx?$/.test(filePath)) {
			return 1;
		}

		// APIs and controllers
		if (/\b(api|controller|service|provider)\.[jt]sx?$/.test(filePath)) {
			return 0.9;
		}

		// Model definitions
		if (/\b(model|schema|entity|type|interface)\.[jt]sx?$/.test(filePath)) {
			return 0.8;
		}

		// Component files
		if (/\b(component|view|page|screen)\.[jt]sx?$/.test(filePath)) {
			return 0.7;
		}

		// Utils and helpers
		if (/\b(util|helper|common|shared)\.[jt]sx?$/.test(filePath)) {
			return 0.6;
		}

		// Tests
		if (/\.(test|spec)\.[jt]sx?$/.test(filePath)) {
			return 0.4;
		}

		// Default score
		return 0.5;
	}

	/**
	 * Calculate location in file score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateLocationInFileScore(params: RankingParams): number {
		// In a real implementation, this would use the position in the file
		// For now, return a default score
		return 0.5;
	}

	/**
	 * Calculate document section relevance score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateDocumentSectionRelevanceScore(params: RankingParams): number {
		// In a real implementation, this would analyze document structure
		// For now, return a default score
		return 0.5;
	}

	/**
	 * Calculate recent edits score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateRecentEditsScore(params: RankingParams): number {
		const { context } = params;

		if (!context || !context.lastModified) {
			return 0;
		}

		const lastModified = new Date(context.lastModified).getTime();
		const now = Date.now();
		const hoursSinceModified = (now - lastModified) / (1000 * 60 * 60);

		// Recently modified files get higher scores
		// Score decreases with time (24 hours = 1 day)
		if (hoursSinceModified < 1) {
			return 1; // Modified within the last hour
		} else if (hoursSinceModified < 24) {
			return 1 - (hoursSinceModified / 24); // Linear decrease over 24 hours
		} else {
			return 0; // Modified more than 24 hours ago
		}
	}

	/**
	 * Calculate user interaction history score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateUserInteractionHistoryScore(params: RankingParams): number {
		const { context } = params;

		if (!context || !context.interactionCount) {
			return 0;
		}

		// More interactions = higher score, up to a point
		const interactionCount = Math.min(context.interactionCount, 10);
		return interactionCount / 10;
	}

	/**
	 * Calculate time relevance score.
	 * @param params Ranking parameters
	 * @returns Score between 0 and 1
	 */
	private calculateTimeRelevanceScore(params: RankingParams): number {
		// In a real implementation, this would consider time-based relevance
		// For now, return a default score
		return 0.5;
	}

	/**
	 * Create a default ranking configuration.
	 * @returns Default ranking configuration
	 */
	public static createDefaultConfig(): AdvancedRankingConfig {
		return {
			factors: [
				{ type: RankingFactorType.SemanticSimilarity, weight: 1.0 },
				{ type: RankingFactorType.KeywordMatch, weight: 0.7 },
				{ type: RankingFactorType.ExactPhraseMatch, weight: 0.8 },
				{ type: RankingFactorType.SymbolRelevance, weight: 0.9 },
				{ type: RankingFactorType.SymbolUsageCount, weight: 0.6 },
				{ type: RankingFactorType.DefinitionProximity, weight: 0.8 },
				{ type: RankingFactorType.CodeStructureRelevance, weight: 0.7 },
				{ type: RankingFactorType.FileImportance, weight: 0.5 },
				{ type: RankingFactorType.LocationInFile, weight: 0.4 },
				{ type: RankingFactorType.DocumentSectionRelevance, weight: 0.3 },
				{ type: RankingFactorType.RecentEdits, weight: 0.6 },
				{ type: RankingFactorType.UserInteractionHistory, weight: 0.5 },
				{ type: RankingFactorType.TimeRelevance, weight: 0.3 }
			],
			generateExplanations: false
		};
	}
}
