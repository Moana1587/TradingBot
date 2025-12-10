import { TradeEvent, DecodedInstruction, TransactionData } from '../types';
import { PUMPFUN_PROGRAM_ID, PUMPAMM_PROGRAM_ID } from '../config/constants';
import { logger } from '../utils/logger';
import { struct, u64, bool, publicKey, i64 } from '@coral-xyz/borsh';

// Event layouts
const TradeEventLayout = struct([
  publicKey('mint'),
  u64('sol_amount'),
  u64('token_amount'),
  bool('is_buy'),
  publicKey('user'),
  i64('timestamp'),
  u64('virtual_sol_reserves'),
  u64('virtual_token_reserves'),
  u64('real_sol_reserves'),
  u64('real_token_reserves'),
  publicKey('fee_recipient'),
  u64('fee_basis_points'),
  u64('fee'),
  publicKey('creator'),
  u64('creator_fee_basis_points'),
  u64('creator_fee'),
]);

// BuyEventLayout and SellEventLayout are defined but not used in current implementation
// They can be used for future enhancements to decode event data from logs
// Exported to avoid TypeScript noUnusedLocals error
export const _BuyEventLayout = struct([
  i64('timestamp'),
  u64('base_amount_out'),
  u64('max_quote_amount_in'),
  u64('user_base_token_reserves'),
  u64('user_quote_token_reserves'),
  u64('pool_base_token_reserves'),
  u64('pool_quote_token_reserves'),
  u64('quote_amount_in'),
  u64('lp_fee_basis_points'),
  u64('lp_fee'),
  u64('protocol_fee_basis_points'),
  u64('protocol_fee'),
  u64('quote_amount_in_with_lp_fee'),
  u64('user_quote_amount_in'),
  publicKey('pool'),
  publicKey('user'),
  publicKey('user_base_token_account'),
  publicKey('user_quote_token_account'),
  publicKey('protocol_fee_recipient'),
  publicKey('protocol_fee_recipient_token_account'),
  publicKey('coin_creator'),
  u64('coin_creator_fee_basis_points'),
  u64('coin_creator_fee'),
]);

// Exported to avoid TypeScript noUnusedLocals error
export const _SellEventLayout = struct([
  i64('timestamp'),
  u64('base_amount_in'),
  u64('min_quote_amount_out'),
  u64('user_base_token_reserves'),
  u64('user_quote_token_reserves'),
  u64('pool_base_token_reserves'),
  u64('pool_quote_token_reserves'),
  u64('quote_amount_out'),
  u64('lp_fee_basis_points'),
  u64('lp_fee'),
  u64('protocol_fee_basis_points'),
  u64('protocol_fee'),
  u64('quote_amount_out_without_lp_fee'),
  u64('user_quote_amount_out'),
  publicKey('pool'),
  publicKey('user'),
  publicKey('user_base_token_account'),
  publicKey('user_quote_token_account'),
  publicKey('protocol_fee_recipient'),
  publicKey('protocol_fee_recipient_token_account'),
  publicKey('coin_creator'),
  u64('coin_creator_fee_basis_points'),
  u64('coin_creator_fee'),
]);

export class TransactionDecoder {
  /**
   * Decode transaction logs to extract trade events
   */
  static decodeFromLogs(logs: string[], _accounts: string[]): TradeEvent | null {
    try {
      // Look for PumpFun trade events in logs
      for (const log of logs) {
        if (log.includes('Program data:')) {
          const dataMatch = log.match(/Program data: (.+)/);
          if (dataMatch) {
            try {
              const data = Buffer.from(dataMatch[1], 'base64');
              if (data.length >= 8) {
                // Try to decode as trade event
                const event = TradeEventLayout.decode(data.subarray(8));
                return {
                  type: event.is_buy ? 'buy' : 'sell',
                  protocol: 'pumpfun',
                  mint: event.mint.toString(),
                  user: event.user.toString(),
                  creator: event.creator.toString(),
                  tokenAmount: BigInt(event.token_amount),
                  solAmount: BigInt(event.sol_amount),
                  timestamp: Number(event.timestamp),
                  liquidity: Number(event.real_sol_reserves) / 1_000_000_000, // Extract liquidity from logs (no API call needed)
                };
              }
            } catch {
              // Not a trade event, continue
            }
          }
        }
      }
      return null;
    } catch (error) {
      logger.debug('TransactionDecoder', 'Failed to decode from logs', error);
      return null;
    }
  }

