import { logger } from '../../utils/logger';

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setLevel', () => {
    it('should set the log level', () => {
      logger.setLevel('debug');
      expect(logger['level']).toBe('debug');
      logger.setLevel('error');
      expect(logger['level']).toBe('error');
    });
  });

  describe('debug', () => {
    it('should log debug messages when level is debug', () => {
      logger.setLevel('debug');
      const consoleSpy = jest.spyOn(console, 'log');
      logger.debug('Test', 'Debug message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log debug messages when level is info', () => {
      logger.setLevel('info');
      const consoleSpy = jest.spyOn(console, 'log');
      logger.debug('Test', 'Debug message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info messages when level is info', () => {
      logger.setLevel('info');
      const consoleSpy = jest.spyOn(console, 'log');
      logger.info('Test', 'Info message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log info messages when level is warn', () => {
      logger.setLevel('warn');
      const consoleSpy = jest.spyOn(console, 'log');
      logger.info('Test', 'Info message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log warn messages when level is warn', () => {
      logger.setLevel('warn');
      const consoleSpy = jest.spyOn(console, 'warn');
      logger.warn('Test', 'Warn message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log warn messages when level is error', () => {
      logger.setLevel('error');
      const consoleSpy = jest.spyOn(console, 'warn');
      logger.warn('Test', 'Warn message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should always log error messages', () => {
      logger.setLevel('error');
      const consoleSpy = jest.spyOn(console, 'error');
      logger.error('Test', 'Error message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log error messages even at debug level', () => {
      logger.setLevel('debug');
      const consoleSpy = jest.spyOn(console, 'error');
      logger.error('Test', 'Error message');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('formatMessage', () => {
    it('should format messages with timestamp and tag', () => {
      logger.setLevel('info');
      const consoleSpy = jest.spyOn(console, 'log');
      logger.info('TestTag', 'Test message');
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('TestTag');
      expect(call).toContain('Test message');
    });

    it('should include additional arguments', () => {
      logger.setLevel('info');
      const consoleSpy = jest.spyOn(console, 'log');
      logger.info('Test', 'Message', { key: 'value' }, 123);
      const call = consoleSpy.mock.calls[0][0];
      expect(call).toContain('{"key":"value"}');
      expect(call).toContain('123');
    });

    it('should handle unknown log level gracefully', () => {
      // Access private method to test unknown level handling
      const formatMessage = (logger as any).formatMessage.bind(logger);
      const result = formatMessage('unknown' as any, 'Tag', 'Message');
      // Should not throw and should use empty color string
      expect(result).toBeDefined();
      expect(result).toContain('Message');
    });
  });
});
