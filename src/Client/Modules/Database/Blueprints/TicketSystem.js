'use strict';

import Mongoose from 'mongoose';

const TicketSystemSchema = new Mongoose.Schema({
    mid: { type: String },
    g:   { type: String },
    c:   { type: String },
    v:   {
        type:    Number,
        default: 1
    }
}, {
    strict:     false,
    minimize:   false,
    versionKey: false
});

TicketSystemSchema.index({
    g:   1,
    c:   1,
    mid: 1
});

export default Mongoose.model('TicketSystem', TicketSystemSchema);
