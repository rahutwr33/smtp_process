const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CampaignLinkSchema = new Schema({
    token: {
        type: String,
        required: true,
        unique: true
    },
    expiryTime: {
        type: Date,
        required: true,
        expires: 0
    },
    email: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const CampaignLink = mongoose.model('CampaignLink', CampaignLinkSchema);
module.exports = CampaignLink; 