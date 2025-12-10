import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { PublicKey } from '@solana/web3.js';
import { connectionManager } from './connection';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import {
    PUMPFUN_PROGRAM,
    PUMPAMM_PROGRAM,
    getBondingCurvePDA,
    getPoolPDA,
    getPoolAuthorityPDA,
    CANONICAL_POOL_INDEX,
    WSOL_MINT,
    LAMPORTS_PER_SOL,
} from '../config/constants';
import { struct, u64, bool, publicKey } from '@coral-xyz/borsh';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { PumpAmmIDL } from '../idl';
import type { PumpAmm } from '../idl';

// Bonding curve layout
const BondingCurveLayout = struct([
    u64('virtual_token_reserves'),
    u64('virtual_sol_reserves'),
    u64('real_token_reserves'),
    u64('real_sol_reserves'),
    u64('token_total_supply'),
    bool('complete'),
    publicKey('creator'),
    bool('is_mayhem_mode'),
]);

export interface TrackedToken {
    mint: string;
    protocol: 'pumpfun' | 'pumpamm';
    pool?: string;
    bondingCurveAddress?: string;
    poolAddress?: string;
    buyPrice: number; // Price when target wallet bought (SOL per token)
    buyLiquidity: number; // Liquidity when target wallet bought (SOL)
    buyTime: number;
    targetWallet: string; // Target wallet that bought this token
    targetWalletBuyTime: number; // Timestamp when target wallet bought
    targetWalletBuyPrice: number; // Price when target wallet bought (SOL per token)
    targetWalletBuyLiquidity?: number; // Liquidity when target wallet bought (SOL)
    targetWalletBalanceBeforeBuy?: number; // Target wallet balance before buy transaction (SOL)
    targetWalletSolAmount?: number; // SOL amount target wallet spent on buy
    targetWalletTokenAmount?: bigint; // Token amount target wallet bought
    targetWalletSellTime?: number; // Timestamp when target wallet sold (if sold)
    targetWalletSellPrice?: number; // Price when target wallet sold (SOL per token)
    targetWalletSellLiquidity?: number; // Liquidity when target wallet sold (SOL)
    targetWalletBalanceAfterSell?: number; // Target wallet balance after sell transaction (SOL)
    tokenLaunchTime?: number; // Timestamp when token was created/launched
    ourBuyAmount?: number; // SOL amount we spent on buy
    ourSellAmount?: number; // SOL amount we received on sell
    ourBuyTokenAmount?: number; // Token amount we bought
    ourSellTokenAmount?: number; // Token amount we sold
    ourBuyPrice?: number; // Price per token when we bought
    ourSellPrice?: number; // Price per token when we sold
    buyFee?: number; // Total fees paid for buy (transaction + protocol fees)
    sellFee?: number; // Total fees paid for sell (transaction + protocol fees)
    profit?: number; // Net profit/loss after all fees
    lastPrice: number;
    lastUpdate: number;
    priceChangePercent: number;
    subscriptionId?: number; // WebSocket subscription ID
}

export interface PriceUpdateEvent {
    mint: string;
    currentPrice: number;
    buyPrice: number;
    priceChangePercent: number;
    currentLiquidity: number;
    buyLiquidity: number;
    liquidityChangePercent: number;
    targetWallet: string;
    targetWalletBuyTime: number;
    targetWalletBuyPrice: number;
    targetWalletBuyLiquidity?: number; // Liquidity when target wallet bought (SOL)
    targetWalletBalanceBeforeBuy?: number; // Target wallet balance before buy transaction (SOL)
    targetWalletBuyAmount?: number; // SOL amount target wallet spent on buy
    targetWalletTokenAmount?: string; // Token amount target wallet bought (as string for JSON)
    targetWalletSellTime?: number;
    targetWalletSellPrice?: number;
    targetWalletSellLiquidity?: number; // Liquidity when target wallet sold (SOL)
    targetWalletBalanceAfterSell?: number; // Target wallet balance after sell transaction (SOL)
    tokenLaunchTime?: number; // Timestamp when token was created/launched
    timeSinceLaunch?: number; // Time in milliseconds between token launch and target wallet buy
    ourBuyAmount?: number; // SOL amount we spent on buy
    ourSellAmount?: number; // SOL amount we received on sell
    ourBuyTokenAmount?: number; // Token amount we bought
    ourSellTokenAmount?: number; // Token amount we sold
    ourBuyPrice?: number; // Price per token when we bought
    ourSellPrice?: number; // Price per token when we sold
    buyFee?: number; // Total fees paid for buy (transaction + protocol fees)
    sellFee?: number; // Total fees paid for sell (transaction + protocol fees)
    profit?: number; // Net profit/loss after all fees
    protocol: 'pumpfun' | 'pumpamm';
}

