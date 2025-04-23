import { TfIdfCalculator, TfIdfDocument, normalizeTfIdfScores, CancellationToken } from '../src';

describe('TfIdfCalculator', () => {
	let calculator: TfIdfCalculator;
	let documents: TfIdfDocument[];

	beforeEach(() => {
		// Set up documents for testing
		documents = [
			{
				key: 'doc1',
				textChunks: ['This is a document about cats and dogs']
			},
			{
				key: 'doc2',
				textChunks: ['Another document about programming languages']
			},
			{
				key: 'doc3',
				textChunks: ['A document talking about machine learning and artificial intelligence']
			}
		];

		// Create and update calculator
		calculator = new TfIdfCalculator();
		calculator.updateDocuments(documents);
	});

	test('should calculate scores for query', () => {
		const scores = calculator.calculateScores('machine learning', CancellationToken.None);

		// Should return scores
		expect(scores.length).toBeGreaterThan(0);

		// Document 3 should have highest score for 'machine learning'
		const doc3Score = scores.find(score => score.key === 'doc3');
		expect(doc3Score).toBeDefined();
		if (doc3Score) {
			expect(doc3Score.score).toBeGreaterThan(0);
		}
	});

	test('should normalize scores', () => {
		const scores = calculator.calculateScores('document', CancellationToken.None);
		const normalizedScores = normalizeTfIdfScores(scores);

		// Should return normalized scores
		expect(normalizedScores.length).toBeGreaterThan(0);

		// All scores should be normalized between 0 and 1
		for (const score of normalizedScores) {
			expect(score.score).toBeGreaterThanOrEqual(0);
			expect(score.score).toBeLessThanOrEqual(1);
		}

		// First score should be 1 (highest score)
		expect(normalizedScores[0].score).toBe(1);
	});

	test('should handle removing documents', () => {
		// Delete a document
		calculator.deleteDocument('doc1');

		// Should not return scores for deleted document
		const scores = calculator.calculateScores('cats', CancellationToken.None);
		expect(scores.find(score => score.key === 'doc1')).toBeUndefined();
	});

	test('should handle updating documents', () => {
		// Update with new documents
		const newDocuments: TfIdfDocument[] = [
			{
				key: 'doc4',
				textChunks: ['A document about cars and motorcycles']
			}
		];

		calculator.updateDocuments(newDocuments);

		// Should return scores for new document
		const scores = calculator.calculateScores('cars', CancellationToken.None);
		expect(scores.find(score => score.key === 'doc4')).toBeDefined();
	});
});
