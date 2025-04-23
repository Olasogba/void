import { CancellationToken } from '../utils/cancellation';
import { TreeSitterNode, TreeSitterParseResult, TreeSitterParserService } from '../parsing/treeSitterParser';
import { ITextModel, Position, Range } from '../ast/astParser';

/**
 * Type of symbol.
 */
export enum SymbolKind {
	File = 0,
	Module = 1,
	Namespace = 2,
	Package = 3,
	Class = 4,
	Method = 5,
	Property = 6,
	Field = 7,
	Constructor = 8,
	Enum = 9,
	Interface = 10,
	Function = 11,
	Variable = 12,
	Constant = 13,
	String = 14,
	Number = 15,
	Boolean = 16,
	Array = 17,
	Object = 18,
	Key = 19,
	Null = 20,
	EnumMember = 21,
	Struct = 22,
	Event = 23,
	Operator = 24,
	TypeParameter = 25
}

/**
 * Document symbol information.
 */
export interface DocumentSymbol {
	name: string;
	detail?: string;
	kind: SymbolKind;
	range: Range;
	selectionRange: Range;
	children?: DocumentSymbol[];
	parent?: DocumentSymbol;
	id: string;
}

/**
 * Symbol occurrence or reference.
 */
export interface SymbolOccurrence {
	range: Range;
	symbol: DocumentSymbol;
	isDefinition: boolean;
}

/**
 * Symbol usage information.
 */
export interface SymbolUsage {
	symbol: DocumentSymbol;
	references: Range[];
	definitions: Range[];
}

/**
 * Document symbol tree.
 */
export interface DocumentSymbolTree {
	uri: string;
	symbols: DocumentSymbol[];
	occurrences: SymbolOccurrence[];
	usages: Map<string, SymbolUsage>;
}

/**
 * Map containing node types and their associated symbol kinds.
 */
const nodeToSymbolKindMap: Record<string, SymbolKind> = {
	// JavaScript/TypeScript
	'function_declaration': SymbolKind.Function,
	'method_definition': SymbolKind.Method,
	'class_declaration': SymbolKind.Class,
	'interface_declaration': SymbolKind.Interface,
	'variable_declaration': SymbolKind.Variable,
	'const_declaration': SymbolKind.Constant,
	'enum_declaration': SymbolKind.Enum,
	'property_identifier': SymbolKind.Property,
	'type_alias_declaration': SymbolKind.TypeParameter,
	'namespace_declaration': SymbolKind.Namespace,
	'arrow_function': SymbolKind.Function,
	'function': SymbolKind.Function,
	'object': SymbolKind.Object,
	'array': SymbolKind.Array,
	'constructor_declaration': SymbolKind.Constructor,

	// Python
	'function_definition': SymbolKind.Function,
	'class_definition': SymbolKind.Class,
	'module': SymbolKind.Module,
	'decorated_definition': SymbolKind.Function,
	'import_statement': SymbolKind.Module,

	// Generic
	'identifier': SymbolKind.Variable,
	'field_definition': SymbolKind.Field,
	'enum_member': SymbolKind.EnumMember,
	'package_declaration': SymbolKind.Package,
	'struct_declaration': SymbolKind.Struct,
	'interface_body': SymbolKind.Interface
};

/**
 * Symbol provider that extracts symbols from code.
 */
export class SymbolProvider {
	private parserService: TreeSitterParserService;
	private symbolCache = new Map<string, DocumentSymbolTree>();

	constructor() {
		this.parserService = TreeSitterParserService.getInstance();
	}

