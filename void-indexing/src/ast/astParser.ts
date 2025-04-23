/**
 * Abstract Syntax Tree (AST) parser and context collection functionality.
 * This module provides utilities for parsing code into AST and extracting contextual information.
 */

import { CancellationToken } from '../utils/cancellation';

/**
 * Represents a position in a source file.
 */
export interface Position {
	line: number;
	column: number;
}

/**
 * Represents a range in a source file.
 */
export interface Range {
	start: Position;
	end: Position;
}

/**
 * Represents a node in an Abstract Syntax Tree.
 */
export interface ASTNode {
	type: string;
	value?: string;
	range: Range;
	parent?: ASTNode;
	children: ASTNode[];
	metadata?: Record<string, any>;
}

/**
 * Represents a text model that can be parsed.
 */
export interface ITextModel {
	getText(): string;
	getLineContent(lineNumber: number): string;
	getLineCount(): number;
	getLanguageId(): string;
}

/**
 * The AST parser options.
 */
export interface ASTParserOptions {
	includeComments?: boolean;
	preserveWhitespace?: boolean;
	maxDepth?: number;
}

/**
 * AST parser for different languages.
 */
export abstract class ASTParser {
	protected options: ASTParserOptions;

	constructor(options: ASTParserOptions = {}) {
		this.options = {
			includeComments: true,
			preserveWhitespace: false,
			maxDepth: Infinity,
			...options
		};
	}

	/**
	 * Parse a text model into an AST.
	 * @param model The text model to parse
	 * @param token Optional cancellation token
	 */
	abstract parse(model: ITextModel, token?: CancellationToken): Promise<ASTNode>;

	/**
	 * Find the AST node at a specific position.
	 * @param root The root AST node
	 * @param position The position to find a node at
	 */
	findNodeAtPosition(root: ASTNode, position: Position): ASTNode | undefined {
		if (!this.isPositionInRange(position, root.range)) {
			return undefined;
		}

		// Depth-first search for the most specific node
		for (const child of root.children) {
			const found = this.findNodeAtPosition(child, position);
			if (found) {
				return found;
			}
		}

		return root;
	}

	/**
	 * Check if a position is within a range.
	 */
	protected isPositionInRange(position: Position, range: Range): boolean {
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

	/**
	 * Walk the AST and apply a visitor function to each node.
	 * @param root The root AST node
	 * @param visitor The visitor function
	 */
	walkAST(root: ASTNode, visitor: (node: ASTNode) => void | boolean): void {
		const result = visitor(root);

		// If the visitor returns false, don't visit children
		if (result === false) {
			return;
		}

		for (const child of root.children) {
			this.walkAST(child, visitor);
		}
	}
}

/**
 * Generic context gathering service for AST-based context.
 */
export class ASTContextGatherer {
	private parser: ASTParser;

	constructor(parser: ASTParser) {
		this.parser = parser;
	}

	/**
	 * Gather AST context from a text model at a position.
	 * @param model The text model
	 * @param position The position
	 * @param token Optional cancellation token
	 */
	async gatherContext(
		model: ITextModel,
		position: Position,
		token?: CancellationToken
	): Promise<ASTNode[]> {
		// Parse the model into an AST
		const ast = await this.parser.parse(model, token);
		if (token?.isCancellationRequested) {
			return [];
		}

		// Find the node at the position
		const node = this.parser.findNodeAtPosition(ast, position);
		if (!node) {
			return [];
		}

		// Gather the ancestry chain
		const ancestry: ASTNode[] = [];
		let current: ASTNode | undefined = node;

		while (current) {
			ancestry.unshift(current); // Add to the beginning
			current = current.parent;
		}

		return ancestry;
	}

	/**
	 * Get the parent relationship chain for a node.
	 * @param node The AST node
	 */
	getParentRelationship(node: ASTNode): string[] {
		const relationship: string[] = [];
		let current: ASTNode | undefined = node;

		while (current) {
			relationship.unshift(current.type);
			current = current.parent;
		}

		return relationship;
	}

	/**
	 * Find sibling nodes of the same type.
	 * @param node The AST node
	 */
	findSiblings(node: ASTNode): ASTNode[] {
		if (!node.parent) {
			return [];
		}

		return node.parent.children.filter(
			child => child !== node && child.type === node.type
		);
	}

	/**
	 * Find nodes that represent the scope containing the target node.
	 * @param root The root AST node
	 * @param target The target node
	 */
	findScopeNodes(root: ASTNode, target: ASTNode): ASTNode[] {
		const scopeNodes: ASTNode[] = [];

		this.parser.walkAST(root, (node) => {
			// Check if this node represents a scope (function, class, block, etc.)
			if (this.isScopeNode(node)) {
				// Check if the target is within this scope
				if (this.isNodeContained(node, target)) {
					scopeNodes.push(node);
				}
			}
			return true;
		});

		return scopeNodes;
	}

	/**
	 * Check if a node is a scope node (function, class, block, etc.)
	 */
	private isScopeNode(node: ASTNode): boolean {
		const scopeTypes = [
			'FunctionDeclaration',
			'ClassDeclaration',
			'BlockStatement',
			'Program',
			'MethodDefinition',
			'ArrowFunctionExpression'
		];

		return scopeTypes.includes(node.type);
	}

	/**
	 * Check if a node is contained within another node.
	 */
	private isNodeContained(container: ASTNode, node: ASTNode): boolean {
		return this.isPositionInRange(node.range.start, container.range) &&
			this.isPositionInRange(node.range.end, container.range);
	}

	/**
	 * Check if a position is within a range.
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

/**
 * JavaScript/TypeScript AST parser implementation.
 * In a real implementation, this would use a real parser like Babel, TypeScript, etc.
 */
export class JavaScriptASTParser extends ASTParser {
	async parse(model: ITextModel, token?: CancellationToken): Promise<ASTNode> {
		// This is a stub implementation.
		// In a real implementation, you would use a real parser like Babel, TypeScript, etc.

		// For demonstration purposes, return a simple AST
		const program: ASTNode = {
			type: 'Program',
			range: {
				start: { line: 0, column: 0 },
				end: { line: model.getLineCount() - 1, column: model.getLineContent(model.getLineCount()).length }
			},
			children: []
		};

		// In a real implementation, you would parse the code and build a proper AST

		return program;
	}
}
