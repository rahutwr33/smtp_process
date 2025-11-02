const logger = require('../config/logger');
const emailService = require('./email.service');
const sqsService = require('./sqs.service');
const metrics = require('./metrics.service');

/**
 * Worker Pool Manager for processing emails with controlled concurrency
 */
class WorkerPoolService {
    constructor(options = {}) {
        this.maxWorkers = options.maxWorkers || 10; // Concurrent email processing workers
        this.batchSize = options.batchSize || 10; // Messages to fetch from SQS per batch
        this.activeWorkers = 0;
        this.isRunning = false;
        this.pauseProcessing = false;
        this.processedCount = 0;
        this.failedCount = 0;

        // Queue for pending messages
        this.messageQueue = [];
        this.maxQueueSize = options.maxQueueSize || 100;

        // Processing statistics
        this.stats = {
            totalProcessed: 0,
            totalFailed: 0,
            totalSucceeded: 0,
            startTime: null,
        };
    }

    /**
     * Start the worker pool
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Worker pool is already running');
            return;
        }

        this.isRunning = true;
        this.stats.startTime = Date.now();
        this.pauseProcessing = false;

        logger.info({
            maxWorkers: this.maxWorkers,
            batchSize: this.batchSize,
        }, 'Starting worker pool');

        // Start worker processes
        this.startWorkers();

        // Start message polling
        this.startPolling();
    }

    /**
     * Start worker processes
     */
    startWorkers() {
        for (let i = 0; i < this.maxWorkers; i++) {
            this.processWorker(i);
        }
    }

    /**
     * Start polling SQS for messages
     */
    async startPolling() {
        while (this.isRunning) {
            try {
                if (this.pauseProcessing) {
                    await this.sleep(1000);
                    continue;
                }

                // Check queue capacity
                if (this.messageQueue.length >= this.maxQueueSize) {
                    await this.sleep(500);
                    continue;
                }

                // Fetch messages from SQS
                const messages = await sqsService.receiveMessages(this.batchSize, 20);

                if (messages.length === 0) {
                    // No messages, wait a bit before next poll
                    await this.sleep(100);
                    continue;
                }

                metrics.increment('sqsMessagesReceived', messages.length);

                // Add messages to processing queue
                for (const message of messages) {
                    if (this.messageQueue.length < this.maxQueueSize) {
                        this.messageQueue.push(message);
                    } else {
                        logger.warn('Message queue full, dropping message');
                    }
                }

                // Small delay to prevent tight loop
                await this.sleep(50);
            } catch (error) {
                logger.error({ error: error.message, stack: error.stack }, 'Error in SQS polling');
                await this.sleep(1000); // Wait before retrying
            }
        }
    }

    /**
     * Worker process that processes messages from the queue
     */
    async processWorker(workerId) {
        logger.debug({ workerId }, 'Worker started');

        while (this.isRunning) {
            try {
                if (this.pauseProcessing) {
                    await this.sleep(1000);
                    continue;
                }

                // Get message from queue
                const message = this.messageQueue.shift();

                if (!message) {
                    // No messages, wait a bit
                    await this.sleep(100);
                    continue;
                }

                // Process message
                this.activeWorkers++;
                await this.processMessage(message, workerId);
                this.activeWorkers--;

                // Small delay to prevent tight loop
                await this.sleep(10);
            } catch (error) {
                this.activeWorkers--;
                logger.error({ workerId, error: error.message }, 'Error in worker process');
                await this.sleep(100);
            }
        }

        logger.debug({ workerId }, 'Worker stopped');
    }