	/**
	 * Get the symbols for a text model.
	 * @param model The text model
	 * @param token Optional cancellation token
	 * @returns Symbol tree
	 */
	public async getSymbols(model: ITextModel, token?: CancellationToken): Promise<DocumentSymbolTree | undefined> {
		if (token?.isCancellationRequested) {
			return undefined;
		}

		const modelId = this.getModelId(model);

		// Check cache first
		if (this.symbolCache.has(modelId)) {
			return this.symbolCache.get(modelId);
		}

		// Parse the model if not cached
		const parseResult = await this.parserService.parse(model, token);
		if (!parseResult || token?.isCancellationRequested) {
			return undefined;
		}

		// Extract symbols
		const symbols: DocumentSymbol[] = [];
		this.extractSymbols(parseResult.rootNode, undefined, symbols);

		// Build symbol tree
		const symbolTree = this.buildSymbolTree(symbols);

		// Extract occurrences
		const occurrences = this.extractOccurrences(parseResult.rootNode, symbolTree);

		// Build usages
		const usages = this.buildUsages(occurrences);

		// Create the document symbol tree
		const result: DocumentSymbolTree = {
			uri: modelId,
			symbols: symbolTree,
			occurrences,
			usages
		};

		// Cache the result
		this.symbolCache.set(modelId, result);

		return result;
	}

	/**
	 * Extract symbols from a Tree-sitter node.
	 * @param node The node
	 * @param parent Optional parent symbol
	 * @param symbols Output array for symbols
	 */
	private extractSymbols(node: TreeSitterNode, parent: DocumentSymbol | undefined, symbols: DocumentSymbol[]): void {
		// Check if this node type maps to a symbol kind
		const symbolKind = this.getSymbolKind(node);

		// If it's a symbol, create it
		if (symbolKind !== undefined) {
			const name = this.getSymbolName(node) || node.type;

			const range: Range = {
				start: { line: node.startPosition.row, column: node.startPosition.column },
				end: { line: node.endPosition.row, column: node.endPosition.column }
			};

			const symbol: DocumentSymbol = {
				name,
				kind: symbolKind,
				range,
				selectionRange: range,
				children: [],
				parent,
				id: this.generateSymbolId(node, symbolKind)
			};

			// Add to parent or top level
			if (parent) {
				parent.children = parent.children || [];
				parent.children.push(symbol);
			} else {
				symbols.push(symbol);
			}

			// Process children with this as parent
			for (const child of node.namedChildren) {
				this.extractSymbols(child, symbol, symbols);
			}
		} else {
			// Process children with same parent
			for (const child of node.namedChildren) {
				this.extractSymbols(child, parent, symbols);
			}
		}
	}

	/**
	 * Extract symbol occurrences from a Tree-sitter node.
	 * @param node The node
	 * @param symbolTree The symbol tree
	 * @returns Array of occurrences
	 */
	private extractOccurrences(node: TreeSitterNode, symbolTree: DocumentSymbol[]): SymbolOccurrence[] {
		const occurrences: SymbolOccurrence[] = [];

		// Walk the tree looking for identifiers
		this.parserService.walkTree(node, (currentNode) => {
			if (this.isIdentifierNode(currentNode)) {
				const name = currentNode.text;

				// Find the symbol this identifier refers to
				const symbol = this.findSymbolByName(symbolTree, name);
				if (symbol) {
					const range: Range = {
						start: { line: currentNode.startPosition.row, column: currentNode.startPosition.column },
						end: { line: currentNode.endPosition.row, column: currentNode.endPosition.column }
					};

					// Check if this is a definition
					const isDefinition = this.isDefinitionNode(currentNode);

					occurrences.push({
						range,
						symbol,
						isDefinition
					});
				}
			}

			return true; // Continue walking
		});

		return occurrences;
	}

	/**
	 * Build symbol usages from occurrences.
	 * @param occurrences The symbol occurrences
	 * @returns Map of symbol ID to symbol usage
	 */
	private buildUsages(occurrences: SymbolOccurrence[]): Map<string, SymbolUsage> {
		const usages = new Map<string, SymbolUsage>();

		for (const occurrence of occurrences) {
			const symbolId = occurrence.symbol.id;

			if (!usages.has(symbolId)) {
				usages.set(symbolId, {
					symbol: occurrence.symbol,
					references: [],
					definitions: []
				});
			}

			const usage = usages.get(symbolId)!;

			if (occurrence.isDefinition) {
				usage.definitions.push(occurrence.range);
			} else {
				usage.references.push(occurrence.range);
			}
		}

		return usages;
	}

