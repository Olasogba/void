/**
 * Caching strategy implementation.
 * This module provides utilities for caching context data with various policies.
 */

/**
 * Represents data stored in cache.
 */
export interface ContextData {
	id: string;
	data: any;
	timestamp: number;
	accessCount: number;
	lastAccessTime: number;
	size: number;
	priority?: number;
}

/**
 * Represents a cache policy.
 */
export interface CachePolicy {
	maxAge: number;
	maxSize: number;
	maxItems: number;
	priorityFunction: (data: ContextData) => number;
}

/**
 * Type of storage backend.
 */
export enum StorageType {
	Memory,
	IndexedDB,
	LocalStorage,
	SessionStorage,
	Custom
}

/**
 * Base interface for a storage backend.
 */
export interface StorageBackend {
	get(key: string): Promise<any>;
	set(key: string, value: any): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
	has(key: string): Promise<boolean>;
	keys(): Promise<string[]>;
	size(): Promise<number>;
}

/**
 * In-memory storage backend implementation.
 */
export class MemoryStorage implements StorageBackend {
	private storage = new Map<string, any>();

	async get(key: string): Promise<any> {
		return this.storage.get(key);
	}

	async set(key: string, value: any): Promise<void> {
		this.storage.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.storage.delete(key);
	}

	async clear(): Promise<void> {
		this.storage.clear();
	}

	async has(key: string): Promise<boolean> {
		return this.storage.has(key);
	}

	async keys(): Promise<string[]> {
		return Array.from(this.storage.keys());
	}

	async size(): Promise<number> {
		return this.storage.size;
	}
}

/**
 * Indexed DB storage backend implementation.
 * This is a stub implementation that would need to be completed with actual IndexedDB code.
 */
export class IndexedDBStorage implements StorageBackend {
	private dbName: string;
	private storeName: string;

	constructor(dbName: string, storeName: string) {
		this.dbName = dbName;
		this.storeName = storeName;
	}

	async get(key: string): Promise<any> {
		// This would be implemented using IndexedDB
		throw new Error('IndexedDB storage not implemented');
	}

	async set(key: string, value: any): Promise<void> {
		// This would be implemented using IndexedDB
		throw new Error('IndexedDB storage not implemented');
	}

	async delete(key: string): Promise<void> {
		// This would be implemented using IndexedDB
		throw new Error('IndexedDB storage not implemented');
	}

	async clear(): Promise<void> {
		// This would be implemented using IndexedDB
		throw new Error('IndexedDB storage not implemented');
	}

	async has(key: string): Promise<boolean> {
		// This would be implemented using IndexedDB
		throw new Error('IndexedDB storage not implemented');
	}

	async keys(): Promise<string[]> {
		// This would be implemented using IndexedDB
		throw new Error('IndexedDB storage not implemented');
	}

	async size(): Promise<number> {
		// This would be implemented using IndexedDB
		throw new Error('IndexedDB storage not implemented');
	}
}

/**
 * Advanced caching strategy with LRU, TTL, and custom priority policies.
 */
export class CacheStrategy {
	private policy: CachePolicy;
	private shortTermCache: StorageBackend;
	private persistentCache: StorageBackend | null;
	private metadata: Map<string, ContextData> = new Map();

	constructor(
		policy: Partial<CachePolicy> = {},
		shortTermStorage?: StorageBackend,
		persistentStorage?: StorageBackend
	) {
		this.policy = {
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
			maxSize: 100 * 1024 * 1024, // 100 MB
			maxItems: 1000,
			priorityFunction: this.defaultPriorityFunction,
			...policy
		};

		this.shortTermCache = shortTermStorage || new MemoryStorage();
		this.persistentCache = persistentStorage || null;
	}

	/**
	 * Set an item in the cache.
	 * @param key The cache key
	 * @param data The data to cache
	 * @param priority Optional priority override
	 */
	async set(key: string, data: any, priority?: number): Promise<void> {
		// Calculate size (simplified)
		const size = this.calculateSize(data);

		// Create metadata
		const now = Date.now();
		const contextData: ContextData = {
			id: key,
			data: null, // Do not include data in metadata
			timestamp: now,
			accessCount: 0,
			lastAccessTime: now,
			size,
			priority
		};

		// Set metadata
		this.metadata.set(key, contextData);

		// Store in short-term cache
		await this.shortTermCache.set(key, data);

		// Optionally store in persistent cache
		if (this.persistentCache) {
			await this.persistentCache.set(key, data);
		}

		// Enforce policy
		await this.enforceCachePolicy();
	}

	/**
	 * Get an item from the cache.
	 * @param key The cache key
	 */
	async get(key: string): Promise<any> {
		// Update metadata if exists
		const metadata = this.metadata.get(key);
		if (metadata) {
			metadata.accessCount++;
			metadata.lastAccessTime = Date.now();
		}

		// Try short-term cache first
		let data = await this.shortTermCache.get(key);

		// If not in short-term cache, try persistent cache
		if (data === undefined && this.persistentCache) {
			data = await this.persistentCache.get(key);

			// If found in persistent cache, update short-term cache
			if (data !== undefined) {
				await this.shortTermCache.set(key, data);
			}
		}

		return data;
	}