  /**
   * Extract trade events from transaction inner instructions
   */
  static extractFromTransaction(
    tx: TransactionData,
    targetWallets: string[],
    verbose = false,
    logMessages?: string[],
  ): TradeEvent[] {
    const events: TradeEvent[] = [];
    // Convert to Set for O(1) lookups
    const targetWalletsSet = new Set(targetWallets);

    try {
      if (verbose) {
        logger.debug(
          'TransactionDecoder',
          `Extracting events from transaction ${tx.signature.slice(0, 8)}... | Checking ${tx.innerInstructions.length} inner instructions, ${tx.instructions.length} main instructions`,
        );
      }

      // Check inner instructions for PumpFun/PumpAMM instructions
      for (const innerIx of tx.innerInstructions) {
        if (innerIx.programId === PUMPFUN_PROGRAM_ID) {
          if (verbose) {
            logger.debug('TransactionDecoder', 'Found PumpFun inner instruction');
          }
          const event = this.decodePumpFunInstruction(
            innerIx,
            tx.accountKeys,
            targetWalletsSet,
            verbose,
            logMessages,
          );
          if (event) {
            events.push(event);
          }
        } else if (innerIx.programId === PUMPAMM_PROGRAM_ID) {
          if (verbose) {
            logger.debug('TransactionDecoder', 'Found PumpAMM inner instruction');
          }
          const event = this.decodePumpAmmInstruction(
            innerIx,
            tx.accountKeys,
            targetWalletsSet,
            verbose,
          );
          if (event) {
            events.push(event);
          }
        }
      }

      // Also check main instructions
      for (const ix of tx.instructions) {
        if (ix.programId === PUMPFUN_PROGRAM_ID) {
          if (verbose) {
            logger.debug('TransactionDecoder', 'Found PumpFun main instruction');
          }
          const event = this.decodePumpFunInstruction(
            ix,
            tx.accountKeys,
            targetWalletsSet,
            verbose,
            logMessages,
          );
          if (event) {
            events.push(event);
          }
        } else if (ix.programId === PUMPAMM_PROGRAM_ID) {
          if (verbose) {
            logger.debug('TransactionDecoder', 'Found PumpAMM main instruction');
          }
          const event = this.decodePumpAmmInstruction(
            ix,
            tx.accountKeys,
            targetWalletsSet,
            verbose,
          );
          if (event) {
            events.push(event);
          }
        }
      }

      if (verbose) {
        logger.debug('TransactionDecoder', `Extracted ${events.length} trade event(s)`);
      }
    } catch (error) {
      logger.error('TransactionDecoder', 'Error extracting trade events', error);
    }

    return events;
  }

