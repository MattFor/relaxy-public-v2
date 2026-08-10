'use strict';

import Mongoose from 'mongoose';

const ReminderSchema = new Mongoose.Schema({
    u:  { type: String },
    sa: { type: Number },
    ea: { type: Number },
    v:  {
        type:    Number,
        default: 1
    }
}, {
    strict:     false,
    minimize:   false,
    versionKey: false
});

export default Mongoose.model('Reminder', ReminderSchema);
