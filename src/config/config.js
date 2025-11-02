const Joi = require('joi');
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
    FRONTEND_URL: Joi.string().required().description('Frontend URL'),
    LINK_SALT: Joi.string().required().description('Link salt'),
    SERVER_URL: Joi.string().required().description('Server URL'),
    SECRET_KEY: Joi.string().required().description('Secret key'),
    UNSUBSCRIBE_SECRET_KEY: Joi.string().required().description('Unsubscribe secret key'),
    FORWARD_SECRET_KEY: Joi.string().required().description('Forward secret key'),
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
    SQS_QUEUE_NAME: envVars.SQS_QUEUE_NAME
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
  }
};
