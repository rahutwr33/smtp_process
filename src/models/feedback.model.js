const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    message: {
        type: String,
        required: true,
        minlength: 10,
        maxlength: 1000,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});


const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback; 