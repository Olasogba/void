import { ContextKeyService } from '../src';

describe('ContextKeyService', () => {
	let contextService: ContextKeyService;

	beforeEach(() => {
		// Create a fresh context service for each test
		contextService = new ContextKeyService();
	});

	test('should create and manage context keys', () => {
		// Create context keys
		const isActiveKey = contextService.createKey<boolean>('isActive', false);
		const userNameKey = contextService.createKey<string>('userName', undefined);

		// Should initialize with default values
		expect(isActiveKey.get()).toBe(false);
		expect(userNameKey.get()).toBeUndefined();

		// Should update values
		isActiveKey.set(true);
		userNameKey.set('John');

		expect(isActiveKey.get()).toBe(true);
		expect(userNameKey.get()).toBe('John');

		// Should reset to default values
		isActiveKey.reset();
		expect(isActiveKey.get()).toBe(false);
	});

	test('should create hierarchical contexts', () => {
		// Create keys in the root context
		contextService.setContext('rootKey', 'rootValue');

		// Create a child context
		const childContextId = contextService.createChildContext();
		const childContext = contextService.getContextValuesContainer(childContextId);

		// Child should inherit from parent
		expect(childContext.getValue('rootKey')).toBe('rootValue');

		// Set a value in the child context
		childContext.setValue('childKey', 'childValue');

		// Child should have its own value
		expect(childContext.getValue('childKey')).toBe('childValue');

		// Parent should not see child's value
		const rootContext = contextService.getContextValuesContainer(1);
		expect(rootContext.getValue('childKey')).toBeUndefined();

		// Child should see updated parent values
		rootContext.setValue('rootKey', 'updatedRootValue');
		expect(childContext.getValue('rootKey')).toBe('updatedRootValue');
	});

	test('should collect all values from context hierarchy', () => {
		// Setup hierarchy
		const rootContext = contextService.getContextValuesContainer(1);
		rootContext.setValue('rootKey1', 'rootValue1');
		rootContext.setValue('rootKey2', 'rootValue2');

		const childContextId = contextService.createChildContext();
		const childContext = contextService.getContextValuesContainer(childContextId);
		childContext.setValue('childKey', 'childValue');
		childContext.setValue('rootKey1', 'overriddenValue');

		// Collect all values from child context
		const allValues = childContext.collectAllValues();

		// Should contain all values, with child values overriding parent values
		expect(allValues).toEqual({
			rootKey1: 'overriddenValue',
			rootKey2: 'rootValue2',
			childKey: 'childValue'
		});
	});

	test('should dispose contexts', () => {
		// Create a child context
		const childContextId = contextService.createChildContext();

		// Should be able to get the context
		expect(() => {
			contextService.getContextValuesContainer(childContextId);
		}).not.toThrow();

		// Dispose the context
		contextService.disposeContext(childContextId);

		// Should throw when trying to get disposed context
		expect(() => {
			contextService.getContextValuesContainer(childContextId);
		}).toThrow();
	});
});
