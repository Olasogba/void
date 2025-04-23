import { CancellationToken } from '../utils/cancellation';

/**
 * Interface for embedding providers that compute vector embeddings from text.
 */
export interface EmbeddingProvider {
	/**
	 * Compute embeddings for a list of texts.
	 * @param texts The texts to compute embeddings for
	 * @returns A 2D array of embeddings, where each embedding is an array of numbers
	 */
	computeEmbeddings(texts: string[]): Promise<number[][]>;

	/**
	 * The number of dimensions in the embedding vectors.
	 */
	dimensions: number;

	/**
	 * The name of the model used for embeddings.
	 */
	modelName: string;
}

/**
 * Service for managing embedding providers and computing embeddings.
 */
export class EmbeddingsService {
	/**
	 * Map of provider IDs to provider implementations.
	 */
	private providers = new Map<string, EmbeddingProvider>();

	/**
	 * Register an embedding provider with a specific ID.
	 * @param id The ID to register the provider under
	 * @param provider The embedding provider implementation
	 */
	registerProvider(id: string, provider: EmbeddingProvider): void {
		this.providers.set(id, provider);
	}

	/**
	 * Get a registered embedding provider by ID.
	 * @param id The ID of the provider to get
	 * @returns The embedding provider or undefined if not found
	 */
	getProvider(id: string): EmbeddingProvider | undefined {
		return this.providers.get(id);
	}

	/**
	 * Compute embeddings for a list of texts using a specific provider.
	 * @param providerId The ID of the provider to use
	 * @param texts The texts to compute embeddings for
	 * @param token Optional cancellation token
	 * @returns A 2D array of embeddings
	 */
	async computeEmbeddings(
		providerId: string,
		texts: string[],
		token?: CancellationToken
	): Promise<number[][]> {
		if (token?.isCancellationRequested) {
			return [];
		}

		const provider = this.providers.get(providerId);
		if (!provider) {
			throw new Error(`No embedding provider found with id: ${providerId}`);
		}

		return provider.computeEmbeddings(texts);
	}

	/**
	 * Get the list of registered provider IDs.
	 * @returns Array of provider IDs
	 */
	getProviderIds(): string[] {
		return Array.from(this.providers.keys());
	}

	/**
	 * Remove a provider by ID.
	 * @param id The ID of the provider to remove
	 * @returns True if the provider was removed, false otherwise
	 */
	removeProvider(id: string): boolean {
		return this.providers.delete(id);
	}
}
