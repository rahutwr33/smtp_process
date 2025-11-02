const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const GroupSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: false
    },
    contacts: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'Contact',
        }],
        default: []
    }
}, { timestamps: true });
GroupSchema.index({ userId: 1 }); // Single field index for userId
const Group = mongoose.model('Group', GroupSchema);
module.exports = Group

