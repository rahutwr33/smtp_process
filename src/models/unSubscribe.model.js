const mongoose = require("mongoose");

const unSubscribeSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    feedback: {
        type: String,
        default: '',
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
unSubscribeSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const UnSubscribe = mongoose.model("UnSubscribe", unSubscribeSchema);

module.exports = UnSubscribe;