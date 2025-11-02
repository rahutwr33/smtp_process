// config/transporter.js
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Determine the environment (default to 'development' if not set)
const env = process.env.NODE_ENV || 'development';

// Map NODE_ENV to environment file names
const envFileMap = {
    development: '.env.dev',
    dev: '.env.dev',
    production: '.env.prod',
    prod: '.env.prod',
    test: '.env.test'
};

// Determine the environment file to load
const envFile = envFileMap[env] || `.env.${env}`;
const envPath = path.resolve(process.cwd(), envFile);

// Load the appropriate .env file
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log(`Loaded environment variables from ${envFile}`);
} else {
    console.warn(`Environment file ${envFile} not found. Using system environment variables only.`);
}

// Environment-specific configuration
const config = {
    // Required SMTP settings
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    // Support both SMTP_PASSWORD and SMTP_PASS for backward compatibility
    pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
    
    // Optional settings with defaults
    pool: process.env.SMTP_POOL !== 'false',
    maxConnections: parseInt(process.env.SMTP_MAX_CONNECTIONS || '20', 10),
    maxMessages: process.env.SMTP_MAX_MESSAGES ? parseInt(process.env.SMTP_MAX_MESSAGES, 10) : Infinity,
    name: process.env.SMTP_NAME || process.env.SMTP_HOST,
    connectionTimeout: parseInt(process.env.SMTP_CONNECTION_TIMEOUT || '15000', 10),
    greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT || '10000', 10),
    debug: process.env.SMTP_DEBUG === 'true'
};

// Validate required configuration
const requiredConfig = ['host', 'port', 'user'];
// Check if either SMTP_PASSWORD or SMTP_PASS is provided
if (!process.env.SMTP_PASSWORD && !process.env.SMTP_PASS) {
    missingConfig.push('pass');
}
const missingConfig = requiredConfig.filter(key => !config[key]);

if (missingConfig.length > 0) {
    throw new Error(`Missing required SMTP configuration: ${missingConfig.join(', ')}`);
}



const smtpObj = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure, // Require STARTTLS if not using SSL (secure: false)
    pool: config.pool,
    maxConnections: config.maxConnections,
    maxMessages: config.maxMessages,
    auth: {
        user: config.user,
        pass: config.pass,
    },
    name: config.name,
    connectionTimeout: config.connectionTimeout,
    greetingTimeout: config.greetingTimeout,
    debug: config.debug
};
console.log(smtpObj);
const transporter = nodemailer.createTransport(smtpObj);

transporter.verify((error, success) => {
    if (error) {
        console.error("SMTP Transporter failed verification:", error);
    } else {
        console.log(`SMTP pool is ready for ${smtpObj.host}.`);
    }
});

module.exports = transporter;