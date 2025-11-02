const workerPool = require('./workerPool.service');
const sqsService = require('./sqs.service');
const metrics = require('./metrics.service');
const emailService = require('./email.service');
const rateLimiter = require('./rateLimiter.service');
const logger = require('../config/logger');
const config = require('../config/config');

/**
 * Main SMTP Email Processing Service
 * Orchestrates SQS polling, worker pool, and email sending
 */
class SMTPEmailService {
    constructor() {
        this.isRunning = false;
        this.shutdownHandlers = [];
    }

    /**
     * Initialize and start the email processing service
     */
    async start(options = {}) {
        if (this.isRunning) {
            logger.warn('SMTP service is already running');
            return;
        }

        try {
            logger.info('Initializing SMTP Email Processing Service');

            // Initialize SQS
            await sqsService.initialize();

            // Configure worker pool
            const workerPoolOptions = {
                maxWorkers: options.maxWorkers || config.workerPool?.maxWorkers || 10,
                batchSize: options.batchSize || config.workerPool?.batchSize || 10,
                maxQueueSize: options.maxQueueSize || config.workerPool?.maxQueueSize || 100,
            };

            workerPool.maxWorkers = workerPoolOptions.maxWorkers;
            workerPool.batchSize = workerPoolOptions.batchSize;
            workerPool.maxQueueSize = workerPoolOptions.maxQueueSize;

            // Start metrics reporting
            metrics.startPeriodicReporting(config.metrics?.reportInterval || 60);

            // Start worker pool
            await workerPool.start();

            this.isRunning = true;

            // Setup graceful shutdown
            this.setupGracefulShutdown();

            // Start periodic cleanup of processed messages
            this.startCleanupInterval();

            logger.info({
                maxWorkers: workerPoolOptions.maxWorkers,
                batchSize: workerPoolOptions.batchSize,
                targetThroughput: '~35 emails/sec',
            }, 'SMTP Email Processing Service started');

            return true;
        } catch (error) {
            logger.error({ error: error.message, stack: error.stack }, 'Failed to start SMTP service');
            throw error;
        }
    }

    /**
     * Stop the email processing service gracefully
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        logger.info('Stopping SMTP Email Processing Service');

        try {
            // Stop worker pool
            await workerPool.stop();

            // Stop metrics reporting
            metrics.stopPeriodicReporting();

            // Stop rate limiter cleanup
            rateLimiter.destroy();

            this.isRunning = false;

            logger.info('SMTP Email Processing Service stopped');
        } catch (error) {
            logger.error({ error: error.message }, 'Error stopping SMTP service');
            throw error;
        }
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            logger.info({ signal }, 'Received shutdown signal');
            await this.stop();
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught errors
        process.on('uncaughtException', (error) => {
            logger.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
            this.stop().then(() => process.exit(1));
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error({ reason, promise }, 'Unhandled rejection');
        });
    }

    /**
     * Start periodic cleanup tasks
     */
    startCleanupInterval() {
        // Cleanup processed messages every hour
        setInterval(() => {
            emailService.cleanupProcessedMessages();
        }, 60 * 60 * 1000);

        // Cleanup rate limiter every 5 minutes
        setInterval(() => {
            rateLimiter.cleanup();
        }, 5 * 60 * 1000);
    }

    /**
     * Get service status and statistics
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            workerPool: workerPool.getStats(),
            metrics: metrics.getMetrics(),
            emailService: emailService.getStats(),
            rateLimiter: rateLimiter.getStats(),
        };
    }

    /**
     * Pause processing (useful for maintenance)
     */
    pause() {
        workerPool.pause();
        logger.info('SMTP service paused');
    }

    /**
     * Resume processing
     */
    resume() {
        workerPool.resume();
        logger.info('SMTP service resumed');
    }

    /**
     * Update worker pool size dynamically
     */
    setMaxWorkers(count) {
        workerPool.setMaxWorkers(count);
    }

    /**
     * Get health check status
     */
    getHealth() {
        const status = this.getStatus();
        const isHealthy = this.isRunning && status.workerPool.activeWorkers > 0;

        return {
            healthy: isHealthy,
            status: {
                service: 'running',
                workers: status.workerPool.activeWorkers,
                queueSize: status.workerPool.queueSize,
                emailsPerMinute: status.metrics.rates.emailsPerMinute,
                errorRate: status.metrics.rates.errorRate,
            },
        };
    }
}

// Export singleton instance
const smtpEmailService = new SMTPEmailService();

// Export for programmatic use
module.exports = smtpEmailService;

// If running directly, start the service
if (require.main === module) {
    smtpEmailService.start().catch((error) => {
        logger.error({ error: error.message }, 'Failed to start service');
        process.exit(1);
    });
}
