const emailService = require('./email.service');
const sqsService = require('./sqs.service');
const metrics = require('./metrics.service');
const rateLimiter = require('./rateLimiter.service');
const logger = require('../config/logger');
const config = require('../config/config');

/**
 * Cron-based Lambda processor for FIFO queue
 * Pulls messages from queue continuously until timeout or queue empty
 */
class CronProcessorService {
    constructor() {
        this.maxConcurrency = 10; // Process up to 10 emails concurrently
        this.batchSize = 10; // Pull 10 messages per ReceiveMessage call
        this.maxProcessingTime = 840000; // 14 minutes (leave 1 min buffer before Lambda timeout)
        this.startTime = null;
    }

    /**
     * Main entry point for cron-triggered Lambda
     * Continuously pulls and processes messages until timeout or queue empty
     */
    async processQueue(context = null) {
        this.startTime = Date.now();
        const lambdaDeadline = context?.getRemainingTimeInMillis
            ? context.getRemainingTimeInMillis() - 60000 // 1 min buffer
            : this.maxProcessingTime;

        logger.info({
            lambdaDeadline,
            batchSize: this.batchSize,
            maxConcurrency: this.maxConcurrency
        }, 'Starting queue processing');

        let totalProcessed = 0;
        let totalFailed = 0;
        let emptyPolls = 0;
        const maxEmptyPolls = 3; // Stop after 3 consecutive empty polls

        // Initialize SQS if needed
        await sqsService.initialize();

        // Process messages until timeout or queue empty
        while (this.getRemainingTime(lambdaDeadline) > 5000 && emptyPolls < maxEmptyPolls) {
            try {
                // Check remaining Lambda time
                const remainingTime = this.getRemainingTime(lambdaDeadline);
                if (remainingTime < 5000) {
                    logger.info({ remainingTime }, 'Approaching Lambda timeout, stopping');
                    break;
                }

                // Pull messages from FIFO queue
                // For FIFO queues, use short polling (WaitTimeSeconds: 0) for better control
                const waitTime = Math.min(20, Math.floor(remainingTime / 1000) - 1);
                const messages = await sqsService.receiveMessages(
                    this.batchSize,
                    waitTime > 0 ? waitTime : 0
                );

                if (!messages || messages.length === 0) {
                    emptyPolls++;
                    if (emptyPolls >= maxEmptyPolls) {
                        logger.info({ emptyPolls }, 'Queue appears empty, stopping');
                        break;
                    }
                    // Short wait before next poll
                    await this.sleep(1000);
                    continue;
                }

                emptyPolls = 0; // Reset counter on successful poll
                metrics.increment('sqsMessagesReceived', messages.length);

                logger.debug({
                    messageCount: messages.length,
                    remainingTime: Math.floor(remainingTime / 1000)
                }, 'Received messages from queue');

                // Process messages with controlled concurrency
                const results = await this.processMessagesWithConcurrency(messages, lambdaDeadline);

                const processed = results.filter(r => r.success).length;
                const failed = results.filter(r => !r.success).length;

                totalProcessed += processed;
                totalFailed += failed;

                logger.info({
                    batchProcessed: processed,
                    batchFailed: failed,
                    totalProcessed,
                    totalFailed,
                    remainingTime: Math.floor(this.getRemainingTime(lambdaDeadline) / 1000)
                }, 'Batch processing complete');

                // Small delay to prevent tight loop and allow SQS to update
                await this.sleep(100);

            } catch (error) {
                logger.error({
                    error: error.message,
                    stack: error.stack,
                    remainingTime: Math.floor(this.getRemainingTime(lambdaDeadline) / 1000)
                }, 'Error in queue processing loop');

                // Wait before retrying
                await this.sleep(2000);
            }
        }

        const summary = {
            totalProcessed,
            totalFailed,
            processingTimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
            stoppedReason: emptyPolls >= maxEmptyPolls ? 'queue_empty' : 'timeout',
        };

        logger.info(summary, 'Queue processing complete');

        return summary;
    }

