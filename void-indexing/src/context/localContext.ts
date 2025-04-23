/**
 * Local context collection functionality.
 * This module provides utilities for collecting context from the local surroundings of a position in a file.
 */

import { CancellationToken } from '../utils/cancellation';
import { ITextModel, Position } from '../ast/astParser';

/**
 * Represents a code snippet with its location information.
 */
export interface CodeSnippet {
	content: string;
	startLine: number;
	endLine: number;
	relevance: number;
	type: SnippetType;
}

/**
 * The type of snippet.
 */
export enum SnippetType {
	Exact,     // The exact position
	Nearby,    // Nearby lines
	Parent,    // Parent blocks/scopes
	Sibling,   // Similar/sibling blocks
	Related    // Semantically related blocks
}

/**
 * Options for context gathering.
 */
export interface ContextGatheringOptions {
	nearbyLinesAbove: number;
	nearbyLinesBelow: number;
	maxSnippets: number;
	minRelevance: number;
}

/**
 * Service for gathering local context from a text model.
 */
export class LocalContextGatherer {
	private snippetCache: Map<string, CodeSnippet[]> = new Map();
	private options: ContextGatheringOptions;

	constructor(options: Partial<ContextGatheringOptions> = {}) {
		this.options = {
			nearbyLinesAbove: 5,
			nearbyLinesBelow: 5,
			maxSnippets: 20,
			minRelevance: 0.2,
			...options
		};
	}

	/**
	 * Update the cache for a text model at a specific position.
	 * @param model The text model
	 * @param pos The position
	 * @param token Optional cancellation token
	 */
	async updateCache(
		model: ITextModel,
		pos: Position,
		token?: CancellationToken
	): Promise<void> {
		const cacheKey = this.getCacheKey(model, pos);

		// Skip if already in cache
		if (this.snippetCache.has(cacheKey)) {
			return;
		}

		// Gather various types of snippets
		const snippets: CodeSnippet[] = [];

		// Add exact position snippet
		const exactSnippet = this.getExactPositionSnippet(model, pos);
		if (exactSnippet) {
			snippets.push(exactSnippet);
		}

		// Add nearby snippets
		const nearbySnippets = await this.gatherNearbySnippets(
			model,
			pos,
			this.options.nearbyLinesAbove,
			this.options.nearbyLinesBelow,
			token
		);
		snippets.push(...nearbySnippets);

		// Cache the result
		this.snippetCache.set(cacheKey, snippets);
	}

	/**
	 * Get cached snippets for a model and position.
	 * @param model The text model
	 * @param pos The position
	 */
	getCachedSnippets(model: ITextModel, pos: Position): CodeSnippet[] {
		const cacheKey = this.getCacheKey(model, pos);
		return this.snippetCache.get(cacheKey) || [];
	}

	/**
	 * Generate a cache key for a model and position.
	 */
	private getCacheKey(model: ITextModel, pos: Position): string {
		return `${model.getLanguageId()}:${pos.line}:${pos.column}`;
	}

	/**
	 * Get a snippet from the exact position.
	 */
	private getExactPositionSnippet(model: ITextModel, pos: Position): CodeSnippet | null {
		if (pos.line < 0 || pos.line >= model.getLineCount()) {
			return null;
		}

		const lineContent = model.getLineContent(pos.line + 1); // +1 because line count is 1-based

		return {
			content: lineContent,
			startLine: pos.line,
			endLine: pos.line,
			relevance: 1.0, // Highest relevance
			type: SnippetType.Exact
		};
	}

	/**
	 * Gather snippets from nearby lines.
	 * @param model The text model
	 * @param pos The position
	 * @param linesAbove Number of lines to include above
	 * @param linesBelow Number of lines to include below
	 * @param token Optional cancellation token
	 */
	async gatherNearbySnippets(
		model: ITextModel,
		pos: Position,
		linesAbove: number,
		linesBelow: number,
		token?: CancellationToken
	): Promise<CodeSnippet[]> {
		const snippets: CodeSnippet[] = [];
		const lineCount = model.getLineCount();

		// Check for cancellation
		if (token?.isCancellationRequested) {
			return snippets;
		}

		// Gather snippets above the position
		const startLineAbove = Math.max(0, pos.line - linesAbove);
		if (startLineAbove < pos.line) {
			const contentAbove = this.getContentForLines(model, startLineAbove, pos.line - 1);

			snippets.push({
				content: contentAbove,
				startLine: startLineAbove,
				endLine: pos.line - 1,
				relevance: 0.8, // High relevance for lines just above
				type: SnippetType.Nearby
			});
		}

		// Gather snippets below the position
		const endLineBelow = Math.min(lineCount - 1, pos.line + linesBelow);
		if (endLineBelow > pos.line) {
			const contentBelow = this.getContentForLines(model, pos.line + 1, endLineBelow);

			snippets.push({
				content: contentBelow,
				startLine: pos.line + 1,
				endLine: endLineBelow,
				relevance: 0.7, // Medium-high relevance for lines just below
				type: SnippetType.Nearby
			});
		}

		return snippets;
	}

