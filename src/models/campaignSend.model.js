const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CampaignSendSchema = new Schema({
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
    options: {
        type: Number,
        required: true
    },
    fromName: {
        type: String,
        required: true,
        trim: true
    },
    mailsubject: {
        type: String,
        required: true,
        trim: true
    },
    groups: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'Group'
        }],
        default: []
    },
    statsId: {
        type: Schema.Types.ObjectId,
        ref: 'Stats',
        required: true
    },
    isScheduled: {
        type: Boolean,
        default: false,
        required: false
    },
    scheduleTime: {
        type: Date,
        default: Date.now,
        required: false
    }
}, { timestamps: true });

CampaignSendSchema.index({ userId: 1, createdAt: -1 });

const CampaignSend = mongoose.model('CampaignSend', CampaignSendSchema);
module.exports = CampaignSend;


