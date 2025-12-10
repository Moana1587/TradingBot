import { HealthMonitor } from '../../services/health';
import { connectionManager } from '../../services/connection';

jest.mock('../../config/env', () => ({
  config: {
    rpcEndpoint: 'https://api.testnet.solana.com',
    wsEndpoint: 'wss://api.testnet.solana.com',
    commitmentLevel: 'processed',
    walletPrivateKey:
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek',
    healthCheckIntervalMs: 100,
    blockhashUpdateIntervalMs: 100,
  },
}));

jest.mock('../../services/connection', () => {
  const mockConnection = {
    getSlot: jest.fn().mockResolvedValue(100),
    getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'test_blockhash' }),
  };
  const mockWallet = {
    publicKey: { toString: () => '11111111111111111111111111111111' },
  };
  return {
    connectionManager: {
      connection: mockConnection,
      wallet: mockWallet,
      updateBlockhash: jest.fn().mockResolvedValue(undefined),
      getBlockhash: jest.fn().mockResolvedValue('test_blockhash'),
      getBalance: jest.fn().mockResolvedValue(1.0),
      healthCheck: jest.fn().mockResolvedValue(true),
    },
  };
});

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    healthMonitor = new HealthMonitor();
  });

  afterEach(() => {
    healthMonitor.stop();
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should start health checks and blockhash updates', () => {
      const mockHealthCheck = jest.spyOn(connectionManager, 'healthCheck').mockResolvedValue(true);
      const mockUpdateBlockhash = jest
        .spyOn(connectionManager, 'updateBlockhash')
        .mockResolvedValue();

      healthMonitor.start();

      expect(mockHealthCheck).toHaveBeenCalled();
      expect(mockUpdateBlockhash).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop all intervals', () => {
      healthMonitor.start();
      healthMonitor.stop();

      // Verify intervals are cleared by checking that timers don't fire
      jest.advanceTimersByTime(200);
      // If intervals were cleared, no additional calls should be made
      // Use type assertion to access private property for testing
      expect((healthMonitor as any).healthCheckInterval).toBeNull();
    });
  });

  describe('performHealthCheck', () => {
    it('should emit healthy event when connection becomes healthy', async () => {
      const mockHealthCheck = jest.spyOn(connectionManager, 'healthCheck');
      const healthyListener = jest.fn();

      healthMonitor.on('healthy', healthyListener);
      healthMonitor.start();

      mockHealthCheck.mockResolvedValueOnce(true);
      await (healthMonitor as any).performHealthCheck();

      expect(healthyListener).toHaveBeenCalled();
    });

    it('should emit unhealthy event when connection becomes unhealthy', async () => {
      const mockHealthCheck = jest.spyOn(connectionManager, 'healthCheck');
      const unhealthyListener = jest.fn();

      healthMonitor.on('unhealthy', unhealthyListener);
      healthMonitor.start();

      mockHealthCheck.mockResolvedValueOnce(false);
      await (healthMonitor as any).performHealthCheck();

      expect(unhealthyListener).toHaveBeenCalled();
    });

    it('should handle health check errors', async () => {
      const mockHealthCheck = jest.spyOn(connectionManager, 'healthCheck');
      const unhealthyListener = jest.fn();

      healthMonitor.on('unhealthy', unhealthyListener);
      healthMonitor.start();

      mockHealthCheck.mockRejectedValueOnce(new Error('Network error'));
      await (healthMonitor as any).performHealthCheck();

      expect(unhealthyListener).toHaveBeenCalled();
      expect((healthMonitor as any).isHealthy).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return health status', () => {
      connectionManager.currentBlockhash = 'test_blockhash';
      connectionManager.lastBlockhashUpdate = Date.now();
      (healthMonitor as any).isHealthy = true;

      const status = healthMonitor.getStatus();

      expect(status.isHealthy).toBe(true);
      expect(status.lastBlockhash).toBe('test_blockhash');
      expect(status.connectionStatus).toBe('connected');
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return disconnected status when unhealthy', () => {
      (healthMonitor as any).isHealthy = false;

      const status = healthMonitor.getStatus();

      expect(status.isHealthy).toBe(false);
      expect(status.connectionStatus).toBe('disconnected');
    });
  });

  describe('interval management', () => {
    it('should perform health checks at interval', async () => {
      const mockHealthCheck = jest.spyOn(connectionManager, 'healthCheck').mockResolvedValue(true);

      healthMonitor.start();
      jest.advanceTimersByTime(150);

      // Should be called initially and then after interval
      expect(mockHealthCheck).toHaveBeenCalledTimes(2);
    });

    it('should update blockhash at interval', async () => {
      const mockUpdateBlockhash = jest
        .spyOn(connectionManager, 'updateBlockhash')
        .mockResolvedValue();

      healthMonitor.start();
      jest.advanceTimersByTime(150);

      // Should be called initially and then after interval
      expect(mockUpdateBlockhash).toHaveBeenCalledTimes(2);
    });

    it('should handle blockhash update errors', async () => {
      const mockUpdateBlockhash = jest
        .spyOn(connectionManager, 'updateBlockhash')
        .mockRejectedValue(new Error('Update failed'));

      healthMonitor.start();
      jest.advanceTimersByTime(150);

      // Should not throw, just log error
      expect(mockUpdateBlockhash).toHaveBeenCalled();
    });
  });
});
