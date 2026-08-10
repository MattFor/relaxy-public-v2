'use strict';

import Mongoose from 'mongoose';

const MuteSchema = new Mongoose.Schema({
    g:  { type: String },
    u:  { type: String },
    ex: { type: Number },
    v:  {
        type:    Number,
        default: 1
    }
}, {
    strict:     false,
    minimize:   false,
    versionKey: false
});

MuteSchema.index({
    g: 1,
    u: 1
}, { unique: true });

export default Mongoose.model('Mute', MuteSchema);