  private static decodePumpFunInstruction(
    instruction: DecodedInstruction,
    _accountKeys: string[],
    targetWallets: Set<string>,
    verbose = false,
    logMessages?: string[],
  ): TradeEvent | null {
    try {
      if (verbose) {
        logger.debug(
          'TransactionDecoder',
          `Decoding PumpFun instruction with ${instruction.accounts.length} accounts`,
        );
      }

      // Extract accounts (mint is typically at index 2, user at index 6)
      if (instruction.accounts.length < 7) {
        if (verbose) {
          logger.debug(
            'TransactionDecoder',
            `Insufficient accounts: ${instruction.accounts.length} < 7`,
          );
        }
        return null;
      }

      const mint = instruction.accounts[2];
      const user = instruction.accounts[6];
      const creatorVault = instruction.accounts[8] || mint; // Fallback to mint if not available

      if (verbose) {
        logger.debug(
          'TransactionDecoder',
          `Extracted accounts: mint=${mint.slice(0, 8)}..., user=${user.slice(0, 8)}..., creator=${creatorVault.slice(0, 8)}...`,
        );
        if (instruction.parsed) {
          logger.debug(
            'TransactionDecoder',
            `Parsed instruction available: type=${instruction.parsed.type}, hasInfo=${!!instruction.parsed.info}`,
          );
        } else if (instruction.data) {
          logger.debug(
            'TransactionDecoder',
            `Raw instruction data: ${instruction.data.slice(0, 20)}... (length: ${instruction.data.length})`,
          );
        }
      }

      // Check if this is a target wallet transaction (using Set for O(1) lookup)
      if (!targetWallets.has(user)) {
        if (verbose) {
          logger.debug(
            'TransactionDecoder',
            `User ${user.slice(0, 8)}... is not in target wallets list`,
          );
        }
        return null;
      }

      // Determine if buy or sell based on instruction data
      // First check if we have parsed instruction data (jsonParsed encoding)
      let isBuy = false;
      let isSell = false;

      if (instruction.parsed?.type) {
        // For jsonParsed encoding, check the instruction type directly
        const instructionType = instruction.parsed.type.toLowerCase();
        isBuy = instructionType === 'buy' || instructionType === 'buyexactsolin';
        isSell = instructionType === 'sell';

        if (verbose) {
          logger.debug(
            'TransactionDecoder',
            `Parsed instruction type: ${instruction.parsed.type} | isBuy: ${isBuy}, isSell: ${isSell}`,
          );
        }
      } else if (instruction.data) {
        // Fall back to checking discriminator from raw data
        // Buy instruction discriminator: [102, 6, 61, 18, 1, 218, 235, 234] (from pump.ts IDL)
        // Sell instruction discriminator: [51, 230, 133, 164, 1, 127, 131, 173] (from pump.ts IDL)
        try {
          const data = Buffer.from(instruction.data, 'base64');
          if (data.length >= 8) {
            const discriminator = Array.from(data.subarray(0, 8));
            // Buy instruction discriminator: [102, 6, 61, 18, 1, 218, 235, 234]
            const buyDiscriminator = [102, 6, 61, 18, 1, 218, 235, 234];
            // Sell instruction discriminator: [51, 230, 133, 164, 1, 127, 131, 173]
            const sellDiscriminator = [51, 230, 133, 164, 1, 127, 131, 173];

            isBuy = discriminator.every((byte, index) => byte === buyDiscriminator[index]);
            isSell = discriminator.every((byte, index) => byte === sellDiscriminator[index]);

            if (verbose) {
              logger.debug(
                'TransactionDecoder',
                `Discriminator: [${discriminator.join(', ')}] | isBuy: ${isBuy}, isSell: ${isSell}`,
              );
            }
          } else {
            if (verbose) {
              logger.debug('TransactionDecoder', `Instruction data too short: ${data.length} < 8`);
            }
            return null;
          }
        } catch (error) {
          if (verbose) {
            logger.debug('TransactionDecoder', `Failed to parse instruction data: ${error}`);
          }
          return null;
        }
      } else {
        if (verbose) {
          logger.debug('TransactionDecoder', 'No instruction data or parsed type available');
        }
        return null;
      }

      // If we still don't have buy/sell, check log messages as fallback
      if (!isBuy && !isSell && logMessages) {
        const logText = logMessages.join(' ');
        if (logText.includes('Instruction: Buy') || logText.includes('Instruction: buy')) {
          isBuy = true;
          if (verbose) {
            logger.debug('TransactionDecoder', 'Detected buy from log messages');
          }
        } else if (logText.includes('Instruction: Sell') || logText.includes('Instruction: sell')) {
          isSell = true;
          if (verbose) {
            logger.debug('TransactionDecoder', 'Detected sell from log messages');
          }
        }
      }

      if (!isBuy && !isSell) {
        // Only log unknown discriminators for target wallets (might be other instruction types)
        const discriminatorInfo = instruction.parsed?.type
          ? `Parsed type: ${instruction.parsed.type}`
          : instruction.data
            ? `Discriminator: [${Array.from(Buffer.from(instruction.data, 'base64').subarray(0, 8)).join(', ')}]`
            : 'No data';
        logger.debug(
          'TransactionDecoder',
          `Unknown instruction type for target wallet ${user.slice(0, 8)}... | ${discriminatorInfo}`,
        );
        return null;
      }

      // Try to extract amounts from instruction data or use defaults
      // For now, we'll need to get amounts from balance changes or logs
      // This is a simplified version - full implementation would parse the instruction args
      const tokenAmount = 0n; // Will be extracted from balance changes
      const solAmount = 0n; // Will be extracted from balance changes

      const event = {
        type: (isBuy ? 'buy' : 'sell') as 'buy' | 'sell',
        protocol: 'pumpfun' as const,
        mint,
        user,
        creator: creatorVault,
        tokenAmount,
        solAmount,
        timestamp: Date.now(),
      };

      logger.info(
        'TransactionDecoder',
        `Detected ${event.type.toUpperCase()} for target wallet ${user.slice(0, 8)}... | Mint: ${mint.slice(0, 8)}... | Protocol: ${event.protocol}`,
      );

      if (verbose) {
        logger.debug(
          'TransactionDecoder',
          `Created ${event.type} event: mint=${mint.slice(0, 8)}..., user=${user.slice(0, 8)}..., creator=${creatorVault.slice(0, 8)}...`,
        );
      }

      return event;
    } catch (error) {
      logger.debug('TransactionDecoder', 'Failed to decode PumpFun instruction', error);
      return null;
    }
  }

