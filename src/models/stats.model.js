const mongoose = require('mongoose');
const Schema = mongoose.Schema
const statsSchema = new mongoose.Schema({
    campaignId: {
        type: Schema.Types.ObjectId,
        ref: 'Campaign',
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    totalclick:{
        type: Number,
        default: 0
    },
    opens: [
        String
    ],
    click:[
        {
            email: {
                type: String,
                index: true
            },
            url: {
                type: String,
                index: true
            }
        }
    ],
    forwards: [
        String
    ],
    unsubscribeClicks: [
        String
    ],
    bounces: [
        String
    ],
    sent: [
        String
    ],
}, { timestamps: true });

// Create compound indexes for frequently queried fields
statsSchema.index({ campaignId: 1 });
statsSchema.index({ _id: 1, 'click.email': 1, 'click.url': 1 });
statsSchema.index({ userId: 1, createdAt: -1 });

// Add TTL index for cleanup if needed
statsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 }); // 1 year

const Stats = mongoose.model('Stats', statsSchema);

module.exports = Stats;