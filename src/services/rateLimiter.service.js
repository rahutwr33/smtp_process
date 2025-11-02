const logger = require('../config/logger');

/**
 * Rate limiter service for email sending
 * Implements per-domain throttling and global rate limiting
 */
class RateLimiterService {
    constructor() {
        // Domain-specific rate limits (emails per minute)
        // Conservative limits to avoid blocks, especially for Gmail
        this.domainLimits = new Map([
            ['gmail.com', 15], // Conservative: Gmail allows ~20/min but safer at 15
            ['googlemail.com', 15], // Same as gmail.com
            ['outlook.com', 20],
            ['hotmail.com', 20],
            ['live.com', 20],
            ['msn.com', 20],
            ['yahoo.com', 25],
            ['aol.com', 25],
            ['default', 30], // Default limit (more conservative)
        ]);

        // Track recent sends per domain
        this.domainCounters = new Map();

        // Global rate limit (emails per second)
        this.globalRateLimit = 35; // ~35 emails/sec = 2100/min
        this.globalCounter = [];
        this.globalCounterStartTime = Date.now();

        // Per-domain cooldown periods (in milliseconds)
        this.domainCooldowns = new Map();

        // Cleanup interval for expired counters
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Every minute
    }

    /**
     * Extract domain from email address
     */
    extractDomain(email) {
        if (!email || typeof email !== 'string') {
            return 'unknown';
        }
        const parts = email.split('@');
        if (parts.length < 2) {
            return 'unknown';
        }
        return parts[1].toLowerCase();
    }

    /**
     * Get rate limit for a domain
     */
    getDomainLimit(domain) {
        return this.domainLimits.get(domain) || this.domainLimits.get('default');
    }

    /**
     * Check if we can send to a domain right now
     */
    canSendToDomain(domain) {
        const limit = this.getDomainLimit(domain);
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        // Check cooldown
        const cooldownUntil = this.domainCooldowns.get(domain);
        if (cooldownUntil && now < cooldownUntil) {
            return false;
        }

        // Count recent sends
        if (!this.domainCounters.has(domain)) {
            this.domainCounters.set(domain, []);
        }

        const timestamps = this.domainCounters.get(domain);
        const recent = timestamps.filter(t => t > oneMinuteAgo);

        return recent.length < limit;
    }

    /**
     * Check global rate limit
     */
    canSendGlobally() {
        const now = Date.now();
        const oneSecondAgo = now - 1000;

        // Keep only recent entries
        this.globalCounter = this.globalCounter.filter(t => t > oneSecondAgo);

        return this.globalCounter.length < this.globalRateLimit;
    }

    /**
     * Record a send attempt
     */
    recordSend(domain) {
        const now = Date.now();

        // Record in domain counter
        if (!this.domainCounters.has(domain)) {
            this.domainCounters.set(domain, []);
        }
        this.domainCounters.get(domain).push(now);

        // Record in global counter
        this.globalCounter.push(now);
    }

    /**
     * Calculate delay before next send to a domain
     */
    getDelayForDomain(domain) {
        const limit = this.getDomainLimit(domain);
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        if (!this.domainCounters.has(domain)) {
            return 0;
        }

        const timestamps = this.domainCounters.get(domain);
        const recent = timestamps.filter(t => t > oneMinuteAgo);

        if (recent.length >= limit) {
            // Calculate time until oldest entry expires
            const oldest = Math.min(...recent);
            const delay = (oldest + 60000) - now;
            return Math.max(0, delay);
        }

        return 0;
    }

    /**
     * Calculate delay before next global send
     */
    getGlobalDelay() {
        const now = Date.now();
        const oneSecondAgo = now - 1000;

        this.globalCounter = this.globalCounter.filter(t => t > oneSecondAgo);

        if (this.globalCounter.length >= this.globalRateLimit) {
            const oldest = Math.min(...this.globalCounter);
            const delay = (oldest + 1000) - now;
            return Math.max(0, delay);
        }

        return 0;
    }

    /**
     * Set cooldown for a domain (e.g., after receiving rate limit error)
     */
    setDomainCooldown(domain, durationMs = 60000) {
        const cooldownUntil = Date.now() + durationMs;
        this.domainCooldowns.set(domain, cooldownUntil);
        logger.warn({ domain, cooldownMs: durationMs }, 'Domain rate limit cooldown set');
    }

    /**
     * Clear cooldown for a domain
     */
    clearDomainCooldown(domain) {
        this.domainCooldowns.delete(domain);
    }

    /**
     * Get delay needed before sending to an email
     */
    async getDelayBeforeSend(email) {
        const domain = this.extractDomain(email);
        const domainDelay = this.getDelayForDomain(domain);
        const globalDelay = this.getGlobalDelay();

        return Math.max(domainDelay, globalDelay);
    }

    /**
     * Wait if necessary before sending
     */
    async waitIfNeeded(email) {
        const delay = await this.getDelayBeforeSend(email);
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    /**
     * Cleanup old counter entries
     */
    cleanup() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const twoMinutesAgo = now - 120000;

        // Clean domain counters
        for (const [domain, timestamps] of this.domainCounters.entries()) {
            const filtered = timestamps.filter(t => t > twoMinutesAgo);
            if (filtered.length === 0) {
                this.domainCounters.delete(domain);
            } else {
                this.domainCounters.set(domain, filtered);
            }
        }

        // Clean global counter
        this.globalCounter = this.globalCounter.filter(t => t > oneMinuteAgo);

        // Clean expired cooldowns
        for (const [domain, cooldownUntil] of this.domainCooldowns.entries()) {
            if (now >= cooldownUntil) {
                this.domainCooldowns.delete(domain);
            }
        }
    }

    /**
     * Get current rate limit statistics
     */
    getStats() {
        const stats = {};
        for (const [domain, timestamps] of this.domainCounters.entries()) {
            const oneMinuteAgo = Date.now() - 60000;
            const recent = timestamps.filter(t => t > oneMinuteAgo);
            stats[domain] = {
                recentCount: recent.length,
                limit: this.getDomainLimit(domain),
                utilization: (recent.length / this.getDomainLimit(domain)) * 100,
            };
        }
        return stats;
    }

    /**
     * Destroy the rate limiter
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

module.exports = new RateLimiterService();

