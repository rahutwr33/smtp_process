
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const CampaignSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    imageUrl: {
        type: String,
        default: ''
    },
    htmlcontent: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        required: true,
        enum: ['Draft', 'Sent', 'InProgress', 'Scheduled'],
        default: 'Draft'
    },
    layout: {
        type: String,
        required: false,
        default: '{}'
    },
    active: {
        type: Boolean,
        default: true
    },
    components: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});
const Campaign = mongoose.model('Campaign', CampaignSchema);
module.exports = Campaign
