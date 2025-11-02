const nodemailer = require('nodemailer');
const config = require('../config/config');
const logger = require('../config/logger');
const rateLimiter = require('./rateLimiter.service');
const metrics = require('./metrics.service');
const crypto = require('crypto');

/**
 * Email sending service with retry logic, domain-based sending, and deliverability features
 */
class EmailService {
    constructor() {
        // Multiple SMTP transporters for domain-based sending
        this.transporters = new Map();
        this.defaultTransporter = null;
        this.initTransporters();

        // Retry configuration
        this.maxRetries = 3;
        this.initialRetryDelay = 1000; // 1 second
        this.maxRetryDelay = 60000; // 60 seconds

        // Processed message IDs for idempotency
        this.processedMessages = new Map();
        this.idempotencyWindow = 24 * 60 * 60 * 1000; // 24 hours
    }

    /**
     * Initialize SMTP transporters
     */
    initTransporters() {
        // Default transporter
        this.defaultTransporter = require('../config/transporter');

        // Support for multiple sending domains/IPs (if configured)
        const additionalDomains = config.smtp.additionalDomains || [];
        additionalDomains.forEach((domainConfig, index) => {
            const transporter = nodemailer.createTransport({
                host: domainConfig.host || config.smtp.host,
                port: domainConfig.port || config.smtp.port,
                secure: domainConfig.secure !== undefined ? domainConfig.secure : config.smtp.secure,
                auth: {
                    user: domainConfig.user || config.smtp.user,
                    pass: domainConfig.password || config.smtp.password,
                },
                pool: config.smtp.pool,
                maxConnections: domainConfig.maxConnections || config.smtp.maxConnections || 20,
                connectionTimeout: 15000,
                greetingTimeout: 10000,
            });

            this.transporters.set(domainConfig.domain || `domain-${index}`, transporter);
        });
    }

    /**
     * Generate message ID for idempotency
     */
    generateMessageId(to, subject, content) {
        const hash = crypto
            .createHash('sha256')
            .update(`${to}:${subject}:${content.substring(0, 100)}`)
            .digest('hex');
        return hash;
    }

    /**
     * Check if message was already processed (idempotency)
     */
    isAlreadyProcessed(messageId) {
        if (this.processedMessages.has(messageId)) {
            const processedAt = this.processedMessages.get(messageId);
            const age = Date.now() - processedAt;
            if (age < this.idempotencyWindow) {
                return true;
            }
            // Remove old entry
            this.processedMessages.delete(messageId);
        }
        return false;
    }

    /**
     * Mark message as processed
     */
    markAsProcessed(messageId) {
        this.processedMessages.set(messageId, Date.now());
    }

    /**
     * Cleanup old processed message IDs
     */
    cleanupProcessedMessages() {
        const now = Date.now();
        for (const [messageId, processedAt] of this.processedMessages.entries()) {
            if (now - processedAt > this.idempotencyWindow) {
                this.processedMessages.delete(messageId);
            }
        }
    }

    /**
     * Extract domain from email address
     */
    extractDomain(email) {
        if (!email || typeof email !== 'string') {
            return null;
        }
        const parts = email.split('@');
        return parts.length > 1 ? parts[1].toLowerCase() : null;
    }

