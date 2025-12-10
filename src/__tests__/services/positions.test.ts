import { PositionManager } from '../../services/positions';
import { TradeEvent } from '../../types';
import { PublicKey } from '@solana/web3.js';

describe('PositionManager', () => {
  let positionManager: PositionManager;

  beforeEach(() => {
    positionManager = new PositionManager();
  });

  describe('updatePosition', () => {
    it('should create new position on buy', () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n, // 1 SOL
        timestamp: Date.now(),
      };

      positionManager.updatePosition(event, false);

      const position = positionManager.getPosition(event.mint);
      expect(position).toBeDefined();
      expect(position?.tokenBalance).toBe(1000n);
      expect(position?.totalCostBasis).toBe(1000000000n);
      expect(position?.protocol).toBe('pumpfun');
    });

    it('should update existing position on buy', () => {
      const event1: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      const event2: TradeEvent = {
        ...event1,
        tokenAmount: 500n,
        solAmount: 500000000n,
      };

      positionManager.updatePosition(event1, false);
      positionManager.updatePosition(event2, false);

      const position = positionManager.getPosition(event1.mint);
      expect(position?.tokenBalance).toBe(1500n);
      expect(position?.totalCostBasis).toBe(1500000000n);
    });

    it('should close position on full sell', () => {
      const buyEvent: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      const sellEvent: TradeEvent = {
        ...buyEvent,
        type: 'sell',
        tokenAmount: 1000n,
      };

      positionManager.updatePosition(buyEvent, false);
      positionManager.updatePosition(sellEvent, false);

      expect(positionManager.hasPosition(buyEvent.mint)).toBe(false);
    });

    it('should reduce position on partial sell', () => {
      const buyEvent: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      const sellEvent: TradeEvent = {
        ...buyEvent,
        type: 'sell',
        tokenAmount: 300n,
      };

      positionManager.updatePosition(buyEvent, false);
      positionManager.updatePosition(sellEvent, false);

      const position = positionManager.getPosition(buyEvent.mint);
      expect(position?.tokenBalance).toBe(700n);
    });

    it('should handle sell for unknown position', () => {
      const sellEvent: TradeEvent = {
        type: 'sell',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      positionManager.updatePosition(sellEvent, false);
      expect(positionManager.hasPosition(sellEvent.mint)).toBe(false);
    });

    it('should handle AMM positions with pool', () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpamm',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
        pool: '11111111111111111111111111111115',
      };

      positionManager.updatePosition(event, false);
      const position = positionManager.getPosition(event.mint);
      expect(position?.protocol).toBe('pumpamm');
      expect(position?.pool).toBeInstanceOf(PublicKey);
    });
  });

  describe('getPositions', () => {
    it('should return all positions', () => {
      const event1: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      const event2: TradeEvent = {
        ...event1,
        mint: '11111111111111111111111111111116',
      };

      positionManager.updatePosition(event1, false);
      positionManager.updatePosition(event2, false);

      const positions = positionManager.getPositions();
      expect(positions.length).toBe(2);
    });

    it('should return empty array when no positions', () => {
      expect(positionManager.getPositions()).toEqual([]);
    });
  });

  describe('getPosition', () => {
    it('should return position for mint', () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      positionManager.updatePosition(event, false);
      const position = positionManager.getPosition(event.mint);
      expect(position).toBeDefined();
    });

    it('should return undefined for unknown mint', () => {
      expect(positionManager.getPosition('unknown')).toBeUndefined();
    });
  });

  describe('hasPosition', () => {
    it('should return true for existing position', () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      positionManager.updatePosition(event, false);
      expect(positionManager.hasPosition(event.mint)).toBe(true);
    });

    it('should return false for non-existent position', () => {
      expect(positionManager.hasPosition('unknown')).toBe(false);
    });
  });

  describe('getPositionCount', () => {
    it('should return correct position count', () => {
      expect(positionManager.getPositionCount()).toBe(0);

      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      positionManager.updatePosition(event, false);
      expect(positionManager.getPositionCount()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all positions', () => {
      const event: TradeEvent = {
        type: 'buy',
        protocol: 'pumpfun',
        mint: '11111111111111111111111111111112',
        user: '11111111111111111111111111111113',
        creator: '11111111111111111111111111111114',
        tokenAmount: 1000n,
        solAmount: 1000000000n,
        timestamp: Date.now(),
      };

      positionManager.updatePosition(event, false);
      expect(positionManager.getPositionCount()).toBe(1);

      positionManager.clear();
      expect(positionManager.getPositionCount()).toBe(0);
    });
  });
});
