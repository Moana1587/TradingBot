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
import { PublicKey } from '@solana/web3.js';
import { LAMPORTS_PER_SOL } from '../config/constants';
import { getBondingCurvePDA, PUMPFUN_PROGRAM } from '../config/constants';
import { struct, u64, bool, publicKey } from '@coral-xyz/borsh';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from '../config/constants';
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
                    type: 'tradeResult',
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
                    type: 'tradeResult',
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
                        type: 'tradeResult',
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
                // For sell, get actual token balance
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

                let tokenAmount = BigInt(0);
                try {
                    const tokenAccount = await connectionManager.connection.getTokenAccountBalance(walletAta);
                    tokenAmount = BigInt(tokenAccount.value.amount);
                } catch (error) {
                    logger.debug('WebUI', `Token account not found for ${mint.slice(0, 8)}...`);
                }

                if (tokenAmount === BigInt(0)) {
                    ws.send(JSON.stringify({
                        type: 'tradeResult',
                        success: false,
                        error: 'No tokens to sell'
                    }));
                    return;
                }

                tradeEvent = {
                    type: 'sell',
                    protocol: protocol as 'pumpfun' | 'pumpamm',
                    mint: mint,
                    user: connectionManager.wallet.publicKey.toString(),
                    creator: creator,
                    tokenAmount: tokenAmount,
                    solAmount: BigInt(0), // Will be determined by the sell
                    timestamp: Date.now(),
                };
            }

            // Execute the trade
            const result = await tradingEngine.executeTrade(tradeEvent);

            // Send result back to client
            ws.send(JSON.stringify({
                messageType: 'tradeResult',
                ...result
            }));

            // Update position manager
            if (result.success) {
                positionManager.updatePosition(tradeEvent, true);
            }
        } catch (error) {
            logger.error('WebUI', 'Error handling trade request', error);
            ws.send(JSON.stringify({
                type: 'tradeResult',
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