	/**
	 * Build a symbol tree from a flat list.
	 * @param symbols The symbols
	 * @returns The symbol tree
	 */
	private buildSymbolTree(symbols: DocumentSymbol[]): DocumentSymbol[] {
		// The input already has parent-child relationships set up
		// Just filter out the top-level symbols
		return symbols.filter(symbol => !symbol.parent);
	}

	/**
	 * Find a symbol by name in the symbol tree.
	 * @param symbols The symbol tree
	 * @param name The name to find
	 * @returns The symbol or undefined
	 */
	private findSymbolByName(symbols: DocumentSymbol[], name: string): DocumentSymbol | undefined {
		for (const symbol of symbols) {
			if (symbol.name === name) {
				return symbol;
			}

			if (symbol.children) {
				const childMatch = this.findSymbolByName(symbol.children, name);
				if (childMatch) {
					return childMatch;
				}
			}
		}

		return undefined;
	}

	/**
	 * Get the symbol kind for a node.
	 * @param node The node
	 * @returns The symbol kind or undefined
	 */
	private getSymbolKind(node: TreeSitterNode): SymbolKind | undefined {
		return nodeToSymbolKindMap[node.type];
	}

	/**
	 * Get the name for a symbol node.
	 * @param node The node
	 * @returns The name or undefined
	 */
	private getSymbolName(node: TreeSitterNode): string | undefined {
		// Different nodes store their names in different ways
		// This handles common patterns

		// Look for an identifier child first
		for (const child of node.namedChildren) {
			if (child.type === 'identifier') {
				return child.text;
			}
		}

		// For property nodes in object literals
		if (node.type === 'property_identifier') {
			return node.text;
		}

		// For function and method declarations with a name field
		for (const child of node.namedChildren) {
			if (child.type === 'property_identifier' || child.type === 'function_name') {
				return child.text;
			}
		}

		return undefined;
	}

	/**
	 * Check if a node is an identifier.
	 * @param node The node
	 * @returns True if it's an identifier
	 */
	private isIdentifierNode(node: TreeSitterNode): boolean {
		return node.type === 'identifier' ||
			node.type === 'property_identifier' ||
			node.type === 'variable_name' ||
			node.type === 'function_name';
	}

	/**
	 * Check if a node is a definition.
	 * @param node The node
	 * @returns True if it's a definition
	 */
	private isDefinitionNode(node: TreeSitterNode): boolean {
		// Check if this is in a declaration context
		if (!node.parent) {
			return false;
		}

		const parentType = node.parent.type;

		return parentType.includes('declaration') ||
			parentType.includes('definition') ||
			parentType === 'method_definition' ||
			parentType === 'function_declaration' ||
			parentType === 'class_declaration';
	}

	/**
	 * Generate a unique ID for a symbol.
	 * @param node The node
	 * @param kind The symbol kind
	 * @returns The ID
	 */
	private generateSymbolId(node: TreeSitterNode, kind: SymbolKind): string {
		const name = this.getSymbolName(node) || node.type;
		return `${kind}-${name}-${node.startPosition.row}-${node.startPosition.column}`;
	}

	/**
	 * Get a unique ID for a text model.
	 * @param model The text model
	 * @returns The ID
	 */
	private getModelId(model: ITextModel): string {
		// Simple hash of the text for demo purposes
		// In a real implementation, this would be a URI or path
		const text = model.getText();
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			hash = ((hash << 5) - hash) + text.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}
		return `${model.getLanguageId()}-${hash}`;
	}

	/**
	 * Clear the symbol cache.
	 */
	public clearCache(): void {
		this.symbolCache.clear();
	}
}
