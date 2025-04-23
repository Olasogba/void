import Parser from 'web-tree-sitter';
import { CancellationToken } from '../utils/cancellation';
import { ITextModel, Position, Range } from '../ast/astParser';

/**
 * Type of Tree-sitter node.
 */
export interface TreeSitterNode {
	id: string;
	type: string;
	startPosition: { row: number; column: number };
	endPosition: { row: number; column: number };
	startIndex: number;
	endIndex: number;
	text: string;
	children: TreeSitterNode[];
	parent?: TreeSitterNode;
	namedChildren: TreeSitterNode[];
	childCount: number;
	namedChildCount: number;
	isNamed: boolean;
}

/**
 * Result of Tree-sitter parsing.
 */
export interface TreeSitterParseResult {
	rootNode: TreeSitterNode;
	tree: Parser.Tree;
	changedRanges?: Parser.Range[];
}

/**
 * Map of language names to their Tree-sitter language implementations.
 */
const languageMap: Record<string, (() => Promise<any>)> = {
	javascript: () => import('tree-sitter-javascript'),
	typescript: () => import('tree-sitter-typescript').then(m => m.typescript),
	tsx: () => import('tree-sitter-typescript').then(m => m.tsx),
	python: () => import('tree-sitter-python'),
	go: () => import('tree-sitter-go'),
	java: () => import('tree-sitter-java'),
	rust: () => import('tree-sitter-rust'),
	ruby: () => import('tree-sitter-ruby'),
	cpp: () => import('tree-sitter-cpp')
};

/**
 * Tree-sitter parser service.
 */
export class TreeSitterParserService {
	private static instance: TreeSitterParserService;
	private isInitialized = false;
	private languages = new Map<string, Parser.Language>();
	private parser?: Parser;
	private parserCache = new Map<string, TreeSitterParseResult>();
	private previousTrees = new Map<string, Parser.Tree>();

	/**
	 * Get the singleton instance of the parser service.
	 */
	public static getInstance(): TreeSitterParserService {
		if (!TreeSitterParserService.instance) {
			TreeSitterParserService.instance = new TreeSitterParserService();
		}
		return TreeSitterParserService.instance;
	}

