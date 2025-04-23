import { CancellationToken } from '../utils/cancellation';
import { ChunkingStrategy, Chunk } from '../chunking/chunkingStrategy';

/**
 * Options for stream processing.
 */
export interface StreamProcessingOptions {
	/**
	 * Maximum buffer size in bytes.
	 */
	bufferSize?: number;

	/**
	 * Maximum chunk size in bytes.
	 */
	maxChunkSize?: number;

	/**
	 * Character encoding.
	 */
	encoding?: 'utf8' | 'ascii' | 'binary';

	/**
	 * Custom end pattern to recognize when a logical chunk ends.
	 */
	chunkEndPattern?: RegExp;

	/**
	 * Whether to respect language-specific boundaries.
	 */
	respectLanguageBoundaries?: boolean;
}

/**
 * Result of stream processing.
 */
export interface StreamProcessingResult {
	/**
	 * The chunks that were processed.
	 */
	chunks: Chunk[];

	/**
	 * Total number of bytes read.
	 */
	bytesRead: number;

	/**
	 * Whether processing is complete.
	 */
	isComplete: boolean;

	/**
	 * Any error that occurred.
	 */
	error?: Error;
}

/**
 * Stream progress callback.
 */
export type StreamProgressCallback = (result: StreamProcessingResult) => void;

/**
 * Stream processor for large files.
 */
export class StreamProcessor {
	/**
	 * Process a stream in chunks.
	 * @param stream The readable stream
	 * @param chunkingStrategy The chunking strategy to use
	 * @param options Processing options
	 * @param progress Optional progress callback
	 * @param token Optional cancellation token
	 * @returns Processing result
	 */
	public async processStream(
		stream: ReadableStream<Uint8Array>,
		chunkingStrategy: ChunkingStrategy,
		options: StreamProcessingOptions = {},
		progress?: StreamProgressCallback,
		token?: CancellationToken
	): Promise<StreamProcessingResult> {
		const bufferSize = options.bufferSize || 1024 * 1024; // 1MB default
		const maxChunkSize = options.maxChunkSize || 1024 * 100; // 100KB default
		const encoding = options.encoding || 'utf8';

		const reader = stream.getReader();
		const decoder = new TextDecoder(encoding);

		// Buffer to accumulate data
		let buffer = '';
		let totalBytesRead = 0;
		const allChunks: Chunk[] = [];

		try {
			let done = false;
			let chunkIndex = 0;

			// Read from the stream in chunks
			while (!done && !token?.isCancellationRequested) {
				const { value, done: streamDone } = await reader.read();
				done = streamDone;

				if (value) {
					// Decode the buffer and add to our accumulated text
					const decodedText = decoder.decode(value, { stream: !streamDone });
					buffer += decodedText;
					totalBytesRead += value.length;

					// Process chunks when buffer gets large enough
					if (buffer.length >= bufferSize || done) {
						const chunks = await this.processBuffer(
							buffer,
							chunkingStrategy,
							options,
							chunkIndex,
							token
						);

						// Add processed chunks to our result
						allChunks.push(...chunks);
						chunkIndex += chunks.length;

						// Reset buffer if we've processed everything
						if (done || buffer.length <= maxChunkSize) {
							buffer = '';
						} else {
							// Keep the remainder for the next iteration
							const lastChunk = chunks[chunks.length - 1];
							const lastChunkEnd = lastChunk ? lastChunk.metadata.endOffset : 0;
							buffer = buffer.substring(lastChunkEnd);
						}

						// Report progress
						if (progress) {
							progress({
								chunks,
								bytesRead: totalBytesRead,
								isComplete: false
							});
						}
					}
				}
			}

			// Process any remaining buffer
			if (buffer.length > 0 && !token?.isCancellationRequested) {
				const chunks = await this.processBuffer(
					buffer,
					chunkingStrategy,
					options,
					chunkIndex,
					token
				);

				allChunks.push(...chunks);

				// Report final progress
				if (progress) {
					progress({
						chunks,
						bytesRead: totalBytesRead,
						isComplete: true
					});
				}
			}

			return {
				chunks: allChunks,
				bytesRead: totalBytesRead,
				isComplete: true
			};
		} catch (error) {
			// Report error
			const result: StreamProcessingResult = {
				chunks: allChunks,
				bytesRead: totalBytesRead,
				isComplete: false,
				error: error instanceof Error ? error : new Error(String(error))
			};

			if (progress) {
				progress(result);
			}

			return result;
		} finally {
			// Release the reader
			reader.releaseLock();
		}
	}