  private static decodePumpAmmInstruction(
    instruction: DecodedInstruction,
    _accountKeys: string[],
    targetWallets: Set<string>,
    verbose = false,
  ): TradeEvent | null {
    try {
      if (verbose) {
        logger.debug(
          'TransactionDecoder',
          `Decoding PumpAMM instruction with ${instruction.accounts.length} accounts`,
        );
      }

      if (instruction.accounts.length < 4) {
        if (verbose) {
          logger.debug(
            'TransactionDecoder',
            `Insufficient accounts: ${instruction.accounts.length} < 4`,
          );
        }
        return null;
      }

      const pool = instruction.accounts[0];
      const user = instruction.accounts[1];
      const baseMint = instruction.accounts[3];

      if (verbose) {
        logger.debug(
          'TransactionDecoder',
          `Extracted accounts: pool=${pool.slice(0, 8)}..., user=${user.slice(0, 8)}..., baseMint=${baseMint.slice(0, 8)}...`,
        );
      }

      // Check if this is a target wallet transaction (using Set for O(1) lookup)
      if (!targetWallets.has(user)) {
        if (verbose) {
          logger.debug(
            'TransactionDecoder',
            `User ${user.slice(0, 8)}... is not in target wallets list`,
          );
        }
        return null;
      }

      const data = Buffer.from(instruction.data, 'base64');
      if (data.length < 8) {
        if (verbose) {
          logger.debug('TransactionDecoder', `Instruction data too short: ${data.length} < 8`);
        }
        return null;
      }

      // Buy discriminator: [102, 6, 61, 18, 1, 218, 235, 234]
      // Sell discriminator: [51, 230, 133, 164, 1, 127, 131, 173]
      const discriminator = Array.from(data.subarray(0, 8));
      const isBuy = discriminator[0] === 102 && discriminator[1] === 6;

      if (verbose) {
        logger.debug(
          'TransactionDecoder',
          `Discriminator: [${discriminator.join(', ')}] | isBuy: ${isBuy}`,
        );
      }

      const event = {
        type: (isBuy ? 'buy' : 'sell') as 'buy' | 'sell',
        protocol: 'pumpamm' as const,
        mint: baseMint,
        user,
        creator: baseMint, // Will be fetched from pool account
        tokenAmount: 0n,
        solAmount: 0n,
        timestamp: Date.now(),
        pool,
      };

      logger.info(
        'TransactionDecoder',
        `Detected ${event.type.toUpperCase()} for target wallet ${user.slice(0, 8)}... | Mint: ${baseMint.slice(0, 8)}... | Protocol: ${event.protocol} | Pool: ${pool.slice(0, 8)}...`,
      );

      if (verbose) {
        logger.debug(
          'TransactionDecoder',
          `Created ${event.type} event: pool=${pool.slice(0, 8)}..., mint=${baseMint.slice(0, 8)}..., user=${user.slice(0, 8)}...`,
        );
      }

      return event;
    } catch (error) {
      logger.debug('TransactionDecoder', 'Failed to decode PumpAMM instruction', error);
      return null;
    }
  }

  /**
   * Extract amounts from transaction balance changes
   */
  static extractAmountsFromBalances(
    preBalances: number[],
    postBalances: number[],
    accountKeys: string[],
    userIndex: number,
  ): { solAmount: bigint; tokenAmount: bigint } {
    if (userIndex < 0 || userIndex >= preBalances.length || userIndex >= postBalances.length) {
      logger.debug(
        'TransactionDecoder',
        `Invalid user index: ${userIndex} (preBalances: ${preBalances.length}, postBalances: ${postBalances.length})`,
      );
      return { solAmount: 0n, tokenAmount: 0n };
    }

    const preBalance = preBalances[userIndex] || 0;
    const postBalance = postBalances[userIndex] || 0;
    const balanceChange = postBalance - preBalance;

    // For buys: user SOL decreases (negative change), we want the absolute value
    // For sells: user SOL increases (positive change)
    const solAmount = BigInt(Math.abs(balanceChange));

    logger.debug(
      'TransactionDecoder',
      `Balance change for user at index ${userIndex} (${accountKeys[userIndex]?.slice(0, 8) || 'unknown'}...): ${preBalance} -> ${postBalance} (change: ${balanceChange})`,
    );

    // Token amounts would need to be extracted from token account balance changes
    // This is simplified - full implementation would track token account changes
    return { solAmount, tokenAmount: 0n };
  }
}
