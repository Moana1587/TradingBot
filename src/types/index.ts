import { PublicKey } from '@solana/web3.js';

export type TradeType = 'buy' | 'sell';
export type ProtocolType = 'pumpfun' | 'pumpamm';

export interface TradeEvent {
  type: TradeType;
  protocol: ProtocolType;
  mint: string;
  user: string;
  creator: string;
  tokenAmount: bigint;
  solAmount: bigint;
  timestamp: number;
  pool?: string; // For AMM trades
  liquidity?: number; // Liquidity in SOL (extracted from WebSocket logs, no API call needed)
}

export interface Position {
  mint: PublicKey;
  creator: PublicKey;
  protocol: ProtocolType;
  tokenBalance: bigint;
  totalCostBasis: bigint; // Total SOL spent
  createdAt: number;
  lastTradeAt: number;
  pool?: PublicKey; // For AMM positions
}

export interface DecodedInstruction {
  programId: string;
  accounts: string[];
  data: string;
  innerInstructions?: DecodedInstruction[];
  parsed?: {
    type: string;
    info?: any;
  };
}

export interface TransactionData {
  signature: string;
  slot: number;
  blockTime: number | null;
  instructions: DecodedInstruction[];
  innerInstructions: DecodedInstruction[];
  accountKeys: string[];
}

export interface WalletBalance {
  sol: number;
  wsol: number;
  total: number;
}

export interface HealthStatus {
  isHealthy: boolean;
  lastBlockhash: string | null;
  lastBlockhashTime: number | null;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  uptime: number;
}

export interface TradingConfig {
  copyPercentage: number;
  minTradingAmountSol: number;
  maxTradingAmountSol: number;
  slippageTolerancePercent: number;
}

export interface CopyTradeParams {
  tradeEvent: TradeEvent;
  config: TradingConfig;
}

export interface TradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  mint: string;
  type: TradeType;
}
