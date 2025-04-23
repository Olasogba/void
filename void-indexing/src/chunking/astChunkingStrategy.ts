import { CancellationToken } from '../utils/cancellation';
import { ASTNode, ASTParser, ITextModel } from '../ast/astParser';
import { ChunkingStrategy, ChunkingStrategyType, Chunk, ChunkingOptions } from './chunkingStrategy';

/**
 * AST-based chunking strategy that splits content based on code structure.
 */
export class ASTChunkingStrategy extends ChunkingStrategy {
	private astParser: ASTParser;

	/**
	 * Create a new AST-based chunking strategy.
	 * @param astParser The AST parser to use
	 * @param options Chunking options
	 */
	constructor(astParser: ASTParser, options: Partial<ChunkingOptions> = {}) {
		super({
			...options,
			strategy: ChunkingStrategyType.AST
		});
		this.astParser = astParser;
	}

	/**
	 * Chunk content based on AST nodes.
	 * @param content The content to chunk
	 * @param metadata Additional metadata about the content
	 * @param token Optional cancellation token
	 * @returns Array of chunks based on code structure
	 */
	async chunk(
		content: string,
		metadata?: Record<string, any>,
		token?: CancellationToken
	): Promise<Chunk[]> {
		if (token?.isCancellationRequested) {
			return [];
		}

		// Create a simple model from the content
		const textModel: ITextModel = {
			getText: () => content,
			getLineContent: (lineNumber: number) => content.split('\n')[lineNumber - 1] || '',
			getLineCount: () => content.split('\n').length,
			getLanguageId: () => metadata?.language || 'plaintext'
		};

		try {
			// Parse the content into an AST
			const ast = await this.astParser.parse(textModel, token);

			if (token?.isCancellationRequested) {
				return [];
			}

			// Extract chunks from the AST
			return this.extractChunksFromAST(ast, content, metadata);
		} catch (error) {
			console.error('Error parsing content with AST parser:', error);

			// Fallback to a simpler chunking strategy if AST parsing fails
			const fallbackChunks: Chunk[] = [{
				id: this.generateChunkId(content, 0, metadata),
				content,
				metadata: {
					startLine: 0,
					endLine: this.getLineNumberAtOffset(content, content.length),
					...metadata,
					fallback: true
				}
			}];

			return fallbackChunks;
		}
	}

	/**
	 * Extract chunks from the AST.
	 * @param node The AST node
	 * @param content The original content
	 * @param metadata Additional metadata
	 * @returns Array of chunks
	 */
	private extractChunksFromAST(
		node: ASTNode,
		content: string,
		metadata?: Record<string, any>
	): Chunk[] {
		const chunks: Chunk[] = [];
		const chunkableNodeTypes = this.getChunkableNodeTypes(metadata?.language);
		const idMap = new Map<ASTNode, string>();

		// Traverse the AST to find chunkable nodes
		this.astParser.walkAST(node, (currentNode) => {
			if (chunkableNodeTypes.includes(currentNode.type)) {
				const nodeStart = this.getPositionOffset(currentNode.range.start, content);
				const nodeEnd = this.getPositionOffset(currentNode.range.end, content);

				if (nodeStart >= 0 && nodeEnd > nodeStart) {
					const nodeContent = content.substring(nodeStart, nodeEnd);

					// Skip if the content is too small
					if (nodeContent.length < (this.options.minChunkSize || 20)) {
						return true;
					}

					// Generate a unique ID for this node
					const chunkId = this.generateChunkId(
						nodeContent,
						chunks.length,
						{ ...metadata, type: currentNode.type }
					);

					// Store the ID for parent references
					idMap.set(currentNode, chunkId);

					// Create the chunk
					chunks.push({
						id: chunkId,
						content: nodeContent,
						metadata: {
							startLine: currentNode.range.start.line,
							endLine: currentNode.range.end.line,
							type: currentNode.type,
							parentId: currentNode.parent ? idMap.get(currentNode.parent) : undefined,
							...metadata
						}
					});
				}
			}

			return true; // Continue traversal
		});

		// If no chunks were found, create a single chunk for the entire content
		if (chunks.length === 0) {
			chunks.push({
				id: this.generateChunkId(content, 0, metadata),
				content,
				metadata: {
					startLine: 0,
					endLine: this.getLineNumberAtOffset(content, content.length),
					...metadata
				}
			});
		}

		return chunks;
	}

	/**
	 * Get the list of node types that should be chunked based on the language.
	 * @param language The programming language
	 * @returns Array of node types to chunk
	 */
	private getChunkableNodeTypes(language?: string): string[] {
		// Common chunkable node types across languages
		const commonTypes = [
			'FunctionDeclaration',
			'ClassDeclaration',
			'MethodDefinition',
			'PropertyDefinition',
			'Program'
		];

		// Language-specific node types
		const languageSpecificTypes: Record<string, string[]> = {
			typescript: [
				'InterfaceDeclaration',
				'TypeAliasDeclaration',
				'EnumDeclaration',
				'ExportDeclaration'
			],
			javascript: [
				'ObjectExpression',
				'ArrowFunctionExpression',
				'FunctionExpression'
			],
			python: [
				'ClassDef',
				'FunctionDef',
				'AsyncFunctionDef',
				'Module'
			],
			java: [
				'ClassOrInterfaceDeclaration',
				'MethodDeclaration',
				'ConstructorDeclaration',
				'EnumDeclaration'
			],
			go: [
				'FuncDecl',
				'TypeDecl',
				'StructType',
				'InterfaceType'
			]
		};

		// Get language-specific types or default to empty array
		const specificTypes = languageSpecificTypes[language?.toLowerCase() || ''] || [];

		// Combine common and language-specific types
		return [...commonTypes, ...specificTypes];
	}

	/**
	 * Convert a position to a character offset.
	 * @param position The position object
	 * @param content The content string
	 * @returns Character offset
	 */
	private getPositionOffset(position: { line: number, column: number }, content: string): number {
		const lines = content.split('\n');
		let offset = 0;

		for (let i = 0; i < position.line; i++) {
			offset += (lines[i]?.length || 0) + 1; // +1 for newline
		}

		return offset + position.column;
	}
}
