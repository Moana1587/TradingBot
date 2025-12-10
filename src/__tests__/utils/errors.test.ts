import {
  SniperError,
  ConnectionError,
  TransactionError,
  DecodeError,
  ValidationError,
} from '../../utils/errors';

describe('Error Classes', () => {
  describe('SniperError', () => {
    it('should create error with message', () => {
      const error = new SniperError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('SniperError');
    });

    it('should create error with code', () => {
      const error = new SniperError('Test error', 'TEST_CODE');
      expect(error.code).toBe('TEST_CODE');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new SniperError('Test error', 'TEST_CODE', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('ConnectionError', () => {
    it('should create connection error', () => {
      const error = new ConnectionError('Connection failed');
      expect(error.message).toBe('Connection failed');
      expect(error.name).toBe('ConnectionError');
      expect(error.code).toBe('CONNECTION_ERROR');
    });

    it('should include cause', () => {
      const cause = new Error('Network timeout');
      const error = new ConnectionError('Connection failed', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('TransactionError', () => {
    it('should create transaction error', () => {
      const error = new TransactionError('Transaction failed');
      expect(error.message).toBe('Transaction failed');
      expect(error.name).toBe('TransactionError');
      expect(error.code).toBe('TRANSACTION_ERROR');
    });
  });

  describe('DecodeError', () => {
    it('should create decode error', () => {
      const error = new DecodeError('Decode failed');
      expect(error.message).toBe('Decode failed');
      expect(error.name).toBe('DecodeError');
      expect(error.code).toBe('DECODE_ERROR');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Validation failed');
      expect(error.message).toBe('Validation failed');
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
    });
  });
});