export interface PriceMonitorEvents {
    priceUpdate: (event: PriceUpdateEvent) => void;
    error: (error: Error) => void;
    connected: () => void;
    disconnected: () => void;
}

export class PriceMonitor extends EventEmitter {
    private trackedTokens: Map<string, TrackedToken> = new Map();
    private ws: WebSocket | null = null;
    private pingInterval: NodeJS.Timeout | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 10;
    private readonly pingIntervalMs = 10000;
    private lastMessageTime = Date.now();
    private isConnected = false;
    private subscriptionCounter = 0;
    private subscriptionIdMap: Map<number, string> = new Map(); // subscriptionId -> mint
    private requestIdMap: Map<number, string> = new Map(); // requestId -> mint (temporary, until we get subscription ID)
    private pumpammProgram: Program<PumpAmm>;

    constructor() {
        super();
        const provider = new AnchorProvider(
            connectionManager.connection,
            null as unknown as Wallet,
            {},
        );

        // Initialize PumpAMM program
        const pumpAmmIdlOverride = { ...PumpAmmIDL };
        pumpAmmIdlOverride.address = PUMPAMM_PROGRAM.toString();
        this.pumpammProgram = new Program(pumpAmmIdlOverride as PumpAmm, provider);
    }

    /**
     * Start the price monitor WebSocket connection
     */
    start(): void {
        this.connect();
    }

    /**
     * Stop the price monitor
     */
    stop(): void {
        this.disconnect();
        this.trackedTokens.clear();
        this.subscriptionIdMap.clear();
        this.requestIdMap.clear();
        logger.info('PriceMonitor', 'Price monitor stopped');
    }