    /**
     * Process a single SQS message
     */
    async processMessage(sqsMessage, workerId) {
        let parsedMessage = null;

        try {
            // Parse message
            parsedMessage = sqsService.parseMessage(sqsMessage);
            const { to, subject, content, contentType, receiptHandle, messageId, metadata } = parsedMessage;

            logger.debug({
                workerId,
                messageId,
                to,
                subject: subject?.substring(0, 50),
            }, 'Processing email message');

            // Send email
            const result = await emailService.sendEmail(
                to,
                subject,
                content,
                contentType || 'html',
                metadata
            );

            if (result.success) {
                // Delete message from SQS
                await sqsService.deleteMessage(receiptHandle);
                this.stats.totalSucceeded++;
                this.processedCount++;
                metrics.increment('sqsMessagesProcessed');

                logger.info({
                    workerId,
                    messageId,
                    to,
                    attempt: result.attempt,
                }, 'Email processed successfully');
            } else {
                // Handle failure
                this.handleFailure(sqsMessage, parsedMessage, result, workerId);
            }

            this.stats.totalProcessed++;
        } catch (error) {
            logger.error({
                workerId,
                messageId: parsedMessage?.messageId,
                error: error.message,
                stack: error.stack,
            }, 'Error processing message');

            this.stats.totalFailed++;
            this.failedCount++;

            // Try to send to DLQ if max retries reached
            try {
                await sqsService.sendToDLQ(
                    sqsMessage.Body,
                    sqsMessage.MessageAttributes || {}
                );
                metrics.increment('dlqMessages');
                await sqsService.deleteMessage(sqsMessage.ReceiptHandle);
            } catch (dlqError) {
                logger.error({ error: dlqError.message }, 'Failed to send to DLQ');
            }
        }
    }

    /**
     * Handle message processing failure
     */
    async handleFailure(sqsMessage, parsedMessage, result, workerId) {
        const { receiptHandle, messageId, to } = parsedMessage;

        // Check if it's a permanent failure (hard fail)
        if (!result.isRetryable) {
            logger.warn({
                workerId,
                messageId,
                to,
                error: result.error,
            }, 'Permanent failure, sending to DLQ');

            try {
                await sqsService.sendToDLQ(
                    sqsMessage.Body,
                    sqsMessage.MessageAttributes || {}
                );
                metrics.increment('dlqMessages');
                await sqsService.deleteMessage(receiptHandle);
            } catch (error) {
                logger.error({ error: error.message }, 'Failed to send to DLQ');
            }

            this.stats.totalFailed++;
        } else {
            // Transient failure - message will be retried by SQS visibility timeout
            logger.warn({
                workerId,
                messageId,
                to,
                attempt: result.attempt,
                willRetry: true,
            }, 'Transient failure, message will be retried by SQS');

            // Don't delete message - let it become visible again for retry
            // SQS will handle the retry via visibility timeout
        }
    }

    /**
     * Stop the worker pool gracefully
     */
    async stop() {
        logger.info('Stopping worker pool');
        this.isRunning = false;
        this.pauseProcessing = true;

        // Wait for active workers to finish
        let waitCount = 0;
        while (this.activeWorkers > 0 && waitCount < 300) {
            // Wait up to 30 seconds
            await this.sleep(100);
            waitCount++;
        }

        logger.info({
            totalProcessed: this.stats.totalProcessed,
            totalSucceeded: this.stats.totalSucceeded,
            totalFailed: this.stats.totalFailed,
        }, 'Worker pool stopped');
    }

    /**
     * Pause processing (useful for maintenance or rate limiting)
     */
    pause() {
        this.pauseProcessing = true;
        logger.info('Worker pool paused');
    }

    /**
     * Resume processing
     */
    resume() {
        this.pauseProcessing = false;
        logger.info('Worker pool resumed');
    }

    /**
     * Get worker pool statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeWorkers: this.activeWorkers,
            maxWorkers: this.maxWorkers,
            queueSize: this.messageQueue.length,
            isRunning: this.isRunning,
            pauseProcessing: this.pauseProcessing,
            uptimeSeconds: this.stats.startTime
                ? Math.floor((Date.now() - this.stats.startTime) / 1000)
                : 0,
        };
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Set max workers (for dynamic scaling)
     */
    setMaxWorkers(count) {
        const oldCount = this.maxWorkers;
        this.maxWorkers = Math.max(1, Math.min(count, 50)); // Limit between 1 and 50

        if (this.maxWorkers > oldCount && this.isRunning) {
            // Start additional workers
            for (let i = oldCount; i < this.maxWorkers; i++) {
                this.processWorker(i);
            }
        }

        logger.info({ oldCount, newCount: this.maxWorkers }, 'Max workers updated');
    }
}

module.exports = new WorkerPoolService();