	/**
	 * Check if an item exists in the cache.
	 * @param key The cache key
	 */
	async has(key: string): Promise<boolean> {
		// Check short-term cache first
		if (await this.shortTermCache.has(key)) {
			return true;
		}

		// Check persistent cache if available
		if (this.persistentCache) {
			return await this.persistentCache.has(key);
		}

		return false;
	}

	/**
	 * Remove an item from the cache.
	 * @param key The cache key
	 */
	async delete(key: string): Promise<void> {
		// Remove from metadata
		this.metadata.delete(key);

		// Remove from short-term cache
		await this.shortTermCache.delete(key);

		// Remove from persistent cache if available
		if (this.persistentCache) {
			await this.persistentCache.delete(key);
		}
	}

	/**
	 * Clear the entire cache.
	 */
	async clear(): Promise<void> {
		// Clear metadata
		this.metadata.clear();

		// Clear short-term cache
		await this.shortTermCache.clear();

		// Clear persistent cache if available
		if (this.persistentCache) {
			await this.persistentCache.clear();
		}
	}

	/**
	 * Preload probable items into short-term cache.
	 * @param keys The keys to preload
	 */
	async preloadProbable(keys: string[]): Promise<void> {
		if (!this.persistentCache) {
			return;
		}

		for (const key of keys) {
			// Skip if already in short-term cache
			if (await this.shortTermCache.has(key)) {
				continue;
			}

			// Try to load from persistent cache
			const data = await this.persistentCache.get(key);
			if (data !== undefined) {
				await this.shortTermCache.set(key, data);
			}
		}
	}

	/**
	 * Evict unlikely items from short-term cache.
	 */
	async evictUnlikely(): Promise<void> {
		const candidatesForEviction: string[] = [];

		// Calculate priorities for all items
		const itemsWithPriority: [string, number][] = [];

		for (const [key, metadata] of this.metadata.entries()) {
			const priority = this.policy.priorityFunction(metadata);
			itemsWithPriority.push([key, priority]);
		}

		// Sort by priority (ascending, so lowest priority first)
		itemsWithPriority.sort((a, b) => a[1] - b[1]);

		// Take the lowest priority items as candidates for eviction
		const numItemsToEvict = Math.max(0, itemsWithPriority.length - this.policy.maxItems / 2);

		for (let i = 0; i < numItemsToEvict; i++) {
			candidatesForEviction.push(itemsWithPriority[i][0]);
		}

		// Evict from short-term cache only
		for (const key of candidatesForEviction) {
			await this.shortTermCache.delete(key);

			// Update metadata to indicate not in short-term cache
			const metadata = this.metadata.get(key);
			if (metadata) {
				metadata.timestamp = Date.now(); // Reset timestamp
			}
		}
	}

	/**
	 * Enforce the cache policy by evicting items as needed.
	 */
	private async enforceCachePolicy(): Promise<void> {
		// Enforce TTL
		const now = Date.now();
		const maxAge = this.policy.maxAge;

		const expiredKeys: string[] = [];

		for (const [key, metadata] of this.metadata.entries()) {
			if (now - metadata.timestamp > maxAge) {
				expiredKeys.push(key);
			}
		}

		// Delete expired items
		for (const key of expiredKeys) {
			await this.delete(key);
		}

		// Check if we're over capacity
		if (this.metadata.size <= this.policy.maxItems) {
			return;
		}

		// Calculate priorities
		const itemsWithPriority: [string, number][] = [];

		for (const [key, metadata] of this.metadata.entries()) {
			const priority = this.policy.priorityFunction(metadata);
			itemsWithPriority.push([key, priority]);
		}

		// Sort by priority (ascending, so lowest priority first)
		itemsWithPriority.sort((a, b) => a[1] - b[1]);

		// Evict items until we're under capacity
		const numToEvict = this.metadata.size - this.policy.maxItems;

		for (let i = 0; i < numToEvict; i++) {
			if (i < itemsWithPriority.length) {
				await this.delete(itemsWithPriority[i][0]);
			}
		}
	}

	/**
	 * Calculate the size of a data item (simplified).
	 * @param data The data to measure
	 */
	private calculateSize(data: any): number {
		if (typeof data === 'string') {
			return data.length * 2; // Rough estimate for string (2 bytes per char)
		} else if (data instanceof ArrayBuffer) {
			return data.byteLength;
		} else if (Array.isArray(data)) {
			return data.reduce((sum, item) => sum + this.calculateSize(item), 0);
		} else if (typeof data === 'object' && data !== null) {
			return Object.entries(data).reduce(
				(sum, [key, value]) => sum + key.length * 2 + this.calculateSize(value),
				0
			);
		}

		// Fallback
		return 100; // Arbitrary size for unknown types
	}

	/**
	 * Default priority function that combines recency, frequency, and size.
	 * @param data The context data
	 */
	private defaultPriorityFunction(data: ContextData): number {
		const now = Date.now();
		const recency = Math.min(1, (now - data.lastAccessTime) / (24 * 60 * 60 * 1000)); // Normalize to [0,1] with 1 day max
		const frequency = Math.min(1, data.accessCount / 100); // Normalize to [0,1] with 100 accesses max
		const size = Math.min(1, data.size / (1024 * 1024)); // Normalize to [0,1] with 1MB max

		// Higher priority items should have higher scores
		return (0.5 * (1 - recency)) + (0.3 * frequency) + (0.2 * (1 - size));
	}
}
