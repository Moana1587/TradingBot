# Copy Trading Bot - Step-by-Step Introduction

## 📚 Table of Contents
1. [What is Copy Trading?](#what-is-copy-trading)
2. [What is PumpFun?](#what-is-pumpfun)
3. [How This Bot Works](#how-this-bot-works)
4. [Architecture Overview](#architecture-overview)
5. [Step-by-Step Execution Flow](#step-by-step-execution-flow)
6. [Key Concepts Explained](#key-concepts-explained)
7. [Configuration Guide](#configuration-guide)

---

## What is Copy Trading?

**Copy trading** is an automated trading strategy where you automatically replicate trades made by other traders (called "target wallets" or "whales"). 

### Simple Analogy
Imagine you're following a successful trader on social media. Every time they buy a stock, you want to buy the same stock with a portion of your money. Copy trading automates this process - the bot watches their trades and automatically executes similar trades for you.

### In This Project
- **Target Wallets**: The wallets you want to copy (usually successful traders or "whales")
- **Your Wallet**: Your trading wallet that will execute the copied trades
- **Copy Percentage**: How much of their trade size you want to copy (e.g., 1% means if they buy 10 SOL worth, you buy 0.1 SOL worth)

### Why Copy Trading?
- **Automation**: No need to watch markets 24/7
- **Follow Experts**: Copy successful traders' strategies
- **Speed**: Execute trades immediately when targets trade
- **Diversification**: Copy multiple wallets simultaneously

---

## What is PumpFun?

**PumpFun** is a Solana-based platform for launching new tokens. It has two phases:

### Phase 1: Bonding Curve (PumpFun)
- New tokens start on a **bonding curve**
- Price increases as more people buy
- Early buyers get better prices
- When enough SOL is raised, the token **migrates** to Phase 2

### Phase 2: AMM Pool (PumpAMM)
- Token moves to a **liquidity pool** (like Uniswap)
- Trading happens on a decentralized exchange
- More stable pricing with liquidity

### Why This Matters
This bot supports **both phases**:
- Can copy trades on the bonding curve (PumpFun)
- Can copy trades on the AMM pool (PumpAMM)
- Automatically detects which phase the token is in

---

## How This Bot Works

### The Big Picture

```
1. Bot watches target wallets on Solana blockchain
   ↓
2. When target wallet makes a PumpFun/PumpAMM trade
   ↓
3. Bot detects the trade (buy or sell)
   ↓
4. Bot calculates how much to copy (based on percentage)
   ↓
5. Bot executes the same trade for you
   ↓
6. Bot tracks your positions
```

### Real Example

**Scenario:**
- Target wallet buys 5 SOL worth of token ABC
- Your copy percentage: 1%
- Your min/max: 0.1 - 7 SOL

**What Happens:**
1. Bot detects: "Target wallet bought 5 SOL of token ABC"
2. Bot calculates: 5 SOL × 1% = 0.05 SOL
3. Bot checks: 0.05 SOL is within 0.1-7 SOL range? **No, it's below minimum**
4. Bot skips this trade

**Another Scenario:**
- Target wallet buys 2 SOL worth of token XYZ
- Your copy percentage: 1%
- Your min/max: 0.1 - 7 SOL

**What Happens:**
1. Bot detects: "Target wallet bought 2 SOL of token XYZ"
2. Bot calculates: 2 SOL × 1% = 0.02 SOL
3. Bot checks: 0.02 SOL is within 0.1-7 SOL range? **No, it's below minimum**
4. Bot skips this trade

**One More:**
- Target wallet buys 10 SOL worth of token DEF
- Your copy percentage: 1%
- Your min/max: 0.1 - 7 SOL

**What Happens:**
1. Bot detects: "Target wallet bought 10 SOL of token DEF"
2. Bot calculates: 10 SOL × 1% = 0.1 SOL
3. Bot checks: 0.1 SOL is within 0.1-7 SOL range? **Yes!**
4. Bot executes: Buys 0.1 SOL worth of token DEF for you
5. Bot tracks: Records your position in token DEF

---

## Architecture Overview

The bot is built with a **clean, modular architecture**. Each component has a specific job:

```
┌─────────────────────────────────────────────────────────┐
│                    Main Entry Point                      │
│                    (src/index.ts)                        │
│  - Starts all services                                   │
│  - Handles trade events                                  │
│  - Manages shutdown                                      │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Connection  │  │   Monitor    │  │   Trading   │
│   Manager    │  │              │  │   Engine    │
│              │  │              │  │              │
│ - RPC setup  │  │ - WebSocket  │  │ - Execute   │
│ - Blockhash  │  │ - Listen for │  │   trades    │
│ - Wallet     │  │   trades     │  │ - PumpFun   │
└──────────────┘  └──────────────┘  │ - PumpAMM   │
        │                 │         └──────────────┘
        │                 │                 │
        │                 ▼                 │
        │         ┌──────────────┐          │
        │         │   Decoder    │          │
        │         │              │          │
        │         │ - Parse txns │          │
        │         │ - Extract    │          │
        │         │   events     │          │
        │         └──────────────┘          │
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Positions   │  │    Health    │  │   Utils      │
│   Manager    │  │   Monitor    │  │              │
│              │  │              │  │ - Logger     │
│ - Track      │  │ - Check      │  │ - Errors     │
│   positions  │  │   connection │  │ - WSOL       │
│ - Update     │  │ - Update     │  │ - Txns       │
│   balances   │  │   blockhash  │  └──────────────┘
└──────────────┘  └──────────────┘
```

### Component Responsibilities

#### 1. **Connection Manager** (`services/connection.ts`)
- Manages connection to Solana blockchain (via Helius RPC)
- Handles wallet operations
- Updates blockhashes (needed for transactions)
- Gets wallet balance

#### 2. **Transaction Monitor** (`services/monitor.ts`)
- Connects to Solana via WebSocket
- Listens for transactions involving target wallets
- Automatically reconnects if connection drops
- Emits trade events when detected

#### 3. **Transaction Decoder** (`services/decoder.ts`)
- Parses Solana transactions
- Extracts trade information (buy/sell, amounts, tokens)
- Identifies PumpFun vs PumpAMM trades
- Decodes event data from transaction logs

#### 4. **Trading Engine** (`services/trading.ts`)
- Executes buy/sell trades
- Handles both PumpFun (bonding curve) and PumpAMM (pool) trades
- Manages account setup (token accounts, WSOL wrapping)
- Calculates slippage tolerance
- Sends transactions to blockchain

#### 5. **Position Manager** (`services/positions.ts`)
- Tracks your token positions
- Updates balances when you buy/sell
- Removes positions when sold out

#### 6. **Health Monitor** (`services/health.ts`)
- Periodically checks connection health
- Updates blockhashes automatically
- Alerts if connection is unhealthy

---

## Step-by-Step Execution Flow

Let's trace through what happens when a target wallet makes a trade:

### Step 1: Bot Startup (`src/index.ts`)

```typescript
1. Load configuration from .env file
2. Initialize connection to Solana
3. Check wallet balance
4. Start health monitor
5. Create transaction monitor
6. Start listening for transactions
```

**What you see:**
```
Starting Copy Sniper Bot v2.0
Configuration: 1% copy, 0-7 SOL range
Wallet balance: 5.2341 SOL (5.0000 SOL + 0.2341 WSOL)
Transaction monitor connected
Bot is running. Press Ctrl+C to stop.
```

### Step 2: Target Wallet Makes a Trade

A target wallet (e.g., `ABC123...`) buys 10 SOL worth of token `XYZ789...` on PumpFun.

**On the blockchain:**
- Transaction is created and sent
- Transaction includes instructions to PumpFun program
- Transaction is confirmed on Solana

### Step 3: Monitor Detects Transaction (`services/monitor.ts`)

```typescript
1. WebSocket receives transaction notification
2. Check if transaction involves any target wallets
3. Check if transaction involves PumpFun/PumpAMM programs
4. Extract transaction data (instructions, accounts, logs)
```

**What you see:**
```
Transaction ABC123... contains 1 target wallet(s): ABC123...
Found PumpFun/PumpAMM programs: 6EF8rct...
```

### Step 4: Decoder Extracts Trade Event (`services/decoder.ts`)

```typescript
1. Parse transaction instructions
2. Find PumpFun/PumpAMM buy/sell instructions
3. Extract:
   - Trade type (buy/sell)
   - Token mint address
   - User wallet (target wallet)
   - SOL amount
   - Token amount
   - Protocol (PumpFun or PumpAMM)
4. Decode from transaction logs if needed
```

**What you see:**
```
Trade detected: BUY XYZ789... | User: ABC123... | SOL: 10.0000 | Tokens: 1000000
```

### Step 5: Main Handler Processes Event (`src/index.ts`)

```typescript
1. Check if this is your own trade (skip if yes)
2. Validate trade amount:
   - Is it >= MIN_TRADING_AMOUNT_SOL? (e.g., 0.1 SOL)
   - For buys: Is it < MAX_TRADING_AMOUNT_SOL? (e.g., 7 SOL)
3. Calculate copy amount:
   - copyAmount = targetAmount × (COPY_PERCENTAGE / 100)
   - Example: 10 SOL × 1% = 0.1 SOL
4. Log the trade details
5. Call trading engine to execute
```

**What you see:**
```
Copy trade: BUY XYZ789... | Target wallet: ABC123... | 
Target: 10.0000 SOL | Copy: 0.1000 SOL (1%) | 1000000 tokens
```

### Step 6: Trading Engine Executes Trade (`services/trading.ts`)

#### For PumpFun (Bonding Curve) Trades:

```typescript
1. Determine if token uses Token Program or Token2022
2. Get/create associated token account (ATA) for the token
3. Get bonding curve PDA (Program Derived Address)
4. Get creator vault PDA
5. Check if token is in "mayhem mode" (special fee handling)
6. Build buy/sell instruction:
   - Accounts: user, mint, bonding curve, token account, etc.
   - Data: instruction discriminator + parameters
7. Add account setup instructions if needed
8. Calculate slippage tolerance
9. Send transaction with retry logic
10. Wait for confirmation
```

#### For PumpAMM (Pool) Trades:

```typescript
1. Get pool PDA
2. Check WSOL balance (needed for AMM trades)
3. Wrap SOL to WSOL if needed
4. Get/create WSOL token account
5. Get/create token account for the token
6. Get pool authority PDA
7. Build swap instruction
8. Add account setup instructions
9. Calculate slippage tolerance
10. Send transaction with retry logic
11. Wait for confirmation
```

**What you see:**
```
Trade executed successfully: 3xYz789...
```

### Step 7: Position Manager Updates (`services/positions.ts`)

```typescript
1. If buy: Add/update position
   - Record token mint
   - Record token balance
   - Record total cost basis (SOL spent)
   - Record protocol (PumpFun/PumpAMM)
2. If sell: Update/remove position
   - Reduce token balance
   - Update cost basis
   - Remove if balance is zero
```

**What you see:**
```
Position updated: XYZ789... | Balance: 1000000 tokens | Cost: 0.1000 SOL
```

### Step 8: Continue Monitoring

The bot continues monitoring for the next trade. The cycle repeats.

---

## Key Concepts Explained

### 1. **WebSocket vs RPC**

- **RPC (HTTP)**: Request-response. You ask for data, you get data. Good for one-time queries.
- **WebSocket**: Persistent connection. Server pushes data to you. Perfect for real-time monitoring.

**Why WebSocket here?**
- We need to know about trades **immediately** when they happen
- RPC would require constant polling (inefficient)
- WebSocket gives us real-time transaction notifications

### 2. **Program Derived Addresses (PDAs)**

PDAs are special addresses derived from:
- A program ID
- A set of "seeds" (like a token mint address)

**Example:**
- PumpFun bonding curve PDA = `derive(program_id, [mint_address])`
- Same inputs always give same PDA (deterministic)

**Why PDAs?**
- Programs need accounts to store data
- PDAs let programs "own" accounts
- No private key needed (derived, not generated)

### 3. **Associated Token Accounts (ATAs)**

An ATA is a token account associated with a wallet for a specific token.

**Example:**
- Your wallet: `YourWallet123...`
- Token: `XYZ789...`
- Your ATA for XYZ: `derive(YourWallet123..., XYZ789...)`

**Why ATAs?**
- Standard way to hold tokens
- Deterministic (same wallet + token = same ATA)
- Easy to find: "Where does this wallet hold this token?"

### 4. **WSOL (Wrapped SOL)**

- **SOL**: Native Solana currency (like ETH on Ethereum)
- **WSOL**: SOL wrapped as an SPL token (like WETH)

**Why wrap SOL?**
- Some protocols (like AMM pools) only work with SPL tokens
- WSOL lets you use SOL in token-based protocols
- Bot automatically wraps/unwraps as needed

### 5. **Slippage Tolerance**

When you place a trade, the price might change before it executes.

**Example:**
- You want to buy at $1.00
- By the time your trade executes, price is $1.02
- Slippage = 2%

**Slippage Tolerance:**
- Maximum price change you'll accept
- If price moves more than tolerance, trade fails
- Protects you from bad executions

**In this bot:**
- Default: 1% slippage tolerance
- Configurable via `SLIPPAGE_TOLERANCE_PERCENT`

### 6. **Bonding Curve vs AMM Pool**

#### Bonding Curve (PumpFun):
- **Price formula**: Price increases as more tokens are bought
- **Early advantage**: First buyers get better prices
- **Migration**: When enough SOL raised, moves to AMM

#### AMM Pool (PumpAMM):
- **Price formula**: Based on token reserves in pool (x * y = k)
- **Liquidity**: Provided by initial migration
- **Stable**: More predictable pricing

### 7. **Mayhem Mode**

Some tokens have "mayhem mode" enabled:
- Special fee recipient (different from normal)
- Bot automatically detects and handles this
- Uses correct fee recipient for trades

### 8. **Token Program vs Token2022**

Solana has two token programs:
- **Token Program**: Original (like ERC-20)
- **Token2022**: Newer version with extra features

**Bot automatically detects** which one a token uses and handles it correctly.

---

## Configuration Guide

### Environment Variables (`.env` file)

```env
# Required
HELIUS_API_KEY=your_helius_api_key_here
WALLET_PRIVATE_KEY=your_base58_encoded_wallet_private_key_here
TARGET_WALLETS=wallet1,wallet2,wallet3

# Optional (with defaults)
COPY_PERCENTAGE=1                    # 1% of target trade size
MIN_TRADING_AMOUNT_SOL=0            # Minimum target trade to copy
MAX_TRADING_AMOUNT_SOL=7            # Maximum target trade to copy
SLIPPAGE_TOLERANCE_PERCENT=1        # 1% slippage tolerance
LOG_LEVEL=info                      # debug, info, warn, error
```

### Configuration Explained

#### `COPY_PERCENTAGE`
- **What**: Percentage of target wallet's trade to copy
- **Example**: If target buys 10 SOL and COPY_PERCENTAGE=1, you buy 0.1 SOL
- **Range**: 0.01 to 100 (though 100% means copying exactly, which may exceed your balance)

#### `MIN_TRADING_AMOUNT_SOL`
- **What**: Minimum target trade size (in SOL) to trigger a copy
- **Example**: If MIN=0.1, and target buys 0.05 SOL, you skip it
- **Use case**: Filter out tiny trades

#### `MAX_TRADING_AMOUNT_SOL`
- **What**: Maximum target trade size (in SOL) to copy (only for buys)
- **Example**: If MAX=7, and target buys 10 SOL, you skip it
- **Use case**: Avoid copying very large trades (risk management)

#### `SLIPPAGE_TOLERANCE_PERCENT`
- **What**: Maximum price change you'll accept
- **Example**: If tolerance=1%, and price moves 2% before execution, trade fails
- **Use case**: Protect against bad executions

#### `TARGET_WALLETS`
- **What**: Comma-separated list of wallet addresses to copy
- **Example**: `ABC123...,DEF456...,GHI789...`
- **Tip**: Research wallets before adding them!

### Getting Your Wallet Private Key

**⚠️ SECURITY WARNING**: Never share your private key!

1. Export from Phantom/Solflare wallet
2. Convert to base58 format (bot uses `bs58` library)
3. Store securely in `.env` file
4. Never commit `.env` to git!

### Getting Helius API Key

1. Sign up at [helius.dev](https://helius.dev)
2. Create a new API key
3. Copy the key to `.env` file
4. Helius provides fast RPC and WebSocket access

---

## Common Questions

### Q: How fast does the bot execute trades?
**A**: Very fast! The bot:
- Receives transactions in real-time via WebSocket
- Processes them immediately
- Executes your trade within seconds

### Q: What if the target wallet sells?
**A**: The bot will also copy sells! It tracks your positions and will sell when the target sells.

### Q: Can I copy multiple wallets?
**A**: Yes! Add multiple wallets to `TARGET_WALLETS` (comma-separated).

### Q: What if I don't have enough SOL?
**A**: The bot checks your balance and will skip trades if you don't have enough SOL (including fees).

### Q: Can I test on devnet first?
**A**: Yes! Change the RPC endpoint in `config/env.ts` to use devnet. Note: You'll need devnet SOL and target wallets on devnet.

### Q: What happens if the connection drops?
**A**: The bot automatically reconnects with exponential backoff. It will resume monitoring once reconnected.

### Q: How do I know if a trade succeeded?
**A**: Check the logs. Successful trades show:
```
Trade executed successfully: [transaction_signature]
```

### Q: Can I see my positions?
**A**: The bot tracks positions internally. You can add logging or a database to view them. Check `services/positions.ts` for the position data structure.

---

## Next Steps

1. **Read the README.md** for setup instructions
2. **Read SETUP.md** for detailed setup steps
3. **Read TESTING.md** for testing information
4. **Configure your `.env`** file
5. **Test on devnet** first (recommended)
6. **Start with small copy percentages** (0.1-1%)
7. **Monitor logs closely** when starting
8. **Gradually increase** as you gain confidence

---

## Safety Reminders

⚠️ **Important Warnings:**

1. **Only use funds you can afford to lose**
2. **Start with small amounts** to test
3. **Research target wallets** before copying them
4. **Monitor your balance** regularly
5. **Understand the risks** of copy trading
6. **Test on devnet** before mainnet
7. **Keep your private key secure**
8. **Don't share your `.env` file**

---

## Summary

This bot automates copy trading on Solana's PumpFun platform:

1. **Watches** target wallets via WebSocket
2. **Detects** their PumpFun/PumpAMM trades
3. **Calculates** how much to copy (based on percentage)
4. **Executes** the same trade for you
5. **Tracks** your positions

The architecture is modular, well-tested, and production-ready. Each component has a clear responsibility, making it easy to understand and maintain.

**Happy trading! 🚀**

