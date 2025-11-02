const AWS = require('aws-sdk');
const https = require('https');
const config = require('../config/config');
const logger = require('../config/logger');

// Create a connection pool for better performance
const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    rejectUnauthorized: true
});

/**
 * AWS SQS Service for polling messages
 */
class SQSService {
    constructor() {
        try {
            // Configure AWS SDK v2 for maximum performance
            this.sqs = new AWS.SQS({
                region: config.aws.CUSTOM_AWS_REGION,
                accessKeyId: config.aws.CUSTOM_AWS_ACCESS_KEY,
                secretAccessKey: config.aws.CUSTOM_AWS_SECRET_ACCESS,
                apiVersion: '2012-11-05',
                maxRetries: 1,
                httpOptions: {
                    timeout: 2000,
                    connectTimeout: 1000,
                    agent  // Use the shared connection pool
                }
            });
            this.queueUrl = null;
        } catch (error) {
            logger.error({ error: error.message }, 'Failed to initialize SQS client');
            throw error;
        }
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
                    const params = {
                        QueueName: config.aws.SQS_QUEUE_NAME
                    };
                    const response = await this.sqs.getQueueUrl(params).promise();
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
            const params = {
                QueueUrl: this.queueUrl,
                MaxNumberOfMessages: Math.min(maxMessages, 10),
                WaitTimeSeconds: waitTimeSeconds,
                MessageAttributeNames: ['All'],
                AttributeNames: ['All'],
            };

            const response = await this.sqs.receiveMessage(params).promise();

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
            const params = {
                QueueUrl: this.queueUrl,
                ReceiptHandle: receiptHandle,
            };

            await this.sqs.deleteMessage(params).promise();
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

            // Convert messageAttributes to AWS SDK v2 format
            const sqsAttributes = {};
            Object.keys(messageAttributes).forEach(key => {
                sqsAttributes[key] = {
                    DataType: 'String',
                    StringValue: typeof messageAttributes[key] === 'string'
                        ? messageAttributes[key]
                        : JSON.stringify(messageAttributes[key])
                };
            });

            const params = {
                QueueUrl: targetUrl,
                MessageBody: typeof messageBody === 'string' ? messageBody : JSON.stringify(messageBody),
                MessageAttributes: Object.keys(sqsAttributes).length > 0 ? sqsAttributes : undefined,
            };

            await this.sqs.sendMessage(params).promise();
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

            // Handle AWS SDK v2 attribute format (nested StringValue)
            const getAttributeValue = (attr) => {
                if (!attr) return null;
                return attr.StringValue || attr.stringValue || attr;
            };

            return {
                receiptHandle: sqsMessage.ReceiptHandle,
                messageId: sqsMessage.MessageId,
                body: body,
                to: getAttributeValue(attributes.to) || body.to,
                subject: getAttributeValue(attributes.subject) || body.subject,
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