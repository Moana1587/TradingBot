import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

// Program IDs
export const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPAMM_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const PUMP_FEE_PROGRAM_ID = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');

export const PUMPFUN_PROGRAM = new PublicKey(PUMPFUN_PROGRAM_ID);
export const PUMPAMM_PROGRAM = new PublicKey(PUMPAMM_PROGRAM_ID);

// Token Programs
export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Fee Recipients
export const FEE_RECIPIENT = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');

// Mayhem Mode
export const MAYHEM_PROGRAM_ID = new PublicKey('MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e');
export const MAYHEM_FEE_RECIPIENTS = [
  new PublicKey('GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS'),
  new PublicKey('4budycTjhs9fD6xw62VBducVTNgMgJJ5BgtKq7mAZwn6'),
  new PublicKey('8SBKzEQU4nLSzcwF4a74F2iaUDQyTfjGndn6qUWBnrpR'),
  new PublicKey('4UQeTP1T39KZ9Sfxzo3WR5skgsaP6NZa87BAkuazLEKH'),
  new PublicKey('8sNeir4QsLsJdYpc9RZacohhK1Y5FLU3nC5LXgYB4aa6'),
  new PublicKey('Fh9HmeLNUMVCvejxCtCL2DbYaRyBFVJ5xrWkLnMH6fdk'),
  new PublicKey('463MEnMeGyJekNZFQSTUABBEbLnvMTALbT6ZmsxAbAdq'),
  new PublicKey('6AUH3WEHucYZyC61hqpqYUWVto5qA5hjHuNQ32GNnNxA'),
];

export const getMayhemFeeRecipient = (): PublicKey => {
  return MAYHEM_FEE_RECIPIENTS[Math.floor(Math.random() * MAYHEM_FEE_RECIPIENTS.length)];
};

// PDAs
export function getGlobalPDA(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('global')], programId)[0];
}

export function getBondingCurvePDA(mint: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    programId,
  )[0];
}

export function getCreatorVaultPDA(creator: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    programId,
  )[0];
}

export function getPoolPDA(
  index: number,
  poolAuthority: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  programId: PublicKey,
): PublicKey {
  const indexBuffer = Buffer.allocUnsafe(2);
  indexBuffer.writeUInt16LE(index, 0);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('pool'),
      indexBuffer,
      poolAuthority.toBuffer(),
      baseMint.toBuffer(),
      quoteMint.toBuffer(),
    ],
    programId,
  )[0];
}

export function getPoolAuthorityPDA(mint: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool-authority'), mint.toBuffer()],
    programId,
  )[0];
}

export function getEventAuthorityPDA(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], programId)[0];
}

export function getGlobalConfigPDA(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('global_config')], programId)[0];
}

export function getVolumeAccumulatorPDA(
  isGlobal: boolean,
  user?: PublicKey,
  programId?: PublicKey,
): PublicKey {
  const program = programId || PUMPFUN_PROGRAM;
  if (isGlobal) {
    return PublicKey.findProgramAddressSync([Buffer.from('global_volume_accumulator')], program)[0];
  }
  if (!user) {
    throw new Error('User public key required for user volume accumulator');
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_volume_accumulator'), user.toBuffer()],
    program,
  )[0];
}

export function getFeeConfigPDA(programId: PublicKey, feeProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('fee_config'), programId.toBuffer()],
    feeProgramId,
  )[0];
}

export function getProtocolFeeRecipientTokenAccount(feeRecipient: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(WSOL_MINT, feeRecipient, true);
}

// Constants
export const CANONICAL_POOL_INDEX = 0;
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const MAX_SLIPPAGE_BPS = 10000; // 100%
