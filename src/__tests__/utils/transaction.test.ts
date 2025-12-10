import { sendTransaction } from '../../utils/transaction';
import { connectionManager } from '../../services/connection';
import {
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  PublicKey,
  Keypair,
} from '@solana/web3.js';
import { TransactionError } from '../../utils/errors';

jest.mock('../../services/connection');

// Mock Transaction and VersionedTransaction signing
jest.spyOn(Transaction.prototype, 'sign').mockImplementation(function (this: Transaction) {
  return this;
});

jest.spyOn(VersionedTransaction.prototype, 'sign').mockImplementation(function (
  this: VersionedTransaction,
) {
  return this;
});

jest
  .spyOn(VersionedTransaction.prototype, 'serialize')
  .mockReturnValue(Buffer.from('mock_serialized_tx'));

// Mock TransactionMessage.compileToV0Message
const mockMessageV0 = {
  header: {
    numRequiredSignatures: 1,
    numReadonlySignedAccounts: 0,
    numReadonlyUnsignedAccounts: 1,
  },
  accountKeys: [],
  recentBlockhash: '11111111111111111111111111111111',
  instructions: [],
  addressTableLookups: [],
  staticAccountKeys: [],
};

jest
  .spyOn(TransactionMessage.prototype, 'compileToV0Message')
  .mockReturnValue(mockMessageV0 as any);

describe('Transaction Utilities', () => {
  let mockConnection: jest.Mocked<any>;
  let mockTransaction: Transaction;
  let mockWallet: Keypair;
  let mockPublicKey: PublicKey;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create a real PublicKey for proper equals method
    mockPublicKey = new PublicKey('11111111111111111111111111111111');
    // Create a mock Keypair
    mockWallet = {
      publicKey: mockPublicKey,
      sign: jest.fn(),
    } as any;

    mockConnection = {
      getBlockhash: jest.fn(),
      connection: {
        sendRawTransaction: jest.fn(),
        confirmTransaction: jest.fn(),
      },
      wallet: mockWallet,
    };
    (connectionManager as any) = mockConnection;
    (connectionManager.getBlockhash as jest.Mock) = jest
      .fn()
      .mockResolvedValue('11111111111111111111111111111111');
    (connectionManager.wallet as any) = mockWallet;
    (connectionManager.connection as any) = mockConnection.connection;

    mockTransaction = new Transaction();
    mockTransaction.recentBlockhash = '11111111111111111111111111111111';
    mockTransaction.feePayer = mockPublicKey;
  });

  describe('sendTransaction', () => {
    it('should send transaction successfully without waiting for confirmation', async () => {
      const mockSignature = 'test_signature_123';
      mockConnection.connection.sendRawTransaction.mockResolvedValue(mockSignature);

      const result = await sendTransaction(mockTransaction);

      expect(result).toBe(mockSignature);
      expect(mockConnection.connection.sendRawTransaction).toHaveBeenCalled();
      // By default, confirmation should NOT be called (for lower latency)
      expect(mockConnection.connection.confirmTransaction).not.toHaveBeenCalled();
    });

    it('should wait for confirmation when waitForConfirmation is true', async () => {
      const mockSignature = 'test_signature_123';
      mockConnection.connection.sendRawTransaction.mockResolvedValue(mockSignature);
      mockConnection.connection.confirmTransaction.mockResolvedValue({ value: { err: null } });

      const result = await sendTransaction(mockTransaction, true, 3, true);

      expect(result).toBe(mockSignature);
      expect(mockConnection.connection.sendRawTransaction).toHaveBeenCalled();
      expect(mockConnection.connection.confirmTransaction).toHaveBeenCalledWith(
        mockSignature,
        'confirmed',
      );
    });

    it('should retry on failure', async () => {
      const mockSignature = 'test_signature_456';
      mockConnection.connection.sendRawTransaction
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockSignature);

      jest.useFakeTimers();
      const sendPromise = sendTransaction(mockTransaction);

      // Process the first attempt
      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      // Process the retry (1000ms delay)
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      const result = await sendPromise;

      expect(result).toBe(mockSignature);
      expect(mockConnection.connection.sendRawTransaction).toHaveBeenCalledTimes(2);
      // Should not wait for confirmation by default
      expect(mockConnection.connection.confirmTransaction).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should throw TransactionError after max retries', async () => {
      mockConnection.connection.sendRawTransaction.mockRejectedValue(new Error('Network error'));

      jest.useFakeTimers();
      const sendPromise = sendTransaction(mockTransaction, false, 2);

      // Process the first attempt
      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      // Process the retry (1000ms delay)
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      await expect(sendPromise).rejects.toThrow(TransactionError);
      jest.useRealTimers();

      expect(mockConnection.connection.sendRawTransaction).toHaveBeenCalledTimes(2);
    });

    it('should handle blockhash errors', async () => {
      (connectionManager.getBlockhash as jest.Mock) = jest
        .fn()
        .mockRejectedValue(new Error('Blockhash error'));

      await expect(sendTransaction(mockTransaction)).rejects.toThrow(TransactionError);
    });

    it('should use custom skipPreflight', async () => {
      const mockSignature = 'test_signature_789';
      mockConnection.connection.sendRawTransaction.mockResolvedValue(mockSignature);

      await sendTransaction(mockTransaction, true);

      expect(mockConnection.connection.sendRawTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ skipPreflight: true }),
      );
      // Should not wait for confirmation by default
      expect(mockConnection.connection.confirmTransaction).not.toHaveBeenCalled();
    });

    it('should use custom maxRetries', async () => {
      const mockSignature = 'test_signature_abc';
      mockConnection.connection.sendRawTransaction
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce(mockSignature);

      jest.useFakeTimers();
      const sendPromise = sendTransaction(mockTransaction, false, 3);

      // Process the first attempt
      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      // Process first retry (1000ms delay)
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      // Process second retry (2000ms delay)
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      const result = await sendPromise;
      jest.useRealTimers();

      expect(result).toBe(mockSignature);
      expect(mockConnection.connection.sendRawTransaction).toHaveBeenCalledTimes(3);
      // Should not wait for confirmation by default
      expect(mockConnection.connection.confirmTransaction).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      // Mock a non-Error exception (e.g., string)
      mockConnection.connection.sendRawTransaction.mockRejectedValue('String error');

      jest.useFakeTimers();
      const sendPromise = sendTransaction(mockTransaction, false, 1);

      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      await expect(sendPromise).rejects.toThrow(TransactionError);
      jest.useRealTimers();
    });
  });
});
