import { getWsolBalance, wrapSol } from '../../utils/wsol';
import { connectionManager } from '../../services/connection';
import { sendTransaction } from '../../utils/transaction';
import { PublicKey, Connection } from '@solana/web3.js';

jest.mock('../../services/connection');
jest.mock('../../utils/transaction');

describe('WSOL Utilities', () => {
  let mockConnection: jest.Mocked<Connection>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      getTokenAccountBalance: jest.fn(),
    } as any;
    (connectionManager.connection as any) = mockConnection;
    (connectionManager.wallet as any) = {
      publicKey: new PublicKey('11111111111111111111111111111111'),
    };
  });

  describe('getWsolBalance', () => {
    it('should return WSOL balance when account exists', async () => {
      const mockBalance = {
        value: {
          amount: '2000000000', // 2 WSOL
          decimals: 9,
          uiAmount: 2,
          uiAmountString: '2',
        },
      };

      mockConnection.getTokenAccountBalance.mockResolvedValue(mockBalance as any);

      const owner = new PublicKey('11111111111111111111111111111113');
      const result = await getWsolBalance(mockConnection, owner);

      expect(result).toBe(2000000000n);
      expect(mockConnection.getTokenAccountBalance).toHaveBeenCalled();
    });

    it('should return 0n when account does not exist', async () => {
      mockConnection.getTokenAccountBalance.mockRejectedValue(new Error('Account not found'));

      const owner = new PublicKey('11111111111111111111111111111113');
      const result = await getWsolBalance(mockConnection, owner);

      expect(result).toBe(0n);
    });

    it('should return 0n on other errors', async () => {
      mockConnection.getTokenAccountBalance.mockRejectedValue(new Error('Network error'));

      const owner = new PublicKey('11111111111111111111111111111113');
      const result = await getWsolBalance(mockConnection, owner);

      expect(result).toBe(0n);
    });
  });

  describe('wrapSol', () => {
    it('should wrap SOL to WSOL', async () => {
      const mockSignature = 'test_signature_123';
      (sendTransaction as jest.Mock) = jest.fn().mockResolvedValue(mockSignature);

      const solAmount = 1_000_000_000n; // 1 SOL
      const result = await wrapSol(solAmount);

      expect(result).toBe(mockSignature);
      expect(sendTransaction).toHaveBeenCalled();
    });

    it('should wrap SOL for specific recipient', async () => {
      const mockSignature = 'test_signature_456';
      (sendTransaction as jest.Mock) = jest.fn().mockResolvedValue(mockSignature);

      const solAmount = 500_000_000n; // 0.5 SOL
      const recipient = new PublicKey('11111111111111111111111111111114');
      const result = await wrapSol(solAmount, recipient);

      expect(result).toBe(mockSignature);
      expect(sendTransaction).toHaveBeenCalled();
    });

    it('should use wallet public key as default recipient', async () => {
      const mockSignature = 'test_signature_789';
      (sendTransaction as jest.Mock) = jest.fn().mockResolvedValue(mockSignature);

      const solAmount = 2_000_000_000n; // 2 SOL
      const result = await wrapSol(solAmount);

      expect(result).toBe(mockSignature);
      expect(sendTransaction).toHaveBeenCalled();
    });
  });
});
