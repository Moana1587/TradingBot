import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config/env';
import { PUMPFUN_PROGRAM_ID, PUMPAMM_PROGRAM_ID } from '../config/constants';
import { logger } from '../utils/logger';
import { ConnectionError } from '../utils/errors';
import { TransactionData, TradeEvent, DecodedInstruction } from '../types';
import { TransactionDecoder } from './decoder';

interface SolanaWebSocketTransaction {
  transaction: {
    signatures?: string[];
    message?: {
      instructions?: SolanaInstruction[];
      accountKeys?: (string | { pubkey: string; toString(): string })[];
    };
  };
  slot?: number;
  blockTime?: number | null;
  meta?: {
    preBalances?: number[];
    postBalances?: number[];
    innerInstructions?: SolanaInnerInstructionGroup[];
    logMessages?: string[];
  };
}

interface SolanaInstruction {
  programId: string | { toString(): string };
  accounts?: (string | { toString(): string })[];
  data?: string;
  parsed?: {
    type: string;
    info?: any;
  };
}

interface SolanaInnerInstructionGroup {
  instructions?: SolanaInstruction[];
}

export interface MonitorEvents {
  trade: (event: TradeEvent) => void;
  error: (error: Error) => void;
  connected: () => void;
  disconnected: () => void;
}

export class TransactionMonitor extends EventEmitter {
  private ws: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly pingIntervalMs = 10000;
  private lastMessageTime = Date.now();
  private isConnected = false;
  private readonly targetWalletsSet: Set<string>; // Use Set for O(1) lookups

