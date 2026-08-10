'use strict';

import Mongoose from 'mongoose';

const ForumChannelSchema = new Mongoose.Schema({
    id: { type: String },
    g:  { type: String },
    v:  {
        type:    Number,
        default: 1
    }
}, {
    strict:     false,
    minimize:   false,
    versionKey: false
});

ForumChannelSchema.index({
    g:  1,
    id: 1
});

export default Mongoose.model('ForumChannel', ForumChannelSchema);
