type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      const parts: string[] = [];

      // Error name and message
      if (error.name && error.name !== 'Error') {
        parts.push(`Error: ${error.name}`);
      }
      if (error.message) {
        parts.push(`Message: ${error.message}`);
      }

      // Handle custom error properties
      const errorObj = error as unknown as Record<string, unknown>;
      if (errorObj.code) {
        parts.push(`Code: ${errorObj.code}`);
      }
      if (errorObj.cause) {
        const causeStr = this.formatError(errorObj.cause);
        if (causeStr) {
          parts.push(`Cause: ${causeStr}`);
        }
      }

      // Handle transaction-specific errors
      if (errorObj.transactionMessage) {
        parts.push(`\n  Transaction Error: ${errorObj.transactionMessage}`);
      }

      // Parse transaction logs if present
      if (errorObj.transactionLogs && Array.isArray(errorObj.transactionLogs)) {
        const logs = errorObj.transactionLogs as string[];
        const errorLogs = logs.filter(
          (log) =>
            log.includes('Error') ||
            log.includes('failed') ||
            log.includes('AnchorError') ||
            log.includes('Left:') ||
            log.includes('Right:'),
        );

        if (errorLogs.length > 0) {
          parts.push('\n  Program Errors:');
          errorLogs.forEach((log) => {
            // Extract meaningful error information
            if (log.includes('AnchorError')) {
              const errorMatch = log.match(
                /Error Code: ([^.]+)\. Error Number: (\d+)\. Error Message: ([^.]+)/,
              );
              if (errorMatch) {
                parts.push(`    - ${errorMatch[1]} (${errorMatch[2]}): ${errorMatch[3]}`);
              } else {
                parts.push(`    - ${log.replace('Program log: ', '').trim()}`);
              }
            } else if (log.includes('Left:') || log.includes('Right:')) {
              // Format comparison values nicely
              const leftMatch = log.match(/Left: (\d+)/);
              const rightMatch = log.match(/Right: (\d+)/);
              if (leftMatch && rightMatch) {
                const left = BigInt(leftMatch[1]);
                const right = BigInt(rightMatch[1]);
                parts.push(
                  `    - Balance: ${this.formatNumber(left)} (required: ${this.formatNumber(right)})`,
                );
              } else {
                parts.push(`    - ${log.replace('Program log: ', '').trim()}`);
              }
            } else if (log.includes('failed') || log.includes('Error')) {
              parts.push(`    - ${log.replace('Program log: ', '').trim()}`);
            }
          });
        }
      }

      // Handle signature if present
      if (errorObj.signature) {
        parts.push(`Signature: ${errorObj.signature || '(none)'}`);
      }

      return parts.join('\n  ');
    }

    if (typeof error === 'object' && error !== null) {
      // Try to extract meaningful information from error objects
      const errorObj = error as Record<string, unknown>;
      const meaningfulKeys = ['code', 'message', 'name', 'cause', 'transactionMessage'];
      const extracted: string[] = [];

      meaningfulKeys.forEach((key) => {
        if (errorObj[key] !== undefined && errorObj[key] !== null) {
          extracted.push(`${key}: ${String(errorObj[key])}`);
        }
      });

      if (extracted.length > 0) {
        return extracted.join(', ');
      }
    }

    return String(error);
  }

  private formatNumber(value: bigint | number): string {
    const num = typeof value === 'bigint' ? Number(value) : value;
    if (num >= 1_000_000_000) {
      return `${(num / 1_000_000_000).toFixed(2)}B`;
    }
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`;
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toFixed(2)}K`;
    }
    return num.toString();
  }

  private formatArgs(args: unknown[]): string {
    if (args.length === 0) return '';

    return args
      .map((arg) => {
        // If it's an error, format it nicely
        if (arg instanceof Error || (typeof arg === 'object' && arg !== null && 'message' in arg)) {
          return '\n' + this.formatError(arg);
        }

        // For simple values, use JSON but limit length
        const json = JSON.stringify(arg);
        if (json.length > 200) {
          return json.substring(0, 200) + '...';
        }
        return json;
      })
      .join('\n');
  }

  private formatMessage(level: LogLevel, tag: string, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m', // Green
      warn: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';
    const color = colors[level] || '';
    const formattedArgs = this.formatArgs(args);
    const separator = formattedArgs ? '\n' : '';
    return `${color}[${timestamp}] [${level.toUpperCase()}] [${tag}]${reset} ${message}${separator}${formattedArgs}`;
  }

  debug(tag: string, message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', tag, message, ...args));
    }
  }

  info(tag: string, message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', tag, message, ...args));
    }
  }

  warn(tag: string, message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', tag, message, ...args));
    }
  }

  error(tag: string, message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', tag, message, ...args));
    }
  }
}

export const logger = new Logger();
