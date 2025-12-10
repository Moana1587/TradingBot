# Setup Guide

## Initial Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Copy IDL Files**
   
   The trading engine needs the PumpFun and PumpAMM IDL files to work properly. **IDL files must only be obtained from the official Pump public documentation repository.**

   **Repository**: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs)
   
   **Steps to get IDL files:**
   
   ```bash
   # Clone the official Pump public docs repository
   git clone https://github.com/pump-fun/pump-public-docs.git
   
   # Copy IDL files from the official repository
   cp pump-public-docs/idl/pump.json src/idl/
   cp pump-public-docs/idl/pump_amm.json src/idl/
   ```
   
   **Important**: Always use IDL files from the official Pump public documentation repository to ensure compatibility and correctness.

3. **Update Trading Engine**
   
   After copying IDL files, update `src/services/trading.ts` to import and use the actual IDL:
   
   ```typescript
   import { PumpFunIDL } from '../idl/pump-fun';
   import { PumpAmmIDL } from '../idl/pump-amm';
   
   // In initializePrograms():
   this.pumpfunProgram = new Program(PumpFunIDL, PUMPFUN_PROGRAM, provider);
   this.pumpammProgram = new Program(PumpAmmIDL, PUMPAMM_PROGRAM, provider);
   ```

4. **Configure Environment**
   
   Create `.env` file with your configuration:
   ```env
   HELIUS_API_KEY=your_key
   WALLET_PRIVATE_KEY=your_key
   TARGET_WALLETS=wallet1,wallet2,wallet3
   ```

## Next Steps

### Complete Trading Engine Implementation

The trading engine currently has placeholder implementations. To complete it:

1. **Import IDL Types**
   - Import `PumpFunIDL` and `PumpAmmIDL` from IDL files
   - Create proper Program instances

2. **Implement Buy/Sell Instructions**
   - Complete `executePumpFunTrade()` method
   - Complete `executePumpAmmTrade()` method
   - Add proper account setup (WSOL wrapping, ATA creation)
   - Handle mayhem mode fee recipients

3. **Add Transaction Sending**
   - Implement proper transaction sending with retries
   - Add confirmation waiting
   - Handle transaction errors gracefully

### Enhance Transaction Decoder

The decoder needs improvements for:
- Better amount extraction from balance changes
- Token account balance tracking
- More robust event parsing from logs

### Add Features

Consider adding:
- Balance monitoring and alerts
- Trade history logging
- Performance metrics
- Rate limiting
- Circuit breakers for failed trades

## Testing

Before running in production:

1. Test on devnet first
2. Start with small copy percentages
3. Monitor logs closely
4. Check position tracking accuracy
5. Verify trade execution

## Production Checklist

- [ ] IDL files copied and imported
- [ ] Trading engine fully implemented
- [ ] Transaction decoder tested
- [ ] Environment variables configured
- [ ] Wallet has sufficient SOL
- [ ] Target wallets verified
- [ ] Tested on devnet
- [ ] Monitoring set up
- [ ] Error handling verified

