'use strict';

import Mongoose from 'mongoose';

const ReactionRoleSchema = new Mongoose.Schema({
    g: { type: String },
    v: {
        type:    Number,
        default: 1
    }
}, {
    strict:     false,
    minimize:   false,
    versionKey: false
});

ReactionRoleSchema.index({ g: 1 }, { unique: true });

export default Mongoose.model('ReactionRole', ReactionRoleSchema);
