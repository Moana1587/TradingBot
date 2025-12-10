import { EventEmitter } from 'events';
import { config } from '../config/env';
import { connectionManager } from './connection';
import { logger } from '../utils/logger';
import { HealthStatus } from '../types';

export class HealthMonitor extends EventEmitter {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();
  private isHealthy = false;

  start(): void {
    logger.info('HealthMonitor', 'Starting health monitoring');
    this.startHealthChecks();
    // Note: Blockhash updates are handled by ConnectionManager's background refresh
    // No need to duplicate here to avoid redundant API calls
  }

  stop(): void {
    this.stopHealthChecks();
    // Note: Blockhash updates are handled by ConnectionManager
    logger.info('HealthMonitor', 'Health monitoring stopped');
  }

  private startHealthChecks(): void {
    this.stopHealthChecks();
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, config.healthCheckIntervalMs);
    // Perform initial check
    this.performHealthCheck();
  }

  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // Removed startBlockhashUpdates/stopBlockhashUpdates methods
  // Blockhash updates are handled by ConnectionManager's background refresh
  // to avoid duplicate API calls and potential race conditions

  private async performHealthCheck(): Promise<void> {
    try {
      const isHealthy = await connectionManager.healthCheck();
      const wasHealthy = this.isHealthy;
      this.isHealthy = isHealthy;

      if (isHealthy !== wasHealthy) {
        if (isHealthy) {
          logger.info('HealthMonitor', 'Connection is healthy');
          this.emit('healthy');
        } else {
          logger.warn('HealthMonitor', 'Connection is unhealthy');
          this.emit('unhealthy');
        }
      }
    } catch (error) {
      logger.error('HealthMonitor', 'Health check failed', error);
      this.isHealthy = false;
      this.emit('unhealthy');
    }
  }

  getStatus(): HealthStatus {
    return {
      isHealthy: this.isHealthy,
      lastBlockhash: connectionManager.currentBlockhash,
      lastBlockhashTime: connectionManager.lastBlockhashUpdate,
      connectionStatus: this.isHealthy ? 'connected' : 'disconnected',
      uptime: Date.now() - this.startTime,
    };
  }
}

export const healthMonitor = new HealthMonitor();
