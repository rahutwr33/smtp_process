const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const FixedPlanSchema = new mongoose.Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User", required: true
    },
    order_id: {
        type: String,
        unique: true,
        required: true
    },
    plan_id: {
        type: String,
        required: true
    },
    paymentId: {
        type: String, unique: true,
        default: null
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: "INR",
        required: true
    },
    duration: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ["created", "active", "expired"],
        default: "created"
    },
    start_date: {
        type: Date,
        default: null
    },
    end_date: {
        type: Date,
        default: null
    },
    next_billing_date: {
        type: Date,
        default: null
    }
}, { timestamps: true });

const FixedPlan = mongoose.model("FixedPlan", FixedPlanSchema);
module.exports = FixedPlan;
