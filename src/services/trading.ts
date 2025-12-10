import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { connectionManager } from './connection';
import { config } from '../config/env';
import {
  PUMPFUN_PROGRAM,
  PUMPAMM_PROGRAM,
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  WSOL_MINT,
  FEE_RECIPIENT,
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
  PUMP_FEE_PROGRAM_ID,
  getProtocolFeeRecipientTokenAccount,
  CANONICAL_POOL_INDEX,
  LAMPORTS_PER_SOL,
} from '../config/constants';
import { logger } from '../utils/logger';
import { TradeEvent, TradeResult } from '../types';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { struct, u64, bool, publicKey } from '@coral-xyz/borsh';
import { PumpFunIDL, PumpAmmIDL } from '../idl';
import type { PumpFun, PumpAmm } from '../idl';
// import { sendTransaction } from '../utils/transaction';
import { getWsolBalance } from '../utils/wsol';

// Bonding curve layout
const BondingCurveLayout = struct([
  u64('virtual_token_reserves'),
  u64('virtual_sol_reserves'),
  u64('real_token_reserves'),
  u64('real_sol_reserves'),
  u64('token_total_supply'),
  bool('complete'),
  publicKey('creator'),
  bool('is_mayhem_mode'),
]);

export class TradingEngine {
  private pumpfunProgram: Program<PumpFun>;
  private pumpammProgram: Program<PumpAmm>;

  constructor() {
    const provider = new AnchorProvider(
      connectionManager.connection,
      null as unknown as Wallet,
      {},
    );

    // Initialize PumpFun program
    const pumpFunIdlOverride = { ...PumpFunIDL };
    pumpFunIdlOverride.address = PUMPFUN_PROGRAM.toString();
    this.pumpfunProgram = new Program(pumpFunIdlOverride as PumpFun, provider);

    // Initialize PumpAMM program
    const pumpAmmIdlOverride = { ...PumpAmmIDL };
    pumpAmmIdlOverride.address = PUMPAMM_PROGRAM.toString();
    this.pumpammProgram = new Program(pumpAmmIdlOverride as PumpAmm, provider);
  }

  async executeTrade(event: TradeEvent): Promise<TradeResult> {
    try {
      if (event.protocol === 'pumpfun') {
        return await this.executePumpFunTrade(event);
      } else {
        return await this.executePumpAmmTrade(event);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        'TradingEngine',
        `Failed to execute ${event.type.toUpperCase()} trade for mint ${event.mint.substring(0, 8)}...`,
        error,
      );
      return {
        success: false,
        error: errorMessage,
        mint: event.mint,
        type: event.type,
      };
    }
  }

