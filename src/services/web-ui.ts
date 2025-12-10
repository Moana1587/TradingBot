import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import type { PriceUpdateEvent } from './price-monitor';
import { tradingEngine } from './trading';
import { connectionManager } from './connection';
import { positionManager } from './positions';
import { priceMonitor } from './price-monitor';
import { config } from '../config/env';
import { PublicKey } from '@solana/web3.js';
import { LAMPORTS_PER_SOL } from '../config/constants';
import { getBondingCurvePDA, PUMPFUN_PROGRAM } from '../config/constants';
import { struct, u64, bool, publicKey } from '@coral-xyz/borsh';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from '../config/constants';
import { getWsolBalance } from '../utils/wsol';
import type { TradeEvent } from '../types';

// Bonding curve layout for getting creator
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

export class WebUI extends EventEmitter {
    private server: http.Server | null = null;
    private wss: WebSocketServer | null = null;
    private port: number;
    private clients: Set<any> = new Set();

    constructor(port = 3000) {
        super();
        this.port = port;
    }

    start(): void {
        try {
            // Create HTTP server
            this.server = http.createServer((req, res) => {
                if (req.url === '/' || req.url === '/index.html') {
                    // Serve the HTML UI - try multiple possible paths
                    const possiblePaths = [
                        join(__dirname, '../../public/index.html'), // Development
                        join(process.cwd(), 'public/index.html'), // Production from root
                        join(process.cwd(), 'dist/public/index.html'), // Production from dist
                    ];

                    let htmlPath: string | null = null;
                    for (const path of possiblePaths) {
                        if (existsSync(path)) {
                            htmlPath = path;
                            break;
                        }
                    }

                    if (htmlPath) {
                        try {
                            const html = readFileSync(htmlPath, 'utf-8');
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(html);
                        } catch (error) {
                            res.writeHead(500, { 'Content-Type': 'text/plain' });
                            res.end('Error reading UI file');
                        }
                    } else {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('UI file not found. Tried: ' + possiblePaths.join(', '));
                    }
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not found');
                }
            });

            // Create WebSocket server on the same HTTP server
            this.wss = new WebSocketServer({
                server: this.server,
                path: '/ws'
            });

            this.wss.on('connection', (ws) => {
                this.clients.add(ws);
                logger.info('WebUI', `Client connected. Total clients: ${this.clients.size}`);

                ws.on('message', async (message: Buffer) => {
                    try {
                        const data = JSON.parse(message.toString());
                        
                        if (data.type === 'executeTrade') {
                            await this.handleTradeRequest(ws, data.data);
                        }
                    } catch (error) {
                        logger.error('WebUI', 'Error handling WebSocket message', error);
                    }
                });

                ws.on('close', () => {
                    this.clients.delete(ws);
                    logger.info('WebUI', `Client disconnected. Total clients: ${this.clients.size}`);
                });

                ws.on('error', (error) => {
                    logger.error('WebUI', 'WebSocket error', error);
                });
            });

            this.server.listen(this.port, () => {
                logger.info('WebUI', `Web UI server started on http://localhost:${this.port}`);
            });

            this.server.on('error', (error: any) => {
                if (error.code === 'EADDRINUSE') {
                    logger.error('WebUI', `Port ${this.port} is already in use`);
                } else {
                    logger.error('WebUI', 'Server error', error);
                }
            });
        } catch (error) {
            logger.error('WebUI', 'Failed to start web UI', error);
        }
    }

    broadcastPriceUpdate(event: PriceUpdateEvent): void {
        if (this.clients.size === 0) {
            return;
        }

        const message = JSON.stringify({
            type: 'priceUpdate',
            data: event,
            timestamp: Date.now(),
        });

        this.clients.forEach((client) => {
            if (client.readyState === 1) {
                // WebSocket.OPEN
                try {
                    client.send(message);
                } catch (error) {
                    logger.debug('WebUI', 'Error sending message to client', error);
                }
            }
        });
    }

