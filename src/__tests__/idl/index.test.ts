import { PumpFunIDL, PumpAmmIDL } from '../../idl';
import type { PumpFun, PumpAmm } from '../../idl';

describe('IDL Exports', () => {
  it('should export PumpFunIDL', () => {
    expect(PumpFunIDL).toBeDefined();
    expect(PumpFunIDL).toHaveProperty('address');
  });

  it('should export PumpAmmIDL', () => {
    expect(PumpAmmIDL).toBeDefined();
    expect(PumpAmmIDL).toHaveProperty('address');
  });

  it('should export PumpFun type', () => {
    // Type check - this will fail at compile time if type doesn't exist
    const _test: PumpFun = {} as PumpFun;
    expect(_test).toBeDefined();
  });

  it('should export PumpAmm type', () => {
    // Type check - this will fail at compile time if type doesn't exist
    const _test: PumpAmm = {} as PumpAmm;
    expect(_test).toBeDefined();
  });
});
