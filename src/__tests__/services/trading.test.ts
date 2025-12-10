import { TradingEngine } from '../../services/trading';
import { TradeEvent } from '../../types';
import { connectionManager } from '../../services/connection';
import { sendTransaction } from '../../utils/transaction';
import { getWsolBalance } from '../../utils/wsol';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from '../../config/constants';

jest.mock('../../config/env', () => {
  const mockConfig = {
    rpcEndpoint: 'https://api.testnet.solana.com',
    wsEndpoint: 'wss://api.testnet.solana.com',
    commitmentLevel: 'processed' as const,
    walletPrivateKey:
      '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek',
    copyPercentage: 1,
    slippageTolerancePercent: 1,
    minTradingAmountSol: 0,
    maxTradingAmountSol: 7,
    targetWallets: ['11111111111111111111111111111111'],
    healthCheckIntervalMs: 30000,
    blockhashUpdateIntervalMs: 60000,
    logLevel: 'info' as const,
    heliusApiKey: 'test-key',
  };
  return {
    config: mockConfig,
  };
});

jest.mock('../../services/connection', () => {
  const mockConnection = {
    getAccountInfo: jest.fn(),
    getBalance: jest.fn(),
    getTokenAccountBalance: jest.fn(),
    getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'test_blockhash' }),
    sendRawTransaction: jest.fn(),
    confirmTransaction: jest.fn(),
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

jest.mock('../../utils/transaction');
jest.mock('../../utils/wsol');

// Mock IDL imports
jest.mock('../../idl', () => ({
  PumpFunIDL: { address: 'test', instructions: [], accounts: [], types: [], events: [] },
  PumpAmmIDL: { address: 'test', instructions: [], accounts: [], types: [], events: [] },
}));

describe('TradingEngine', () => {
  let tradingEngine: TradingEngine;
  let mockConnection: jest.Mocked<any>;

  // Helper to create bonding curve account data
  const createBondingCurveData = (creator: PublicKey): Buffer => {
    const data = Buffer.alloc(8 + 8 * 5 + 1 + 32 + 1); // discriminator + 5 u64 + bool + pubkey + bool
    creator.toBuffer().copy(data, 8 + 8 * 5 + 1); // Copy creator at correct offset
    return data;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      getAccountInfo: jest.fn(),
      getBalance: jest.fn(),
      getTokenAccountBalance: jest.fn(),
    };
    (connectionManager.connection as any) = mockConnection;
    (connectionManager.getBlockhash as jest.Mock) = jest.fn().mockResolvedValue('test_blockhash');
    (connectionManager.wallet as any) = {
      publicKey: new PublicKey('11111111111111111111111111111111'),
    };
    (sendTransaction as jest.Mock) = jest.fn().mockResolvedValue('test_signature');
    (getWsolBalance as jest.Mock) = jest.fn().mockResolvedValue(0n);

    tradingEngine = new TradingEngine();
  });

  describe('constructor', () => {
    it('should initialize programs', () => {
      expect(tradingEngine).toBeInstanceOf(TradingEngine);
    });
  });

  describe('executeTrade', () => {
    it('should execute PumpFun buy trade', async () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      // Mock bonding curve account with creator (first call)
      const creatorPubkey = new PublicKey('11111111111111111111111111111114');
      const bondingCurveData = createBondingCurveData(creatorPubkey);

      mockConnection.getAccountInfo
        .mockResolvedValueOnce({
          owner: TOKEN_PROGRAM,
          data: bondingCurveData,
        })
        .mockResolvedValueOnce({
          owner: TOKEN_PROGRAM,
          data: Buffer.alloc(100),
        });

      // Mock program methods
      (tradingEngine as any).pumpfunProgram = {
        methods: {
          buy: jest.fn().mockReturnValue({
            accountsPartial: jest.fn().mockReturnValue({
              instruction: jest.fn().mockResolvedValue(
                new TransactionInstruction({
                  keys: [],
                  programId: new PublicKey('11111111111111111111111111111111'),
                  data: Buffer.alloc(0),
                }),
              ),
            }),
          }),
        },
      };

      const result = await tradingEngine.executeTrade(event);

      expect(result.success).toBe(true);
      expect(result.signature).toBe('test_signature');
      expect(result.mint).toBe(event.mint);
      expect(result.type).toBe(event.type);
    });

    it('should execute PumpFun sell trade', async () => {
      const event: TradeEvent = {
        type: 'sell',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      // Mock bonding curve account with creator (first call)
      const creatorPubkey = new PublicKey('11111111111111111111111111111114');
      const bondingCurveData = createBondingCurveData(creatorPubkey);

      mockConnection.getAccountInfo
        .mockResolvedValueOnce({
          owner: TOKEN_PROGRAM,
          data: bondingCurveData,
        })
        .mockResolvedValueOnce({
          owner: TOKEN_PROGRAM,
          data: Buffer.alloc(100),
        });

      (tradingEngine as any).pumpfunProgram = {
        methods: {
          sell: jest.fn().mockReturnValue({
            accountsPartial: jest.fn().mockReturnValue({
              instruction: jest.fn().mockResolvedValue(
                new TransactionInstruction({
                  keys: [],
                  programId: new PublicKey('11111111111111111111111111111111'),
                  data: Buffer.alloc(0),
                }),
              ),
            }),
          }),
        },
      };

      const result = await tradingEngine.executeTrade(event);

      expect(result.success).toBe(true);
      expect(result.type).toBe('sell');
    });

    it('should execute PumpAMM buy trade', async () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpamm',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
        pool: '11111111111111111111111111111115',
      };

      mockConnection.getAccountInfo.mockResolvedValue({
        owner: TOKEN_PROGRAM,
        data: Buffer.alloc(100),
      });
      mockConnection.getBalance.mockResolvedValue(10_000_000_000); // 10 SOL

      (tradingEngine as any).pumpammProgram = {
        methods: {
          buy: jest.fn().mockReturnValue({
            accountsPartial: jest.fn().mockReturnValue({
              instruction: jest.fn().mockResolvedValue(
                new TransactionInstruction({
                  keys: [],
                  programId: new PublicKey('11111111111111111111111111111111'),
                  data: Buffer.alloc(0),
                }),
              ),
            }),
          }),
        },
        account: {
          pool: {
            fetch: jest.fn().mockResolvedValue({
              isMayhemMode: false,
              coinCreator: new PublicKey('11111111111111111111111111111114'),
            }),
          },
        },
      };

      const result = await tradingEngine.executeTrade(event);

      expect(result.success).toBe(true);
      expect(result.type).toBe('buy');
    });

    it('should execute PumpAMM sell trade', async () => {
      const event: TradeEvent = {
        type: 'sell',
        protocol: 'pumpamm',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
        pool: '11111111111111111111111111111115',
      };

      mockConnection.getAccountInfo.mockResolvedValue({
        owner: TOKEN_PROGRAM,
        data: Buffer.alloc(100),
      });

      (tradingEngine as any).pumpammProgram = {
        methods: {
          sell: jest.fn().mockReturnValue({
            accountsPartial: jest.fn().mockReturnValue({
              instruction: jest.fn().mockResolvedValue(
                new TransactionInstruction({
                  keys: [],
                  programId: new PublicKey('11111111111111111111111111111111'),
                  data: Buffer.alloc(0),
                }),
              ),
            }),
          }),
        },
        account: {
          pool: {
            fetch: jest.fn().mockResolvedValue({
              isMayhemMode: false,
              coinCreator: new PublicKey('11111111111111111111111111111114'),
            }),
          },
        },
      };

      const result = await tradingEngine.executeTrade(event);

      expect(result.success).toBe(true);
      expect(result.type).toBe('sell');
    });

    it('should handle PumpAMM trade without pool', async () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpamm',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      const result = await tradingEngine.executeTrade(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Pool address is required');
    });

    it('should handle trade errors', async () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      (connectionManager.getBlockhash as jest.Mock) = jest
        .fn()
        .mockRejectedValue(new Error('Network error'));

      const result = await tradingEngine.executeTrade(event);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle unknown protocol', async () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'unknown' as any,
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      const result = await tradingEngine.executeTrade(event);

      expect(result.success).toBe(false);
    });
  });

  describe('getTokenProgramForMint', () => {
    it('should return TOKEN_2022_PROGRAM for new mints', async () => {
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const mint = new PublicKey('11111111111111111111111111111111');
      const result = await (tradingEngine as any).getTokenProgramForMint(mint);

      expect(result).toEqual(TOKEN_2022_PROGRAM);
    });

    it('should return TOKEN_2022_PROGRAM when owner is TOKEN_2022_PROGRAM', async () => {
      mockConnection.getAccountInfo.mockResolvedValue({
        owner: TOKEN_2022_PROGRAM,
        data: Buffer.alloc(100),
      });

      const mint = new PublicKey('11111111111111111111111111111111');
      const result = await (tradingEngine as any).getTokenProgramForMint(mint);

      expect(result).toEqual(TOKEN_2022_PROGRAM);
    });

    it('should return TOKEN_PROGRAM when owner is TOKEN_PROGRAM', async () => {
      mockConnection.getAccountInfo.mockResolvedValue({
        owner: TOKEN_PROGRAM,
        data: Buffer.alloc(100),
      });

      const mint = new PublicKey('11111111111111111111111111111111');
      const result = await (tradingEngine as any).getTokenProgramForMint(mint);

      expect(result).toEqual(TOKEN_PROGRAM);
    });

    it('should default to TOKEN_2022_PROGRAM on error', async () => {
      mockConnection.getAccountInfo.mockRejectedValue(new Error('Network error'));

      const mint = new PublicKey('11111111111111111111111111111111');
      const result = await (tradingEngine as any).getTokenProgramForMint(mint);

      expect(result).toEqual(TOKEN_2022_PROGRAM);
    });
  });

  describe('getFeeRecipientForBondingCurve', () => {
    it('should return mayhem fee recipient for mayhem mode', async () => {
      const mockBondingCurve = Buffer.alloc(82);
      // Create proper bonding curve data with is_mayhem_mode = true
      // Layout after 8-byte discriminator: 5*u64 (40) + bool (1) + pubkey (32) + bool (1) = 74 bytes
      // Total: 8 (discriminator) + 74 = 82 bytes
      // is_mayhem_mode is at byte 81 (after discriminator + 5*u64 + bool + pubkey)
      const discriminatorSize = 8;
      const u64Size = 8;
      const boolSize = 1;
      const pubkeySize = 32;
      const isMayhemModeOffset = discriminatorSize + u64Size * 5 + boolSize + pubkeySize; // = 81
      mockBondingCurve[isMayhemModeOffset] = 1; // is_mayhem_mode = true

      mockConnection.getAccountInfo.mockResolvedValue({
        data: mockBondingCurve,
      });

      const pda = new PublicKey('11111111111111111111111111111113');
      const result = await (tradingEngine as any).getFeeRecipientForBondingCurve(pda);

      expect(result).toBeDefined();
    });

    it('should return default fee recipient for non-mayhem mode', async () => {
      const mockBondingCurve = Buffer.alloc(82);
      const discriminatorSize = 8;
      const u64Size = 8;
      const boolSize = 1;
      const pubkeySize = 32;
      const isMayhemModeOffset = discriminatorSize + u64Size * 5 + boolSize + pubkeySize; // = 81
      mockBondingCurve[isMayhemModeOffset] = 0; // is_mayhem_mode = false

      mockConnection.getAccountInfo.mockResolvedValue({
        data: mockBondingCurve,
      });

      const pda = new PublicKey('11111111111111111111111111111113');
      const result = await (tradingEngine as any).getFeeRecipientForBondingCurve(pda);

      expect(result).toBeDefined();
    });

    it('should return default fee recipient when account is too small', async () => {
      mockConnection.getAccountInfo.mockResolvedValue({
        data: Buffer.alloc(50), // Too small
      });

      const pda = new PublicKey('11111111111111111111111111111113');
      const result = await (tradingEngine as any).getFeeRecipientForBondingCurve(pda);

      expect(result).toBeDefined();
    });

    it('should return default fee recipient on error', async () => {
      mockConnection.getAccountInfo.mockRejectedValue(new Error('Network error'));

      const pda = new PublicKey('11111111111111111111111111111113');
      const result = await (tradingEngine as any).getFeeRecipientForBondingCurve(pda);

      expect(result).toBeDefined();
    });
  });

  describe('getFeeRecipientForPool', () => {
    it('should return mayhem fee recipient for mayhem mode pool', async () => {
      (tradingEngine as any).pumpammProgram = {
        account: {
          pool: {
            fetch: jest.fn().mockResolvedValue({
              isMayhemMode: true,
              coinCreator: new PublicKey('11111111111111111111111111111114'),
            }),
          },
        },
      };

      const poolPDA = new PublicKey('11111111111111111111111111111114');
      const result = await (tradingEngine as any).getFeeRecipientForPool(poolPDA);

      expect(result.feeRecipient).toBeDefined();
      expect(result.feeRecipientTokenAccount).toBeDefined();
    });

    it('should return default fee recipient for non-mayhem mode pool', async () => {
      (tradingEngine as any).pumpammProgram = {
        account: {
          pool: {
            fetch: jest.fn().mockResolvedValue({
              isMayhemMode: false,
              coinCreator: new PublicKey('11111111111111111111111111111114'),
            }),
          },
        },
      };

      const poolPDA = new PublicKey('11111111111111111111111111111114');
      const result = await (tradingEngine as any).getFeeRecipientForPool(poolPDA);

      expect(result.feeRecipient).toBeDefined();
      expect(result.feeRecipientTokenAccount).toBeDefined();
    });

    it('should return default fee recipient when pool fetch fails', async () => {
      (tradingEngine as any).pumpammProgram = {
        account: {
          pool: {
            fetch: jest.fn().mockRejectedValue(new Error('Pool not found')),
          },
        },
      };

      const poolPDA = new PublicKey('11111111111111111111111111111114');
      const result = await (tradingEngine as any).getFeeRecipientForPool(poolPDA);

      expect(result.feeRecipient).toBeDefined();
      expect(result.feeRecipientTokenAccount).toBeDefined();
    });
  });

  describe('executePumpFunTrade', () => {
    it('should close token account when selling all tokens', async () => {
      const event: TradeEvent = {
        type: 'sell',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      // Mock bonding curve account with creator (first call)
      const creatorPubkey = new PublicKey('11111111111111111111111111111114');
      const bondingCurveData = createBondingCurveData(creatorPubkey);

      mockConnection.getAccountInfo
        .mockResolvedValueOnce({
          owner: TOKEN_PROGRAM,
          data: bondingCurveData,
        })
        .mockResolvedValueOnce({
          owner: TOKEN_PROGRAM,
          data: Buffer.alloc(100),
        });

      (tradingEngine as any).pumpfunProgram = {
        methods: {
          sell: jest.fn().mockReturnValue({
            accountsPartial: jest.fn().mockReturnValue({
              instruction: jest.fn().mockResolvedValue(
                new TransactionInstruction({
                  keys: [],
                  programId: new PublicKey('11111111111111111111111111111111'),
                  data: Buffer.alloc(0),
                }),
              ),
            }),
          }),
        },
      };

      // Set copy amount to equal token amount (selling all)
      // Temporarily override copyPercentage
      const { config } = require('../../config/env');
      const originalCopyPercentage = config.copyPercentage;
      config.copyPercentage = 100; // 100% = sell all

      try {
        const result = await tradingEngine.executeTrade(event);
        expect(result.success).toBe(true);
      } finally {
        // Restore original value
        config.copyPercentage = originalCopyPercentage;
      }
    });
  });

  describe('executePumpAmmTrade', () => {
    it('should wrap SOL when WSOL balance is insufficient', async () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpamm',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n, // 1 SOL
        timestamp: Date.now(),
        pool: '11111111111111111111111111111115',
      };

      mockConnection.getAccountInfo.mockResolvedValue({
        owner: TOKEN_PROGRAM,
        data: Buffer.alloc(100),
      });
      mockConnection.getBalance.mockResolvedValue(5_000_000_000); // 5 SOL
      (getWsolBalance as jest.Mock) = jest.fn().mockResolvedValue(100_000_000n); // 0.1 WSOL (insufficient)

      (tradingEngine as any).pumpammProgram = {
        methods: {
          buy: jest.fn().mockReturnValue({
            accountsPartial: jest.fn().mockReturnValue({
              instruction: jest.fn().mockResolvedValue(
                new TransactionInstruction({
                  keys: [],
                  programId: new PublicKey('11111111111111111111111111111111'),
                  data: Buffer.alloc(0),
                }),
              ),
            }),
          }),
        },
        account: {
          pool: {
            fetch: jest.fn().mockResolvedValue({
              isMayhemMode: false,
              coinCreator: new PublicKey('11111111111111111111111111111114'),
            }),
          },
        },
      };

      const result = await tradingEngine.executeTrade(event);

      expect(result.success).toBe(true);
      expect(getWsolBalance).toHaveBeenCalled();
    });

    it('should throw error when insufficient SOL for wrapping', async () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpamm',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 100_000_000_000n, // 100 SOL (with 1% copy = 1 SOL needed)
        timestamp: Date.now(),
        pool: '11111111111111111111111111111115',
      };

      mockConnection.getAccountInfo.mockResolvedValue({
        owner: TOKEN_PROGRAM,
        data: Buffer.alloc(100),
      });
      // Only 0.01 SOL available (10_000_000 lamports), which is less than needed
      // The code uses connectionManager.connection.getBalance
      mockConnection.getBalance.mockResolvedValue(10_000_000); // 0.01 SOL
      (getWsolBalance as jest.Mock) = jest.fn().mockResolvedValue(0n);

      (tradingEngine as any).pumpammProgram = {
        methods: {
          buy: jest.fn().mockReturnValue({
            accountsPartial: jest.fn().mockReturnValue({
              instruction: jest.fn().mockResolvedValue(
                new TransactionInstruction({
                  keys: [],
                  programId: new PublicKey('11111111111111111111111111111111'),
                  data: Buffer.alloc(0),
                }),
              ),
            }),
          }),
        },
        account: {
          pool: {
            fetch: jest.fn().mockResolvedValue({
              isMayhemMode: false,
              coinCreator: new PublicKey('11111111111111111111111111111114'),
            }),
          },
        },
      };

      const result = await tradingEngine.executeTrade(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient SOL balance');
    });

    it('should not wrap SOL when WSOL balance is sufficient', async () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpamm',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1_000_000_000n, // 1 SOL
        timestamp: Date.now(),
        pool: '11111111111111111111111111111115',
      };

      mockConnection.getAccountInfo.mockResolvedValue({
        owner: TOKEN_PROGRAM,
        data: Buffer.alloc(100),
      });
      (getWsolBalance as jest.Mock) = jest.fn().mockResolvedValue(2_000_000_000n); // 2 WSOL (sufficient)

      (tradingEngine as any).pumpammProgram = {
        methods: {
          buy: jest.fn().mockReturnValue({
            accountsPartial: jest.fn().mockReturnValue({
              instruction: jest.fn().mockResolvedValue(
                new TransactionInstruction({
                  keys: [],
                  programId: new PublicKey('11111111111111111111111111111111'),
                  data: Buffer.alloc(0),
                }),
              ),
            }),
          }),
        },
        account: {
          pool: {
            fetch: jest.fn().mockResolvedValue({
              isMayhemMode: false,
              coinCreator: new PublicKey('11111111111111111111111111111114'),
            }),
          },
        },
      };

      const result = await tradingEngine.executeTrade(event);

      expect(result.success).toBe(true);
    });
  });
});