	/**
	 * Process a text buffer into chunks.
	 * @param buffer The text buffer
	 * @param chunkingStrategy The chunking strategy
	 * @param options Processing options
	 * @param startIndex Starting index for chunk IDs
	 * @param token Optional cancellation token
	 * @returns Array of chunks
	 */
	private async processBuffer(
		buffer: string,
		chunkingStrategy: ChunkingStrategy,
		options: StreamProcessingOptions,
		startIndex: number,
		token?: CancellationToken
	): Promise<Chunk[]> {
		if (token?.isCancellationRequested) {
			return [];
		}

		// Determine where to split the buffer
		const maxChunkSize = options.maxChunkSize || 1024 * 100;
		const chunks: Chunk[] = [];

		if (buffer.length <= maxChunkSize) {
			// If buffer is small enough, process it as a single chunk
			const processed = await chunkingStrategy.chunk(buffer, {
				startOffset: 0,
				endOffset: buffer.length,
				isPartial: false
			}, token);

			// Add offset information to each chunk
			for (const chunk of processed) {
				chunk.metadata.startOffset = 0;
				chunk.metadata.endOffset = buffer.length;
				chunk.metadata.chunkIndex = startIndex + chunks.length;
			}

			chunks.push(...processed);
		} else {
			// Split buffer at logical boundaries
			const boundaries = this.findChunkBoundaries(buffer, options);

			let currentStart = 0;
			for (const boundary of boundaries) {
				if (token?.isCancellationRequested) {
					break;
				}

				const currentText = buffer.substring(currentStart, boundary);

				if (currentText.length > 0) {
					const processed = await chunkingStrategy.chunk(currentText, {
						startOffset: currentStart,
						endOffset: boundary,
						isPartial: true
					}, token);

					// Add offset information to each chunk
					for (const chunk of processed) {
						chunk.metadata.startOffset = currentStart;
						chunk.metadata.endOffset = boundary;
						chunk.metadata.chunkIndex = startIndex + chunks.length;
					}

					chunks.push(...processed);
				}

				currentStart = boundary;
			}

			// Process the last part if needed
			if (currentStart < buffer.length && !token?.isCancellationRequested) {
				const currentText = buffer.substring(currentStart);

				const processed = await chunkingStrategy.chunk(currentText, {
					startOffset: currentStart,
					endOffset: buffer.length,
					isPartial: true
				}, token);

				// Add offset information to each chunk
				for (const chunk of processed) {
					chunk.metadata.startOffset = currentStart;
					chunk.metadata.endOffset = buffer.length;
					chunk.metadata.chunkIndex = startIndex + chunks.length;
				}

				chunks.push(...processed);
			}
		}

		return chunks;
	}

	/**
	 * Find logical chunk boundaries in a text buffer.
	 * @param buffer The text buffer
	 * @param options Processing options
	 * @returns Array of boundary positions
	 */
	private findChunkBoundaries(buffer: string, options: StreamProcessingOptions): number[] {
		const maxChunkSize = options.maxChunkSize || 1024 * 100;
		const boundaries: number[] = [];

		// Custom pattern has priority
		if (options.chunkEndPattern) {
			let match;
			const pattern = options.chunkEndPattern;
			pattern.lastIndex = 0; // Reset the regex

			while ((match = pattern.exec(buffer)) !== null) {
				boundaries.push(match.index + match[0].length);

				// Prevent infinite loops
				if (pattern.lastIndex === match.index) {
					pattern.lastIndex++;
				}
			}
		}

		// Add boundaries based on size if we don't have enough
		if (boundaries.length === 0 ||
			(boundaries.length > 0 && boundaries[boundaries.length - 1] < buffer.length - maxChunkSize)) {

			let position = 0;
			while (position < buffer.length) {
				position += maxChunkSize;

				// Find a good boundary (newline, period, etc.)
				if (position < buffer.length) {
					// Look for newlines or sentence endings
					const searchEnd = Math.min(position + 100, buffer.length);
					const searchRegion = buffer.substring(position, searchEnd);

					// Try to find a paragraph break first
					const paragraphMatch = searchRegion.match(/\n\s*\n/);
					if (paragraphMatch) {
						position += paragraphMatch.index! + paragraphMatch[0].length;
						boundaries.push(position);
						continue;
					}

					// Try to find a line break
					const lineMatch = searchRegion.match(/\n/);
					if (lineMatch) {
						position += lineMatch.index! + lineMatch[0].length;
						boundaries.push(position);
						continue;
					}

					// Try to find a sentence end
					const sentenceMatch = searchRegion.match(/[.!?]\s/);
					if (sentenceMatch) {
						position += sentenceMatch.index! + sentenceMatch[0].length;
						boundaries.push(position);
						continue;
					}

					// If all else fails, just use a space
					const spaceMatch = searchRegion.match(/\s/);
					if (spaceMatch) {
						position += spaceMatch.index! + spaceMatch[0].length;
						boundaries.push(position);
						continue;
					}

					// If we couldn't find a good boundary, just use the max size
					boundaries.push(position);
				}
			}
		}

		// Sort boundaries in ascending order
		boundaries.sort((a, b) => a - b);

		return boundaries;
	}

	/**
	 * Process a file using streams.
	 * @param filePath Path to the file
	 * @param chunkingStrategy The chunking strategy to use
	 * @param options Processing options
	 * @param progress Optional progress callback
	 * @param token Optional cancellation token
	 * @returns Processing result
	 */
	public async processFile(
		fileData: Uint8Array,
		chunkingStrategy: ChunkingStrategy,
		options: StreamProcessingOptions = {},
		progress?: StreamProgressCallback,
		token?: CancellationToken
	): Promise<StreamProcessingResult> {
		// Create a readable stream from the file data
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(fileData);
				controller.close();
			}
		});

		return this.processStream(stream, chunkingStrategy, options, progress, token);
	}

	/**
	 * Process a string using the streaming API.
	 * @param text The text to process
	 * @param chunkingStrategy The chunking strategy to use
	 * @param options Processing options
	 * @param token Optional cancellation token
	 * @returns Processing result
	 */
	public async processString(
		text: string,
		chunkingStrategy: ChunkingStrategy,
		options: StreamProcessingOptions = {},
		token?: CancellationToken
	): Promise<StreamProcessingResult> {
		const encoder = new TextEncoder();
		const data = encoder.encode(text);

		return this.processFile(data, chunkingStrategy, options, undefined, token);
	}
}
