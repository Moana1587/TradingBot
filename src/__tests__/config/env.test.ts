describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load configuration', () => {
    process.env.HELIUS_API_KEY = 'test_helius_api_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS =
      '11111111111111111111111111111112,11111111111111111111111111111113';
    process.env.COPY_PERCENTAGE = '1';
    process.env.MIN_TRADING_AMOUNT_SOL = '0';
    process.env.MAX_TRADING_AMOUNT_SOL = '7';
    process.env.SLIPPAGE_TOLERANCE_PERCENT = '1';

    jest.isolateModules(() => {
      const { config } = require('../../config/env');
      expect(config).toBeDefined();
      expect(config.heliusApiKey).toBe('test_helius_api_key');
      expect(config.copyPercentage).toBe(1);
      expect(config.minTradingAmountSol).toBe(0);
      expect(config.maxTradingAmountSol).toBe(7);
      expect(config.slippageTolerancePercent).toBe(1);
      expect(config.targetWallets.length).toBeGreaterThan(0);
    });
  });

  it('should throw error when HELIUS_API_KEY is missing', () => {
    const originalKey = process.env.HELIUS_API_KEY;
    delete process.env.HELIUS_API_KEY;
    jest.isolateModules(() => {
      // Mock dotenv to prevent loading from .env file
      jest.doMock('dotenv', () => ({
        config: jest.fn(),
      }));
      expect(() => {
        require('../../config/env');
      }).toThrow('HELIUS_API_KEY is required');
    });
    if (originalKey) process.env.HELIUS_API_KEY = originalKey;
  });

  it('should throw error when WALLET_PRIVATE_KEY is missing', () => {
    const originalKey = process.env.WALLET_PRIVATE_KEY;
    process.env.HELIUS_API_KEY = 'test_key';
    delete process.env.WALLET_PRIVATE_KEY;
    jest.isolateModules(() => {
      // Mock dotenv to prevent loading from .env file
      jest.doMock('dotenv', () => ({
        config: jest.fn(),
      }));
      expect(() => {
        require('../../config/env');
      }).toThrow('WALLET_PRIVATE_KEY is required');
    });
    if (originalKey) process.env.WALLET_PRIVATE_KEY = originalKey;
  });

  it('should throw error when TARGET_WALLETS is empty', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '';
    jest.isolateModules(() => {
      expect(() => {
        require('../../config/env');
      }).toThrow('At least one TARGET_WALLET is required');
    });
  });

  it('should throw error when TARGET_WALLETS contains invalid address', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = 'invalid_address';
    jest.isolateModules(() => {
      expect(() => {
        require('../../config/env');
      }).toThrow('Invalid target wallet address: invalid_address');
    });
  });

  it('should throw error when COPY_PERCENTAGE is <= 0', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    process.env.COPY_PERCENTAGE = '0';
    jest.isolateModules(() => {
      expect(() => {
        require('../../config/env');
      }).toThrow('COPY_PERCENTAGE must be between 0 and 100');
    });
  });

  it('should throw error when COPY_PERCENTAGE is > 100', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    process.env.COPY_PERCENTAGE = '101';
    jest.isolateModules(() => {
      expect(() => {
        require('../../config/env');
      }).toThrow('COPY_PERCENTAGE must be between 0 and 100');
    });
  });

  it('should throw error when MIN_TRADING_AMOUNT_SOL is < 0', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    process.env.MIN_TRADING_AMOUNT_SOL = '-1';
    jest.isolateModules(() => {
      expect(() => {
        require('../../config/env');
      }).toThrow('MIN_TRADING_AMOUNT_SOL must be >= 0');
    });
  });

  it('should throw error when MAX_TRADING_AMOUNT_SOL <= MIN_TRADING_AMOUNT_SOL', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    process.env.MIN_TRADING_AMOUNT_SOL = '5';
    process.env.MAX_TRADING_AMOUNT_SOL = '5';
    jest.isolateModules(() => {
      expect(() => {
        require('../../config/env');
      }).toThrow('MAX_TRADING_AMOUNT_SOL must be > MIN_TRADING_AMOUNT_SOL');
    });
  });

  it('should throw error when SLIPPAGE_TOLERANCE_PERCENT is < 0', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    process.env.SLIPPAGE_TOLERANCE_PERCENT = '-1';
    jest.isolateModules(() => {
      expect(() => {
        require('../../config/env');
      }).toThrow('SLIPPAGE_TOLERANCE_PERCENT must be between 0 and 100');
    });
  });

  it('should throw error when SLIPPAGE_TOLERANCE_PERCENT is > 100', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    process.env.SLIPPAGE_TOLERANCE_PERCENT = '101';
    jest.isolateModules(() => {
      expect(() => {
        require('../../config/env');
      }).toThrow('SLIPPAGE_TOLERANCE_PERCENT must be between 0 and 100');
    });
  });

  it('should have valid target wallets', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    jest.isolateModules(() => {
      const { config } = require('../../config/env');
      expect(config.targetWallets).toBeInstanceOf(Array);
      expect(config.targetWallets.length).toBeGreaterThan(0);
      config.targetWallets.forEach((wallet: string) => {
        expect(typeof wallet).toBe('string');
        expect(wallet.length).toBeGreaterThan(0);
      });
    });
  });

  it('should have valid RPC endpoints', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    jest.isolateModules(() => {
      const { config } = require('../../config/env');
      expect(config.rpcEndpoint).toBeDefined();
      expect(config.wsEndpoint).toBeDefined();
      expect(typeof config.rpcEndpoint).toBe('string');
      expect(typeof config.wsEndpoint).toBe('string');
    });
  });

  it('should have valid commitment level', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    jest.isolateModules(() => {
      const { config } = require('../../config/env');
      expect(['processed', 'confirmed', 'finalized']).toContain(config.commitmentLevel);
    });
  });

  it('should have valid log level', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    jest.isolateModules(() => {
      const { config } = require('../../config/env');
      expect(['debug', 'info', 'warn', 'error']).toContain(config.logLevel);
    });
  });

  it('should have valid intervals', () => {
    process.env.HELIUS_API_KEY = 'test_key';
    process.env.WALLET_PRIVATE_KEY =
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
    process.env.TARGET_WALLETS = '11111111111111111111111111111112';
    jest.isolateModules(() => {
      const { config } = require('../../config/env');
      expect(config.healthCheckIntervalMs).toBeGreaterThan(0);
      expect(config.blockhashUpdateIntervalMs).toBeGreaterThan(0);
    });
  });
});
