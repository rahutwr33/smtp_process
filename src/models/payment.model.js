const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PaymentSchema = new mongoose.Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    plan_id: {
        type: String,
        required: true,
    },
    invoice_id: {
        type: String,
        default: null
    },
    order_id: {
        type: String,
        required: true,
        unique: true
    },
    subscription_id: {
        type: String,
        default: null
    },
    payment_id: {
        type: String,
        required: true,
        unique: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: "INR"
    },
    status: {
        type: String,
        enum: ["captured", "failed", "refunded"],
        required: true,
    },
    payment_method: {
        type: String,
    },
    error_description: {
        type: String,
    },
    error_code: {
        type: String,
    },
    created_at: {
        type: Date,
    }
}, { timestamps: true });

module.exports = mongoose.model("Payment", PaymentSchema);
