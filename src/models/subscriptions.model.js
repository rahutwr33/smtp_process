const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SubscriptionSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User", required: true
    },
    plan_id: {
        type: String,
        required: true
    },
    subscription_id: {
        type: String,
        required: true,
        unique: true
    },
    link: {
        type: String,
        required: true
    },
    status: {
        type: String, enum: ["pending", "created", "active", "cancelled", "expired", "halted"],
        default: "pending"
    },
    start_date: { //when subscription was started
        type: Date,
        default: null
    },
    end_date: { //final billing date
        type: Date,
        default: null
    },
    current_billing_date: { //current billing date
        type: Date,
        default: null
    },
    current_billing_end_date: { //current billing end date
        type: Date,
        default: null
    },
    next_billing_date: {  //next billing date
        type: Date,
        default: null
    },
    lastInvoiceId: {
        type: String,
        default: null
    }
}, { timestamps: true });

const Subscription = mongoose.model('Subscription', SubscriptionSchema);
module.exports = Subscription

