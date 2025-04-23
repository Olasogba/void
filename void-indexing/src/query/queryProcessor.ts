/**
 * Query processing and expansion capabilities.
 * This module provides utilities for analyzing and expanding search queries.
 */

import { CancellationToken } from '../utils/cancellation';

/**
 * Represents a parsed query.
 */
export interface ParsedQuery {
	original: string;
	terms: string[];
	exact: string[];
	excluded: string[];
	filters: Map<string, string>;
	type?: string;
}

/**
 * Represents an expanded query with additional terms.
 */
export interface ExpandedQuery extends ParsedQuery {
	synonyms: Map<string, string[]>;
	expanded: string[];
	stemmed: string[];
	prefixMatches: string[];
}

/**
 * Represents a query match result.
 */
export interface MatchResult {
	matchType: 'exact' | 'fuzzy' | 'semantic' | 'none';
	score: number;
	matches: string[];
	highlights: [number, number][]; // Start and end positions of matches
}

/**
 * Context matching capabilities.
 */
export interface ContextMatcher {
	exactMatch: boolean;
	fuzzyMatch: boolean;
	semanticMatch: boolean;
	astMatch: boolean;
	score: number;
}

/**
 * Advanced query processor that can parse, expand, and match queries.
 */
export class QueryProcessor {
	private synonyms: Map<string, string[]> = new Map();
	private stopWords: Set<string> = new Set();

	constructor() {
		this.initStopWords();
		this.initSynonyms();
	}

	/**
	 * Parse a query string into structured parts.
	 * @param query The query string
	 */
	parseQuery(query: string): ParsedQuery {
		const result: ParsedQuery = {
			original: query,
			terms: [],
			exact: [],
			excluded: [],
			filters: new Map()
		};

		// Split the query into tokens
		const tokens = this.tokenizeQuery(query);

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];

			// Handle exact phrases
			if (token.startsWith('"') && token.endsWith('"')) {
				result.exact.push(token.slice(1, -1));
				continue;
			}

			// Handle excluded terms
			if (token.startsWith('-')) {
				result.excluded.push(token.slice(1));
				continue;
			}

			// Handle filters (field:value)
			if (token.includes(':')) {
				const [field, value] = token.split(':');
				result.filters.set(field, value);

				// Handle special type filter
				if (field === 'type') {
					result.type = value;
				}

				continue;
			}

