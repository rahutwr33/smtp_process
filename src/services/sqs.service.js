const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand, GetQueueUrlCommand } = require('@aws-sdk/client-sqs');
const config = require('../config/config');
const logger = require('../config/logger');

/**
 * AWS SQS Service for polling messages
 */
class SQSService {
    constructor() {
        this.client = new SQSClient({
            region: config.aws.CUSTOM_AWS_REGION,
            credentials: {
                accessKeyId: config.aws.CUSTOM_AWS_ACCESS_KEY,
                secretAccessKey: config.aws.CUSTOM_AWS_SECRET_ACCESS,
            },
        });
        this.queueUrl = null;
    }

    /**
     * Initialize and get the queue URL
     */
    async initialize() {
        try {
            // If queue name is provided, we'll construct the URL
            // Otherwise, assume it's already a URL
            if (config.aws.SQS_QUEUE_NAME.startsWith('https://')) {
                this.queueUrl = config.aws.SQS_QUEUE_NAME;
            } else {
                // Try to get queue URL using AWS API (more reliable)
                try {
                    const command = new GetQueueUrlCommand({
                        QueueName: config.aws.SQS_QUEUE_NAME,
                    });
                    const response = await this.client.send(command);
                    this.queueUrl = response.QueueUrl;
                } catch (apiError) {
                    // Fallback to URL construction if API call fails
                    logger.warn({ error: apiError.message }, 'Failed to get queue URL from API, constructing manually');
                    this.queueUrl = `https://sqs.${config.aws.CUSTOM_AWS_REGION}.amazonaws.com/${config.aws.CUSTOM_AWS_ACCOUNT_ID || ''}/${config.aws.SQS_QUEUE_NAME}`;
                }
            }
            logger.info({ queueUrl: this.queueUrl }, 'SQS service initialized');
        } catch (error) {
            logger.error({ error: error.message }, 'Failed to initialize SQS service');
            throw error;
        }
    }

    /**
     * Receive messages from SQS with long polling
     * @param {number} maxMessages - Maximum number of messages to receive (1-10)
     * @param {number} waitTimeSeconds - Long poll wait time (0-20 seconds)
     * @returns {Promise<Array>} Array of SQS messages
     */
    async receiveMessages(maxMessages = 10, waitTimeSeconds = 20) {
        if (!this.queueUrl) {
            await this.initialize();
        }

        try {
            const command = new ReceiveMessageCommand({
                QueueUrl: this.queueUrl,
                MaxNumberOfMessages: Math.min(maxMessages, 10),
                WaitTimeSeconds: waitTimeSeconds,
                MessageAttributeNames: ['All'],
                AttributeNames: ['All'],
            });

            const response = await this.client.send(command);

            if (response.Messages && response.Messages.length > 0) {
                logger.debug(
                    { messageCount: response.Messages.length },
                    'Received messages from SQS'
                );
            }

            return response.Messages || [];
        } catch (error) {
            logger.error({ error: error.message, stack: error.stack }, 'Failed to receive messages from SQS');
            throw error;
        }
    }

    /**
     * Delete a message from the queue after successful processing
     * @param {string} receiptHandle - Message receipt handle
     */
    async deleteMessage(receiptHandle) {
        if (!this.queueUrl) {
            await this.initialize();
        }

        try {
            const command = new DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: receiptHandle,
            });

            await this.client.send(command);
            logger.debug({ receiptHandle }, 'Deleted message from SQS');
        } catch (error) {
            logger.error({ error: error.message, receiptHandle }, 'Failed to delete message from SQS');
            throw error;
        }
    }

    /**
     * Send message to dead-letter queue
     * @param {Object} messageBody - Message body to send
     * @param {Object} messageAttributes - Message attributes
     */
    async sendToDLQ(messageBody, messageAttributes = {}) {
        const dlqUrl = config.aws.SQS_DLQ_URL || config.aws.SQS_DLQ_NAME;

        if (!dlqUrl) {
            logger.warn('DLQ not configured, skipping message');
            return;
        }

        try {
            let targetUrl = dlqUrl;
            if (!targetUrl.startsWith('https://') && config.aws.CUSTOM_AWS_REGION) {
                targetUrl = `https://sqs.${config.aws.CUSTOM_AWS_REGION}.amazonaws.com/${config.aws.CUSTOM_AWS_ACCOUNT_ID || ''}/${dlqUrl}`;
            }

            const command = new SendMessageCommand({
                QueueUrl: targetUrl,
                MessageBody: typeof messageBody === 'string' ? messageBody : JSON.stringify(messageBody),
                MessageAttributes: messageAttributes,
            });

            await this.client.send(command);
            logger.info({ dlqUrl: targetUrl }, 'Message sent to dead-letter queue');
        } catch (error) {
            logger.error({ error: error.message }, 'Failed to send message to DLQ');
            throw error;
        }
    }

    /**
     * Extract email data from SQS message
     * @param {Object} sqsMessage - SQS message object
     * @returns {Object} Parsed email data
     */
    parseMessage(sqsMessage) {
        try {
            const body = JSON.parse(sqsMessage.Body);
            const attributes = sqsMessage.MessageAttributes || {};

            return {
                receiptHandle: sqsMessage.ReceiptHandle,
                messageId: sqsMessage.MessageId,
                body: body,
                to: attributes.to?.StringValue || body.to,
                subject: attributes.subject?.StringValue || body.subject,
                content: body.content || body.html || body.text || body.body,
                contentType: body.contentType || (body.html ? 'html' : 'text'),
                metadata: {
                    ...body,
                    messageId: sqsMessage.MessageId,
                    receivedAt: new Date(),
                },
            };
        } catch (error) {
            logger.error({ error: error.message, messageId: sqsMessage.MessageId }, 'Failed to parse SQS message');
            throw new Error(`Invalid message format: ${error.message}`);
        }
    }
}

module.exports = new SQSService();

