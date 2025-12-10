// Test setup file
// Mock environment variables before tests run
process.env.HELIUS_API_KEY = 'test_helius_api_key';
// Valid test keypair private key (generated for testing only)
process.env.WALLET_PRIVATE_KEY =
  '2VpuCTQjcc52QmLjNhe7AYT7DPKbBgn1pNEsjVAVxRPEhzPucY1jY51aLsGJsgmQjjMVAy8LteL7GuZtok8Vd8ek';
process.env.COPY_PERCENTAGE = '1';
process.env.MIN_TRADING_AMOUNT_SOL = '0';
process.env.MAX_TRADING_AMOUNT_SOL = '7';
process.env.SLIPPAGE_TOLERANCE_PERCENT = '1';
// Use valid Solana public keys (32 bytes base58 encoded)
// These are valid test public keys
process.env.TARGET_WALLETS = '11111111111111111111111111111112,11111111111111111111111111111113';
process.env.RPC_ENDPOINT = 'https://api.testnet.solana.com';
process.env.WS_ENDPOINT = 'wss://api.testnet.solana.com';
process.env.COMMITMENT_LEVEL = 'processed';
process.env.HEALTH_CHECK_INTERVAL_MS = '30000';
process.env.BLOCKHASH_UPDATE_INTERVAL_MS = '60000';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Suppress console output during tests unless explicitly testing logging
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
