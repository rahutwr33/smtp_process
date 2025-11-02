
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ContactSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    active: {
        type: Boolean,
        default: true
    },
    email: {
        type: String,
        required: true,
        unique: false,
        trim: true
    },
    phoneno: {
        type: String,
        required: false,
        trim: true
    },
    address: {
        type: String,
        required: false,
        trim: true
    }
}, {
    timestamps: true
});

const Contact = mongoose.model('Contact', ContactSchema);
module.exports = Contact
