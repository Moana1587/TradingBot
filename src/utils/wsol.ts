import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from '@solana/spl-token';
import { TOKEN_PROGRAM } from '../config/constants';
import { logger } from './logger';
import { connectionManager } from '../services/connection';
import { sendTransaction } from './transaction';

/**
 * Get WSOL token account balance
 */
export async function getWsolBalance(connection: Connection, owner: PublicKey): Promise<bigint> {
  try {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, owner, true, TOKEN_PROGRAM);
    const balance = await connection.getTokenAccountBalance(wsolAta);
    return BigInt(balance.value.amount);
  } catch {
    // Account doesn't exist or other error
    return 0n;
  }
}

/**
 * Wrap SOL to WSOL
 */
export async function wrapSol(solAmount: bigint, recipient?: PublicKey): Promise<string> {
  const recipientPubKey = recipient || connectionManager.wallet.publicKey;
  const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, recipientPubKey, true, TOKEN_PROGRAM);

  logger.info('WSOL', `Wrapping ${Number(solAmount) / 1e9} SOL for ${recipientPubKey.toString()}`);

  const transaction = new Transaction()
    .add(
      createAssociatedTokenAccountIdempotentInstruction(
        connectionManager.wallet.publicKey,
        wsolAta,
        recipientPubKey,
        NATIVE_MINT,
        TOKEN_PROGRAM,
      ),
    )
    .add(
      SystemProgram.transfer({
        fromPubkey: connectionManager.wallet.publicKey,
        toPubkey: wsolAta,
        lamports: Number(solAmount),
      }),
    )
    .add(createSyncNativeInstruction(wsolAta, TOKEN_PROGRAM));

  const signature = await sendTransaction(transaction);
  logger.info('WSOL', `Successfully wrapped ${Number(solAmount) / 1e9} SOL: ${signature}`);
  return signature;
}
