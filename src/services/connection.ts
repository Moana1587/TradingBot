import { Connection, Keypair } from '@solana/web3.js';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { ConnectionError } from '../utils/errors';
import bs58 from 'bs58';

export class ConnectionManager {
  public readonly connection: Connection;
  public readonly wallet: Keypair;
  public currentBlockhash: string | null = null;
  public lastBlockhashUpdate: number = 0;
  private blockhashRefreshInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.connection = new Connection(config.rpcEndpoint, {
      commitment: config.commitmentLevel,
      wsEndpoint: config.wsEndpoint,
    });

    try {
      this.wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
      logger.info('ConnectionManager', `Wallet loaded: ${this.wallet.publicKey.toString()}`);
    } catch (error) {
      throw new ConnectionError('Failed to load wallet from private key', error);
    }

    // Start background blockhash refresh for lower latency
    this.startBlockhashRefresh();
  }

  async updateBlockhash(): Promise<void> {
    try {
      const { blockhash } = await this.connection.getLatestBlockhash(config.commitmentLevel);
      this.currentBlockhash = blockhash;
      this.lastBlockhashUpdate = Date.now();
      logger.debug('ConnectionManager', `Blockhash updated: ${blockhash.slice(0, 8)}...`);
    } catch (error) {
      logger.error('ConnectionManager', 'Failed to update blockhash', error);
      throw new ConnectionError('Failed to update blockhash', error);
    }
  }

  async getBlockhash(): Promise<string> {
    const now = Date.now();
    const blockhashAge = now - this.lastBlockhashUpdate;

    // Update blockhash if it's older than 30 seconds (fallback if background refresh fails)
    if (!this.currentBlockhash || blockhashAge > 30_000) {
      await this.updateBlockhash();
    }

    if (!this.currentBlockhash) {
      throw new ConnectionError('Blockhash is not available');
    }

    return this.currentBlockhash;
  }

  /**
   * Start background blockhash refresh to keep it fresh and reduce latency
   */
  private startBlockhashRefresh(): void {
    // Refresh blockhash every 20 seconds to keep it fresh (blockhash is valid for ~60s)
    this.blockhashRefreshInterval = setInterval(async () => {
      try {
        await this.updateBlockhash();
      } catch (error) {
        logger.warn('ConnectionManager', 'Background blockhash refresh failed', error);
      }
    }, 20_000);
  }

  /**
   * Stop background blockhash refresh
   */
  stopBlockhashRefresh(): void {
    if (this.blockhashRefreshInterval) {
      clearInterval(this.blockhashRefreshInterval);
      this.blockhashRefreshInterval = null;
    }
  }

  async getBalance(): Promise<number> {
    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      return balance / 1_000_000_000; // Convert lamports to SOL
    } catch (error) {
      logger.error('ConnectionManager', 'Failed to get balance', error);
      throw new ConnectionError('Failed to get balance', error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const slot = await this.connection.getSlot();
      return slot > 0;
    } catch (error) {
      logger.error('ConnectionManager', 'Health check failed', error);
      return false;
    }
  }
}

export const connectionManager = new ConnectionManager();
