/**
 * Advanced index structure implementation.
 * This module provides sophisticated index structures for code retrieval.
 */

import { CancellationToken } from '../utils/cancellation';
import { ASTNode } from '../ast/astParser';
import { TfIdfCalculator } from '../index/tfIdf';

/**
 * Represents a vector (for embeddings).
 */
export type Vector = number[];

/**
 * Metadata about a document.
 */
export interface DocumentMetadata {
	id: string;
	path?: string;
	language?: string;
	lastModified: number;
	size: number;
	type: 'file' | 'snippet' | 'ast';
	symbols?: string[];
	tags?: string[];
}

/**
 * Term frequency information.
 */
export interface TermFrequency {
	term: string;
	documentFrequency: number;
	documents: Map<string, number>;
}

/**
 * Symbol information.
 */
export interface SymbolInfo {
	name: string;
	kind: string;
	location: {
		path: string;
		range: {
			start: { line: number; character: number };
			end: { line: number; character: number };
		};
	};
	containerName?: string;
	children?: SymbolInfo[];
}

/**
 * Comprehensive index structure for code.
 */
export class CodeIndex {
	private documentIndex: Map<string, DocumentMetadata> = new Map();
	private termIndex: Map<string, TermFrequency> = new Map();
	private embeddings: Map<string, Vector> = new Map();
	private astIndex: Map<string, ASTNode> = new Map();
	private symbolIndex: Map<string, SymbolInfo[]> = new Map();
	private tfIdfCalculator = new TfIdfCalculator();

	/**
	 * Add a document to the index.
	 * @param id The document ID
	 * @param content The document content
	 * @param metadata The document metadata
	 * @param embedding Optional embedding vector
	 * @param ast Optional AST node
	 */
	addDocument(
		id: string,
		content: string,
		metadata: Partial<DocumentMetadata>,
		embedding?: Vector,
		ast?: ASTNode
	): void {
		// Create and store document metadata
		const docMetadata: DocumentMetadata = {
			id,
			lastModified: Date.now(),
			size: content.length,
			type: 'file',
			...metadata
		};

		this.documentIndex.set(id, docMetadata);

		// Update TF-IDF calculator
		this.tfIdfCalculator.updateDocuments([{
			key: id,
			textChunks: [content]
		}]);

		// Update term index
		this.updateTermIndex(id, content);

		// Store embedding if provided
		if (embedding) {
			this.embeddings.set(id, embedding);
		}

		// Store AST if provided
		if (ast) {
			this.astIndex.set(id, ast);
			this.extractSymbolsFromAST(id, ast);
		}
	}

	/**
	 * Remove a document from the index.
	 * @param id The document ID
	 */
	removeDocument(id: string): void {
		// Remove from document index
		this.documentIndex.delete(id);

		// Remove from TF-IDF calculator
		this.tfIdfCalculator.deleteDocument(id);

		// Remove from term index
		for (const [term, termFreq] of this.termIndex.entries()) {
			if (termFreq.documents.has(id)) {
				termFreq.documents.delete(id);
				termFreq.documentFrequency--;

				// Remove term if no documents have it
				if (termFreq.documentFrequency === 0) {
					this.termIndex.delete(term);
				}
			}
		}

		// Remove from embeddings
		this.embeddings.delete(id);

		// Remove from AST index
		this.astIndex.delete(id);

		// Remove from symbol index
		this.symbolIndex.delete(id);
	}

	/**
	 * Search the index using TF-IDF.
	 * @param query The search query
	 * @param token Optional cancellation token
	 */
	searchTfIdf(query: string, token?: CancellationToken): string[] {
		const scores = this.tfIdfCalculator.calculateScores(query, token || CancellationToken.None);
		return scores.map(score => score.key);
	}

	/**
	 * Search the index using embeddings.
	 * @param queryEmbedding The query embedding
	 * @param maxResults Maximum number of results
	 */
	searchEmbeddings(queryEmbedding: Vector, maxResults: number = 10): string[] {
		const similarities: [string, number][] = [];

		// Calculate cosine similarity for each document
		for (const [id, embedding] of this.embeddings.entries()) {
			const similarity = this.cosineSimilarity(queryEmbedding, embedding);
			similarities.push([id, similarity]);
		}

		// Sort by similarity (descending)
		similarities.sort((a, b) => b[1] - a[1]);

		// Return top results
		return similarities.slice(0, maxResults).map(([id]) => id);
	}

