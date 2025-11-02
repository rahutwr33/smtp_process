const mongoose = require('mongoose');

const contactUsSchema = new mongoose.Schema({
    fullname: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        match: [/.+\@.+\..+/, 'Please fill a valid email address']
    },
    phoneno: {
        type: String,
        trim: true,
        minlength: 0,
        maxlength: 20
    },
    message: {
        type: String,
        required: true,
        trim: true,
        minlength: 5,
        maxlength: 1000
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const ContactUs = mongoose.model('ContactUs', contactUsSchema);

module.exports = ContactUs;