    /**
     * Select appropriate transporter based on domain
     */
    selectTransporter(recipientDomain) {
        // If we have domain-specific transporters, use them in round-robin
        if (this.transporters.size > 0) {
            const domains = Array.from(this.transporters.keys());
            // Simple hash-based selection for consistent domain assignment
            const index = Math.abs(recipientDomain?.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % domains.length;
            return this.transporters.get(domains[index]);
        }
        return this.defaultTransporter;
    }

    /**
     * Generate RFC-compliant Message-ID for Gmail deliverability
     */
    generateRFCCompliantMessageId(fromEmail) {
        const domain = fromEmail.split('@')[1] || 'example.com';
        const timestamp = Date.now();
        const randomBytes = crypto.randomBytes(12).toString('base64url').replace(/[^a-zA-Z0-9]/g, '');
        // RFC 5322 compliant format: <local-part@domain>
        return `<${timestamp}.${randomBytes}@${domain}>`;
    }

    /**
     * Add proper email headers optimized for Gmail bulk sending
     */
    randomizeHeaders(baseHeaders = {}, to) {
        const fromEmail = config.smtp.from;
        const fromDomain = fromEmail.split('@')[1] || 'example.com';

        // Generate RFC-compliant Message-ID (critical for Gmail)
        const messageId = this.generateRFCCompliantMessageId(fromEmail);

        // Get current date in RFC 2822 format
        const date = new Date().toUTCString();

        // Build headers optimized for bulk sending to Gmail
        const headers = {
            ...baseHeaders,
            // Required headers
            'Message-ID': messageId,
            'Date': date,
            'From': fromEmail,

            // Recommended headers for deliverability
            'MIME-Version': '1.0',
            'X-Mailer': 'EmailService/1.0',

            // Avoid spam triggers - don't use suspicious headers
            // 'X-Priority' and 'X-MSMail-Priority' can trigger spam filters, use sparingly

            // List-Unsubscribe header (recommended for bulk emails)
            ...(config.smtp.listUnsubscribe ? {
                'List-Unsubscribe': config.smtp.listUnsubscribe,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
            } : {}),
        };

        // Add Return-Path if configured (for bounce handling)
        if (config.smtp.returnPath) {
            headers['Return-Path'] = config.smtp.returnPath;
        }

        // Add Reply-To if configured
        if (config.smtp.replyTo) {
            headers['Reply-To'] = config.smtp.replyTo;
        }

        // Add custom headers if configured
        if (config.smtp.customHeaders) {
            Object.assign(headers, config.smtp.customHeaders);
        }

        // Randomize timestamps slightly to avoid patterns (small jitter ±30 seconds)
        const jitterSeconds = Math.floor(Math.random() * 60) - 30;
        const jitteredDate = new Date(Date.now() + jitterSeconds * 1000);
        headers['Date'] = jitteredDate.toUTCString();

        return headers;
    }

    /**
     * Prepare email options optimized for Gmail bulk sending
     * Includes proper headers, DKIM/SPF alignment, and deliverability best practices
     */
    prepareEmailOptions(to, subject, content, contentType = 'html') {
        const recipientDomain = this.extractDomain(to);
        const transporter = this.selectTransporter(recipientDomain);

        // Base email structure
        const baseOptions = {
            from: config.smtp.from,
            to,
            subject,
            // Ensure both text and HTML for better deliverability
            ...(contentType === 'html'
                ? { html: content, text: this.extractTextFromHTML(content) }
                : { text: content }
            ),
        };

        // Add optimized headers for Gmail
        baseOptions.headers = this.randomizeHeaders({}, to);

        // Add delay randomization (more jitter for bulk sending)
        // Larger jitter for Gmail to mimic natural sending patterns
        const isGmail = recipientDomain === 'gmail.com' || recipientDomain === 'googlemail.com';
        const jitter = isGmail
            ? Math.random() * 200 + 50 // 50-250ms for Gmail
            : Math.random() * 100; // 0-100ms for others

        // Add envelope for proper routing (optional but recommended)
        if (config.smtp.envelope) {
            baseOptions.envelope = {
                from: config.smtp.from,
                to: to,
            };
        }

        return {
            options: baseOptions,
            transporter,
            delay: jitter,
        };
    }

    /**
     * Extract plain text from HTML (fallback for text-only clients)
     */
    extractTextFromHTML(html) {
        if (!html) return '';
        // Simple text extraction (remove HTML tags)
        return html
            .replace(/<style[^>]*>.*?<\/style>/gi, '')
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 1000); // Limit text length
    }

    /**
     * Calculate exponential backoff delay
     */
    calculateBackoffDelay(attempt) {
        const delay = this.initialRetryDelay * Math.pow(2, attempt - 1);
        // Add jitter
        const jitter = Math.random() * 0.3 * delay;
        return Math.min(delay + jitter, this.maxRetryDelay);
    }