	/**
	 * Get the content for a range of lines.
	 */
	private getContentForLines(model: ITextModel, startLine: number, endLine: number): string {
		let content = '';

		for (let i = startLine; i <= endLine; i++) {
			content += model.getLineContent(i + 1) + '\n'; // +1 because line content is 1-based
		}

		return content.trimEnd();
	}

	/**
	 * Gather parent block snippets based on indentation.
	 * This is a simple heuristic that looks for parent blocks based on indentation levels.
	 * For more accurate parent detection, use AST-based gathering.
	 * @param model The text model
	 * @param pos The position
	 * @param token Optional cancellation token
	 */
	async gatherParentSnippets(
		model: ITextModel,
		pos: Position,
		token?: CancellationToken
	): Promise<CodeSnippet[]> {
		const snippets: CodeSnippet[] = [];
		const lineCount = model.getLineCount();

		// Check for cancellation
		if (token?.isCancellationRequested) {
			return snippets;
		}

		const currentLine = pos.line;
		const currentLineContent = model.getLineContent(currentLine + 1); // +1 because line content is 1-based
		const currentIndentation = this.getIndentationLevel(currentLineContent);

		// Look for parent blocks going upward
		let parentStart = currentLine;
		for (let i = currentLine - 1; i >= 0; i--) {
			const lineContent = model.getLineContent(i + 1);
			const indentation = this.getIndentationLevel(lineContent);

			// If we find a line with less indentation, it might be a parent block
			if (indentation < currentIndentation && lineContent.trim().length > 0) {
				parentStart = i;

				// For simplicity, we'll just take the first parent block we find
				const parentContent = this.getContentForLines(model, parentStart, currentLine);

				snippets.push({
					content: parentContent,
					startLine: parentStart,
					endLine: currentLine,
					relevance: 0.9, // Very high relevance for parent blocks
					type: SnippetType.Parent
				});

				break;
			}
		}

		return snippets;
	}

	/**
	 * Get the indentation level (number of spaces/tabs) of a line.
	 */
	private getIndentationLevel(line: string): number {
		const match = line.match(/^(\s*)/);
		return match ? match[1].length : 0;
	}

	/**
	 * Combine multiple types of snippets and sort by relevance.
	 * @param model The text model
	 * @param pos The position
	 * @param token Optional cancellation token
	 */
	async getAllContextSnippets(
		model: ITextModel,
		pos: Position,
		token?: CancellationToken
	): Promise<CodeSnippet[]> {
		// First check cache
		const cachedSnippets = this.getCachedSnippets(model, pos);
		if (cachedSnippets.length > 0) {
			return cachedSnippets;
		}

		// If not in cache, gather all types of snippets
		const snippets: CodeSnippet[] = [];

		// Get exact position snippet
		const exactSnippet = this.getExactPositionSnippet(model, pos);
		if (exactSnippet) {
			snippets.push(exactSnippet);
		}

		// Get nearby snippets
		const nearbySnippets = await this.gatherNearbySnippets(
			model,
			pos,
			this.options.nearbyLinesAbove,
			this.options.nearbyLinesBelow,
			token
		);
		snippets.push(...nearbySnippets);

		// Get parent snippets
		const parentSnippets = await this.gatherParentSnippets(model, pos, token);
		snippets.push(...parentSnippets);

		// Sort by relevance
		snippets.sort((a, b) => b.relevance - a.relevance);

		// Limit to max snippets
		const result = snippets.slice(0, this.options.maxSnippets);

		// Cache the result
		this.snippetCache.set(this.getCacheKey(model, pos), result);

		return result;
	}

	/**
	 * Clear the snippet cache.
	 */
	clearCache(): void {
		this.snippetCache.clear();
	}
}
