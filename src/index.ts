import { config } from './config/env';
import { logger } from './utils/logger';
import { connectionManager } from './services/connection';
import { TransactionMonitor } from './services/monitor';
import { tradingEngine } from './services/trading';
import { positionManager } from './services/positions';
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
      await handleTradeEvent(event);
    });

    monitor.start();

    // Track target wallet balances periodically
    const walletBalanceInterval = setInterval(async () => {
      for (const walletAddress of config.targetWallets) {
        try {
          const publicKey = new PublicKey(walletAddress);
          const balance = await connectionManager.connection.getBalance(publicKey);
          const balanceSol = balance / LAMPORTS_PER_SOL;

          // Broadcast wallet balance update
          webUI.broadcastWalletBalance(walletAddress, balanceSol);
        } catch (error) {
          logger.debug('Main', `Failed to get balance for wallet ${walletAddress.slice(0, 8)}...`, error);
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

async function handleTradeEvent(event: TradeEvent): Promise<void> {
  try {
    const solAmount = Number(event.solAmount) / LAMPORTS_PER_SOL;
    const tokenAmountStr = event.tokenAmount.toString();

    // Check if this is our own trade
    const isOwnTrade = event.user === connectionManager.wallet.publicKey.toString();

    if (isOwnTrade) {
      logger.info('Main', `Own trade detected: ${event.type} ${event.mint.slice(0, 8)}...`);
      positionManager.updatePosition(event, true);
      return;
    }

    // Validate trade amount
    if (solAmount < config.minTradingAmountSol) {
      logger.debug(
        'Main',
        `Skipping trade - amount ${solAmount.toFixed(4)} SOL < minimum ${config.minTradingAmountSol} SOL`,
      );
      return;
    }

    if (event.type === 'buy' && solAmount >= config.maxTradingAmountSol) {
      logger.info(
        'Main',
        `Skipping buy - amount ${solAmount.toFixed(4)} SOL >= maximum ${config.maxTradingAmountSol} SOL`,
      );
      return;
    }

    // Calculate copy amounts
    const copyPercentage = config.copyPercentage;
    const copySolAmount = solAmount * (copyPercentage / 100);
    // const copyTokenAmount = (event.tokenAmount * BigInt(Math.floor(copyPercentage * 100))) / 10000n;

    // Build liquidity info string if available (extracted from WebSocket logs, no API call)
    let liquidityInfo = '';
    if (event.liquidity !== undefined && event.type === 'buy' && event.protocol === 'pumpfun') {
      liquidityInfo = ` | Liquidity: ${event.liquidity.toFixed(4)} SOL`;
    }

    logger.info(
      'Main',
      `Copy trade: ${event.type.toUpperCase()} ${event.mint.slice(0, 8)}... | ` +
      `Target wallet: ${event.user.slice(0, 8)}... | ` +
      `Target: ${solAmount.toFixed(4)} SOL | Copy: ${copySolAmount.toFixed(4)} SOL (${copyPercentage}%) | ` +
      `${tokenAmountStr} tokens${liquidityInfo}`,
    );

    // Calculate buy price when target wallet buys and start tracking
    if (event.type === 'buy' && event.tokenAmount > 0n) {
      const buyPrice = Number(event.solAmount) / Number(event.tokenAmount) / LAMPORTS_PER_SOL;
      const buyLiquidity = event.liquidity; // Use liquidity from trade event if available
      // event.timestamp is already in milliseconds (set in monitor.ts from blockTime)
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
        logger.debug('Main', `Failed to get balance for target wallet ${event.user.slice(0, 8)}...`, error);
      }

      // Start tracking price for this token (real-time via WebSocket)
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
      );
    }

    // Update sell time and price when target wallet sells
    if (event.type === 'sell') {
      // event.timestamp is already in milliseconds (set in monitor.ts from blockTime)
      const sellTime = event.timestamp || Date.now();
      const sellPrice = event.tokenAmount > 0n
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
        logger.debug('Main', `Failed to get balance for target wallet ${event.user.slice(0, 8)}...`, error);
      }

      priceMonitor.updateSellTime(event.mint, sellTime, sellPrice, undefined, undefined, sellLiquidity, balanceAfterSell);
    }

    // Execute trade
    const result = await tradingEngine.executeTrade(event);

    if (result.success) {
      logger.info('Main', `Trade executed successfully: ${result.signature}`);
      // Create a modified event with our copied amounts for position tracking
      const copyPercentage = config.copyPercentage;
      const copyTokenAmount = (event.tokenAmount * BigInt(Math.floor(copyPercentage * 100))) / 10000n;
      const copySolAmount = (event.solAmount * BigInt(Math.floor(copyPercentage * 100))) / 10000n;
      const ourTradeEvent: TradeEvent = {
        ...event,
        user: connectionManager.wallet.publicKey.toString(),
        tokenAmount: copyTokenAmount,
        solAmount: copySolAmount,
      };
      positionManager.updatePosition(ourTradeEvent, false);

      // Calculate and track fees
      const copySolAmountNumber = Number(copySolAmount) / LAMPORTS_PER_SOL;

      if (event.type === 'buy') {
        // Estimate fees for buy transaction
        // Base transaction fee: ~5000 lamports (0.000005 SOL)
        // Priority fee: estimated ~10000 lamports (0.00001 SOL) for fast execution
        // Protocol fees: typically 1-2% of trade amount (using 1.5% as estimate)
        const baseTxFee = 0.000005; // Base transaction fee
        const priorityFee = 0.00001; // Priority fee estimate
        const protocolFeeRate = 0.015; // 1.5% protocol fee estimate
        const protocolFee = copySolAmountNumber * protocolFeeRate;
        const totalBuyFee = baseTxFee + priorityFee + protocolFee;
        const totalBuyAmount = copySolAmountNumber + totalBuyFee;
        const buyTokenAmount = Number(copyTokenAmount);
        const buyPrice = Number(event.solAmount) / Number(event.tokenAmount) / LAMPORTS_PER_SOL; // Price per token

        // Track buy fees and token amounts
        priceMonitor.updateBuyFees(event.mint, totalBuyAmount, totalBuyFee, buyTokenAmount, buyPrice);
      } else if (event.type === 'sell') {
        // Estimate fees for sell transaction
        // Base transaction fee: ~5000 lamports (0.000005 SOL)
        // Priority fee: estimated ~10000 lamports (0.00001 SOL) for fast execution
        // Protocol fees: typically 1-2% of trade amount (using 1.5% as estimate)
        const baseTxFee = 0.000005; // Base transaction fee
        const priorityFee = 0.00001; // Priority fee estimate
        const protocolFeeRate = 0.015; // 1.5% protocol fee estimate
        const sellAmountNumber = Number(copySolAmount) / LAMPORTS_PER_SOL;
        const protocolFee = sellAmountNumber * protocolFeeRate;
        const totalSellFee = baseTxFee + priorityFee + protocolFee;
        const netSellAmount = sellAmountNumber - totalSellFee; // Net amount received after fees

        // Update sell time with fees
        const sellTime = event.timestamp || Date.now();
        const sellPrice = event.tokenAmount > 0n
          ? Number(event.solAmount) / Number(event.tokenAmount) / LAMPORTS_PER_SOL
          : undefined;
        const sellLiquidity = event.liquidity; // Liquidity when target wallet sold
        const sellTokenAmount = Number(copyTokenAmount);

        // Fetch target wallet balance after sell
        let balanceAfterSell: number | undefined;
        try {
          const targetWalletPubkey = new PublicKey(event.user);
          const balance = await connectionManager.connection.getBalance(targetWalletPubkey);
          balanceAfterSell = balance / LAMPORTS_PER_SOL;
        } catch (error) {
          logger.debug('Main', `Failed to get balance for target wallet ${event.user.slice(0, 8)}...`, error);
        }

        // Update sell time with our trade data (token amounts and prices for profit calculation)
        priceMonitor.updateSellTime(event.mint, sellTime, sellPrice, netSellAmount, totalSellFee, sellLiquidity, balanceAfterSell, sellTokenAmount);
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
            'Main',
            `Wallet balance after trade: ${totalBalance.toFixed(4)} SOL (${solBalance.toFixed(4)} SOL + ${wsolBalanceSol.toFixed(4)} WSOL)`,
          );
        } catch (error) {
          logger.warn('Main', 'Failed to get wallet balance after trade', error);
        }
      });
    } else {
      logger.error('Main', `Trade failed: ${result.error}`);
    }
  } catch (error) {
    logger.error('Main', 'Error handling trade event', error);
  }
}

// Start the bot
main().catch((error) => {
  logger.error('Main', 'Fatal error', error);
  process.exit(1);
});
