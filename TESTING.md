# Testing Guide

## Overview

This project has **100% test coverage** with comprehensive unit tests for all modules.

## Running Tests

### Install Dependencies First
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests in CI Mode
```bash
npm run test:ci
```

## Test Structure

Tests are located in `src/__tests__/` directory:

```
src/__tests__/
├── setup.ts                    # Test setup and mocks
├── config/
│   ├── constants.test.ts      # Constants and PDA tests
│   └── env.test.ts            # Configuration tests
├── services/
│   ├── connection.test.ts     # Connection manager tests
│   ├── decoder.test.ts        # Transaction decoder tests
│   ├── health.test.ts         # Health monitor tests
│   ├── monitor.test.ts        # Transaction monitor tests
│   ├── positions.test.ts      # Position manager tests
│   └── trading.test.ts        # Trading engine tests
└── utils/
    ├── errors.test.ts         # Error class tests
    └── logger.test.ts         # Logger tests
```

## Coverage Requirements

The project enforces **100% code coverage** for:
- Branches: 100%
- Functions: 100%
- Lines: 100%
- Statements: 100%

## Test Categories

### Unit Tests
- **Logger**: Tests all log levels and formatting
- **Errors**: Tests all custom error classes
- **Constants**: Tests all PDA functions and constants
- **Config**: Tests configuration validation
- **PositionManager**: Tests position tracking logic
- **ConnectionManager**: Tests connection and blockhash management
- **TransactionDecoder**: Tests transaction parsing
- **HealthMonitor**: Tests health check logic
- **TransactionMonitor**: Tests WebSocket monitoring
- **TradingEngine**: Tests trade execution (with mocks)

## Mocking Strategy

### External Dependencies
- `@solana/web3.js`: Mocked Connection class
- `ws`: Mocked WebSocket class
- Environment variables: Mocked in setup.ts

### Internal Dependencies
- Connection manager methods are mocked in tests
- Logger output is suppressed during tests
- Config values are set in test setup

## Writing New Tests

When adding new features:

1. **Create test file**: `src/__tests__/[module]/[name].test.ts`
2. **Follow naming convention**: `describe` blocks for classes, `it` blocks for methods
3. **Mock external dependencies**: Use Jest mocks for external libraries
4. **Test all branches**: Ensure 100% coverage
5. **Test error cases**: Include error handling tests
6. **Use descriptive names**: Test names should clearly describe what's being tested

## Example Test Structure

```typescript
describe('MyClass', () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
  });

  describe('methodName', () => {
    it('should do something when condition is met', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = instance.methodName(input);
      
      // Assert
      expect(result).toBe('expected');
    });

    it('should throw error when invalid input', () => {
      expect(() => {
        instance.methodName(null);
      }).toThrow(ValidationError);
    });
  });
});
```

## Continuous Integration

Tests are configured to run in CI with:
- Coverage reporting
- Fail on coverage threshold not met
- Parallel test execution
- No watch mode

## Troubleshooting

### Tests Failing
1. Check that all dependencies are installed: `npm install`
2. Verify environment variables are set in `setup.ts`
3. Check that mocks are properly configured
4. Ensure test data matches expected formats

### Coverage Issues
1. Run `npm run test:coverage` to see detailed coverage report
2. Check `coverage/lcov-report/index.html` for line-by-line coverage
3. Add tests for uncovered lines/branches
4. Ensure all error paths are tested

### Mock Issues
1. Verify mocks are reset in `beforeEach`
2. Check that mock implementations match real API
3. Ensure async mocks use proper Promise resolution

## Best Practices

1. **Isolation**: Each test should be independent
2. **Clarity**: Tests should be easy to read and understand
3. **Completeness**: Test both success and failure cases
4. **Speed**: Keep tests fast (use mocks, avoid real network calls)
5. **Maintainability**: Update tests when code changes

