declare module 'web-tree-sitter' {
	export default class Parser {
		static init(): Promise<void>;
		static Language: {
			load(wasm: ArrayBuffer): Promise<Language>;
		};

		setLanguage(language: Language): void;
		parse(input: string, previousTree?: Tree): Tree;
		getLanguage(): Language;
	}

	export interface Language {
		readonly version: number;
		readonly fieldCount: number;
		readonly nodeTypeCount: number;
	}

	export interface Tree {
		readonly rootNode: SyntaxNode;
		copy(): Tree;
		delete(): void;
		edit(edit: Edit): void;
		walk(): TreeCursor;
		getChangedRanges(previousTree: Tree): Range[];
		getLanguage(): Language;
	}

	export interface TreeCursor {
		nodeType: string;
		nodeText: string;
		nodeIsNamed: boolean;
		startPosition: Point;
		endPosition: Point;
		startIndex: number;
		endIndex: number;
		reset(node: SyntaxNode): void;
		currentNode(): SyntaxNode;
		currentFieldName(): string | null;
		gotoFirstChild(): boolean;
		gotoNextSibling(): boolean;
		gotoParent(): boolean;
	}

	export interface SyntaxNode {
		readonly type: string;
		readonly isNamed: () => boolean;
		readonly text: string;
		readonly startPosition: Point;
		readonly endPosition: Point;
		readonly startIndex: number;
		readonly endIndex: number;
		readonly parent: SyntaxNode | null;
		readonly children: SyntaxNode[];
		readonly namedChildren: SyntaxNode[];
		readonly childCount: number;
		readonly namedChildCount: number;
		readonly firstChild: SyntaxNode | null;
		readonly firstNamedChild: SyntaxNode | null;
		readonly lastChild: SyntaxNode | null;
		readonly lastNamedChild: SyntaxNode | null;
		readonly nextSibling: SyntaxNode | null;
		readonly nextNamedSibling: SyntaxNode | null;
		readonly previousSibling: SyntaxNode | null;
		readonly previousNamedSibling: SyntaxNode | null;

		hasChanges(): boolean;
		hasError(): boolean;
		isMissing(): boolean;
		toString(): string;
		child(index: number): SyntaxNode | null;
		namedChild(index: number): SyntaxNode | null;
		childForFieldName(fieldName: string): SyntaxNode | null;
		childrenForFieldName(fieldName: string): SyntaxNode[];
		descendantsOfType(types: string | string[], startIndex?: number, endIndex?: number): SyntaxNode[];
		walk(): TreeCursor;
	}

	export interface Edit {
		startIndex: number;
		oldEndIndex: number;
		newEndIndex: number;
		startPosition: Point;
		oldEndPosition: Point;
		newEndPosition: Point;
	}

	export interface Range {
		startIndex: number;
		endIndex: number;
		startPosition: Point;
		endPosition: Point;
	}

	export interface Point {
		row: number;
		column: number;
	}
}

declare module 'tree-sitter-javascript' {
	const JavaScript: ArrayBuffer;
	export = JavaScript;
}

declare module 'tree-sitter-typescript' {
	export const typescript: ArrayBuffer;
	export const tsx: ArrayBuffer;
}

declare module 'tree-sitter-python' {
	const Python: ArrayBuffer;
	export = Python;
}

declare module 'tree-sitter-go' {
	const Go: ArrayBuffer;
	export = Go;
}

declare module 'tree-sitter-java' {
	const Java: ArrayBuffer;
	export = Java;
}

declare module 'tree-sitter-rust' {
	const Rust: ArrayBuffer;
	export = Rust;
}

declare module 'tree-sitter-ruby' {
	const Ruby: ArrayBuffer;
	export = Ruby;
}

declare module 'tree-sitter-cpp' {
	const CPP: ArrayBuffer;
	export = CPP;
}

declare module 'tree-sitter' {
	interface Parser {
		parse(input: string, previousTree?: any): any;
	}

	interface Language {
		nodeTypeCount: number;
		fieldCount: number;
	}

	export namespace Parser {
		function init(): Promise<void>;

		class SyntaxNode {
			readonly type: string;
			text: string;
		}
	}

	export namespace Language {
		function load(path: string): Promise<Language>;
	}
}
