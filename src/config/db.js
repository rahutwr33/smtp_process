const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./logger');

let connection = null;

const connectToDatabase = async () => {
    if (connection) {
        logger.info('Using existing database connection');
        return;
    }

    try {
        connection = await mongoose.connect(config.mongoose.url, { bufferCommands: false, dbName: 'test', serverSelectionTimeoutMS: 5000, maxPoolSize: 5 });
        logger.info('Connected to MongoDB');
    } catch (err) {
        logger.info('MongoDB connection error:', err);
        throw err;
    }
};

module.exports.connectToDatabase = connectToDatabase;