    private async handleTradeRequest(ws: any, tradeData: any): Promise<void> {
        try {
            const { type, protocol, mint, solAmount } = tradeData;

            if (!mint || !protocol) {
                ws.send(JSON.stringify({
                    messageType: 'tradeResult',
                    success: false,
                    error: 'Missing mint or protocol'
                }));
                return;
            }

            // Get creator from bonding curve
            const mintPubkey = new PublicKey(mint);
            const bondingCurvePDA = getBondingCurvePDA(mintPubkey, PUMPFUN_PROGRAM);
            const bondingCurveAccount = await connectionManager.connection.getAccountInfo(bondingCurvePDA);

            if (!bondingCurveAccount) {
                ws.send(JSON.stringify({
                    messageType: 'tradeResult',
                    success: false,
                    error: 'Bonding curve not found'
                }));
                return;
            }

            const bondingCurve = BondingCurveLayout.decode(bondingCurveAccount.data.subarray(8));
            const creator = bondingCurve.creator.toString();

            let tradeEvent: TradeEvent;

            if (type === 'buy') {
                // For buy, we need solAmount
                if (!solAmount) {
                    ws.send(JSON.stringify({
                        messageType: 'tradeResult',
                        success: false,
                        error: 'Missing solAmount for buy'
                    }));
                    return;
                }

                const solAmountLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
                // Estimate token amount - actual amount will be determined by bonding curve
                const estimatedTokenAmount = solAmountLamports; // Placeholder

                tradeEvent = {
                    type: 'buy',
                    protocol: protocol as 'pumpfun' | 'pumpamm',
                    mint: mint,
                    user: connectionManager.wallet.publicKey.toString(),
                    creator: creator,
                    tokenAmount: estimatedTokenAmount,
                    solAmount: solAmountLamports,
                    timestamp: Date.now(),
                };
            } else {
                // For sell, get tracked token information to determine sell amount
                // You can access stored target wallet information using:
                // const trackedToken = priceMonitor.getTrackedToken(mint);
                // Available properties:
                // - trackedToken.targetWalletSolAmount: SOL amount target wallet spent on buy
                // - trackedToken.targetWalletTokenAmount: Token amount target wallet bought
                // - trackedToken.targetWalletBuyPrice: Price per token when target wallet bought
                // - trackedToken.targetWallet: Target wallet address
                // - trackedToken.targetWalletBuyTime: Timestamp when target wallet bought
                const trackedToken = priceMonitor.getTrackedToken(mint);
                
                // Get actual token balance from wallet
                const mintAccountInfo = await connectionManager.connection.getAccountInfo(mintPubkey);
                const tokenProgram = mintAccountInfo?.owner.equals(TOKEN_2022_PROGRAM) 
                    ? TOKEN_2022_PROGRAM 
                    : TOKEN_PROGRAM;

                const walletAta = getAssociatedTokenAddressSync(
                    mintPubkey,
                    connectionManager.wallet.publicKey,
                    true,
                    tokenProgram,
                );

                let actualTokenBalance = BigInt(0);
                try {
                    const tokenAccount = await connectionManager.connection.getTokenAccountBalance(walletAta);
                    actualTokenBalance = BigInt(tokenAccount.value.amount);
                } catch (error) {
                    logger.debug('WebUI', `Token account not found for ${mint.slice(0, 8)}...`);
                }

                if (actualTokenBalance === BigInt(0)) {
                    ws.send(JSON.stringify({
                        messageType: 'tradeResult',
                        success: false,
                        error: 'No tokens to sell'
                    }));
                    return;
                }

                // Determine sell amount: use 1% of target wallet's token amount if available, otherwise sell all
                let sellTokenAmount = actualTokenBalance; // Default: sell all tokens
                
                if (trackedToken?.targetWalletTokenAmount) {
                    // Calculate 1% of target wallet's token amount
                    const targetTokenAmount = trackedToken.targetWalletTokenAmount;
                    const onePercentOfTarget = (targetTokenAmount * BigInt(1)) / BigInt(100);
                    
                    // Use the smaller of: 1% of target amount or actual balance
                    sellTokenAmount = onePercentOfTarget < actualTokenBalance 
                        ? onePercentOfTarget 
                        : actualTokenBalance;
                    
                    logger.info(
                        'WebUI',
                        `Selling ${sellTokenAmount.toString()} tokens (1% of target wallet's ${targetTokenAmount.toString()}, balance: ${actualTokenBalance.toString()})`
                    );
                } else {
                    logger.info(
                        'WebUI',
                        `Target wallet token amount not found, selling all tokens: ${actualTokenBalance.toString()}`
                    );
                }

                tradeEvent = {
                    type: 'sell',
                    protocol: protocol as 'pumpfun' | 'pumpamm',
                    mint: mint,
                    user: connectionManager.wallet.publicKey.toString(),
                    creator: creator,
                    tokenAmount: sellTokenAmount,
                    solAmount: BigInt(0), // Will be determined by the sell
                    timestamp: Date.now(),
                };
            }

            // Use the same logic as handleTradeEvent from index.ts
            const solAmountNumber = Number(tradeEvent.solAmount) / LAMPORTS_PER_SOL;
            const tokenAmountStr = tradeEvent.tokenAmount.toString();

            // Check if this is our own trade (it always is for manual trades)
            const isOwnTrade = tradeEvent.user === connectionManager.wallet.publicKey.toString();

            if (isOwnTrade) {
                logger.info('WebUI', `Own trade detected: ${tradeEvent.type} ${tradeEvent.mint.slice(0, 8)}...`);
                // Will update position after trade execution
            }

            // Validate trade amount
            if (solAmountNumber < config.minTradingAmountSol) {
                ws.send(JSON.stringify({
                    messageType: 'tradeResult',
                    success: false,
                    error: `Amount ${solAmountNumber.toFixed(4)} SOL < minimum ${config.minTradingAmountSol} SOL`
                }));
                return;
            }

            if (tradeEvent.type === 'buy' && solAmountNumber >= config.maxTradingAmountSol) {
                ws.send(JSON.stringify({
                    messageType: 'tradeResult',
                    success: false,
                    error: `Amount ${solAmountNumber.toFixed(4)} SOL >= maximum ${config.maxTradingAmountSol} SOL`
                }));
                return;
            }

            // For manual trades, use the exact amount (no copy percentage)
            logger.info(
                'WebUI',
                `Manual trade: ${tradeEvent.type.toUpperCase()} ${tradeEvent.mint.slice(0, 8)}... | ` +
                `Amount: ${solAmountNumber.toFixed(4)} SOL | ` +
                `${tokenAmountStr} tokens`,
            );

            // Calculate buy price when buying and start tracking
            if (tradeEvent.type === 'buy' && tradeEvent.tokenAmount > 0n) {
                const buyPrice = Number(tradeEvent.solAmount) / Number(tradeEvent.tokenAmount) / LAMPORTS_PER_SOL;
                const buyLiquidity = tradeEvent.liquidity; // Use liquidity from trade event if available
                const buyTime = tradeEvent.timestamp || Date.now();
                const targetBuyPrice = buyPrice; // Price when we bought

                // Start tracking price for this token (real-time via WebSocket)
                await priceMonitor.trackToken(
                    tradeEvent.mint,
                    tradeEvent.protocol,
                    buyPrice,
                    tradeEvent.pool,
                    buyLiquidity,
                    tradeEvent.user,
                    buyTime,
                    targetBuyPrice,
                    undefined, // balanceBeforeBuy - not needed for manual trades
                );
            }

            // Update sell time and price when selling
            if (tradeEvent.type === 'sell') {
                const sellTime = tradeEvent.timestamp || Date.now();
                const sellPrice = tradeEvent.tokenAmount > 0n
                    ? Number(tradeEvent.solAmount) / Number(tradeEvent.tokenAmount) / LAMPORTS_PER_SOL
                    : undefined; // Price when we sold
                const sellLiquidity = tradeEvent.liquidity; // Liquidity when we sold

                priceMonitor.updateSellTime(tradeEvent.mint, sellTime, sellPrice, undefined, undefined, sellLiquidity, undefined);
            }

            // Execute trade
            const result = await tradingEngine.executeTrade(tradeEvent);

            // Send result back to client
            ws.send(JSON.stringify({
                messageType: 'tradeResult',
                ...result
            }));

            if (result.success) {
                logger.info('WebUI', `Trade executed successfully: ${result.signature}`);
                // Update position manager with our trade event
                positionManager.updatePosition(tradeEvent, true);

                // Calculate and track fees
                const tradeSolAmountNumber = Number(tradeEvent.solAmount) / LAMPORTS_PER_SOL;

                if (tradeEvent.type === 'buy') {
                    // Estimate fees for buy transaction
                    // Base transaction fee: ~5000 lamports (0.000005 SOL)
                    // Priority fee: estimated ~10000 lamports (0.00001 SOL) for fast execution
                    // Protocol fees: typically 1-2% of trade amount (using 1.5% as estimate)
                    const baseTxFee = 0.000005; // Base transaction fee
                    const priorityFee = 0.00001; // Priority fee estimate
                    const protocolFeeRate = 0.015; // 1.5% protocol fee estimate
                    const protocolFee = tradeSolAmountNumber * protocolFeeRate;
                    const totalBuyFee = baseTxFee + priorityFee + protocolFee;
                    const totalBuyAmount = tradeSolAmountNumber + totalBuyFee;
                    const buyTokenAmount = Number(tradeEvent.tokenAmount);
                    const buyPrice = Number(tradeEvent.solAmount) / Number(tradeEvent.tokenAmount) / LAMPORTS_PER_SOL; // Price per token

                    // Track buy fees and token amounts
                    priceMonitor.updateBuyFees(tradeEvent.mint, totalBuyAmount, totalBuyFee, buyTokenAmount, buyPrice);
                } else if (tradeEvent.type === 'sell') {
                    // Estimate fees for sell transaction
                    // Base transaction fee: ~5000 lamports (0.000005 SOL)
                    // Priority fee: estimated ~10000 lamports (0.00001 SOL) for fast execution
                    // Protocol fees: typically 1-2% of trade amount (using 1.5% as estimate)
                    const baseTxFee = 0.000005; // Base transaction fee
                    const priorityFee = 0.00001; // Priority fee estimate
                    const protocolFeeRate = 0.015; // 1.5% protocol fee estimate
                    const sellAmountNumber = Number(tradeEvent.solAmount) / LAMPORTS_PER_SOL;
                    const protocolFee = sellAmountNumber * protocolFeeRate;
                    const totalSellFee = baseTxFee + priorityFee + protocolFee;
                    const netSellAmount = sellAmountNumber - totalSellFee; // Net amount received after fees

                    // Update sell time with fees
                    const sellTime = tradeEvent.timestamp || Date.now();
                    const sellPrice = tradeEvent.tokenAmount > 0n
                        ? Number(tradeEvent.solAmount) / Number(tradeEvent.tokenAmount) / LAMPORTS_PER_SOL
                        : undefined;
                    const sellLiquidity = tradeEvent.liquidity; // Liquidity when we sold
                    const sellTokenAmount = Number(tradeEvent.tokenAmount);

                    // Update sell time with our trade data (token amounts and prices for profit calculation)
                    priceMonitor.updateSellTime(tradeEvent.mint, sellTime, sellPrice, netSellAmount, totalSellFee, sellLiquidity, undefined, sellTokenAmount);
                }

                // Log wallet balance asynchronously (non-blocking) after successful trade
                // Using setImmediate to defer execution so it doesn't block the main flow
                setImmediate(async () => {
                    try {
                        const solBalance = await connectionManager.getBalance();
                        const wsolBalance = await getWsolBalance(
                            connectionManager.connection,
                            connectionManager.wallet.publicKey,
                        );
                        const wsolBalanceSol = Number(wsolBalance) / LAMPORTS_PER_SOL;
                        const totalBalance = solBalance + wsolBalanceSol;
                        logger.info(
                            'WebUI',
                            `Wallet balance after trade: ${totalBalance.toFixed(4)} SOL (${solBalance.toFixed(4)} SOL + ${wsolBalanceSol.toFixed(4)} WSOL)`,
                        );
                    } catch (error) {
                        logger.warn('WebUI', 'Failed to get wallet balance after trade', error);
                    }
                });
            } else {
                logger.error('WebUI', `Trade failed: ${result.error}`);
            }
        } catch (error) {
            logger.error('WebUI', 'Error handling trade request', error);
            ws.send(JSON.stringify({
                messageType: 'tradeResult',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }));
        }
    }

    broadcastWalletBalance(wallet: string, balance: number, isBotWallet: boolean = false): void {
        if (this.clients.size === 0) {
            return;
        }

        const message = JSON.stringify({
            type: 'walletBalance',
            data: {
                wallet,
                balance,
                isBotWallet,
            },
            timestamp: Date.now(),
        });

        this.clients.forEach((client) => {
            if (client.readyState === 1) {
                // WebSocket.OPEN
                try {
                    client.send(message);
                } catch (error) {
                    logger.debug('WebUI', 'Error sending wallet balance to client', error);
                }
            }
        });
    }

    stop(): void {
        if (this.wss) {
            this.clients.forEach((client) => {
                client.close();
            });
            this.clients.clear();
            this.wss.close();
            this.wss = null;
        }

        if (this.server) {
            this.server.close();
            this.server = null;
        }

        logger.info('WebUI', 'Web UI server stopped');
    }
}

export const webUI = new WebUI(3000);