    private connect(): void {
        try {
            this.ws = new WebSocket(config.wsEndpoint);

            this.ws.on('open', () => {
                logger.info('PriceMonitor', 'WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.lastMessageTime = Date.now();
                this.startPing();
                this.emit('connected');

                // Resubscribe to all tracked tokens
                this.resubscribeAll();
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                this.lastMessageTime = Date.now();
                this.handleMessage(data);
            });

            this.ws.on('error', (error) => {
                logger.error('PriceMonitor', 'WebSocket error', error);
                this.emit('error', error);
            });

            this.ws.on('close', () => {
                logger.warn('PriceMonitor', 'WebSocket closed');
                this.isConnected = false;
                this.emit('disconnected');
                this.scheduleReconnect();
            });

            this.ws.on('pong', () => {
                this.lastMessageTime = Date.now();
            });
        } catch (error) {
            logger.error('PriceMonitor', 'Failed to create WebSocket', error);
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
            // Unsubscribe from all accounts before closing
            for (const token of this.trackedTokens.values()) {
                if (token.subscriptionId !== undefined) {
                    this.unsubscribe(token.subscriptionId);
                }
            }
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
            logger.error('PriceMonitor', 'Max reconnection attempts reached');
            return;
        }

        if (this.reconnectTimeout) {
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;

        logger.info(
            'PriceMonitor',
            `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
        );

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.disconnect();
            this.connect();
        }, delay);
    }

    private startPing(): void {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();

                const timeSinceLastMessage = Date.now() - this.lastMessageTime;
                if (timeSinceLastMessage > 30000) {
                    logger.warn('PriceMonitor', 'No messages received in 30s, reconnecting...');
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

    private handleMessage(data: WebSocket.Data): void {
        try {
            const payload = JSON.parse(data.toString());

            // Handle account change notifications
            if (payload.method === 'accountNotification' && payload.params?.result) {
                const accountData = payload.params.result;
                const subscriptionId = payload.params.subscription;

                // Find which token this subscription belongs to
                const mint = this.subscriptionIdMap.get(subscriptionId);
                if (mint) {
                    const token = this.trackedTokens.get(mint);
                    if (token) {
                        // Account changed - update price immediately
                        // Account data is in params.result.value.data
                        const accountValue = accountData.value || accountData;
                        this.updatePriceFromAccount(mint, token, accountValue.data).catch((error) => {
                            logger.debug('PriceMonitor', `Error updating price for ${mint.slice(0, 8)}...`, error);
                        });
                    }
                }
            } else if (payload.method === 'notification') {
                // Subscription confirmation
                logger.debug('PriceMonitor', 'Subscription confirmed');
            } else if (payload.id && payload.result && typeof payload.result === 'number') {
                // This is a subscription response with subscription ID
                // Match the request ID to the mint
                const requestId = payload.id;
                const subscriptionId = payload.result;
                const mint = this.requestIdMap.get(requestId);

                if (mint) {
                    const token = this.trackedTokens.get(mint);
                    if (token) {
                        token.subscriptionId = subscriptionId;
                        this.subscriptionIdMap.set(subscriptionId, mint);
                        this.requestIdMap.delete(requestId);
                        logger.debug(
                            'PriceMonitor',
                            `Subscribed to account changes for ${mint.slice(0, 8)}... (subscription: ${subscriptionId})`,
                        );
                    }
                }
            }
        } catch (error) {
            logger.error('PriceMonitor', 'Error handling message', error);
        }
    }

    /**
     * Fetch token launch time by getting the oldest transaction for the mint or bonding curve account
     */
    private async fetchTokenLaunchTime(mint: string, protocol: 'pumpfun' | 'pumpamm', bondingCurveAddress?: string, poolAddress?: string): Promise<number | undefined> {
        try {
            const mintPubkey = new PublicKey(mint);
            let accountToCheck: PublicKey;

            // For pumpfun, check bonding curve account; for pumpamm, check pool account
            if (protocol === 'pumpfun' && bondingCurveAddress) {
                accountToCheck = new PublicKey(bondingCurveAddress);
            } else if (protocol === 'pumpamm' && poolAddress) {
                accountToCheck = new PublicKey(poolAddress);
            } else {
                // Fallback to mint account
                accountToCheck = mintPubkey;
            }

            // Get transactions - start with a batch and paginate to find the oldest
            let oldestSignature: string | null = null;
            let before: string | undefined = undefined;
            const maxAttempts = 5; // Limit pagination attempts to avoid too many API calls
            let attempts = 0;

            // Get initial batch
            let signatures = await connectionManager.connection.getSignaturesForAddress(
                accountToCheck,
                { limit: 1000, before },
                'confirmed',
            );

            if (signatures.length === 0) {
                logger.debug('PriceMonitor', `No transactions found for ${mint.slice(0, 8)}...`);
                return undefined;
            }

            // Keep getting older transactions until we can't get more or hit max attempts
            while (attempts < maxAttempts && signatures.length > 0) {
                const lastSignature = signatures[signatures.length - 1];
                oldestSignature = lastSignature.signature;
                before = lastSignature.signature;

                // Try to get older transactions
                const olderSignatures = await connectionManager.connection.getSignaturesForAddress(
                    accountToCheck,
                    { limit: 1000, before },
                    'confirmed',
                );

                if (olderSignatures.length === 0) {
                    break; // No older transactions, use current oldestSignature
                }

                // Update to the new oldest signature from the older batch
                const newLastSignature = olderSignatures[olderSignatures.length - 1];
                oldestSignature = newLastSignature.signature;
                signatures = olderSignatures;
                attempts++;
            }

            if (!oldestSignature) {
                return undefined;
            }

            // Get the transaction details for the oldest signature
            const transaction = await connectionManager.connection.getTransaction(
                oldestSignature,
                { commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
            );

            if (transaction && transaction.blockTime) {
                // Convert Unix timestamp (seconds) to milliseconds
                const launchTime = transaction.blockTime * 1000;
                logger.debug(
                    'PriceMonitor',
                    `Token launch time for ${mint.slice(0, 8)}...: ${new Date(launchTime).toISOString()}`,
                );
                return launchTime;
            }

            return undefined;
        } catch (error) {
            logger.debug('PriceMonitor', `Error fetching token launch time for ${mint.slice(0, 8)}...`, error);
            return undefined;
        }
    }

    /**
     * Track a token and subscribe to its account changes
     */
    async trackToken(
        mint: string,
        protocol: 'pumpfun' | 'pumpamm',
        buyPrice: number,
        pool?: string,
        buyLiquidity?: number,
        targetWallet?: string,
        targetWalletBuyTime?: number,
        targetWalletBuyPrice?: number,
        targetWalletBalanceBeforeBuy?: number,
        targetWalletSolAmount?: number,
        targetWalletTokenAmount?: bigint,
    ): Promise<void> {
        try {
            const mintPubkey = new PublicKey(mint);
            let bondingCurveAddress: string | undefined;
            let poolAddress: string | undefined;

            if (protocol === 'pumpfun') {
                const bondingCurvePDA = getBondingCurvePDA(mintPubkey, PUMPFUN_PROGRAM);
                bondingCurveAddress = bondingCurvePDA.toString();
            } else {
                const poolAuthorityPDA = getPoolAuthorityPDA(mintPubkey, PUMPFUN_PROGRAM);
                const poolPDA = getPoolPDA(
                    CANONICAL_POOL_INDEX,
                    poolAuthorityPDA,
                    mintPubkey,
                    WSOL_MINT,
                    PUMPAMM_PROGRAM,
                );
                poolAddress = pool ? pool : poolPDA.toString();
            }

            // Fetch token launch time
            const tokenLaunchTime = await this.fetchTokenLaunchTime(mint, protocol, bondingCurveAddress, poolAddress);

            const trackedToken: TrackedToken = {
                mint,
                protocol,
                pool,
                bondingCurveAddress,
                poolAddress,
                buyPrice,
                buyLiquidity: buyLiquidity ?? 0,
                buyTime: Date.now(),
                targetWallet: targetWallet ?? '',
                targetWalletBuyTime: targetWalletBuyTime ?? Date.now(),
                targetWalletBuyPrice: targetWalletBuyPrice ?? buyPrice,
                targetWalletBuyLiquidity: buyLiquidity, // Liquidity when target wallet bought
                targetWalletBalanceBeforeBuy: targetWalletBalanceBeforeBuy, // Balance before buy
                targetWalletSolAmount: targetWalletSolAmount, // SOL amount target wallet spent
                targetWalletTokenAmount: targetWalletTokenAmount, // Token amount target wallet bought
                tokenLaunchTime,
                lastPrice: buyPrice,
                lastUpdate: Date.now(),
                priceChangePercent: 0,
            };

            this.trackedTokens.set(mint, trackedToken);

            // Subscribe to account changes
            if (this.isConnected && this.ws) {
                await this.subscribeToAccount(trackedToken);
            }

            logger.info(
                'PriceMonitor',
                `Started tracking token ${mint.slice(0, 8)}... | Protocol: ${protocol} | Buy Price: ${buyPrice.toFixed(8)} SOL | Buy Liquidity: ${(buyLiquidity ?? 0).toFixed(4)} SOL`,
            );
        } catch (error) {
            logger.error('PriceMonitor', `Error tracking token ${mint.slice(0, 8)}...`, error);
        }
    }

    /**
     * Subscribe to account changes for a token
     */
    private async subscribeToAccount(token: TrackedToken): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const accountAddress = token.bondingCurveAddress || token.poolAddress;
        if (!accountAddress) {
            return;
        }

        const requestId = ++this.subscriptionCounter;

        // Store the request ID to mint mapping temporarily
        // When we get the subscription ID back in handleMessage, we'll update the token
        this.requestIdMap.set(requestId, token.mint);

        this.ws.send(
            JSON.stringify({
                jsonrpc: '2.0',
                id: requestId,
                method: 'accountSubscribe',
                params: [
                    accountAddress,
                    {
                        encoding: 'base64',
                        commitment: config.commitmentLevel,
                    },
                ],
            }),
        );

        logger.debug(
            'PriceMonitor',
            `Subscribing to account changes for ${token.mint.slice(0, 8)}... (${accountAddress.slice(0, 8)}...)`,
        );
    }

    /**
     * Unsubscribe from account
     */
    private unsubscribe(subscriptionId: number): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        this.ws.send(
            JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'accountUnsubscribe',
                params: [subscriptionId],
            }),
        );

        this.subscriptionIdMap.delete(subscriptionId);
    }

    /**
     * Resubscribe to all tracked tokens (after reconnection)
     */
    private resubscribeAll(): void {
        for (const token of this.trackedTokens.values()) {
            // Remove old subscription mapping before resetting
            if (token.subscriptionId !== undefined) {
                this.subscriptionIdMap.delete(token.subscriptionId);
            }
            token.subscriptionId = undefined; // Reset subscription ID
            this.subscribeToAccount(token).catch((error) => {
                logger.error('PriceMonitor', `Error resubscribing to ${token.mint.slice(0, 8)}...`, error);
            });
        }
    }

    /**
     * Update buy fees and token amounts for a tracked token
     */
    updateBuyFees(mint: string, buyAmount: number, buyFee: number, buyTokenAmount?: number, buyPrice?: number): void {
        const token = this.trackedTokens.get(mint);
        if (token) {
            token.ourBuyAmount = buyAmount;
            token.buyFee = buyFee;
            if (buyTokenAmount !== undefined) {
                token.ourBuyTokenAmount = buyTokenAmount;
            }
            if (buyPrice !== undefined) {
                token.ourBuyPrice = buyPrice;
            }
            logger.debug(
                'PriceMonitor',
                `Updated buy fees for ${mint.slice(0, 8)}...: Buy Amount: ${buyAmount.toFixed(6)} SOL, Fees: ${buyFee.toFixed(6)} SOL`,
            );
        }
    }

    /**
     * Update sell time, price, liquidity, fees, and calculate profit for a tracked token
     */
    updateSellTime(mint: string, sellTime: number, sellPrice?: number, sellAmount?: number, sellFee?: number, sellLiquidity?: number, balanceAfterSell?: number, sellTokenAmount?: number): void {
        const token = this.trackedTokens.get(mint);
        if (token) {
            token.targetWalletSellTime = sellTime;
            if (sellPrice !== undefined) {
                token.targetWalletSellPrice = sellPrice;
                // Also set our sell price (same as target wallet since we copy their trade)
                token.ourSellPrice = sellPrice;
            }
            if (sellAmount !== undefined) {
                token.ourSellAmount = sellAmount;
            }
            if (sellFee !== undefined) {
                token.sellFee = sellFee;
            }
            if (sellLiquidity !== undefined) {
                token.targetWalletSellLiquidity = sellLiquidity;
            }
            if (balanceAfterSell !== undefined) {
                token.targetWalletBalanceAfterSell = balanceAfterSell;
            }
            if (sellTokenAmount !== undefined) {
                token.ourSellTokenAmount = sellTokenAmount;
            }

            // Calculate profit/loss: (sell token amount * sell price) - (buy token amount * buy price) - buy fee - sell fee
            if (
                token.ourBuyTokenAmount !== undefined &&
                token.ourSellTokenAmount !== undefined &&
                token.ourBuyPrice !== undefined &&
                token.ourSellPrice !== undefined
            ) {
                const buyValue = token.ourBuyTokenAmount * token.ourBuyPrice;
                const sellValue = token.ourSellTokenAmount * token.ourSellPrice;
                const buyFees = token.buyFee ?? 0;
                const sellFees = token.sellFee ?? 0;
                token.profit = sellValue - buyValue - buyFees - sellFees;
                logger.debug(
                    'PriceMonitor',
                    `Updated sell for ${mint.slice(0, 8)}...: Buy Value: ${buyValue.toFixed(6)} SOL, Sell Value: ${sellValue.toFixed(6)} SOL, Buy Fees: ${buyFees.toFixed(6)} SOL, Sell Fees: ${sellFees.toFixed(6)} SOL, Profit: ${token.profit.toFixed(6)} SOL`,
                );
            }

            logger.debug('PriceMonitor', `Updated sell time for ${mint.slice(0, 8)}...: ${new Date(sellTime).toISOString()}`);
        }
    }

    /**
     * Stop tracking a token
     */
    stopTracking(mint: string): void {
        const token = this.trackedTokens.get(mint);
        if (token) {
            if (token.subscriptionId !== undefined) {
                this.unsubscribe(token.subscriptionId);
            }
            this.trackedTokens.delete(mint);
            logger.info('PriceMonitor', `Stopped tracking token ${mint.slice(0, 8)}...`);
        }
    }

    /**
     * Update price from account data
     */
    private async updatePriceFromAccount(
        mint: string,
        token: TrackedToken,
        accountData?: string | string[],
    ): Promise<void> {
        try {
            let currentPrice: number | null = null;
            let currentLiquidity: number | null = null;

            if (token.protocol === 'pumpfun' && token.bondingCurveAddress) {
                const result = await this.getPumpFunPriceAndLiquidity(accountData);
                currentPrice = result?.price ?? null;
                currentLiquidity = result?.liquidity ?? null;
            } else if (token.protocol === 'pumpamm' && token.poolAddress) {
                currentPrice = await this.getPumpAmmPrice(mint, token.poolAddress);
                // For PumpAMM, liquidity would need to be fetched from pool if needed
                // For now, we'll leave it as null
            }

            if (currentPrice === null) {
                return;
            }

            const priceChangePercent =
                token.buyPrice > 0 ? ((currentPrice - token.buyPrice) / token.buyPrice) * 100 : 0;

            const liquidityChangePercent =
                token.buyLiquidity > 0 && currentLiquidity !== null
                    ? ((currentLiquidity - token.buyLiquidity) / token.buyLiquidity) * 100
                    : 0;

            // Update tracked token
            token.lastPrice = currentPrice;
            token.lastUpdate = Date.now();
            token.priceChangePercent = priceChangePercent;

            // Calculate time since launch if both times are available
            const timeSinceLaunch =
                token.tokenLaunchTime && token.targetWalletBuyTime
                    ? token.targetWalletBuyTime - token.tokenLaunchTime
                    : undefined;

            // Emit price update event
            const updateEvent: PriceUpdateEvent = {
                mint,
                currentPrice,
                buyPrice: token.buyPrice,
                priceChangePercent,
                currentLiquidity: currentLiquidity ?? 0,
                buyLiquidity: token.buyLiquidity,
                liquidityChangePercent,
                targetWallet: token.targetWallet,
                targetWalletBuyTime: token.targetWalletBuyTime,
                targetWalletBuyPrice: token.targetWalletBuyPrice,
                targetWalletBuyLiquidity: token.targetWalletBuyLiquidity,
                targetWalletBalanceBeforeBuy: token.targetWalletBalanceBeforeBuy,
                targetWalletBuyAmount: token.targetWalletSolAmount,
                targetWalletTokenAmount: token.targetWalletTokenAmount?.toString(),
                targetWalletSellTime: token.targetWalletSellTime,
                targetWalletSellPrice: token.targetWalletSellPrice,
                targetWalletSellLiquidity: token.targetWalletSellLiquidity,
                targetWalletBalanceAfterSell: token.targetWalletBalanceAfterSell,
                tokenLaunchTime: token.tokenLaunchTime,
                timeSinceLaunch,
                ourBuyAmount: token.ourBuyAmount,
                ourSellAmount: token.ourSellAmount,
                ourBuyTokenAmount: token.ourBuyTokenAmount,
                ourSellTokenAmount: token.ourSellTokenAmount,
                ourBuyPrice: token.ourBuyPrice,
                ourSellPrice: token.ourSellPrice,
                buyFee: token.buyFee,
                sellFee: token.sellFee,
                profit: token.profit,
                protocol: token.protocol,
            };

            this.emit('priceUpdate', updateEvent);

            // Log price change
            // const changeSign = priceChangePercent >= 0 ? '+' : '';
            // logger.info(
            //     'PriceMonitor',
            //     `💰 Price Update: ${mint.slice(0, 8)}... | ` +
            //     `Current: ${currentPrice.toFixed(8)} SOL | ` +
            //     `Buy: ${token.buyPrice.toFixed(8)} SOL | ` +
            //     `Change: ${changeSign}${priceChangePercent.toFixed(2)}%`,
            // );
        } catch (error) {
            logger.debug('PriceMonitor', `Error updating price for ${mint.slice(0, 8)}...`, error);
        }
    }

    /**
     * Get price and liquidity from PumpFun bonding curve account data
     */
    private async getPumpFunPriceAndLiquidity(accountData?: string | string[]): Promise<{ price: number; liquidity: number } | null> {
        try {
            if (!accountData) {
                return null;
            }

            // Account data comes as base64 string or array of strings
            const dataString = Array.isArray(accountData) ? accountData[0] : accountData;
            if (!dataString) {
                return null;
            }

            const data = Buffer.from(dataString, 'base64');
            if (data.length < 8) {
                return null;
            }

            const bondingCurve = BondingCurveLayout.decode(data.subarray(8));

            if (bondingCurve.virtual_token_reserves === 0n) {
                return null;
            }

            // Price calculation: virtual_sol_reserves / virtual_token_reserves / LAMPORTS_PER_SOL
            // Keep the actual price value (may be very small)
            const price =
                Number(bondingCurve.virtual_sol_reserves) /
                Number(bondingCurve.virtual_token_reserves) /
                LAMPORTS_PER_SOL;

            const liquidity = Number(bondingCurve.real_sol_reserves) / LAMPORTS_PER_SOL;

            return { price, liquidity };
        } catch (error) {
            logger.debug('PriceMonitor', 'Error parsing bonding curve data', error);
            return null;
        }
    }


    /**
     * Get price from PumpAMM pool
     */
    private async getPumpAmmPrice(mint: string, poolAddress: string): Promise<number | null> {
        try {
            const pool = new PublicKey(poolAddress);
            const poolData = await this.pumpammProgram.account.pool.fetch(pool).catch(() => null);

            if (!poolData) {
                return null;
            }

            const [baseBalance, quoteBalance] = await Promise.all([
                connectionManager.connection.getTokenAccountBalance(poolData.poolBaseTokenAccount),
                connectionManager.connection.getTokenAccountBalance(poolData.poolQuoteTokenAccount),
            ]);

            const baseReserves = Number(baseBalance.value.amount);
            const quoteReserves = Number(quoteBalance.value.amount);

            if (baseReserves === 0) {
                return null;
            }

            const price = quoteReserves / baseReserves / LAMPORTS_PER_SOL;
            return price;
        } catch (error) {
            logger.debug('PriceMonitor', `Error getting PumpAMM price for ${mint.slice(0, 8)}...`, error);
            return null;
        }
    }

    /**
     * Get all tracked tokens
     */
    getTrackedTokens(): TrackedToken[] {
        return Array.from(this.trackedTokens.values());
    }

    /**
     * Get tracked token info
     */
    getTrackedToken(mint: string): TrackedToken | undefined {
        return this.trackedTokens.get(mint);
    }
}

export const priceMonitor = new PriceMonitor();