  constructor(private readonly targetWallets: string[]) {
    super();
    // Convert to Set for faster lookups
    this.targetWalletsSet = new Set(targetWallets);
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.disconnect();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(config.wsEndpoint);

      this.ws.on('open', () => {
        logger.info('TransactionMonitor', 'WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastMessageTime = Date.now();
        this.subscribe();
        this.startPing();
        this.emit('connected');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.lastMessageTime = Date.now();
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        logger.error('TransactionMonitor', 'WebSocket error', error);
        this.emit('error', new ConnectionError('WebSocket error', error));
      });

      this.ws.on('close', () => {
        logger.warn('TransactionMonitor', 'WebSocket closed');
        this.isConnected = false;
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      this.ws.on('pong', () => {
        this.lastMessageTime = Date.now();
      });
    } catch (error) {
      logger.error('TransactionMonitor', 'Failed to create WebSocket', error);
      this.scheduleReconnect();
    }
  }

  private disconnect(): void {
    this.stopPing();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.isConnected = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('TransactionMonitor', 'Max reconnection attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      return; // Already scheduled
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    logger.info(
      'TransactionMonitor',
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.disconnect();
      this.connect();
    }, delay);
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.error('TransactionMonitor', 'WebSocket not open, cannot subscribe');
      return;
    }

    const accountsToMonitor = [...this.targetWallets, PUMPFUN_PROGRAM_ID, PUMPAMM_PROGRAM_ID];

    this.ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'transactionSubscribe',
        params: [
          {
            failed: false,
            accountInclude: accountsToMonitor,
          },
          {
            commitment: config.commitmentLevel,
            encoding: 'jsonParsed',
            transactionDetails: 'full',
            showRewards: false,
            maxSupportedTransactionVersion: 0,
          },
        ],
      }),
    );

    logger.info(
      'TransactionMonitor',
      `Subscribed to ${this.targetWallets.length} wallets and pump programs`,
    );
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const payload = JSON.parse(data.toString());

      if (payload.method === 'transactionNotification' && payload.params?.result) {
        const transaction = payload.params.result.transaction;
        this.processTransaction(transaction);
      } else if (payload.method === 'notification') {
        // Subscription confirmation - only log once
        logger.debug('TransactionMonitor', 'Subscription confirmed');
      }
      // Silently ignore other message types
    } catch (error) {
      logger.error('TransactionMonitor', 'Error handling message', error);
    }
  }

  private processTransaction(transaction: SolanaWebSocketTransaction): void {
    try {
      const signature = transaction.transaction.signatures?.[0] || 'unknown';

      // Fast path: Extract account keys first to check for target wallets early
      const accountKeys =
        transaction.transaction?.message?.accountKeys?.map((k) => {
          if (typeof k === 'string') {
            return k;
          }
          if ('pubkey' in k && typeof k.pubkey === 'string') {
            return k.pubkey;
          }
          return k.toString();
        }) || [];

      // Early exit if no target wallets in transaction (using Set for O(1) lookup)
      const hasTargetWallet = accountKeys.some((key) => this.targetWalletsSet.has(key));
      if (!hasTargetWallet) {
        return; // Skip processing if no target wallets
      }

      const txData: TransactionData = {
        signature,
        slot: transaction.slot || 0,
        blockTime: transaction.blockTime || null,
        instructions: this.extractInstructions(
          transaction.transaction?.message?.instructions || [],
        ),
        innerInstructions: this.extractInnerInstructions(transaction.meta?.innerInstructions || []),
        accountKeys,
      };

      // Reduced logging - only log essential info
      logger.info(
        'TransactionMonitor',
        `Transaction ${signature.slice(0, 8)}... contains target wallet(s)`,
      );

      const events = TransactionDecoder.extractFromTransaction(
        txData,
        this.targetWallets,
        false, // Set verbose to false to reduce logging overhead
        transaction.meta?.logMessages,
      );

      // Process events with minimal logging overhead
      for (const event of events) {
        // Use transaction blockTime if available (convert from seconds to milliseconds)
        // This ensures we use the actual transaction time, not Date.now()
        if (txData.blockTime) {
          event.timestamp = txData.blockTime * 1000;
        }

        // Try to extract amounts from balance changes if available (fastest method)
        if (transaction.meta?.preBalances && transaction.meta?.postBalances) {
          const userIndex = txData.accountKeys.findIndex((key) => key === event.user);
          if (userIndex >= 0) {
            const amounts = TransactionDecoder.extractAmountsFromBalances(
              transaction.meta.preBalances,
              transaction.meta.postBalances,
              txData.accountKeys,
              userIndex,
            );
            event.solAmount = amounts.solAmount;
          }
        }

        // Try to decode from logs (for token amount and liquidity - no API call needed)
        // Always try to decode logs to get liquidity, even if we already have amounts from balance changes
        if (transaction.meta?.logMessages) {
          const logEvent = TransactionDecoder.decodeFromLogs(
            transaction.meta.logMessages,
            txData.accountKeys,
          );
          if (logEvent && logEvent.user === event.user && logEvent.mint === event.mint) {
            // Extract token amount if not available
            if (event.tokenAmount === 0n) {
              event.tokenAmount = logEvent.tokenAmount;
            }
            // Extract SOL amount if not available
            if (event.solAmount === 0n) {
              event.solAmount = logEvent.solAmount;
            }
            // Always extract liquidity from logs if available (no API call needed)
            if (logEvent.liquidity !== undefined) {
              event.liquidity = logEvent.liquidity;
            }
            // Use timestamp from log event if it's available and blockTime wasn't set
            // Log event timestamp is in seconds, convert to milliseconds
            if (!txData.blockTime && logEvent.timestamp) {
              event.timestamp = logEvent.timestamp * 1000;
            }
          }
        }

        // Emit trade event immediately if we have valid amounts
        if (event.solAmount > 0n || event.tokenAmount > 0n) {
          logger.info(
            'TransactionMonitor',
            `Trade detected: ${event.type.toUpperCase()} ${event.mint.slice(0, 8)}... | User: ${event.user.slice(0, 8)}... | SOL: ${(Number(event.solAmount) / 1e9).toFixed(4)} | Tokens: ${event.tokenAmount.toString()}`,
          );
          // Emit synchronously for lowest latency (removed setImmediate wrapper)
          this.emit('trade', event);
        }
      }
    } catch (error) {
      logger.error('TransactionMonitor', 'Error processing transaction', error);
    }
  }

  private extractInstructions(instructions: SolanaInstruction[]): DecodedInstruction[] {
    return instructions.map((ix) => {
      // For jsonParsed encoding, we need to reconstruct the discriminator from the parsed type
      let data = ix.data || '';

      // If we have parsed data but no raw data, we need to get the discriminator from the instruction type
      if (!data && ix.parsed?.type) {
        // We'll handle this in the decoder by checking the parsed type
        // For now, store the parsed type in a special format
        data = `__PARSED__${ix.parsed.type}`;
      }

      return {
        programId: typeof ix.programId === 'string' ? ix.programId : ix.programId.toString(),
        accounts: (ix.accounts || []).map((acc) =>
          typeof acc === 'string' ? acc : acc.toString(),
        ),
        data,
        parsed: ix.parsed,
      };
    });
  }

  private extractInnerInstructions(
    innerInstructions: SolanaInnerInstructionGroup[],
  ): DecodedInstruction[] {
    const result: DecodedInstruction[] = [];
    for (const innerIxGroup of innerInstructions) {
      if (innerIxGroup.instructions) {
        for (const ix of innerIxGroup.instructions) {
          let data = ix.data || '';

          // If we have parsed data but no raw data, store the parsed type
          if (!data && (ix as any).parsed?.type) {
            data = `__PARSED__${(ix as any).parsed.type}`;
          }

          result.push({
            programId: typeof ix.programId === 'string' ? ix.programId : ix.programId.toString(),
            accounts: (ix.accounts || []).map((acc) =>
              typeof acc === 'string' ? acc : acc.toString(),
            ),
            data,
            parsed: (ix as any).parsed,
          });
        }
      }
    }
    return result;
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();

        // Check if connection is stale
        const timeSinceLastMessage = Date.now() - this.lastMessageTime;
        if (timeSinceLastMessage > 30000) {
          logger.warn('TransactionMonitor', 'No messages received in 30s, reconnecting...');
          this.disconnect();
          this.connect();
        }
      }
    }, this.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
