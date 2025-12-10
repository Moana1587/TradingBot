import dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';

dotenv.config();

interface Config {
  // RPC Configuration
  heliusApiKey: string;
  rpcEndpoint: string;
  wsEndpoint: string;
  commitmentLevel: 'processed' | 'confirmed' | 'finalized';

  // Wallet Configuration
  walletPrivateKey: string;

  // Trading Configuration
  copyPercentage: number;
  minTradingAmountSol: number;
  maxTradingAmountSol: number;
  slippageTolerancePercent: number;

  // Target Wallets
  targetWallets: string[];

  // Health Check Configuration
  healthCheckIntervalMs: number;
  blockhashUpdateIntervalMs: number;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function validateConfig(): Config {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY is required');
  }

  const walletPrivateKey = process.env.WALLET_PRIVATE_KEY;
  if (!walletPrivateKey) {
    throw new Error('WALLET_PRIVATE_KEY is required');
  }

  // Validate target wallets
  const targetWalletsStr = process.env.TARGET_WALLETS || '';
  const targetWallets = targetWalletsStr
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  if (targetWallets.length === 0) {
    throw new Error('At least one TARGET_WALLET is required');
  }

  // Validate wallet addresses
  for (const wallet of targetWallets) {
    try {
      new PublicKey(wallet);
    } catch {
      throw new Error(`Invalid target wallet address: ${wallet}`);
    }
  }

  // Validate trading config
  const copyPercentage = parseFloat(process.env.COPY_PERCENTAGE || '1');
  if (copyPercentage <= 0 || copyPercentage > 100) {
    throw new Error('COPY_PERCENTAGE must be between 0 and 100');
  }

  const minTradingAmountSol = parseFloat(process.env.MIN_TRADING_AMOUNT_SOL || '0');
  const maxTradingAmountSol = parseFloat(process.env.MAX_TRADING_AMOUNT_SOL || '7');
  const slippageTolerancePercent = parseFloat(process.env.SLIPPAGE_TOLERANCE_PERCENT || '1');

  if (minTradingAmountSol < 0) {
    throw new Error('MIN_TRADING_AMOUNT_SOL must be >= 0');
  }

  if (maxTradingAmountSol <= minTradingAmountSol) {
    throw new Error('MAX_TRADING_AMOUNT_SOL must be > MIN_TRADING_AMOUNT_SOL');
  }

  if (slippageTolerancePercent < 0 || slippageTolerancePercent > 100) {
    throw new Error('SLIPPAGE_TOLERANCE_PERCENT must be between 0 and 100');
  }

  return {
    heliusApiKey,
    rpcEndpoint:
      process.env.RPC_ENDPOINT || `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
    wsEndpoint:
      process.env.WS_ENDPOINT || `wss://atlas-mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
    commitmentLevel: (process.env.COMMITMENT_LEVEL as Config['commitmentLevel']) || 'processed',
    walletPrivateKey,
    copyPercentage,
    minTradingAmountSol,
    maxTradingAmountSol,
    slippageTolerancePercent,
    targetWallets,
    healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000', 10),
    blockhashUpdateIntervalMs: parseInt(process.env.BLOCKHASH_UPDATE_INTERVAL_MS || '60000', 10),
    logLevel: (process.env.LOG_LEVEL as Config['logLevel']) || 'info',
  };
}

export const config = validateConfig();
