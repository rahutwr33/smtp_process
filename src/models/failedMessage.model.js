
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const FailedSQSMessageSchema = new Schema({
    campaignId: {
        type: Schema.Types.ObjectId,
        ref: 'Campaign',
        required: true
    },
    payload: {
        type: String
    }
}, {
    timestamps: true
});

const FailedSQSMessage = mongoose.model('FailedSQSMessage', FailedSQSMessageSchema);
module.exports = FailedSQSMessage
