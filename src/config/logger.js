const { createLogger, format, transports } = require('winston');
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }), // error.stack included
    format.splat(),
    format.json()                   // structured logs
  ),
  defaultMeta: { service: 'campaignera-app' }, // optional: for identifying logs
  transports: [
    new transports.Console({ stderrLevels: ['error'] }) // info to stdout, errors to stderr
  ]
});

module.exports = logger;