			// Regular terms
			if (!this.stopWords.has(token.toLowerCase())) {
				result.terms.push(token);
			}
		}

		return result;
	}

	/**
	 * Expand a parsed query with additional terms.
	 * @param parsed The parsed query
	 */
	expandQuery(parsed: ParsedQuery): ExpandedQuery {
		const expanded: ExpandedQuery = {
			...parsed,
			synonyms: new Map(),
			expanded: [],
			stemmed: [],
			prefixMatches: []
		};

		// Add synonyms
		for (const term of parsed.terms) {
			const termLower = term.toLowerCase();
			const termSynonyms = this.synonyms.get(termLower) || [];

			if (termSynonyms.length > 0) {
				expanded.synonyms.set(termLower, termSynonyms);
				expanded.expanded.push(...termSynonyms);
			}

			// Add stemmed version
			const stemmed = this.stemTerm(termLower);
			if (stemmed !== termLower) {
				expanded.stemmed.push(stemmed);
			}
		}

		return expanded;
	}

	/**
	 * Match a query against context.
	 * @param expanded The expanded query
	 * @param context The context text
	 */
	matchContext(expanded: ExpandedQuery, context: string): MatchResult {
		const contextLower = context.toLowerCase();
		const matches: string[] = [];
		const highlights: [number, number][] = [];

		// Check exact matches
		let matchType: 'exact' | 'fuzzy' | 'semantic' | 'none' = 'none';
		let score = 0;

		// Check for exact phrases
		for (const phrase of expanded.exact) {
			const phraseLower = phrase.toLowerCase();
			const phraseIndex = contextLower.indexOf(phraseLower);

			if (phraseIndex >= 0) {
				matches.push(phrase);
				highlights.push([phraseIndex, phraseIndex + phraseLower.length]);
				matchType = 'exact';
				score = Math.max(score, 1.0);
			}
		}

		// Check for regular terms
		for (const term of expanded.terms) {
			const termLower = term.toLowerCase();
			const termIndex = contextLower.indexOf(termLower);

			if (termIndex >= 0) {
				matches.push(term);
				highlights.push([termIndex, termIndex + termLower.length]);
				matchType = matchType === 'none' ? 'exact' : matchType;
				score = Math.max(score, 0.9);
			}
		}

		// Check for expanded terms (synonyms, stemmed)
		if (matchType === 'none') {
			for (const term of expanded.expanded) {
				const termLower = term.toLowerCase();
				const termIndex = contextLower.indexOf(termLower);

				if (termIndex >= 0) {
					matches.push(term);
					highlights.push([termIndex, termIndex + termLower.length]);
					matchType = 'semantic';
					score = Math.max(score, 0.7);
				}
			}

			for (const term of expanded.stemmed) {
				const termLower = term.toLowerCase();
				const termIndex = contextLower.indexOf(termLower);

				if (termIndex >= 0) {
					matches.push(term);
					highlights.push([termIndex, termIndex + termLower.length]);
					matchType = 'fuzzy';
					score = Math.max(score, 0.8);
				}
			}
		}

		// Check for fuzzy matches if we still have no matches
		if (matchType === 'none') {
			for (const term of expanded.terms) {
				const fuzzyScore = this.fuzzyMatch(term, context);
				if (fuzzyScore > 0.6) {
					matches.push(term);
					matchType = 'fuzzy';
					score = Math.max(score, fuzzyScore);
				}
			}
		}

		return {
			matchType,
			score,
			matches,
			highlights
		};
	}

	/**
	 * Tokenize a query string.
	 * @param query The query string
	 */
	private tokenizeQuery(query: string): string[] {
		const tokens: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < query.length; i++) {
			const char = query[i];

			if (char === '"') {
				inQuotes = !inQuotes;
				current += char;
			} else if (char === ' ' && !inQuotes) {
				if (current) {
					tokens.push(current);
					current = '';
				}
			} else {
				current += char;
			}
		}

		if (current) {
			tokens.push(current);
		}

		return tokens;
	}

	/**
	 * Initialize stop words.
	 */
	private initStopWords(): void {
		const stopWordsList = [
			'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by',
			'for', 'if', 'in', 'into', 'is', 'it',
			'no', 'not', 'of', 'on', 'or', 'such',
			'that', 'the', 'their', 'then', 'there', 'these',
			'they', 'this', 'to', 'was', 'will', 'with'
		];

		for (const word of stopWordsList) {
			this.stopWords.add(word);
		}
	}

	/**
	 * Initialize synonyms.
	 */
	private initSynonyms(): void {
		// Add programming-related synonyms
		this.synonyms.set('function', ['method', 'procedure', 'routine', 'subroutine']);
		this.synonyms.set('variable', ['var', 'field', 'property']);
		this.synonyms.set('class', ['type', 'struct', 'interface']);
		this.synonyms.set('method', ['function', 'procedure', 'member']);
		this.synonyms.set('import', ['require', 'include', 'use']);
		this.synonyms.set('export', ['expose', 'provide']);
		this.synonyms.set('async', ['asynchronous', 'promise', 'future']);
		this.synonyms.set('array', ['list', 'collection', 'sequence']);
		this.synonyms.set('object', ['map', 'dictionary', 'hash', 'record']);
		this.synonyms.set('string', ['text', 'str']);
		this.synonyms.set('number', ['int', 'integer', 'float', 'double']);
		this.synonyms.set('boolean', ['bool', 'flag']);
	}

	/**
	 * Perform simple stemming on a term.
	 * @param term The term to stem
	 */
	private stemTerm(term: string): string {
		// Very simplified stemming (just a few common cases)
		if (term.endsWith('ing')) {
			return term.slice(0, -3);
		}
		if (term.endsWith('ed')) {
			return term.slice(0, -2);
		}
		if (term.endsWith('s') && !term.endsWith('ss')) {
			return term.slice(0, -1);
		}

		return term;
	}

	/**
	 * Calculate fuzzy match score.
	 * @param term The term to match
	 * @param text The text to match against
	 */
	private fuzzyMatch(term: string, text: string): number {
		// Simplified implementation using Levenshtein distance
		const termLower = term.toLowerCase();
		const textLower = text.toLowerCase();

		// Look for the term with up to 2 character differences
		const words = textLower.split(/\W+/);

		for (const word of words) {
			const distance = this.levenshteinDistance(termLower, word);
			const maxLength = Math.max(termLower.length, word.length);

			if (maxLength > 0) {
				const score = 1 - (distance / maxLength);
				if (score > 0.6) {
					return score;
				}
			}
		}

		return 0;
	}

	/**
	 * Calculate Levenshtein distance between two strings.
	 * @param a The first string
	 * @param b The second string
	 */
	private levenshteinDistance(a: string, b: string): number {
		const matrix: number[][] = [];

		// Initialize matrix
		for (let i = 0; i <= a.length; i++) {
			matrix[i] = [i];
		}

		for (let j = 0; j <= b.length; j++) {
			matrix[0][j] = j;
		}

		// Fill in the matrix
		for (let i = 1; i <= a.length; i++) {
			for (let j = 1; j <= b.length; j++) {
				const cost = a[i - 1] === b[j - 1] ? 0 : 1;
				matrix[i][j] = Math.min(
					matrix[i - 1][j] + 1,      // deletion
					matrix[i][j - 1] + 1,      // insertion
					matrix[i - 1][j - 1] + cost // substitution
				);
			}
		}

		return matrix[a.length][b.length];
	}
}

/**
 * Factory for creating context matchers.
 */
export class ContextMatcherFactory {
	/**
	 * Create a context matcher for a specific context type.
	 * @param queryType The query type
	 */
	static createMatcher(queryType?: string): ContextMatcher {
		// Default matcher enables all match types
		const defaultMatcher: ContextMatcher = {
			exactMatch: true,
			fuzzyMatch: true,
			semanticMatch: true,
			astMatch: true,
			score: 0
		};

		// Customize based on query type
		switch (queryType) {
			case 'exact':
				return {
					...defaultMatcher,
					fuzzyMatch: false,
					semanticMatch: false
				};

			case 'fuzzy':
				return {
					...defaultMatcher,
					semanticMatch: false
				};

			case 'semantic':
				return {
					...defaultMatcher,
					exactMatch: false,
					fuzzyMatch: false
				};

			case 'ast':
				return {
					...defaultMatcher,
					astMatch: true
				};

			default:
				return defaultMatcher;
		}
	}
}
