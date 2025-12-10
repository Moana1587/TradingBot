import { Transaction, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import { connectionManager } from '../services/connection';
import { logger } from './logger';
import { TransactionError } from './errors';

/**
 * Extract meaningful information from transaction errors
 */
function extractTransactionErrorInfo(error: unknown): {
  message: string;
  code?: string;
  logs?: string[];
} {
  const errorObj = error as Record<string, unknown>;

  let message = 'Unknown transaction error';
  let code: string | undefined;
  let logs: string[] | undefined;

  // Extract error message
  if (errorObj.transactionMessage) {
    message = String(errorObj.transactionMessage);
  } else if (errorObj.message) {
    message = String(errorObj.message);
  } else if (error instanceof Error) {
    message = error.message;
  }

  // Extract error code
  if (errorObj.code) {
    code = String(errorObj.code);
  }

  // Extract transaction logs
  if (errorObj.transactionLogs && Array.isArray(errorObj.transactionLogs)) {
    logs = errorObj.transactionLogs as string[];
  }

  return { message, code, logs };
}

/**
 * Send a transaction with retry logic
 * Optimized for low latency - does not wait for confirmation
 */
export async function sendTransaction(
  transaction: Transaction,
  skipPreflight: boolean = true, // Default to true for lower latency
  maxRetries: number = 3,
  waitForConfirmation: boolean = false, // Default to false for lower latency
): Promise<string> {
  try {
    // Get recent blockhash
    const blockhash = await connectionManager.getBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = connectionManager.wallet.publicKey;

    // Sign transaction
    transaction.sign(connectionManager.wallet);

    // Convert to versioned transaction
    const messageV0 = new TransactionMessage({
      payerKey: connectionManager.wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: transaction.instructions,
    }).compileToV0Message();

    const versionedTxn = new VersionedTransaction(messageV0);
    versionedTxn.sign([connectionManager.wallet]);

    // Send with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const signature = await connectionManager.connection.sendRawTransaction(
          versionedTxn.serialize(),
          {
            skipPreflight,
            maxRetries: 0, // We handle retries ourselves
          },
        );

        // Only wait for confirmation if explicitly requested (for lower latency)
        if (waitForConfirmation) {
          await connectionManager.connection.confirmTransaction(signature, 'confirmed');
        }
        return signature;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries - 1) {
          const errorInfo = extractTransactionErrorInfo(error);
          logger.warn(
            'Transaction',
            `Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${attempt + 1}s...`,
            {
              message: errorInfo.message,
              code: errorInfo.code,
              transactionLogs: errorInfo.logs,
            },
          );
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    // Format final error with extracted information
    const errorInfo = extractTransactionErrorInfo(lastError);
    const finalError = new TransactionError(
      `Failed after ${maxRetries} attempts: ${errorInfo.message}`,
      {
        ...errorInfo,
        originalError: lastError,
      },
    );

    throw finalError;
  } catch (error) {
    const errorInfo = extractTransactionErrorInfo(error);
    logger.error('Transaction', 'Transaction failed', {
      message: errorInfo.message,
      code: errorInfo.code,
      transactionLogs: errorInfo.logs,
      originalError: error,
    });
    throw error instanceof TransactionError
      ? error
      : new TransactionError('Transaction failed', error);
  }
}