    /**
     * Process messages with controlled concurrency
     */
    async processMessagesWithConcurrency(messages, lambdaDeadline) {
        const results = [];
        const chunks = [];

        // Split messages into chunks based on maxConcurrency
        for (let i = 0; i < messages.length; i += this.maxConcurrency) {
            chunks.push(messages.slice(i, i + this.maxConcurrency));
        }

        // Process each chunk sequentially to control concurrency
        for (const chunk of chunks) {
            // Check if we have time remaining
            if (this.getRemainingTime(lambdaDeadline) < 5000) {
                logger.warn('Insufficient time remaining, stopping message processing');
                // Mark remaining messages as not processed
                chunk.forEach(() => {
                    results.push({ success: false, error: 'timeout' });
                });
                break;
            }

            // Process chunk in parallel
            const chunkPromises = chunk.map(message => this.processMessage(message));
            const chunkResults = await Promise.allSettled(chunkPromises);

            chunkResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    logger.error(
                        { error: result.reason?.message, messageId: chunk[index]?.MessageId },
                        'Failed to process message'
                    );
                    results.push({ success: false, error: result.reason?.message });
                }
            });
        }

        return results;
    }

    /**
     * Process a single SQS message
     */
    async processMessage(sqsMessage) {
        let parsedMessage = null;

        try {
            // Parse SQS message
            parsedMessage = sqsService.parseMessage(sqsMessage);
            const { to, subject, content, contentType, receiptHandle, messageId, metadata } = parsedMessage;

            logger.debug({
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
                metrics.increment('sqsMessagesProcessed');

                logger.info({
                    messageId,
                    to,
                    attempt: result.attempt,
                }, 'Email processed successfully');

                return { success: true, messageId };
            } else {
                // Handle failure
                return await this.handleFailure(sqsMessage, parsedMessage, result);
            }
        } catch (error) {
            logger.error({
                messageId: parsedMessage?.messageId,
                error: error.message,
                stack: error.stack,
            }, 'Error processing message');

            metrics.increment('emailsFailed');

            // For transient failures, don't delete - let it retry via visibility timeout
            if (error.message?.includes('Transient failure')) {
                return { success: false, error: error.message, isRetryable: true };
            }

            // Permanent failures: send to DLQ
            try {
                await sqsService.sendToDLQ(
                    sqsMessage.Body || JSON.stringify(parsedMessage?.body || {}),
                    sqsMessage.MessageAttributes || {}
                );
                metrics.increment('dlqMessages');
                await sqsService.deleteMessage(sqsMessage.ReceiptHandle);
            } catch (dlqError) {
                logger.error({ error: dlqError.message }, 'Failed to send to DLQ');
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * Handle message processing failure
     */
    async handleFailure(sqsMessage, parsedMessage, result) {
        const { receiptHandle, messageId, to } = parsedMessage;

        // Check if it's a permanent failure (hard fail)
        if (!result.isRetryable) {
            logger.warn({
                messageId,
                to,
                error: result.error,
            }, 'Permanent failure, sending to DLQ');

            try {
                await sqsService.sendToDLQ(
                    sqsMessage.Body || JSON.stringify(parsedMessage.body),
                    sqsMessage.MessageAttributes || {}
                );
                metrics.increment('dlqMessages');
                await sqsService.deleteMessage(receiptHandle);
            } catch (error) {
                logger.error({ error: error.message }, 'Failed to send to DLQ');
            }

            return { success: false, permanent: true, error: result.error };
        } else {
            // Transient failure - don't delete message, let it retry via SQS visibility timeout
            logger.warn({
                messageId,
                to,
                attempt: result.attempt,
                willRetry: true,
            }, 'Transient failure, message will be retried by SQS');

            return { success: false, isRetryable: true, error: result.error };
        }
    }

    /**
     * Get remaining processing time
     */
    getRemainingTime(lambdaDeadline) {
        if (typeof lambdaDeadline === 'function') {
            return lambdaDeadline();
        }
        if (this.startTime) {
            return lambdaDeadline - (Date.now() - this.startTime);
        }
        return lambdaDeadline;
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Set max concurrency
     */
    setMaxConcurrency(count) {
        this.maxConcurrency = Math.max(1, Math.min(count, 50));
        logger.info({ maxConcurrency: this.maxConcurrency }, 'Updated max concurrency');
    }
}

module.exports = new CronProcessorService();

