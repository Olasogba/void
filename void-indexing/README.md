# Void-Indexing

A comprehensive library for code repository indexing, context-aware retrieval, and RAG (Retrieval-Augmented Generation) for LLMs. This library extracts the context awareness and semantic code understanding components from the Void editor to allow any application to include advanced code comprehension capabilities.

## Overview

Void-Indexing provides developers with a powerful toolkit for:

1. Indexing code repositories and documents using TF-IDF and semantic search
2. Gathering relevant context from code with an awareness of code structure
3. Ranking and retrieving the most relevant code snippets for a query
4. Building well-structured prompts for LLMs with appropriate context
5. Managing context windows efficiently for different LLM providers

## Features

### 1. Code Repository Indexing

- **TF-IDF Based Indexing**: Fast and memory-efficient indexing with term-frequency inverse document frequency
- **Chunking Strategies**: Multiple approaches for splitting code (line-based, token-based, AST-based)
- **Incremental Updates**: Support for updating indices as files change
- **Multi-Language Support**: Language-agnostic core with extensible parsers

### 2. Context-Aware Retrieval

- **Hierarchical Context**: Understands parent-child relationships in code
- **AST-Based Context**: Uses abstract syntax trees for structure awareness
- **Semantic Understanding**: Captures the meaning beyond simple text matching
- **Local Context Collection**: Gathers code snippets around current position

### 3. Advanced Ranking

- **Multi-Factor Scoring**: Combines TF-IDF, fuzzy matching, and semantic scoring
- **Code Structure Awareness**: Ranks based on code organization and relationships
- **User Intent Analysis**: Adapts to different query types and user needs
- **Relevance Heuristics**: Employs sophisticated algorithms for determining relevance

### 4. LLM Integration

- **Prompt Building**: Constructs well-formatted prompts with retrieved context
- **Token Management**: Efficiently manages token limits for different LLM providers
- **Response Processing**: Handles streaming responses and processes results
- **Provider Adaptation**: Supports different LLM capabilities and formats

### 5. Performance Optimizations

- **Lazy Computation**: Calculates embeddings and scores on demand
- **Caching**: Implements intelligent caching strategies
- **Parallel Processing**: Supports concurrent operations for faster performance
- **Resource Efficiency**: Minimizes memory usage through streaming and optimized data structures

## Installation

```bash
npm install void-indexing
```

## Usage Examples

### Basic Document Indexing and Search

```typescript
import { TfIdfCalculator, TfIdfDocument } from 'void-indexing';

// Create a TF-IDF calculator
const calculator = new TfIdfCalculator();

// Add documents to the index
const documents: TfIdfDocument[] = [
  {
    key: 'main.ts',
    textChunks: [
      'function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }',
      'const getDiscount = (total) => total > 100 ? 0.1 : 0;'
    ]
  },
  {
    key: 'utils.ts',
    textChunks: [
      'export function formatPrice(price) { return `$${price.toFixed(2)}`; }',
      'export const TAX_RATE = 0.07;'
    ]
  }
];

calculator.updateDocuments(documents);

// Search for relevant documents
const token = { isCancellationRequested: false };
const results = calculator.calculateScores('calculate price', token);
console.log(results);
```

### Context Gathering

```typescript
import { ContextGatherer, Position } from 'void-indexing';

// Create a context gatherer
const gatherer = new ContextGatherer();

// Gather context at a specific position in a file
const position: Position = { line: 15, column: 10 };
const fileContent = `function calculateTotal(items) {
  // Sum up all item prices
  return items.reduce((sum, item) => {
    return sum + item.price;
  }, 0);
}`;

const snippets = gatherer.gatherContextSnippets(fileContent, position, {
  nearbyLines: 3,
  parentFunction: true,
  siblingFunctions: false
});

console.log(snippets);
```

### Building LLM Prompts

```typescript
import { PromptBuilder, ModelCapabilities } from 'void-indexing';

// Define model capabilities
const modelConfig: ModelCapabilities = {
  contextWindow: 16000,
  maxOutputTokens: 4000,
  supportsFIM: true,
  specialToolFormat: 'anthropic-style'
};

// Create a prompt builder
const promptBuilder = new PromptBuilder(modelConfig);

// Add system message and context
promptBuilder.setSystemMessage("You are a helpful coding assistant.");
promptBuilder.addUserContext("I'm working on a shopping cart implementation.");

// Add retrieved code snippets
promptBuilder.addCodeSnippets([
  {
    content: "function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }",
    path: "main.ts",
    startLine: 10,
    relevance: 0.9
  },
  {
    content: "export function formatPrice(price) { return `$${price.toFixed(2)}`; }",
    path: "utils.ts",
    startLine: 5,
    relevance: 0.7
  }
]);

// Add user query
promptBuilder.addUserQuery("How do I apply a discount to the total?");

// Build the final prompt
const prompt = promptBuilder.buildPrompt();
console.log(prompt);
```

### Complete Retrieval Flow

```typescript
import { Repository, RetrievalEngine, QueryProcessor, PromptBuilder } from 'void-indexing';

// Initialize a repository with the codebase path
const repo = new Repository('/path/to/codebase');
await repo.initialize();

// Create a retrieval engine
const engine = new RetrievalEngine(repo);

// Process a user query
const query = "How do I calculate the total price with discount?";
const processor = new QueryProcessor();
const processedQuery = processor.parseAndExpand(query);

// Retrieve relevant context
const results = await engine.retrieveContext(processedQuery, {
  maxResults: 5,
  minRelevance: 0.7
});

// Build a prompt with the retrieved context
const promptBuilder = new PromptBuilder();
promptBuilder.setSystemMessage("You are a helpful coding assistant.");
promptBuilder.addUserQuery(query);
promptBuilder.addCodeSnippets(results.snippets);

// Get the final prompt
const prompt = promptBuilder.buildPrompt();

// Send to LLM (implementation depends on your LLM provider)
const response = await sendToLLM(prompt);
console.log(response);
```

## API Reference

### Core Components

- **TfIdfCalculator**: Core indexing engine using term frequency-inverse document frequency
- **ContextGatherer**: Collects relevant code snippets based on position and structure
- **QueryProcessor**: Parses, analyzes, and expands user queries
- **RetrievalEngine**: Coordinates the retrieval process from query to ranked results
- **PromptBuilder**: Constructs well-formatted prompts for different LLM providers

### Advanced Features

- **AST Parser**: Parses code into abstract syntax trees for structural analysis
- **ContextRanker**: Ranks code snippets based on multiple relevance factors
- **TokenEstimator**: Estimates token counts for context window management
- **ModelAdapter**: Adapts prompts and responses for different LLM providers
- **ResponseProcessor**: Processes streaming responses from LLMs

## Contributing

We welcome contributions to enhance Void-Indexing! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
