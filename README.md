# Copy Sniper Bot v2.0

A modern, optimized, and maintainable Solana copy-trading bot for PumpFun tokens.

## 🚀 Features

- **Clean Architecture**: Well-structured, maintainable codebase with separation of concerns
- **Type Safety**: Full TypeScript support with strict type checking
- **Error Handling**: Comprehensive error handling with retry logic
- **Health Monitoring**: Built-in connection health checks and blockhash management
- **Position Tracking**: Multi-token position management
- **Real-time Monitoring**: WebSocket-based transaction monitoring
- **Dual Protocol Support**: PumpFun (bonding curve) and PumpAMM (migrated pools)
- **Token2022 Support**: Automatic detection of Token Program vs Token2022
- **Mayhem Mode Support**: Handles mayhem mode coins with appropriate fee recipients

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A Solana wallet with SOL for trading
- Helius RPC API key

## 🔧 Installation

1. Clone the repository and navigate to the sniper folder:
```bash
cd sniper
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Configure your `.env` file:
```env
HELIUS_API_KEY=your_helius_api_key_here
WALLET_PRIVATE_KEY=your_base58_encoded_wallet_private_key_here
COPY_PERCENTAGE=1
MIN_TRADING_AMOUNT_SOL=0
MAX_TRADING_AMOUNT_SOL=7
SLIPPAGE_TOLERANCE_PERCENT=1
TARGET_WALLETS=wallet1,wallet2,wallet3
```

## 🏗️ Project Structure

```
sniper/
├── src/
│   ├── config/          # Configuration files
│   │   ├── env.ts        # Environment variable loader with validation
│   │   └── constants.ts  # Program IDs, PDAs, and constants
│   ├── services/         # Core services
│   │   ├── connection.ts # Connection manager
│   │   ├── decoder.ts    # Transaction decoder
│   │   ├── monitor.ts    # Transaction monitor
│   │   ├── trading.ts    # Trading engine
│   │   ├── positions.ts  # Position manager
│   │   └── health.ts     # Health monitor
│   ├── types/            # TypeScript types and interfaces
│   │   └── index.ts      # Core types
│   ├── utils/            # Utility functions
│   │   ├── logger.ts     # Structured logging
│   │   └── errors.ts     # Custom error classes
│   └── index.ts          # Application entry point
├── package.json
├── tsconfig.json
└── README.md
```

## 🎯 Usage

### Development Mode
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Production with PM2 (Recommended)
For production deployment, PM2 is recommended for process management, auto-restart, and logging.

1. **Install PM2 globally:**
   ```bash
   npm install -g pm2
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Start with PM2:**
   ```bash
   npm run pm2:start
   ```

4. **View logs:**
   ```bash
   npm run pm2:logs
   ```

5. **Check status:**
   ```bash
   npm run pm2:status
   ```

See [PM2_GUIDE.md](./PM2_GUIDE.md) for complete PM2 setup and usage instructions.

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

## ⚙️ Configuration

### Environment Variables

- `HELIUS_API_KEY`: Your Helius RPC API key (required)
- `WALLET_PRIVATE_KEY`: Base58-encoded private key of your trading wallet (required)
- `COPY_PERCENTAGE`: Percentage of target wallet's trade amount to copy (default: 1)
- `MIN_TRADING_AMOUNT_SOL`: Minimum target wallet's SOL amount to copy trades (default: 0)
- `MAX_TRADING_AMOUNT_SOL`: Maximum target wallet's SOL amount to copy trades (default: 7)
- `SLIPPAGE_TOLERANCE_PERCENT`: Slippage tolerance percentage for buy orders (default: 1)
- `TARGET_WALLETS`: Comma-separated list of target wallet addresses (required)
- `LOG_LEVEL`: Logging level - debug, info, warn, error (default: info)

## 🔍 Architecture

### Key Components

1. **ConnectionManager**: Manages RPC connection, blockhash updates, and wallet operations
2. **TransactionMonitor**: WebSocket-based transaction monitoring with automatic reconnection
3. **TransactionDecoder**: Decodes PumpFun/PumpAMM transactions and extracts trade events
4. **TradingEngine**: Executes buy/sell trades with proper account setup
5. **PositionManager**: Tracks active token positions
6. **HealthMonitor**: Monitors connection health and updates blockhashes

### Design Principles

- **Separation of Concerns**: Each service has a single responsibility
- **Type Safety**: Strong TypeScript typing throughout
- **Error Handling**: Custom error classes with proper error propagation
- **Event-Driven**: Uses EventEmitter for loose coupling
- **Maintainability**: Clean code with clear naming and structure

## 📊 Monitoring

The bot provides structured logging with different log levels:
- `debug`: Detailed debugging information
- `info`: General information about bot operations
- `warn`: Warning messages (e.g., low balance, connection issues)
- `error`: Error messages with stack traces

## ⚠️ Important Notes

- **Risk Warning**: Copy trading involves significant financial risk. Only use funds you can afford to lose.
- **Gas Fees**: Each trade incurs Solana transaction fees. Monitor your SOL balance.
- **Slippage**: The bot uses configurable slippage tolerance. Market conditions may affect execution.
- **Rate Limits**: Be aware of Helius RPC rate limits.
- **Legal Compliance**: Ensure your use of this bot complies with local regulations.

## 🛠️ Development

### Adding New Features

1. Create types in `src/types/`
2. Implement services in `src/services/`
3. Add configuration in `src/config/`
4. Update main entry point in `src/index.ts`

### Testing

Currently, the bot doesn't include automated tests. Consider adding:
- Unit tests for services
- Integration tests for trading flows
- E2E tests for full bot operation

## 🐛 Troubleshooting

### WebSocket Connection Issues
- Check your Helius API key is valid
- Verify network connectivity
- Check Helius service status

### Transaction Failures
- Ensure sufficient SOL balance for fees
- Check that target wallets are valid Solana addresses
- Verify RPC endpoint is responsive

### Configuration Errors
- The bot validates configuration on startup
- Check error messages for specific validation failures

## 📝 License

ISC

## 🤝 Contributing

Contributions are welcome! Please ensure your code:
- Follows the existing code style
- Includes appropriate error handling
- Has proper TypeScript types
- Includes logging for important operations

---

**Disclaimer**: This software is provided as-is. Trading cryptocurrencies carries risk. Use at your own discretion.

