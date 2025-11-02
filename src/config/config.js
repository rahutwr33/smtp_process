const Joi = require('joi');
const dotenv = require('dotenv');
const path = require('path');

if (!process.env.APP_NAME) {
  dotenv.config({ path: path.join(__dirname, '../../.env.dev') });
}
const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('prod', 'dev', 'test').required(),
    PORT: Joi.number().default(3000),
    MONGODB_URL: Joi.string().required().description('Mongo DB url'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which reset password token expires'),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which verify email token expires'),
    CUSTOM_AWS_SECRET_ACCESS: Joi.string().required().description('Custom AWS secret access'),
    CUSTOM_AWS_ACCESS_KEY: Joi.string().required().description('Custom AWS access key'),
    CUSTOM_AWS_REGION: Joi.string().required().description('Custom AWS region'),
    SQS_QUEUE_NAME: Joi.string().required().description('Custom AWS sqs queue name'),
    SQS_DLQ_URL: Joi.string().optional().description('SQS Dead Letter Queue URL or name'),
    SQS_DLQ_NAME: Joi.string().optional().description('SQS Dead Letter Queue name'),
    CUSTOM_AWS_ACCOUNT_ID: Joi.string().optional().description('AWS Account ID for queue URL construction'),
    FRONTEND_URL: Joi.string().required().description('Frontend URL'),
    LINK_SALT: Joi.string().required().description('Link salt'),
    SERVER_URL: Joi.string().required().description('Server URL'),
    SECRET_KEY: Joi.string().required().description('Secret key'),
    UNSUBSCRIBE_SECRET_KEY: Joi.string().required().description('Unsubscribe secret key'),
    FORWARD_SECRET_KEY: Joi.string().required().description('Forward secret key'),
    SMTP_HOST: Joi.string().required().description('SMTP host'),
    SMTP_PORT: Joi.number().required().description('SMTP port'),
    SMTP_USER: Joi.string().required().description('SMTP user'),
    SMTP_PASSWORD: Joi.string().required().description('SMTP password'),
    SMTP_FROM: Joi.string().required().description('SMTP from'),
    SMTP_SECURE: Joi.boolean().required().description('SMTP secure'),
    SMTP_POOL: Joi.boolean().required().description('SMTP pool'),
    SMTP_MAX_CONNECTIONS: Joi.number().optional().default(10).description('SMTP max connections (conservative for Gmail)'),
    SMTP_MAX_MESSAGES: Joi.number().optional().default(50).description('SMTP max messages per connection'),
    SMTP_LIST_UNSUBSCRIBE: Joi.string().optional().description('List-Unsubscribe header URL'),
    SMTP_REPLY_TO: Joi.string().optional().description('Reply-To email address'),
    SMTP_RETURN_PATH: Joi.string().optional().description('Return-Path email address for bounces'),
    WORKER_POOL_MAX_WORKERS: Joi.number().optional().default(10).description('Worker pool max workers'),
    WORKER_POOL_BATCH_SIZE: Joi.number().optional().default(10).description('SQS batch size'),
    WORKER_POOL_MAX_QUEUE_SIZE: Joi.number().optional().default(100).description('Max queue size'),
    METRICS_REPORT_INTERVAL: Joi.number().optional().default(60).description('Metrics report interval in seconds'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGODB_URL,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  aws: {
    CUSTOM_AWS_SECRET_ACCESS: envVars.CUSTOM_AWS_SECRET_ACCESS,
    CUSTOM_AWS_ACCESS_KEY: envVars.CUSTOM_AWS_ACCESS_KEY,
    CUSTOM_AWS_REGION: envVars.CUSTOM_AWS_REGION,
    SQS_QUEUE_NAME: envVars.SQS_QUEUE_NAME,
    SQS_DLQ_URL: envVars.SQS_DLQ_URL,
    SQS_DLQ_NAME: envVars.SQS_DLQ_NAME,
    CUSTOM_AWS_ACCOUNT_ID: envVars.CUSTOM_AWS_ACCOUNT_ID,
  },
  frontend: {
    url: envVars.FRONTEND_URL
  },
  security: {
    linkSalt: envVars.LINK_SALT,
    secretKey: envVars.SECRET_KEY,
    unsubscribeSecretKey: envVars.UNSUBSCRIBE_SECRET_KEY,
    forwardSecretKey: envVars.FORWARD_SECRET_KEY
  },
  server: {
    url: envVars.SERVER_URL
  },
  smtp: {
    host: envVars.SMTP_HOST,
    port: envVars.SMTP_PORT,
    user: envVars.SMTP_USER,
    password: envVars.SMTP_PASSWORD,
    from: envVars.SMTP_FROM,
    secure: envVars.SMTP_SECURE,
    pool: envVars.SMTP_POOL,
    maxConnections: envVars.SMTP_MAX_CONNECTIONS || 10, // Conservative for Gmail
    maxMessages: envVars.SMTP_MAX_MESSAGES || 50,
    // Additional domains can be configured as JSON array in env
    additionalDomains: envVars.SMTP_ADDITIONAL_DOMAINS ? JSON.parse(envVars.SMTP_ADDITIONAL_DOMAINS) : [],
    randomizeUserAgent: envVars.SMTP_RANDOMIZE_USER_AGENT === 'true',
    userAgents: envVars.SMTP_USER_AGENTS ? JSON.parse(envVars.SMTP_USER_AGENTS) : [],
    // Deliverability headers for bulk sending
    listUnsubscribe: envVars.SMTP_LIST_UNSUBSCRIBE,
    replyTo: envVars.SMTP_REPLY_TO,
    returnPath: envVars.SMTP_RETURN_PATH,
    envelope: true, // Enable envelope for proper routing
  },
  workerPool: {
    maxWorkers: envVars.WORKER_POOL_MAX_WORKERS || 10,
    batchSize: envVars.WORKER_POOL_BATCH_SIZE || 10,
    maxQueueSize: envVars.WORKER_POOL_MAX_QUEUE_SIZE || 100,
  },
  metrics: {
    reportInterval: envVars.METRICS_REPORT_INTERVAL || 60,
  },
};
