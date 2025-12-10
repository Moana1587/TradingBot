import {
  PUMPFUN_PROGRAM_ID,
  PUMPAMM_PROGRAM_ID,
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  WSOL_MINT,
  FEE_RECIPIENT,
  MAYHEM_FEE_RECIPIENTS,
  getMayhemFeeRecipient,
  getGlobalPDA,
  getBondingCurvePDA,
  getCreatorVaultPDA,
  getPoolPDA,
  getPoolAuthorityPDA,
  getEventAuthorityPDA,
  getGlobalConfigPDA,
  getVolumeAccumulatorPDA,
  getFeeConfigPDA,
  getProtocolFeeRecipientTokenAccount,
  CANONICAL_POOL_INDEX,
  LAMPORTS_PER_SOL,
  MAX_SLIPPAGE_BPS,
  PUMPFUN_PROGRAM,
  PUMPAMM_PROGRAM,
  PUMP_FEE_PROGRAM_ID,
} from '../../config/constants';
import { PublicKey } from '@solana/web3.js';

describe('Constants', () => {
  describe('Program IDs', () => {
    it('should have correct PumpFun program ID', () => {
      expect(PUMPFUN_PROGRAM_ID).toBe('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
      expect(PUMPFUN_PROGRAM.toString()).toBe(PUMPFUN_PROGRAM_ID);
    });

    it('should have correct PumpAMM program ID', () => {
      expect(PUMPAMM_PROGRAM_ID).toBe('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
      expect(PUMPAMM_PROGRAM.toString()).toBe(PUMPAMM_PROGRAM_ID);
    });

    it('should have correct token programs', () => {
      expect(TOKEN_PROGRAM.toString()).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      expect(TOKEN_2022_PROGRAM.toString()).toBe('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    });

    it('should have correct WSOL mint', () => {
      expect(WSOL_MINT.toString()).toBe('So11111111111111111111111111111111111111112');
    });
  });

  describe('Fee Recipients', () => {
    it('should have correct fee recipient', () => {
      expect(FEE_RECIPIENT.toString()).toBe('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');
    });

    it('should have mayhem fee recipients', () => {
      expect(MAYHEM_FEE_RECIPIENTS.length).toBeGreaterThan(0);
      expect(MAYHEM_FEE_RECIPIENTS[0]).toBeInstanceOf(PublicKey);
    });

    it('should get random mayhem fee recipient', () => {
      const recipient = getMayhemFeeRecipient();
      expect(recipient).toBeInstanceOf(PublicKey);
      expect(MAYHEM_FEE_RECIPIENTS).toContain(recipient);
    });
  });

  describe('PDA Functions', () => {
    const testMint = new PublicKey('11111111111111111111111111111111');
    const testCreator = new PublicKey('11111111111111111111111111111113');

    it('should get global PDA', () => {
      const pda = getGlobalPDA(PUMPFUN_PROGRAM);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should get bonding curve PDA', () => {
      const pda = getBondingCurvePDA(testMint, PUMPFUN_PROGRAM);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should get creator vault PDA', () => {
      const pda = getCreatorVaultPDA(testCreator, PUMPFUN_PROGRAM);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should get pool PDA', () => {
      const poolAuthority = getPoolAuthorityPDA(testMint, PUMPFUN_PROGRAM);
      const pda = getPoolPDA(0, poolAuthority, testMint, WSOL_MINT, PUMPAMM_PROGRAM);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should get pool authority PDA', () => {
      const pda = getPoolAuthorityPDA(testMint, PUMPFUN_PROGRAM);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should get event authority PDA', () => {
      const pda = getEventAuthorityPDA(PUMPFUN_PROGRAM);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should get global config PDA', () => {
      const pda = getGlobalConfigPDA(PUMPAMM_PROGRAM);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should get volume accumulator PDA for global', () => {
      const pda = getVolumeAccumulatorPDA(true, undefined, PUMPFUN_PROGRAM);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should get volume accumulator PDA for user', () => {
      const pda = getVolumeAccumulatorPDA(false, testCreator, PUMPFUN_PROGRAM);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should get volume accumulator PDA with custom programId', () => {
      const pda = getVolumeAccumulatorPDA(true, undefined, PUMPAMM_PROGRAM);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should throw error for user volume accumulator without user', () => {
      expect(() => getVolumeAccumulatorPDA(false, undefined, PUMPFUN_PROGRAM)).toThrow();
    });

    it('should get fee config PDA', () => {
      const pda = getFeeConfigPDA(PUMPFUN_PROGRAM, PUMP_FEE_PROGRAM_ID);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should get protocol fee recipient token account', () => {
      const pda = getProtocolFeeRecipientTokenAccount(FEE_RECIPIENT);
      expect(pda).toBeInstanceOf(PublicKey);
    });
  });

  describe('Constants', () => {
    it('should have correct canonical pool index', () => {
      expect(CANONICAL_POOL_INDEX).toBe(0);
    });

    it('should have correct lamports per SOL', () => {
      expect(LAMPORTS_PER_SOL).toBe(1_000_000_000);
    });

    it('should have correct max slippage BPS', () => {
      expect(MAX_SLIPPAGE_BPS).toBe(10000);
    });
  });
});
