const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const PlansSchema = new Schema({
    plan_id: {
        type: String,
        required: true
    },
    period: {
        type: String,
        enum: ['monthly', 'yearly'],
        required: true
    },
    contactcount: {
        type: Number,
        required: true,
        default: 10
    },
    interval: {
        type: Number,
        required: true,
        default: 1
    },
    name: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        required: true
    }
}, { timestamps: true });

const Plans = mongoose.model('Plans', PlansSchema);
module.exports = Plans

