const emailService = require('./email.service');
const sqsService = require('./sqs.service');
const metrics = require('./metrics.service');
const rateLimiter = require('./rateLimiter.service');
const logger = require('../config/logger');

/**
 * Lambda-optimized message processor
 * Processes SQS events directly without polling loops
 */
class LambdaProcessorService {
    constructor() {
        this.maxConcurrency = 10; // Process up to 10 emails concurrently
    }

    /**
     * Process SQS event from Lambda
     * SQS event source mapping provides messages in event.Records
     * Returns format compatible with partial batch failure reporting
     */
    async processSQSEvent(event) {
        if (!event.Records || !Array.isArray(event.Records)) {
            logger.warn('Invalid SQS event format', { event });
            return { processed: 0, failed: 0, batchItemFailures: [] };
        }

        const records = event.Records;
        metrics.increment('sqsMessagesReceived', records.length);

        logger.info({ messageCount: records.length }, 'Processing SQS event');

        // Process messages in parallel with controlled concurrency
        const results = await this.processMessagesWithConcurrency(records);

        // Collect failed message IDs for partial batch failure reporting
        const batchItemFailures = results
            .map((result, index) => ({
                result,
                record: records[index],
            }))
            .filter(({ result }) => !result.success && !result.permanent)
            .map(({ record }) => ({ itemIdentifier: record.messageId }));

        const summary = {
            processed: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            permanent: results.filter(r => r.permanent).length,
            total: records.length,
            batchItemFailures, // For Lambda partial batch failure reporting
        };

        logger.info({
            ...summary,
            batchItemFailuresCount: batchItemFailures.length,
        }, 'SQS event processing complete');

        return summary;
    }

    /**
     * Process messages with controlled concurrency
     */
    async processMessagesWithConcurrency(records) {
        const results = [];
        const chunks = [];

        // Split records into chunks based on maxConcurrency
        for (let i = 0; i < records.length; i += this.maxConcurrency) {
            chunks.push(records.slice(i, i + this.maxConcurrency));
        }

        // Process each chunk
        for (const chunk of chunks) {
            const chunkPromises = chunk.map(record => this.processMessage(record));
            const chunkResults = await Promise.allSettled(chunkPromises);

            chunkResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    logger.error(
                        { error: result.reason?.message, record: chunk[index] },
                        'Failed to process message'
                    );
                    results.push({ success: false, error: result.reason?.message });
                }
            });
        }

        return results;
    }

    /**
     * Process a single SQS record
     */
    async processMessage(record) {
        let parsedMessage = null;

        try {
            // Parse SQS record (Lambda SQS event format)
            parsedMessage = this.parseSQSMessage(record);
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
                return this.handleFailure(record, parsedMessage, result);
            }
        } catch (error) {
            logger.error({
                messageId: parsedMessage?.messageId,
                error: error.message,
                stack: error.stack,
            }, 'Error processing message');

            metrics.increment('emailsFailed');

            // Try to send to DLQ if it's a permanent failure
            try {
                await sqsService.sendToDLQ(
                    record.body,
                    {}
                );
                metrics.increment('dlqMessages');
                await sqsService.deleteMessage(record.receiptHandle);
            } catch (dlqError) {
                logger.error({ error: dlqError.message }, 'Failed to send to DLQ');
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * Parse SQS message from Lambda event record
     */
    parseSQSMessage(record) {
        try {
            // SQS event record structure
            const body = JSON.parse(record.body || '{}');
            const attributes = record.messageAttributes || {};

            // Some SQS configurations send body as string that needs parsing
            let messageBody = body;
            if (typeof body === 'string') {
                try {
                    messageBody = JSON.parse(body);
                } catch {
                    messageBody = { content: body };
                }
            }

            return {
                receiptHandle: record.receiptHandle,
                messageId: record.messageId,
                body: messageBody,
                to: attributes.to?.stringValue || attributes.to?.StringValue || messageBody.to || body.to,
                subject: attributes.subject?.stringValue || attributes.subject?.StringValue || messageBody.subject || body.subject,
                content: messageBody.content || messageBody.html || messageBody.text || messageBody.body || body,
                contentType: messageBody.contentType || (messageBody.html ? 'html' : 'text'),
                metadata: {
                    ...messageBody,
                    messageId: record.messageId,
                    receivedAt: new Date(),
                    eventSourceARN: record.eventSourceARN,
                },
            };
        } catch (error) {
            logger.error({ error: error.message, record }, 'Failed to parse SQS message');
            throw new Error(`Invalid message format: ${error.message}`);
        }
    }

    /**
     * Handle message processing failure
     */
    async handleFailure(record, parsedMessage, result) {
        const { receiptHandle, messageId, to } = parsedMessage;

        // Check if it's a permanent failure (hard fail)
        if (!result.isRetryable) {
            logger.warn({
                messageId,
                to,
                error: result.error,
            }, 'Permanent failure, sending to DLQ');

            try {
                await sqsService.sendToDLQ(record.body || parsedMessage.body, {});
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

            // Throw error so Lambda marks it as failed and SQS retries
            throw new Error(`Transient failure: ${result.error}`);
        }
    }

    /**
     * Set max concurrency
     */
    setMaxConcurrency(count) {
        this.maxConcurrency = Math.max(1, Math.min(count, 50));
        logger.info({ maxConcurrency: this.maxConcurrency }, 'Updated max concurrency');
    }
}

module.exports = new LambdaProcessorService();

