import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import type { PriceUpdateEvent } from './price-monitor';

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

