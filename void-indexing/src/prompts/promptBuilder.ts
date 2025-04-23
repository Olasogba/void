import { CodeSnippet } from '../context/localContext';

/**
 * Template for building prompts.
 */
export interface PromptTemplate {
	/**
	 * System message to be used with LLMs that support system messages.
	 */
	systemMessage?: string;

	/**
	 * Template for the user message, can include placeholders like {{query}} and {{context}}.
	 */
	userMessageTemplate: string;

	/**
	 * Header text to include before context snippets.
	 */
	contextHeader?: string;

	/**
	 * Footer text to include after context snippets.
	 */
	contextFooter?: string;

	/**
	 * Separator to use between context snippets.
	 */
	contextSeparator: string;
}

/**
 * Extended code snippet with additional metadata.
 */
export interface ExtendedCodeSnippet extends CodeSnippet {
	metadata?: {
		fileName?: string;
		language?: string;
		[key: string]: any;
	};
}

/**
 * Context data for prompt building.
 */
export interface PromptContext {
	/**
	 * The user query to include in the prompt.
	 */
	query: string;

	/**
	 * Code snippets to include as context.
	 */
	codeSnippets: ExtendedCodeSnippet[];

	/**
	 * System information to include in the prompt.
	 */
	systemInfo?: Record<string, any>;

	/**
	 * Capabilities of the target model.
	 */
	modelCapabilities?: {
		contextWindow: number;
		supportsSystemMessage: boolean;
		maxOutputTokens?: number;
	};
}

/**
 * Result of prompt building.
 */
export interface PromptResult {
	/**
	 * System message to be sent to the LLM (if supported).
	 */
	systemMessage?: string;

	/**
	 * User message to be sent to the LLM.
	 */
	userMessage: string;

	/**
	 * Metadata about the prompt building process.
	 */
	metadata: {
		includedSnippets: number;
		totalSnippets: number;
		estimatedTokens: number;
	};
}

/**
 * Service for building prompts with context.
 */
export class PromptBuilder {
	/**
	 * Default template to use if none is provided.
	 */
	private defaultTemplate: PromptTemplate = {
		systemMessage: "You are a helpful coding assistant with expertise in software development.",
		userMessageTemplate: "{{query}}",
		contextHeader: "Here is some relevant code context:\n",
		contextFooter: "\nPlease answer based on the above context.",
		contextSeparator: "\n---\n"
	};

	/**
	 * The template to use for building prompts.
	 */
	private template: PromptTemplate;

	/**
	 * Create a new prompt builder.
	 * @param template Optional custom template
	 */
	constructor(template: Partial<PromptTemplate> = {}) {
		this.template = {
			...this.defaultTemplate,
			...template
		};
	}

	/**
	 * Build a prompt with context.
	 * @param context The context data for the prompt
	 * @returns The built prompt
	 */
	buildPrompt(context: PromptContext): PromptResult {
		// Sort snippets by relevance (highest first)
		const sortedSnippets = [...context.codeSnippets]
			.sort((a, b) => b.relevance - a.relevance);

		// Calculate estimated token count and determine which snippets to include
		const snippetsToInclude = this.calculateSnippetsToInclude(
			sortedSnippets,
			context.modelCapabilities?.contextWindow || 4000,
			context.modelCapabilities?.maxOutputTokens || 1000
		);

		// Build context string from the snippets
		const contextString = snippetsToInclude.length > 0
			? `${this.template.contextHeader || ''}${snippetsToInclude.map(snippet =>
				this.formatSnippet(snippet)
			).join(this.template.contextSeparator)
			}${this.template.contextFooter || ''}`
			: '';

		// Replace placeholders in the user message template
		const userMessage = this.template.userMessageTemplate
			.replace('{{query}}', context.query)
			.replace('{{context}}', contextString);

		// Format system message (if supported)
		const systemMessage = context.modelCapabilities?.supportsSystemMessage
			? this.formatSystemMessage(this.template.systemMessage, context.systemInfo)
			: undefined;

		// If system messages aren't supported, prepend it to the user message
		const finalUserMessage = context.modelCapabilities?.supportsSystemMessage
			? userMessage
			: `${systemMessage || ''}\n\n${userMessage}`;

		// Calculate metadata about the prompt
		const estimatedTokens = this.estimateTokens(
			(systemMessage || '') + finalUserMessage
		);

		return {
			systemMessage,
			userMessage: finalUserMessage,
			metadata: {
				includedSnippets: snippetsToInclude.length,
				totalSnippets: sortedSnippets.length,
				estimatedTokens
			}
		};
	}

	/**
	 * Format a code snippet for inclusion in the prompt.
	 * @param snippet The code snippet
	 * @returns Formatted snippet text
	 */
	private formatSnippet(snippet: ExtendedCodeSnippet): string {
		const fileName = snippet.metadata?.fileName || 'unknown';
		const language = snippet.metadata?.language || '';

		return `File: ${fileName} (Lines ${snippet.startLine + 1}-${snippet.endLine + 1})\n` +
			'```' + language + '\n' +
			snippet.content + '\n' +
			'```';
	}

	/**
	 * Format the system message with system information.
	 * @param template System message template
	 * @param systemInfo System information
	 * @returns Formatted system message
	 */
	private formatSystemMessage(
		template?: string,
		systemInfo?: Record<string, any>
	): string {
		if (!template) {
			return '';
		}

		// If there's no system info, return the template as is
		if (!systemInfo) {
			return template;
		}

		// Replace system info placeholders
		let result = template;

		for (const [key, value] of Object.entries(systemInfo)) {
			result = result.replace(`{{${key}}}`, String(value));
		}

		return result;
	}

	/**
	 * Calculate which snippets to include based on token limits.
	 * @param snippets Sorted snippets
	 * @param maxContextTokens Maximum tokens for context
	 * @param maxOutputTokens Maximum tokens for output
	 * @returns Snippets to include
	 */
	private calculateSnippetsToInclude(
		snippets: ExtendedCodeSnippet[],
		maxContextTokens: number,
		maxOutputTokens: number
	): ExtendedCodeSnippet[] {
		// Reserve tokens for the query, system message, and output
		const reservedTokens = 500 + maxOutputTokens; // 500 for query and formatting
		const availableTokens = maxContextTokens - reservedTokens;

		const result: ExtendedCodeSnippet[] = [];
		let tokenCount = 0;

		for (const snippet of snippets) {
			const snippetTokens = this.estimateTokens(
				this.formatSnippet(snippet) + this.template.contextSeparator
			);

			if (tokenCount + snippetTokens <= availableTokens) {
				result.push(snippet);
				tokenCount += snippetTokens;
			} else {
				break;
			}
		}

		return result;
	}

	/**
	 * Estimate the number of tokens in a string.
	 * This is a simple approximation based on word count.
	 * @param text The text to estimate tokens for
	 * @returns Estimated token count
	 */
	private estimateTokens(text: string): number {
		// Simple estimation: count words and multiply by a factor
		// Real token counting would require a tokenizer like GPT-2/3 uses
		return Math.ceil(text.split(/\s+/).length * 1.3);
	}
}
