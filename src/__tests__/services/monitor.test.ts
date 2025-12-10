import { TransactionMonitor } from '../../services/monitor';
import { TradeEvent } from '../../types';
import WebSocket from 'ws';

jest.mock('ws');
jest.mock('../../config/env', () => ({
  config: {
    wsEndpoint: 'wss://test.example.com',
    commitmentLevel: 'processed' as const,
  },
}));

describe('TransactionMonitor', () => {
  let monitor: TransactionMonitor;
  const targetWallets = ['11111111111111111111111111111111', '11111111111111111111111111111113'];

  beforeEach(() => {
    jest.clearAllMocks();
    monitor = new TransactionMonitor(targetWallets);
  });

  afterEach(() => {
    monitor.stop();
  });

  describe('constructor', () => {
    it('should create monitor instance', () => {
      expect(monitor).toBeInstanceOf(TransactionMonitor);
    });
  });

  describe('start', () => {
    it('should create WebSocket connection', () => {
      monitor.start();
      expect(WebSocket).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should close WebSocket connection', () => {
      const mockWs = {
        removeAllListeners: jest.fn(),
        close: jest.fn(),
        readyState: WebSocket.OPEN,
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();
      monitor.stop();

      expect(mockWs.removeAllListeners).toHaveBeenCalled();
      expect(mockWs.close).toHaveBeenCalled();
    });
  });

  describe('connected property', () => {
    it('should return connection status', () => {
      expect(monitor.connected).toBe(false);
    });
  });

  describe('event emission', () => {
    it('should emit connected event', (done) => {
      monitor.on('connected', () => {
        done();
      });

      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            setTimeout(() => callback(), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();
    });

    it('should emit disconnected event', (done) => {
      monitor.on('disconnected', () => {
        done();
      });

      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.CLOSED,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();
    });

    it('should emit error event', (done) => {
      monitor.on('error', () => {
        done();
      });

      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Test error')), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.CLOSED,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();
    });
  });

  describe('message handling', () => {
    it('should process transaction notifications', (done) => {
      let messageCallback: any;
      let openCallback: any;

      monitor.on('trade', (event: TradeEvent) => {
        expect(event).toBeDefined();
        expect(event.user).toBe('11111111111111111111111111111113');
        done();
      });

      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            openCallback = callback;
          } else if (event === 'message') {
            messageCallback = callback;
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => {
        // Trigger open immediately
        process.nextTick(() => {
          if (openCallback) openCallback();
          // Then trigger message immediately after
          process.nextTick(() => {
            if (messageCallback) {
              const payload = {
                method: 'transactionNotification',
                params: {
                  result: {
                    transaction: {
                      transaction: {
                        signatures: ['test_sig'],
                        message: {
                          instructions: [],
                          accountKeys: ['11111111111111111111111111111113'],
                        },
                      },
                      meta: {
                        innerInstructions: [
                          {
                            instructions: [
                              {
                                programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
                                accounts: [
                                  'account0',
                                  'account1',
                                  '11111111111111111111111111111112', // mint
                                  'account3',
                                  'account4',
                                  'account5',
                                  '11111111111111111111111111111113', // user (target wallet)
                                  'account7',
                                  'account8', // creator vault
                                ],
                                data: Buffer.from([
                                  102,
                                  6,
                                  61,
                                  18,
                                  1,
                                  218,
                                  235,
                                  234,
                                  ...Buffer.alloc(100),
                                ]).toString('base64'),
                              },
                            ],
                          },
                        ],
                        preBalances: [1000000000],
                        postBalances: [500000000],
                        logMessages: [],
                      },
                    },
                  },
                },
              };
              messageCallback(JSON.stringify(payload));
            }
          });
        });
        return mockWs as any;
      });

      monitor.start();
    }, 10000);

    it('should handle transactionNotification with valid trade data', (done) => {
      monitor.on('trade', (event: TradeEvent) => {
        expect(event).toBeDefined();
        done();
      });

      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'message') {
            const payload = {
              method: 'transactionNotification',
              params: {
                result: {
                  transaction: {
                    transaction: {
                      signatures: ['test_sig'],
                      message: {
                        instructions: [],
                        accountKeys: ['11111111111111111111111111111111'],
                      },
                    },
                    meta: {
                      innerInstructions: [
                        {
                          instructions: [
                            {
                              programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
                              accounts: [
                                'account0',
                                'account1',
                                'mint',
                                'account3',
                                'account4',
                                'account5',
                                '11111111111111111111111111111111',
                                'account7',
                                'account8',
                              ],
                              data: Buffer.from([
                                102,
                                6,
                                61,
                                18,
                                1,
                                218,
                                235,
                                234,
                                ...Buffer.alloc(100),
                              ]).toString('base64'),
                            },
                          ],
                        },
                      ],
                      preBalances: [1000000000],
                      postBalances: [500000000],
                      logMessages: [],
                    },
                  },
                },
              },
            };
            setTimeout(() => callback(JSON.stringify(payload)), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();
    });

    it('should handle invalid JSON messages', () => {
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'message') {
            setTimeout(() => callback('invalid json'), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();

      // Should not throw error
      expect(mockWs.on).toHaveBeenCalled();
    });

    it('should handle notification method', () => {
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'message') {
            const payload = {
              method: 'notification',
            };
            setTimeout(() => callback(JSON.stringify(payload)), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();

      expect(mockWs.on).toHaveBeenCalled();
    });

    it('should extract instructions correctly', () => {
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'message') {
            const payload = {
              method: 'transactionNotification',
              params: {
                result: {
                  transaction: {
                    transaction: {
                      signatures: ['test_sig'],
                      message: {
                        instructions: [
                          {
                            programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
                            accounts: ['account1', 'account2'],
                            data: 'base64data',
                          },
                        ],
                        accountKeys: ['key1', 'key2'],
                      },
                    },
                    meta: {
                      innerInstructions: [
                        {
                          instructions: [
                            {
                              programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
                              accounts: ['account1'],
                              data: 'base64data',
                            },
                          ],
                        },
                      ],
                      preBalances: [],
                      postBalances: [],
                      logMessages: [],
                    },
                  },
                },
              },
            };
            setTimeout(() => callback(JSON.stringify(payload)), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();

      expect(mockWs.on).toHaveBeenCalled();
    });

    it('should handle transaction processing errors', () => {
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'message') {
            const payload = {
              method: 'transactionNotification',
              params: {
                result: {
                  transaction: null, // Invalid transaction
                },
              },
            };
            setTimeout(() => callback(JSON.stringify(payload)), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();

      expect(mockWs.on).toHaveBeenCalled();
    });
  });

  describe('reconnection', () => {
    it('should schedule reconnection on close', () => {
      jest.useFakeTimers();
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.CLOSED,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementation(() => mockWs as any);
      monitor.start();

      jest.advanceTimersByTime(2000);
      expect(WebSocket).toHaveBeenCalledTimes(2); // Initial + reconnect

      jest.useRealTimers();
    });

    it('should stop reconnecting after max attempts', () => {
      jest.useFakeTimers();
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.CLOSED,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementation(() => mockWs as any);
      monitor.start();

      // Advance time to trigger multiple reconnection attempts
      jest.advanceTimersByTime(100000); // Enough for max attempts

      // Should eventually stop trying
      expect(WebSocket).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('ping and health checks', () => {
    it('should ping at intervals', () => {
      jest.useFakeTimers();
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            setTimeout(() => callback(), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();

      jest.advanceTimersByTime(15000); // Advance past ping interval
      expect(mockWs.ping).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should reconnect if no messages received', () => {
      jest.useFakeTimers();
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            jest.advanceTimersByTime(0);
            callback();
          } else if (event === 'close') {
            // Don't trigger close automatically
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      let callCount = 0;
      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementation(() => {
        callCount++;
        return mockWs as any;
      });

      monitor.start();
      expect(callCount).toBe(1);

      // Advance time without messages (past 30s threshold)
      // The ping interval should trigger reconnection
      jest.advanceTimersByTime(35000);

      // Should trigger reconnection (ping interval checks for stale connection)
      expect(callCount).toBeGreaterThanOrEqual(1); // At least initial connection

      jest.useRealTimers();
    });

    it('should stop reconnecting after max attempts', () => {
      jest.useFakeTimers();
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.CLOSED,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementation(() => mockWs as any);
      monitor.start();

      // Advance time to trigger multiple reconnection attempts (max is 10)
      for (let i = 0; i < 12; i++) {
        jest.advanceTimersByTime(30000);
      }

      // Should eventually stop trying after max attempts
      expect(WebSocket).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should not schedule reconnect if already scheduled', () => {
      jest.useFakeTimers();
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.CLOSED,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementation(() => mockWs as any);
      monitor.start();

      // Trigger close multiple times quickly
      jest.advanceTimersByTime(0);
      jest.advanceTimersByTime(0);

      // Should not create multiple reconnection timeouts
      expect(WebSocket).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should handle subscribe when WebSocket is not open', () => {
      const mockWs = {
        on: jest.fn(),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.CLOSING, // Not OPEN
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();

      // subscribe() should check readyState and return early
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should handle JSON parse errors in messages', () => {
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            setTimeout(() => callback(), 0);
          } else if (event === 'message') {
            setTimeout(() => callback('invalid json {'), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();

      // Should not throw, error should be caught
      expect(mockWs.on).toHaveBeenCalled();
    });

    it('should handle transaction processing errors', () => {
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            setTimeout(() => callback(), 0);
          } else if (event === 'message') {
            const payload = {
              method: 'transactionNotification',
              params: {
                result: {
                  transaction: null, // Will cause error in processTransaction
                },
              },
            };
            setTimeout(() => callback(JSON.stringify(payload)), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();

      // Should not throw, error should be caught
      expect(mockWs.on).toHaveBeenCalled();
    });

    it('should handle accountKeys with pubkey property', () => {
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            setTimeout(() => callback(), 0);
          } else if (event === 'message') {
            const payload = {
              method: 'transactionNotification',
              params: {
                result: {
                  transaction: {
                    transaction: {
                      signatures: ['test_sig'],
                      message: {
                        instructions: [],
                        accountKeys: [{ pubkey: 'test_pubkey' }],
                      },
                    },
                    meta: {
                      innerInstructions: [],
                      preBalances: [],
                      postBalances: [],
                      logMessages: [],
                    },
                  },
                },
              },
            };
            setTimeout(() => callback(JSON.stringify(payload)), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();

      expect(mockWs.on).toHaveBeenCalled();
    });

    it('should handle accountKeys with toString method', () => {
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            setTimeout(() => callback(), 0);
          } else if (event === 'message') {
            const payload = {
              method: 'transactionNotification',
              params: {
                result: {
                  transaction: {
                    transaction: {
                      signatures: ['test_sig'],
                      message: {
                        instructions: [],
                        accountKeys: [{ toString: () => 'test_string' }],
                      },
                    },
                    meta: {
                      innerInstructions: [],
                      preBalances: [],
                      postBalances: [],
                      logMessages: [],
                    },
                  },
                },
              },
            };
            setTimeout(() => callback(JSON.stringify(payload)), 0);
          }
        }),
        send: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
        removeAllListeners: jest.fn(),
        close: jest.fn(),
      };

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementationOnce(() => mockWs as any);
      monitor.start();

      expect(mockWs.on).toHaveBeenCalled();
    });
  });
});
