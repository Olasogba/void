/**
 * Performance optimization utilities.
 * This module provides tools for improving performance of indexing and retrieval operations.
 */

import { CancellationToken } from '../utils/cancellation';

/**
 * Interface for lazy loading operations.
 */
export interface LazyLoader<T> {
	/**
	 * Check if the value is loaded.
	 */
	isLoaded(): boolean;

	/**
	 * Get the value, loading it if necessary.
	 */
	get(): Promise<T>;

	/**
	 * Load the value if not already loaded.
	 */
	load(): Promise<void>;

	/**
	 * Invalidate the loaded value.
	 */
	invalidate(): void;
}

/**
 * Lazy loading implementation.
 */
export class LazyValue<T> implements LazyLoader<T> {
	private value: T | undefined;
	private loading: Promise<T> | null = null;
	private loadFn: () => Promise<T>;

	constructor(loadFn: () => Promise<T>) {
		this.loadFn = loadFn;
	}

	/**
	 * Check if the value is loaded.
	 */
	isLoaded(): boolean {
		return this.value !== undefined;
	}

	/**
	 * Get the value, loading it if necessary.
	 */
	async get(): Promise<T> {
		if (this.value !== undefined) {
			return this.value;
		}

		if (this.loading === null) {
			this.loading = this.loadFn();
			try {
				this.value = await this.loading;
				return this.value;
			} finally {
				this.loading = null;
			}
		} else {
			return this.loading;
		}
	}

	/**
	 * Load the value if not already loaded.
	 */
	async load(): Promise<void> {
		if (this.value === undefined && this.loading === null) {
			this.loading = this.loadFn();
			try {
				this.value = await this.loading;
			} finally {
				this.loading = null;
			}
		}
	}

	/**
	 * Invalidate the loaded value.
	 */
	invalidate(): void {
		this.value = undefined;
	}
}

/**
 * Memoization cache for function results.
 */
export class MemoizationCache<K, V> {
	private cache = new Map<string, { value: V; timestamp: number }>();
	private maxAge: number;
	private maxSize: number;

	constructor(maxAge: number = 60 * 60 * 1000, maxSize: number = 1000) {
		this.maxAge = maxAge;
		this.maxSize = maxSize;
	}

	/**
	 * Get a value from the cache, computing it if necessary.
	 * @param key The cache key
	 * @param compute Function to compute the value
	 */
	async get(key: K, compute: () => Promise<V>): Promise<V> {
		const keyStr = this.keyToString(key);
		const entry = this.cache.get(keyStr);

		// Check if we have a valid cached value
		if (entry && Date.now() - entry.timestamp < this.maxAge) {
			return entry.value;
		}

		// Compute the value
		const value = await compute();

		// Cache the result
		this.cache.set(keyStr, { value, timestamp: Date.now() });

		// Enforce size limit
		if (this.cache.size > this.maxSize) {
			this.evictOldest();
		}

		return value;
	}

	/**
	 * Invalidate a specific cache entry.
	 * @param key The cache key
	 */
	invalidate(key: K): void {
		const keyStr = this.keyToString(key);
		this.cache.delete(keyStr);
	}

	/**
	 * Clear the entire cache.
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Convert a key to a string.
	 */
	private keyToString(key: K): string {
		if (typeof key === 'string') {
			return key;
		} else if (typeof key === 'number' || typeof key === 'boolean') {
			return String(key);
		} else {
			return JSON.stringify(key);
		}
	}

	/**
	 * Evict the oldest entries when cache is full.
	 */
	private evictOldest(): void {
		// Get all entries and sort by timestamp
		const entries = Array.from(this.cache.entries());
		entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

		// Remove the oldest 10% of entries
		const toRemove = Math.max(1, Math.floor(entries.length * 0.1));
		for (let i = 0; i < toRemove; i++) {
			this.cache.delete(entries[i][0]);
		}
	}
}

/**
 * Batched operation executor for grouping related operations.
 */
export class BatchExecutor<T, R> {
	private batch: T[] = [];
	private promises: Array<{ resolve: (value: R) => void; reject: (error: any) => void }> = [];
	private timeout: ReturnType<typeof setTimeout> | null = null;
	private batchFn: (items: T[]) => Promise<R[]>;
	private delay: number;
	private maxBatchSize: number;

	/**
	 * Create a new batch executor.
	 * @param batchFn Function to process a batch of items
	 * @param delay Maximum delay before processing a batch
	 * @param maxBatchSize Maximum batch size
	 */
	constructor(
		batchFn: (items: T[]) => Promise<R[]>,
		delay: number = 50,
		maxBatchSize: number = 100
	) {
		this.batchFn = batchFn;
		this.delay = delay;
		this.maxBatchSize = maxBatchSize;
	}

	/**
	 * Queue an item for batch processing.
	 * @param item The item to process
	 */
	queue(item: T): Promise<R> {
		return new Promise<R>((resolve, reject) => {
			this.batch.push(item);
			this.promises.push({ resolve, reject });

			if (this.batch.length >= this.maxBatchSize) {
				this.flush();
			} else if (!this.timeout) {
				this.timeout = setTimeout(() => this.flush(), this.delay);
			}
		});
	}

	/**
	 * Process all queued items.
	 */
	private async flush(): Promise<void> {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}

		if (this.batch.length === 0) {
			return;
		}

		const currentBatch = this.batch;
		const currentPromises = this.promises;
		this.batch = [];
		this.promises = [];

		try {
			const results = await this.batchFn(currentBatch);
			for (let i = 0; i < currentPromises.length; i++) {
				currentPromises[i].resolve(results[i]);
			}
		} catch (error) {
			for (const promise of currentPromises) {
				promise.reject(error);
			}
		}
	}
}

/**
 * Parallel task executor for running multiple operations concurrently.
 */
export class ParallelExecutor {
	private concurrency: number;
	private running: number = 0;
	private queue: Array<() => Promise<void>> = [];

	/**
	 * Create a new parallel executor.
	 * @param concurrency Maximum number of concurrent operations
	 */
	constructor(concurrency: number = 4) {
		this.concurrency = concurrency;
	}

	/**
	 * Execute a task, respecting concurrency limits.
	 * @param task The task to execute
	 */
	async execute<T>(task: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const wrappedTask = async () => {
				try {
					const result = await task();
					resolve(result);
				} catch (error) {
					reject(error);
				} finally {
					this.running--;
					this.runNext();
				}
			};

			this.queue.push(wrappedTask);
			this.runNext();
		});
	}

	/**
	 * Run the next task in the queue if possible.
	 */
	private runNext(): void {
		if (this.running < this.concurrency && this.queue.length > 0) {
			const task = this.queue.shift()!;
			this.running++;
			task();
		}
	}
}

/**
 * Helper for executing multiple tasks in parallel.
 * @param tasks The tasks to execute
 * @param concurrency Maximum number of concurrent tasks
 * @param token Optional cancellation token
 */
export async function runInParallel<T>(
	tasks: Array<() => Promise<T>>,
	concurrency: number = 4,
	token?: CancellationToken
): Promise<T[]> {
	const executor = new ParallelExecutor(concurrency);
	const results: T[] = [];

	const wrappedTasks = tasks.map((task, index) => async () => {
		if (token?.isCancellationRequested) {
			return;
		}

		const result = await executor.execute(task);
		results[index] = result;
	});

	await Promise.all(wrappedTasks.map(task => task()));

	return results;
}

/**
 * Cache optimization interface.
 */
export interface CacheOptimization {
	preloadProbable: () => void;
	evictUnlikely: () => void;
	maintainFrequency: () => void;
}
