const { connectToDatabase } = require('./src/config/db');
const cronProcessor = require('./src/services/cronProcessor.service');
const sqsService = require('./src/services/sqs.service');
const logger = require('./src/config/logger');

// Only load for standalone mode (when running node index.js directly)
let smtpEmailService = null;
if (require.main === module) {
    smtpEmailService = require('./src/services/smtp');
}

/**
 * Main entry point for the email processing service
 * Supports CloudWatch cron-triggered Lambda (pulls from FIFO queue) and standalone Node.js service
 */

// For AWS Lambda - triggered by CloudWatch cron
// Lambda pulls messages from FIFO queue continuously until timeout or queue empty
exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        // Connect to database if needed
        await connectToDatabase();

        // Process queue by pulling messages continuously
        // This will process messages until Lambda timeout or queue is empty
        const result = await cronProcessor.processQueue(context);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Queue processing complete',
                processed: result.totalProcessed,
                failed: result.totalFailed,
                processingTimeSeconds: result.processingTimeSeconds,
                stoppedReason: result.stoppedReason,
            })
        };
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Lambda handler error');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

// For standalone Node.js service
if (require.main === module) {
    (async () => {
        try {
            // Connect to database
            await connectToDatabase();

            // Start the email processing service
            await smtpEmailService.start();

            logger.info('Email processing service is running. Press Ctrl+C to stop.');
        } catch (error) {
            logger.error({ error: error.message, stack: error.stack }, 'Failed to start service');
            process.exit(1);
        }
    })();
}
