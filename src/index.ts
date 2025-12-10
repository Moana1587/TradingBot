import { config } from './config/env';
import { logger } from './utils/logger';
import { connectionManager } from './services/connection';
import { TransactionMonitor } from './services/monitor';
import { healthMonitor } from './services/health';
import { priceMonitor } from './services/price-monitor';
import { webUI } from './services/web-ui';
import { TradeEvent } from './types';
import { LAMPORTS_PER_SOL } from './config/constants';
import { PublicKey } from '@solana/web3.js';
import { getWsolBalance } from './utils/wsol';

// Set logger level from config
logger.setLevel(config.logLevel);

async function main() {
  try {
    logger.info('Main', 'Starting Copy Sniper Bot v2.0');
    logger.info(
      'Main',
      `Configuration: ${config.copyPercentage}% copy, ${config.minTradingAmountSol}-${config.maxTradingAmountSol} SOL range`,
    );

    // Initialize connection
    await connectionManager.updateBlockhash();
    const solBalance = await connectionManager.getBalance();
    const wsolBalance = await getWsolBalance(
      connectionManager.connection,
      connectionManager.wallet.publicKey,
    );
    const wsolBalanceSol = Number(wsolBalance) / LAMPORTS_PER_SOL;
    const totalBalance = solBalance + wsolBalanceSol;
    logger.info(
      'Main',
      `Wallet balance: ${totalBalance.toFixed(4)} SOL (${solBalance.toFixed(4)} SOL + ${wsolBalanceSol.toFixed(4)} WSOL)`,
    );

    if (totalBalance < 0.1) {
      logger.warn('Main', 'Low wallet balance - ensure sufficient SOL for trading');
    }

    // Start health monitoring
    healthMonitor.start();
    healthMonitor.on('unhealthy', () => {
      logger.error('Main', 'Health check failed - connection may be unstable');
    });

    // Start web UI
    webUI.start();

    // Start price monitor
    priceMonitor.start();

    priceMonitor.on('priceUpdate', (event) => {
      const changeSign = event.priceChangePercent >= 0 ? '+' : '';
      const liqChangeSign = event.liquidityChangePercent >= 0 ? '+' : '';

      // Format price with proper precision for very small numbers
      const formatPrice = (price: number): string => {
        if (price === 0) return '0.00000000';
        if (price < 0.00000001) {
          // Use scientific notation for very small numbers
          return price.toExponential(2);
        }
        return price.toFixed(8);
      };

      logger.info(
        'Main',
        `💰 Price Update: ${event.mint.slice(0, 8)}... | ` +
          `Current: ${formatPrice(event.currentPrice)} SOL | ` +
          `Buy: ${formatPrice(event.buyPrice)} SOL | ` +
          `Change: ${changeSign}${event.priceChangePercent.toFixed(2)}% | ` +
          `Liquidity: ${event.currentLiquidity.toFixed(4)} SOL (${liqChangeSign}${event.liquidityChangePercent.toFixed(2)}%)`,
      );

      // Broadcast to web UI
      webUI.broadcastPriceUpdate(event);
    });

    // Create and start transaction monitor
    const monitor = new TransactionMonitor(config.targetWallets);

    monitor.on('connected', () => {
      logger.info('Main', 'Transaction monitor connected');
    });

    monitor.on('disconnected', () => {
      logger.warn('Main', 'Transaction monitor disconnected');
    });

    monitor.on('error', (error) => {
      logger.error('Main', 'Monitor error', error);
    });

    monitor.on('trade', async (event: TradeEvent) => {
      // Track price when target wallet buys
      if (event.type === 'buy' && event.tokenAmount > 0n) {
        const buyPrice = Number(event.solAmount) / Number(event.tokenAmount) / LAMPORTS_PER_SOL;
        const buyLiquidity = event.liquidity; // Use liquidity from trade event if available
        const buyTime = event.timestamp || Date.now();
        const targetBuyPrice = buyPrice; // Price when target wallet bought

        // Fetch target wallet balance and calculate balance before buy
        // Balance before buy = current balance + SOL amount spent
        let balanceBeforeBuy: number | undefined;
        try {
          const targetWalletPubkey = new PublicKey(event.user);
          const currentBalance = await connectionManager.connection.getBalance(targetWalletPubkey);
          const currentBalanceSol = currentBalance / LAMPORTS_PER_SOL;
          const solSpent = Number(event.solAmount) / LAMPORTS_PER_SOL;
          balanceBeforeBuy = currentBalanceSol + solSpent; // Add back the SOL spent to get balance before buy
        } catch (error) {
          logger.debug(
            'Main',
            `Failed to get balance for target wallet ${event.user.slice(0, 8)}...`,
            error,
          );
        }

        // Start tracking price for this token (real-time via WebSocket)
        const targetWalletSolAmount = Number(event.solAmount) / LAMPORTS_PER_SOL;
        await priceMonitor.trackToken(
          event.mint,
          event.protocol,
          buyPrice,
          event.pool,
          buyLiquidity,
          event.user,
          buyTime,
          targetBuyPrice,
          balanceBeforeBuy,
          targetWalletSolAmount, // SOL amount target wallet spent
          event.tokenAmount, // Token amount target wallet bought
        );
      }

      // Update sell time and price when target wallet sells
      if (event.type === 'sell') {
        const sellTime = event.timestamp || Date.now();
        const sellPrice =
          event.tokenAmount > 0n
            ? Number(event.solAmount) / Number(event.tokenAmount) / LAMPORTS_PER_SOL
            : undefined; // Price when target wallet sold
        const sellLiquidity = event.liquidity; // Liquidity when target wallet sold

        // Fetch target wallet balance after sell
        let balanceAfterSell: number | undefined;
        try {
          const targetWalletPubkey = new PublicKey(event.user);
          const balance = await connectionManager.connection.getBalance(targetWalletPubkey);
          balanceAfterSell = balance / LAMPORTS_PER_SOL;
        } catch (error) {
          logger.debug(
            'Main',
            `Failed to get balance for target wallet ${event.user.slice(0, 8)}...`,
            error,
          );
        }

        priceMonitor.updateSellTime(
          event.mint,
          sellTime,
          sellPrice,
          undefined,
          undefined,
          sellLiquidity,
          balanceAfterSell,
        );
      }
    });

    monitor.start();

    // Track bot's own wallet balance and target wallet balances periodically
    const walletBalanceInterval = setInterval(async () => {
      // Track bot's own wallet balance
      try {
        const botBalance = await connectionManager.connection.getBalance(
          connectionManager.wallet.publicKey,
        );
        const botBalanceSol = botBalance / LAMPORTS_PER_SOL;
        webUI.broadcastWalletBalance(
          connectionManager.wallet.publicKey.toString(),
          botBalanceSol,
          true,
        );
      } catch (error) {
        logger.debug('Main', `Failed to get bot wallet balance`, error);
      }

      // Track target wallet balances
      for (const walletAddress of config.targetWallets) {
        try {
          const publicKey = new PublicKey(walletAddress);
          const balance = await connectionManager.connection.getBalance(publicKey);
          const balanceSol = balance / LAMPORTS_PER_SOL;

          // Broadcast wallet balance update
          webUI.broadcastWalletBalance(walletAddress, balanceSol, false);
        } catch (error) {
          logger.debug(
            'Main',
            `Failed to get balance for wallet ${walletAddress.slice(0, 8)}...`,
            error,
          );
        }
      }
    }, 10000); // Update every 10 seconds

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Main', 'Shutting down gracefully...');
      clearInterval(walletBalanceInterval);
      monitor.stop();
      priceMonitor.stop();
      healthMonitor.stop();
      webUI.stop();
      connectionManager.stopBlockhashRefresh();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Main', 'Shutting down gracefully...');
      clearInterval(walletBalanceInterval);
      monitor.stop();
      priceMonitor.stop();
      healthMonitor.stop();
      webUI.stop();
      connectionManager.stopBlockhashRefresh();
      process.exit(0);
    });

    logger.info('Main', 'Bot is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Main', 'Failed to start bot', error);
    process.exit(1);
  }
}

// Start the bot
main().catch((error) => {
  logger.error('Main', 'Fatal error', error);
  process.exit(1);
});