	/**
	 * Initialize the parser service.
	 */
	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Initialize Parser
		await Parser.init();
		this.parser = new Parser();
		this.isInitialized = true;
	}

	/**
	 * Get or initialize a language.
	 * @param languageId The language ID
	 */
	public async getLanguage(languageId: string): Promise<Parser.Language | undefined> {
		if (!this.isInitialized) {
			await this.initialize();
		}

		// Return cached language if available
		if (this.languages.has(languageId)) {
			return this.languages.get(languageId);
		}

		// Check if language is supported
		const languageLoader = languageMap[languageId.toLowerCase()];
		if (!languageLoader) {
			return undefined;
		}

		try {
			// Load language
			const languageModule = await languageLoader();
			const language = await Parser.Language.load(languageModule);
			this.languages.set(languageId, language);
			return language;
		} catch (error) {
			console.error(`Failed to load language ${languageId}:`, error);
			return undefined;
		}
	}

	/**
	 * Parse a text model using Tree-sitter.
	 * @param model The text model to parse
	 * @param token Optional cancellation token
	 */
	public async parse(model: ITextModel, token?: CancellationToken): Promise<TreeSitterParseResult | undefined> {
		if (!this.isInitialized || !this.parser) {
			await this.initialize();
		}

		if (token?.isCancellationRequested) {
			return undefined;
		}

		const languageId = model.getLanguageId();
		const content = model.getText();
		const cacheKey = this.getCacheKey(model, content);

		// Check cache
		if (this.parserCache.has(cacheKey)) {
			return this.parserCache.get(cacheKey);
		}

		const language = await this.getLanguage(languageId);
		if (!language) {
			return undefined;
		}

		try {
			// Set language for parser
			this.parser.setLanguage(language);

			// Get previous tree for incremental parsing
			const previousTree = this.previousTrees.get(cacheKey);

			// Parse content
			const tree = previousTree
				? this.parser.parse(content, previousTree)
				: this.parser.parse(content);

			// Convert root node to our format
			const rootNode = this.convertNode(tree.rootNode);

			// Create result
			const result: TreeSitterParseResult = {
				rootNode,
				tree,
				changedRanges: previousTree ? tree.getChangedRanges(previousTree) : undefined
			};

			// Cache result
			this.parserCache.set(cacheKey, result);
			this.previousTrees.set(cacheKey, tree);

			return result;
		} catch (error) {
			console.error(`Failed to parse ${languageId}:`, error);
			return undefined;
		}
	}

	/**
	 * Parse a string directly using Tree-sitter.
	 * @param content The content to parse
	 * @param languageId The language ID
	 * @param token Optional cancellation token
	 */
	public async parseString(content: string, languageId: string, token?: CancellationToken): Promise<TreeSitterParseResult | undefined> {
		if (!this.isInitialized || !this.parser) {
			await this.initialize();
		}

		if (token?.isCancellationRequested) {
			return undefined;
		}

		const language = await this.getLanguage(languageId);
		if (!language) {
			return undefined;
		}

		try {
			// Set language for parser
			this.parser.setLanguage(language);

			// Parse content
			const tree = this.parser.parse(content);

			// Convert root node to our format
			const rootNode = this.convertNode(tree.rootNode);

			// Create result
			const result: TreeSitterParseResult = {
				rootNode,
				tree
			};

			return result;
		} catch (error) {
			console.error(`Failed to parse ${languageId}:`, error);
			return undefined;
		}
	}

	/**
	 * Find a node at a specific position.
	 * @param rootNode The root node
	 * @param position The position to search at
	 */
	public findNodeAtPosition(rootNode: TreeSitterNode, position: Position): TreeSitterNode | undefined {
		// Check if position is within the node's range
		if (!this.isPositionInRange(position, {
			start: { line: rootNode.startPosition.row, column: rootNode.startPosition.column },
			end: { line: rootNode.endPosition.row, column: rootNode.endPosition.column }
		})) {
			return undefined;
		}

		// Check children from last to first (to get the innermost match)
		for (let i = rootNode.namedChildren.length - 1; i >= 0; i--) {
			const child = rootNode.namedChildren[i];
			const childNode = this.findNodeAtPosition(child, position);
			if (childNode) {
				return childNode;
			}
		}

		// If no children matched, return this node
		return rootNode;
	}

	/**
	 * Walk the tree, calling the visitor for each node.
	 * @param rootNode The root node
	 * @param visitor The visitor function
	 */
	public walkTree(rootNode: TreeSitterNode, visitor: (node: TreeSitterNode) => boolean | void): void {
		const result = visitor(rootNode);
		if (result === false) {
			return;
		}

		for (const child of rootNode.namedChildren) {
			this.walkTree(child, visitor);
		}
	}

	/**
	 * Get the parent chain for a node up to the root.
	 * @param node The node
	 */
	public getNodePath(node: TreeSitterNode): TreeSitterNode[] {
		const path: TreeSitterNode[] = [];
		let current: TreeSitterNode | undefined = node;

		while (current) {
			path.unshift(current);
			current = current.parent;
		}

		return path;
	}

	/**
	 * Clear the parser cache.
	 */
	public clearCache(): void {
		this.parserCache.clear();
		this.previousTrees.clear();
	}

	/**
	 * Get a cache key for a model and content.
	 * @param model The text model
	 * @param content The content
	 */
	private getCacheKey(model: ITextModel, content: string): string {
		// Use a hash of the content to avoid storing too many strings
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			hash = ((hash << 5) - hash) + content.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}
		return `${model.getLanguageId()}-${hash}`;
	}

	/**
	 * Convert a Tree-sitter node to our format.
	 * @param node The Tree-sitter node
	 * @param parent Optional parent node
	 */
	private convertNode(node: Parser.SyntaxNode, parent?: TreeSitterNode): TreeSitterNode {
		const convertedNode: TreeSitterNode = {
			id: `${node.type}-${node.startPosition.row}-${node.startPosition.column}`,
			type: node.type,
			startPosition: node.startPosition,
			endPosition: node.endPosition,
			startIndex: node.startIndex,
			endIndex: node.endIndex,
			text: node.text,
			children: [],
			namedChildren: [],
			parent,
			childCount: node.childCount,
			namedChildCount: node.namedChildCount,
			isNamed: node.isNamed()
		};

		// Convert children
		convertedNode.children = [];
		for (let i = 0; i < node.childCount; i++) {
			const child = node.child(i);
			if (child) {
				const convertedChild = this.convertNode(child, convertedNode);
				convertedNode.children.push(convertedChild);
				if (child.isNamed()) {
					convertedNode.namedChildren.push(convertedChild);
				}
			}
		}

		return convertedNode;
	}

	/**
	 * Check if a position is within a range.
	 * @param position The position
	 * @param range The range
	 */
	private isPositionInRange(position: Position, range: Range): boolean {
		// Check if position is after start
		if (position.line < range.start.line) {
			return false;
		}
		if (position.line === range.start.line && position.column < range.start.column) {
			return false;
		}

		// Check if position is before end
		if (position.line > range.end.line) {
			return false;
		}
		if (position.line === range.end.line && position.column > range.end.column) {
			return false;
		}

		return true;
	}
}
