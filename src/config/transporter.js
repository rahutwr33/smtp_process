// config/transporter.js
const nodemailer = require('nodemailer');
const config = require('./config');
const logger = require('./logger');
// Environment-specific configuration
const smtpConfig = {
    // Required SMTP settings
    host: config.smtp.host,
    port: parseInt(config.smtp.port, 10),
    secure: config.smtp.secure,
    user: config.smtp.user,
    pass: config.smtp.password,

    // Optional settings with defaults
    pool: config.smtp.pool,
    maxConnections: parseInt(config.smtp.maxConnections || '20', 10),
    maxMessages: parseInt(config.smtp.maxMessages || 'Infinity', 10),
    name: config.smtp.name,
    connectionTimeout: parseInt(config.smtp.connectionTimeout || '15000', 10),
    greetingTimeout: parseInt(config.smtp.greetingTimeout || '10000', 10),
    debug: config.smtp.debug
};


const smtpObj = {
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    requireTLS: !smtpConfig.secure, // Require STARTTLS if not using SSL (secure: false)
    pool: smtpConfig.pool !== undefined ? smtpConfig.pool : true, // Always use connection pooling for bulk
    maxConnections: smtpConfig.maxConnections || 10, // Conservative for Gmail (10 connections max)
    maxMessages: smtpConfig.maxMessages || 50, // Limit messages per connection for better reputation
    // Connection timeout settings optimized for bulk sending
    socketTimeout: 30000, // 30 seconds socket timeout
    connectionTimeout: smtpConfig.connectionTimeout || 15000,
    greetingTimeout: smtpConfig.greetingTimeout || 10000,
    // TLS/SSL settings for Gmail compatibility
    tls: {
        rejectUnauthorized: false, // For self-signed certs (adjust based on your SMTP provider)
        minVersion: 'TLSv1.2', // Require TLS 1.2+ (Gmail requirement)
    },
    auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
    },
    name: smtpConfig.name || 'SMTP Email Service', // HELO/EHLO name (should match your domain)
    debug: smtpConfig.debug || false,
};
const transporter = nodemailer.createTransport(smtpObj);

// Verify transporter asynchronously (non-blocking)
transporter.verify((error, success) => {
    if (error) {
        logger.error({ error: error.message }, 'SMTP Transporter verification failed');
    } else {
        logger.info({ host: smtpObj.host }, 'SMTP pool is ready');
    }
});

module.exports = transporter;