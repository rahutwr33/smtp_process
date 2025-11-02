/**
 * Lightweight logger optimized for AWS Lambda
 * Uses console.log with JSON formatting for CloudWatch Logs
 * Maintains same API as Winston for compatibility
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase() || 'info'] || LOG_LEVELS.info;

class LambdaLogger {
  constructor() {
    this.defaultMeta = { service: 'smtp-email-processor' };
  }

  /**
   * Log error
   */
  error(meta, message) {
    if (LOG_LEVELS.error <= currentLevel) {
      this._log('error', meta, message);
    }
  }

  /**
   * Log warning
   */
  warn(meta, message) {
    if (LOG_LEVELS.warn <= currentLevel) {
      this._log('warn', meta, message);
    }
  }

  /**
   * Log info
   */
  info(meta, message) {
    if (LOG_LEVELS.info <= currentLevel) {
      this._log('info', meta, message);
    }
  }

  /**
   * Log debug
   */
  debug(meta, message) {
    if (LOG_LEVELS.debug <= currentLevel) {
      this._log('debug', meta, message);
    }
  }

  /**
   * Internal log method
   */
  _log(level, meta, message) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: message || (typeof meta === 'string' ? meta : undefined),
      ...this.defaultMeta,
    };

    // Handle different meta formats (Winston compatibility)
    if (typeof meta === 'string' && !message) {
      logEntry.message = meta;
    } else if (typeof meta === 'object' && meta !== null) {
      // Merge meta object
      Object.assign(logEntry, meta);
      if (message) {
        logEntry.message = message;
      }
    }

    // Format as JSON for CloudWatch Logs
    const jsonLog = JSON.stringify(logEntry);

    // Use appropriate console method
    if (level === 'error') {
      console.error(jsonLog);
    } else {
      console.log(jsonLog);
    }
  }
}

module.exports = new LambdaLogger();
