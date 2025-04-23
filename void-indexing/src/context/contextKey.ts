/**
 * A context is a set of key-value pairs used for evaluating conditions.
 */
export interface IContext {
	/**
	 * Get a value from the context.
	 */
	getValue<T>(key: string): T | undefined;

	/**
	 * Collect all values from the context.
	 */
	collectAllValues(): { [key: string]: any };
}

/**
 * A mutable context key that can be set to a value.
 */
export interface IContextKey<T> {
	/**
	 * Set the value of this context key.
	 */
	set(value: T): void;

	/**
	 * Reset the value of this context key to its default.
	 */
	reset(): void;

	/**
	 * Get the current value of this context key.
	 */
	get(): T | undefined;
}

/**
 * Type of values that can be stored in a context key.
 */
export type ContextKeyValue = string | number | boolean | string[] | undefined;

/**
 * Base context implementation that stores key-value pairs.
 */
export class Context implements IContext {
	/**
	 * The underlying storage for the context values.
	 */
	protected _value: Record<string, any> = Object.create(null);

	/**
	 * The parent context (if any).
	 */
	protected _parent: Context | null;

	/**
	 * The unique identifier for this context.
	 */
	public readonly id: number;

	constructor(id: number, parent: Context | null) {
		this.id = id;
		this._parent = parent;
	}

	/**
	 * Get the raw underlying value map.
	 */
	public get value(): Record<string, any> {
		return this._value;
	}

	/**
	 * Set a value in this context.
	 */
	public setValue(key: string, value: any): boolean {
		this._value[key] = value;
		return true;
	}

	/**
	 * Remove a value from this context.
	 */
	public removeValue(key: string): boolean {
		if (key in this._value) {
			delete this._value[key];
			return true;
		}
		return false;
	}

	/**
	 * Get a value from this context or its parent contexts.
	 */
	public getValue<T>(key: string): T | undefined {
		if (key in this._value) {
			return this._value[key];
		}
		if (this._parent) {
			return this._parent.getValue<T>(key);
		}
		return undefined;
	}

	/**
	 * Update the parent context.
	 */
	public updateParent(parent: Context): void {
		this._parent = parent;
	}

	/**
	 * Collect all values from this context and its parent contexts.
	 */
	public collectAllValues(): Record<string, any> {
		const result = Object.create(null);
		if (this._parent) {
			Object.assign(result, this._parent.collectAllValues());
		}
		Object.assign(result, this._value);
		return result;
	}
}

/**
 * A service for managing context keys.
 */
export class ContextKeyService {
	private _lastContextId: number = 0;
	private readonly _contexts = new Map<number, Context>();

	constructor() {
		// Create the root context
		const rootContext = new Context(++this._lastContextId, null);
		this._contexts.set(rootContext.id, rootContext);
	}

	/**
	 * Create a new context key.
	 */
	public createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): IContextKey<T> {
		const contextKey = new ContextKey<T>(this, key, defaultValue);
		return contextKey;
	}

	/**
	 * Set a context value.
	 */
	public setContext(key: string, value: any): void {
		// Always update the root context
		const rootContext = this._contexts.get(1);
		if (rootContext) {
			rootContext.setValue(key, value);
		}
	}

	/**
	 * Remove a context value.
	 */
	public removeContext(key: string): void {
		// Always update the root context
		const rootContext = this._contexts.get(1);
		if (rootContext) {
			rootContext.removeValue(key);
		}
	}

	/**
	 * Get a context value.
	 */
	public getContextKeyValue<T>(key: string): T | undefined {
		// Get from the root context
		const rootContext = this._contexts.get(1);
		if (rootContext) {
			return rootContext.getValue<T>(key);
		}
		return undefined;
	}

	/**
	 * Get a context by ID.
	 */
	public getContextValuesContainer(contextId: number): Context {
		const result = this._contexts.get(contextId);
		if (!result) {
			throw new Error(`Unknown context: ${contextId}`);
		}
		return result;
	}

	/**
	 * Create a child context.
	 */
	public createChildContext(parentContextId: number = 1): number {
		const parent = this.getContextValuesContainer(parentContextId);
		const id = ++this._lastContextId;
		const context = new Context(id, parent);
		this._contexts.set(id, context);
		return id;
	}

	/**
	 * Dispose a context.
	 */
	public disposeContext(contextId: number): void {
		this._contexts.delete(contextId);
	}
}

/**
 * Implementation of a context key that interacts with a context key service.
 */
class ContextKey<T extends ContextKeyValue> implements IContextKey<T> {
	private _service: ContextKeyService;
	private _key: string;
	private _defaultValue: T | undefined;

	constructor(service: ContextKeyService, key: string, defaultValue: T | undefined) {
		this._service = service;
		this._key = key;
		this._defaultValue = defaultValue;
		this.reset();
	}

	/**
	 * Set the value of this context key.
	 */
	public set(value: T): void {
		this._service.setContext(this._key, value);
	}

	/**
	 * Reset the value of this context key to its default.
	 */
	public reset(): void {
		if (typeof this._defaultValue === 'undefined') {
			this._service.removeContext(this._key);
		} else {
			this._service.setContext(this._key, this._defaultValue);
		}
	}

	/**
	 * Get the current value of this context key.
	 */
	public get(): T | undefined {
		return this._service.getContextKeyValue<T>(this._key);
	}
}