  private async executePumpFunTrade(event: TradeEvent): Promise<TradeResult> {
    const mint = new PublicKey(event.mint);

    // Calculate copy amounts
    const copyPercentage = BigInt(Math.floor(config.copyPercentage * 100));
    const copyTokenAmount = (event.tokenAmount * copyPercentage) / 10000n;
    const copySolAmount = (event.solAmount * copyPercentage) / 10000n;

    // Apply slippage tolerance for buys
    const slippageBps = BigInt(Math.floor(config.slippageTolerancePercent * 100));
    const maxSolCost =
      event.type === 'buy' ? (copySolAmount * (10000n + slippageBps)) / 10000n : copySolAmount;

    // Get PDAs
    const bondingCurvePDA = getBondingCurvePDA(mint, PUMPFUN_PROGRAM);

    // Parallelize account fetching for lower latency
    const [tokenProgram, bondingCurveAccount] = await Promise.all([
      this.getTokenProgramForMint(mint),
      connectionManager.connection.getAccountInfo(bondingCurvePDA),
    ]);

    if (!bondingCurveAccount) {
      throw new Error(`Bonding curve account not found for mint ${mint.toString()}`);
    }
    const bondingCurve = BondingCurveLayout.decode(bondingCurveAccount.data.subarray(8));
    const creator = bondingCurve.creator;

    // Extract liquidity from account info for comparison with websocket value
    const accountLiquidity = Number(bondingCurve.real_sol_reserves) / LAMPORTS_PER_SOL;
    const websocketLiquidity = event.liquidity;

    // Log comparison if websocket liquidity is available
    if (websocketLiquidity !== undefined) {
      const difference = Math.abs(accountLiquidity - websocketLiquidity);
      const percentDiff = websocketLiquidity > 0
        ? ((difference / websocketLiquidity) * 100).toFixed(2)
        : 'N/A';

      logger.info(
        'TradingEngine',
        `Liquidity comparison for ${mint.toString().slice(0, 8)}... | ` +
        `WebSocket: ${websocketLiquidity.toFixed(4)} SOL | ` +
        `AccountInfo: ${accountLiquidity.toFixed(4)} SOL | ` +
        `Difference: ${difference.toFixed(4)} SOL (${percentDiff}%)`
      );
    } else {
      logger.info(
        'TradingEngine',
        `Liquidity from AccountInfo for ${mint.toString().slice(0, 8)}...: ${accountLiquidity.toFixed(4)} SOL (WebSocket value not available)`
      );
    }

    const globalPDA = getGlobalPDA(PUMPFUN_PROGRAM);
    const creatorVaultPDA = getCreatorVaultPDA(creator, PUMPFUN_PROGRAM);
    const eventAuthorityPDA = getEventAuthorityPDA(PUMPFUN_PROGRAM);
    const globalVolumeAccumulatorPDA = getVolumeAccumulatorPDA(true, undefined, PUMPFUN_PROGRAM);
    const userVolumeAccumulatorPDA = getVolumeAccumulatorPDA(
      false,
      connectionManager.wallet.publicKey,
      PUMPFUN_PROGRAM,
    );
    const feeConfigPDA = getFeeConfigPDA(PUMPFUN_PROGRAM, PUMP_FEE_PROGRAM_ID);

    // Get fee recipient (check mayhem mode) - can be done in parallel with ATA calculations
    const feeRecipient = await this.getFeeRecipientForBondingCurve(bondingCurvePDA);

    // Get ATAs
    const walletBaseAta = getAssociatedTokenAddressSync(
      mint,
      connectionManager.wallet.publicKey,
      true,
      tokenProgram,
    );
    const associatedBondingCurvePDA = getAssociatedTokenAddressSync(
      mint,
      bondingCurvePDA,
      true,
      tokenProgram,
    );

    const tx = new Transaction();

    // Add ATA creation instructions
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        connectionManager.wallet.publicKey,
        walletBaseAta,
        connectionManager.wallet.publicKey,
        mint,
        tokenProgram,
      ),
    );
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        connectionManager.wallet.publicKey,
        associatedBondingCurvePDA,
        bondingCurvePDA,
        mint,
        tokenProgram,
      ),
    );

    // Add buy/sell instruction
    if (event.type === 'buy') {
      tx.add(
        await this.pumpfunProgram.methods
          .buy(new BN(copyTokenAmount.toString()), new BN(maxSolCost.toString()), { none: {} })
          .accountsPartial({
            global: globalPDA,
            feeRecipient: feeRecipient,
            mint: mint,
            bondingCurve: bondingCurvePDA,
            associatedBondingCurve: associatedBondingCurvePDA,
            associatedUser: walletBaseAta,
            user: connectionManager.wallet.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: tokenProgram,
            creatorVault: creatorVaultPDA,
            eventAuthority: eventAuthorityPDA,
            program: PUMPFUN_PROGRAM,
            globalVolumeAccumulator: globalVolumeAccumulatorPDA,
            userVolumeAccumulator: userVolumeAccumulatorPDA,
            feeConfig: feeConfigPDA,
            feeProgram: PUMP_FEE_PROGRAM_ID,
          })
          .instruction(),
      );
    } else {
      // Sell instruction
      tx.add(
        await this.pumpfunProgram.methods
          .sell(new BN(copyTokenAmount.toString()), new BN(0))
          .accountsPartial({
            global: globalPDA,
            feeRecipient: feeRecipient,
            mint: mint,
            bondingCurve: bondingCurvePDA,
            associatedBondingCurve: associatedBondingCurvePDA,
            associatedUser: walletBaseAta,
            user: connectionManager.wallet.publicKey,
            creatorVault: creatorVaultPDA,
            tokenProgram: tokenProgram,
          })
          .instruction(),
      );

      // Optionally close token account if selling all our position
      // Note: We can't easily check our actual token balance here without an extra RPC call,
      // so we'll skip closing the account. The account can be closed manually or in a cleanup process.
      // Closing based on copyTokenAmount === event.tokenAmount is incorrect since copyTokenAmount
      // is a percentage of event.tokenAmount and will almost never be equal.
    }

    // Send transaction
    // TRADE EXECUTION PAUSED - Commented out for testing detection/measurement
    // const signature = await sendTransaction(tx);
    const signature = 'PAUSED_EXECUTION_MOCK_SIGNATURE';

    logger.info('TradingEngine', `PumpFun ${event.type} execution PAUSED (mock): ${signature}`);
    logger.info('TradingEngine', 'Trade execution is paused - only detection/measurement is active');

    return {
      success: true,
      signature,
      mint: event.mint,
      type: event.type,
    };
  }

  private async executePumpAmmTrade(event: TradeEvent): Promise<TradeResult> {
    const mint = new PublicKey(event.mint);
    const pool = event.pool ? new PublicKey(event.pool) : null;

    if (!pool) {
      throw new Error('Pool address is required for AMM trades');
    }

    // Calculate copy amounts
    const copyPercentage = BigInt(Math.floor(config.copyPercentage * 100));
    const copyTokenAmount = (event.tokenAmount * copyPercentage) / 10000n;
    const copySolAmount = (event.solAmount * copyPercentage) / 10000n;

    // Apply slippage tolerance for buys
    const slippageBps = BigInt(Math.floor(config.slippageTolerancePercent * 100));
    const maxSolCostForBuy =
      event.type === 'buy' ? (copySolAmount * (10000n + slippageBps)) / 10000n : copySolAmount;

    // Get pool authority and derive pool PDA if needed
    const poolAuthorityPDA = getPoolAuthorityPDA(mint, PUMPFUN_PROGRAM);
    const poolPDA = getPoolPDA(
      CANONICAL_POOL_INDEX,
      poolAuthorityPDA,
      mint,
      WSOL_MINT,
      PUMPAMM_PROGRAM,
    );

    // Parallelize account fetching for lower latency
    const [poolData, baseTokenProgram] = await Promise.all([
      this.pumpammProgram.account.pool.fetch(poolPDA).catch(() => null),
      this.getTokenProgramForMint(mint),
    ]);

    if (!poolData) {
      throw new Error(`Pool account not found for mint ${mint.toString()}`);
    }
    // Get creator from pool data - coinCreator is the field we need for the creator vault PDA
    const creator = poolData.coinCreator;
    const creatorVaultAuthority = getCreatorVaultPDA(creator, PUMPAMM_PROGRAM);

    // Extract liquidity from pool quote token account (WSOL balance) for comparison
    let accountLiquidity: number | undefined;
    try {
      const poolQuoteTokenBalance = await connectionManager.connection.getTokenAccountBalance(
        poolData.poolQuoteTokenAccount
      );
      accountLiquidity = Number(poolQuoteTokenBalance.value.amount) / LAMPORTS_PER_SOL;
    } catch (error) {
      logger.warn(
        'TradingEngine',
        `Failed to get pool quote token balance for ${mint.toString().slice(0, 8)}...`,
        error
      );
    }

    const websocketLiquidity = event.liquidity;

    // Log comparison if both values are available
    if (accountLiquidity !== undefined && websocketLiquidity !== undefined) {
      const difference = Math.abs(accountLiquidity - websocketLiquidity);
      const percentDiff = websocketLiquidity > 0
        ? ((difference / websocketLiquidity) * 100).toFixed(2)
        : 'N/A';

      logger.info(
        'TradingEngine',
        `Liquidity comparison (AMM) for ${mint.toString().slice(0, 8)}... | ` +
        `WebSocket: ${websocketLiquidity.toFixed(4)} SOL | ` +
        `AccountInfo: ${accountLiquidity.toFixed(4)} SOL | ` +
        `Difference: ${difference.toFixed(4)} SOL (${percentDiff}%)`
      );
    } else if (accountLiquidity !== undefined) {
      logger.info(
        'TradingEngine',
        `Liquidity from AccountInfo (AMM) for ${mint.toString().slice(0, 8)}...: ${accountLiquidity.toFixed(4)} SOL (WebSocket value not available)`
      );
    }

    // Get PDAs
    const globalConfigPDA = getGlobalConfigPDA(PUMPAMM_PROGRAM);
    const eventAuthorityAmmPDA = getEventAuthorityPDA(PUMPAMM_PROGRAM);
    const globalVolumeAccumulatorAmmPDA = getVolumeAccumulatorPDA(true, undefined, PUMPAMM_PROGRAM);
    const userVolumeAccumulatorAmmPDA = getVolumeAccumulatorPDA(
      false,
      connectionManager.wallet.publicKey,
      PUMPAMM_PROGRAM,
    );
    const feeConfigPDA = getFeeConfigPDA(PUMPAMM_PROGRAM, PUMP_FEE_PROGRAM_ID);

    // Get fee recipient (check mayhem mode) - can be done in parallel with ATA calculations
    const { feeRecipient, feeRecipientTokenAccount } = await this.getFeeRecipientForPool(poolPDA);

    // Get ATAs
    const walletBaseAta = getAssociatedTokenAddressSync(
      mint,
      connectionManager.wallet.publicKey,
      true,
      baseTokenProgram,
    );
    const walletQuoteAta = getAssociatedTokenAddressSync(
      WSOL_MINT,
      connectionManager.wallet.publicKey,
      true,
    );
    const poolBaseAta = getAssociatedTokenAddressSync(mint, poolPDA, true, baseTokenProgram);
    const poolQuoteAta = getAssociatedTokenAddressSync(WSOL_MINT, poolPDA, true);

    const tx = new Transaction();

    // Add ATA creation instructions
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        connectionManager.wallet.publicKey,
        walletBaseAta,
        connectionManager.wallet.publicKey,
        mint,
        baseTokenProgram,
      ),
    );
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        connectionManager.wallet.publicKey,
        walletQuoteAta,
        connectionManager.wallet.publicKey,
        WSOL_MINT,
        TOKEN_PROGRAM,
      ),
    );

    // For buys, ensure we have enough WSOL
    if (event.type === 'buy') {
      // Parallelize balance checks
      const [existingWsol, walletBalance] = await Promise.all([
        getWsolBalance(connectionManager.connection, connectionManager.wallet.publicKey),
        connectionManager.connection.getBalance(connectionManager.wallet.publicKey),
      ]);
      const requiredWsol = maxSolCostForBuy + 1_000_000n; // Add small buffer for fees
      const wsolNeeded = existingWsol < requiredWsol ? requiredWsol - existingWsol : 0n;

      if (wsolNeeded > 0n) {
        // Check wallet balance
        const walletBalanceBigInt = BigInt(walletBalance);
        const rentReserve = 5_000_000n; // Reserve for rent and fees
        const availableSol = walletBalanceBigInt > rentReserve ? walletBalanceBigInt - rentReserve : 0n;

        if (availableSol < wsolNeeded) {
          throw new Error(
            `Insufficient SOL balance. Need ${Number(wsolNeeded) / LAMPORTS_PER_SOL} SOL but have ${Number(availableSol) / LAMPORTS_PER_SOL} SOL`,
          );
        }

        // Wrap SOL to WSOL
        tx.add(
          SystemProgram.transfer({
            fromPubkey: connectionManager.wallet.publicKey,
            toPubkey: walletQuoteAta,
            lamports: Number(wsolNeeded),
          }),
        );
        tx.add(createSyncNativeInstruction(walletQuoteAta, TOKEN_PROGRAM));
      }
    }

    // Add buy/sell instruction
    if (event.type === 'buy') {
      tx.add(
        await this.pumpammProgram.methods
          .buy(new BN(copyTokenAmount.toString()), new BN(maxSolCostForBuy.toString()), {
            none: {},
          })
          .accountsPartial({
            pool: poolPDA,
            user: connectionManager.wallet.publicKey,
            globalConfig: globalConfigPDA,
            baseMint: mint,
            quoteMint: WSOL_MINT,
            userBaseTokenAccount: walletBaseAta,
            userQuoteTokenAccount: walletQuoteAta,
            poolBaseTokenAccount: poolBaseAta,
            poolQuoteTokenAccount: poolQuoteAta,
            protocolFeeRecipient: feeRecipient,
            protocolFeeRecipientTokenAccount: feeRecipientTokenAccount,
            baseTokenProgram: baseTokenProgram,
            quoteTokenProgram: TOKEN_PROGRAM,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
            eventAuthority: eventAuthorityAmmPDA,
            program: PUMPAMM_PROGRAM,
            coinCreatorVaultAuthority: creatorVaultAuthority,
            globalVolumeAccumulator: globalVolumeAccumulatorAmmPDA,
            userVolumeAccumulator: userVolumeAccumulatorAmmPDA,
            feeConfig: feeConfigPDA,
            feeProgram: PUMP_FEE_PROGRAM_ID,
          })
          .instruction(),
      );
    } else {
      tx.add(
        await this.pumpammProgram.methods
          .sell(new BN(copyTokenAmount.toString()), new BN(0))
          .accountsPartial({
            pool: poolPDA,
            user: connectionManager.wallet.publicKey,
            globalConfig: globalConfigPDA,
            baseMint: mint,
            quoteMint: WSOL_MINT,
            userBaseTokenAccount: walletBaseAta,
            userQuoteTokenAccount: walletQuoteAta,
            poolBaseTokenAccount: poolBaseAta,
            poolQuoteTokenAccount: poolQuoteAta,
            protocolFeeRecipient: feeRecipient,
            protocolFeeRecipientTokenAccount: feeRecipientTokenAccount,
            baseTokenProgram: baseTokenProgram,
            quoteTokenProgram: TOKEN_PROGRAM,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
            eventAuthority: eventAuthorityAmmPDA,
            program: PUMPAMM_PROGRAM,
            coinCreatorVaultAuthority: creatorVaultAuthority,
            feeConfig: feeConfigPDA,
            feeProgram: PUMP_FEE_PROGRAM_ID,
          })
          .instruction(),
      );

      // Optionally close token account if selling all our position
      // Note: We can't easily check our actual token balance here without an extra RPC call,
      // so we'll skip closing the account. The account can be closed manually or in a cleanup process.
      // Closing based on copyTokenAmount === event.tokenAmount is incorrect since copyTokenAmount
      // is a percentage of event.tokenAmount and will almost never be equal.
    }

    // Send transaction
    // TRADE EXECUTION PAUSED - Commented out for testing detection/measurement
    // const signature = await sendTransaction(tx);
    const signature = 'PAUSED_EXECUTION_MOCK_SIGNATURE';

    logger.info('TradingEngine', `PumpAMM ${event.type} execution PAUSED (mock): ${signature}`);
    logger.info('TradingEngine', 'Trade execution is paused - only detection/measurement is active');

    return {
      success: true,
      signature,
      mint: event.mint,
      type: event.type,
    };
  }

  private async getTokenProgramForMint(mint: PublicKey): Promise<PublicKey> {
    try {
      const mintAccountInfo = await connectionManager.connection.getAccountInfo(mint);
      if (!mintAccountInfo) {
        return TOKEN_2022_PROGRAM; // Default to Token2022 for new tokens
      }
      return mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM) ? TOKEN_2022_PROGRAM : TOKEN_PROGRAM;
    } catch (error) {
      logger.warn(
        'TradingEngine',
        'Error checking mint owner, defaulting to TOKEN_2022_PROGRAM',
        error,
      );
      return TOKEN_2022_PROGRAM;
    }
  }

  private async getFeeRecipientForBondingCurve(bondingCurvePDA: PublicKey): Promise<PublicKey> {
    try {
      const bondingCurveAccount =
        await connectionManager.connection.getAccountInfo(bondingCurvePDA);
      if (bondingCurveAccount && bondingCurveAccount.data.length >= 82) {
        const bondingCurve = BondingCurveLayout.decode(bondingCurveAccount.data.subarray(8));
        if (bondingCurve.is_mayhem_mode) {
          return getMayhemFeeRecipient();
        }
      }
      return FEE_RECIPIENT;
    } catch (error) {
      logger.error(
        'TradingEngine',
        'Error checking mayhem mode, using default fee recipient',
        error,
      );
      return FEE_RECIPIENT;
    }
  }

  private async getFeeRecipientForPool(
    poolPDA: PublicKey,
  ): Promise<{ feeRecipient: PublicKey; feeRecipientTokenAccount: PublicKey }> {
    try {
      // Try to fetch pool account via program
      const poolData = await this.pumpammProgram.account.pool.fetch(poolPDA).catch(() => null);
      if (poolData && 'isMayhemMode' in poolData && poolData.isMayhemMode) {
        const mayhemFeeRecipient = getMayhemFeeRecipient();
        const mayhemFeeRecipientTokenAccount =
          getProtocolFeeRecipientTokenAccount(mayhemFeeRecipient);
        return {
          feeRecipient: mayhemFeeRecipient,
          feeRecipientTokenAccount: mayhemFeeRecipientTokenAccount,
        };
      }
    } catch (error) {
      logger.error(
        'TradingEngine',
        'Error checking pool mayhem mode, using default fee recipient',
        error,
      );
    }

    // Default to regular fee recipient
    return {
      feeRecipient: FEE_RECIPIENT,
      feeRecipientTokenAccount: getProtocolFeeRecipientTokenAccount(FEE_RECIPIENT),
    };
  }
}

export const tradingEngine = new TradingEngine();
