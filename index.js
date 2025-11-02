const { connectToDatabase } = require('./src/config/db');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    await connectToDatabase();
   
    return {
        statusCode: 200
    };
}