	/**
	 * Search for symbols.
	 * @param query The symbol query
	 * @param exact Whether to require exact matches
	 */
	searchSymbols(query: string, exact: boolean = false): SymbolInfo[] {
		const results: SymbolInfo[] = [];

		for (const symbols of this.symbolIndex.values()) {
			for (const symbol of symbols) {
				if (this.matchSymbol(symbol, query, exact)) {
					results.push(symbol);
				}
			}
		}

		return results;
	}

	/**
	 * Get document metadata.
	 * @param id The document ID
	 */
	getDocumentMetadata(id: string): DocumentMetadata | undefined {
		return this.documentIndex.get(id);
	}

	/**
	 * Get document AST.
	 * @param id The document ID
	 */
	getDocumentAST(id: string): ASTNode | undefined {
		return this.astIndex.get(id);
	}

	/**
	 * Get all indexed documents.
	 */
	getAllDocuments(): DocumentMetadata[] {
		return Array.from(this.documentIndex.values());
	}

	/**
	 * Update the term index for a document.
	 * @param id The document ID
	 * @param content The document content
	 */
	private updateTermIndex(id: string, content: string): void {
		// Parse content into terms
		const terms = content.toLowerCase().split(/\W+/).filter(term => term.length > 2);

		// Count term frequencies
		const termCounts = new Map<string, number>();
		for (const term of terms) {
			termCounts.set(term, (termCounts.get(term) || 0) + 1);
		}

		// Update term index
		for (const [term, count] of termCounts.entries()) {
			let termFreq = this.termIndex.get(term);

			if (!termFreq) {
				termFreq = {
					term,
					documentFrequency: 0,
					documents: new Map()
				};
				this.termIndex.set(term, termFreq);
			}

			if (!termFreq.documents.has(id)) {
				termFreq.documentFrequency++;
			}

			termFreq.documents.set(id, count);
		}
	}

	/**
	 * Extract symbols from an AST.
	 * @param id The document ID
	 * @param ast The AST node
	 */
	private extractSymbolsFromAST(id: string, ast: ASTNode): void {
		const symbols: SymbolInfo[] = [];

		// Walk the AST and extract symbols
		const extractSymbols = (node: ASTNode, containerName?: string) => {
			// Check if this node represents a symbol
			if (this.isSymbolNode(node)) {
				const symbol: SymbolInfo = {
					name: node.value || node.type,
					kind: node.type,
					location: {
						path: id,
						range: {
							start: { line: node.range.start.line, character: node.range.start.column },
							end: { line: node.range.end.line, character: node.range.end.column }
						}
					},
					containerName,
					children: []
				};

				// Process children
				for (const child of node.children) {
					extractSymbols(child, symbol.name);
				}

				// Add to symbols list
				symbols.push(symbol);
			} else {
				// Process children
				for (const child of node.children) {
					extractSymbols(child, containerName);
				}
			}
		};

		// Start extraction
		extractSymbols(ast);

		// Store symbols
		this.symbolIndex.set(id, symbols);
	}

	/**
	 * Check if a node represents a symbol.
	 * @param node The AST node
	 */
	private isSymbolNode(node: ASTNode): boolean {
		const symbolTypes = [
			'FunctionDeclaration',
			'ClassDeclaration',
			'MethodDefinition',
			'VariableDeclaration',
			'InterfaceDeclaration',
			'TypeAliasDeclaration',
			'EnumDeclaration'
		];

		return symbolTypes.includes(node.type);
	}

	/**
	 * Check if a symbol matches a query.
	 * @param symbol The symbol
	 * @param query The query
	 * @param exact Whether to require exact matches
	 */
	private matchSymbol(symbol: SymbolInfo, query: string, exact: boolean): boolean {
		if (exact) {
			return symbol.name === query;
		} else {
			return symbol.name.toLowerCase().includes(query.toLowerCase());
		}
	}

	/**
	 * Calculate cosine similarity between two vectors.
	 * @param a The first vector
	 * @param b The second vector
	 */
	private cosineSimilarity(a: Vector, b: Vector): number {
		if (a.length !== b.length) {
			throw new Error('Vectors must have the same dimension');
		}

		let dotProduct = 0;
		let magnitudeA = 0;
		let magnitudeB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			magnitudeA += a[i] * a[i];
			magnitudeB += b[i] * b[i];
		}

		magnitudeA = Math.sqrt(magnitudeA);
		magnitudeB = Math.sqrt(magnitudeB);

		if (magnitudeA === 0 || magnitudeB === 0) {
			return 0;
		}

		return dotProduct / (magnitudeA * magnitudeB);
	}
}