    /**
     * Determine if error is retryable (soft fail) or permanent (hard fail)
     */
    isRetryableError(error) {
        if (!error) return false;

        const errorMessage = error.message?.toLowerCase() || '';
        const errorCode = error.code?.toLowerCase() || '';

        // Network/timeout errors - retryable
        if (errorCode === 'etimedout' || errorCode === 'econnreset' || errorCode === 'enotfound') {
            return true;
        }

        // SMTP 4xx errors - mostly retryable (transient)
        if (error.responseCode >= 400 && error.responseCode < 500) {
            // Gmail-specific rate limiting (421 Service temporarily unavailable)
            if (error.responseCode === 421 || errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
                return true;
            }
            // Gmail temporary blocks (450 - greylisting, temporary block)
            if (error.responseCode === 450 || errorMessage.includes('temporarily deferred')) {
                return true;
            }
            // Mailbox temporarily full (452)
            if (error.responseCode === 451 || error.responseCode === 452) {
                return true; // Greylisting or mailbox full - retryable
            }
            // Gmail quota exceeded (temporary)
            if (errorMessage.includes('quota') || errorMessage.includes('exceeded')) {
                return true;
            }
        }

        // SMTP 5xx errors - retryable (server errors)
        if (error.responseCode >= 500 && error.responseCode < 600) {
            return true;
        }

        // Permanent failures
        if (error.responseCode === 550 || error.responseCode === 551 || error.responseCode === 552) {
            return false; // Mailbox doesn't exist or message too large
        }

        // Default: retry transient errors
        return true;
    }

    /**
     * Send email with retry logic
     */
    async sendEmail(to, subject, content, contentType = 'html', metadata = {}) {
        const messageId = this.generateMessageId(to, subject, content);
        const recipientDomain = this.extractDomain(to);

        // Check idempotency
        if (this.isAlreadyProcessed(messageId)) {
            logger.info({ messageId, to }, 'Email already processed, skipping');
            return { success: true, skipped: true, reason: 'idempotency' };
        }

        // Apply rate limiting
        await rateLimiter.waitIfNeeded(to);

        // Prepare email options
        const { options, transporter, delay } = this.prepareEmailOptions(to, subject, content, contentType);

        // Apply small random delay
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        let lastError = null;
        let attempt = 0;

        while (attempt < this.maxRetries) {
            attempt++;

            try {
                // Send email
                const info = await transporter.sendMail(options);

                // Mark as processed
                this.markAsProcessed(messageId);

                // Record success
                rateLimiter.recordSend(recipientDomain);
                metrics.increment('emailsSent');
                metrics.recordEvent('emailsSent');
                metrics.recordDomainMetric(recipientDomain, true);

                logger.info({
                    messageId,
                    to,
                    subject,
                    attempt,
                    messageId: info.messageId,
                    response: info.response,
                }, 'Email sent successfully');

                return {
                    success: true,
                    messageId: info.messageId,
                    response: info.response,
                    attempt,
                };
            } catch (error) {
                lastError = error;
                const isRetryable = this.isRetryableError(error);

                metrics.increment('smtpErrors');
                metrics.recordEvent('errors');
                metrics.recordDomainMetric(recipientDomain, false, isRetryable ? 'soft' : 'hard');

                logger.error({
                    messageId,
                    to,
                    attempt,
                    error: error.message,
                    responseCode: error.responseCode,
                    isRetryable,
                }, 'Email send failed');

                // If not retryable or max retries reached, fail
                if (!isRetryable || attempt >= this.maxRetries) {
                    if (isRetryable) {
                        metrics.increment('emailsSoftFailed');
                    } else {
                        metrics.increment('emailsHardFailed');
                    }
                    metrics.increment('emailsFailed');

                    // If rate limit error, set cooldown
                    if (error.responseCode === 421 || (error.message?.toLowerCase().includes('rate limit'))) {
                        rateLimiter.setDomainCooldown(recipientDomain, 60000); // 1 minute cooldown
                    }

                    return {
                        success: false,
                        error: error.message,
                        responseCode: error.responseCode,
                        isRetryable,
                        attempt,
                    };
                }

                // Calculate backoff delay
                const backoffDelay = this.calculateBackoffDelay(attempt);
                metrics.increment('retries');

                logger.warn({
                    messageId,
                    to,
                    attempt,
                    retryIn: backoffDelay,
                }, 'Retrying email send');

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }

        // Should not reach here, but handle just in case
        metrics.increment('emailsFailed');
        return {
            success: false,
            error: lastError?.message || 'Unknown error',
            attempt,
        };
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            processedMessagesCount: this.processedMessages.size,
            transportersCount: this.transporters.size + 1, // +1 for default
        };
    }
}

module.exports = new EmailService();

