const logger = require('../config/logger');

/**
 * Metrics collection service for observability
 */
class MetricsService {
    constructor() {
        this.metrics = {
            emailsSent: 0,
            emailsFailed: 0,
            emailsSoftFailed: 0,
            emailsHardFailed: 0,
            sqsMessagesReceived: 0,
            sqsMessagesProcessed: 0,
            smtpErrors: 0,
            retries: 0,
            dlqMessages: 0,
            startTime: Date.now(),
        };

        // Time-series data for rate calculations
        this.timeSeries = {
            emailsSent: [],
            errors: [],
        };

        // Per-domain metrics
        this.domainMetrics = new Map();

        // Interval for periodic metrics logging
        this.reportInterval = null;
    }

    /**
     * Increment a counter metric
     */
    increment(metric, value = 1) {
        if (this.metrics[metric] !== undefined) {
            this.metrics[metric] += value;
        }
    }

    /**
     * Record a timestamped event for rate calculations
     */
    recordEvent(type, timestamp = Date.now()) {
        if (!this.timeSeries[type]) {
            this.timeSeries[type] = [];
        }
        this.timeSeries[type].push(timestamp);

        // Keep only last 5 minutes of data
        const fiveMinutesAgo = timestamp - 5 * 60 * 1000;
        this.timeSeries[type] = this.timeSeries[type].filter(t => t > fiveMinutesAgo);
    }

    /**
     * Record domain-specific metrics
     */
    recordDomainMetric(domain, success, errorType = null) {
        if (!this.domainMetrics.has(domain)) {
            this.domainMetrics.set(domain, {
                sent: 0,
                failed: 0,
                softFail: 0,
                hardFail: 0,
                lastError: null,
                lastErrorTime: null,
            });
        }

        const metrics = this.domainMetrics.get(domain);
        if (success) {
            metrics.sent++;
        } else {
            metrics.failed++;
            if (errorType === 'soft') {
                metrics.softFail++;
            } else if (errorType === 'hard') {
                metrics.hardFail++;
            }
            metrics.lastError = errorType;
            metrics.lastErrorTime = Date.now();
        }
    }

    /**
     * Calculate emails per minute
     */
    getEmailsPerMinute() {
        const oneMinuteAgo = Date.now() - 60 * 1000;
        const recent = this.timeSeries.emailsSent?.filter(t => t > oneMinuteAgo) || [];
        return recent.length;
    }

    /**
     * Get error rate (errors per minute)
     */
    getErrorRate() {
        const oneMinuteAgo = Date.now() - 60 * 1000;
        const recent = this.timeSeries.errors?.filter(t => t > oneMinuteAgo) || [];
        return recent.length;
    }

    /**
     * Get queue depth estimate (approximate based on processing rate)
     */
    getEstimatedQueueDepth() {
        // This is an approximation - actual queue depth should be queried from SQS
        const processingRate = this.getEmailsPerMinute();
        const targetRate = 35; // emails per second = 2100 per minute
        return Math.max(0, (targetRate * 60) - processingRate);
    }

    /**
     * Get comprehensive metrics snapshot
     */
    getMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        const uptimeMinutes = Math.floor(uptime / 60000);

        return {
            counters: {
                ...this.metrics,
                uptimeSeconds: Math.floor(uptime / 1000),
                uptimeMinutes,
            },
            rates: {
                emailsPerMinute: this.getEmailsPerMinute(),
                errorRate: this.getErrorRate(),
                estimatedQueueDepth: this.getEstimatedQueueDepth(),
                averageEmailsPerMinute: uptimeMinutes > 0 ? this.metrics.emailsSent / uptimeMinutes : 0,
            },
            domainMetrics: Object.fromEntries(this.domainMetrics),
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Log metrics periodically
     */
    startPeriodicReporting(intervalSeconds = 60) {
        if (this.reportInterval) {
            clearInterval(this.reportInterval);
        }

        this.reportInterval = setInterval(() => {
            const metrics = this.getMetrics();
            logger.info(metrics, 'Email processing metrics');
        }, intervalSeconds * 1000);
    }

    /**
     * Stop periodic reporting
     */
    stopPeriodicReporting() {
        if (this.reportInterval) {
            clearInterval(this.reportInterval);
            this.reportInterval = null;
        }
    }

    /**
     * Reset metrics (useful for testing)
     */
    reset() {
        this.metrics = {
            emailsSent: 0,
            emailsFailed: 0,
            emailsSoftFailed: 0,
            emailsHardFailed: 0,
            sqsMessagesReceived: 0,
            sqsMessagesProcessed: 0,
            smtpErrors: 0,
            retries: 0,
            dlqMessages: 0,
            startTime: Date.now(),
        };
        this.timeSeries = {
            emailsSent: [],
            errors: [],
        };
        this.domainMetrics.clear();
    }
}

module.exports = new MetricsService();

