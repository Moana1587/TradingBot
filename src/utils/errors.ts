export class SniperError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SniperError';
  }
}

export class ConnectionError extends SniperError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ConnectionError';
  }
}

export class TransactionError extends SniperError {
  constructor(message: string, cause?: unknown) {
    super(message, 'TRANSACTION_ERROR', cause);
    this.name = 'TransactionError';
  }
}

export class DecodeError extends SniperError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DECODE_ERROR', cause);
    this.name = 'DecodeError';
  }
}

export class ValidationError extends SniperError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}
