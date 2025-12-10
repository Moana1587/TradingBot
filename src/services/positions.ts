import { PublicKey } from '@solana/web3.js';
import { Position, TradeEvent } from '../types';
import { logger } from '../utils/logger';

export class PositionManager {
  private positions: Map<string, Position> = new Map();

  /**
   * Update position based on trade event
   */
  updatePosition(event: TradeEvent, _isOwnTrade: boolean): void {
    const mintKey = event.mint;
    const mint = new PublicKey(mintKey);
    const creator = new PublicKey(event.creator);

    let position = this.positions.get(mintKey);

    if (event.type === 'buy') {
      if (!position) {
        // Create new position
        position = {
          mint,
          creator,
          protocol: event.protocol,
          tokenBalance: event.tokenAmount,
          totalCostBasis: event.solAmount,
          createdAt: Date.now(),
          lastTradeAt: Date.now(),
          pool: event.pool ? new PublicKey(event.pool) : undefined,
        };
        this.positions.set(mintKey, position);
        logger.info('PositionManager', `New position opened: ${mintKey.slice(0, 8)}...`);
      } else {
        // Update existing position
        position.tokenBalance += event.tokenAmount;
        position.totalCostBasis += event.solAmount;
        position.lastTradeAt = Date.now();
        logger.debug('PositionManager', `Position updated: ${mintKey.slice(0, 8)}...`);
      }
    } else {
      // Sell
      if (!position) {
        logger.warn(
          'PositionManager',
          `Sell detected for unknown position: ${mintKey.slice(0, 8)}...`,
        );
        return;
      }

      // Calculate proportional cost basis reduction
      // Use bigint arithmetic to avoid precision loss
      const costBasisReduction =
        position.tokenBalance > 0n
          ? (position.totalCostBasis * event.tokenAmount) / position.tokenBalance
          : position.totalCostBasis;

      if (position.tokenBalance <= event.tokenAmount) {
        // Close position
        this.positions.delete(mintKey);
        logger.info('PositionManager', `Position closed: ${mintKey.slice(0, 8)}...`);
      } else {
        // Partial sell
        position.tokenBalance -= event.tokenAmount;
        position.totalCostBasis -= costBasisReduction;
        position.lastTradeAt = Date.now();
        logger.debug('PositionManager', `Position reduced: ${mintKey.slice(0, 8)}...`);
      }
    }
  }

  /**
   * Get all active positions
   */
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get position for a specific mint
   */
  getPosition(mint: string): Position | undefined {
    return this.positions.get(mint);
  }

  /**
   * Check if we have a position for a mint
   */
  hasPosition(mint: string): boolean {
    return this.positions.has(mint);
  }

  /**
   * Get total number of positions
   */
  getPositionCount(): number {
    return this.positions.size;
  }

  /**
   * Clear all positions (useful for testing or reset)
   */
  clear(): void {
    this.positions.clear();
    logger.info('PositionManager', 'All positions cleared');
  }
}

export const positionManager = new PositionManager();
