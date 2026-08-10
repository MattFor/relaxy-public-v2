'use strict';

import Mongoose from 'mongoose';

const ProfileSchema = new Mongoose.Schema({
    id: { type: String },
    v:  {
        type:    Number,
        default: 1
    }
}, {
    strict:     false,
    minimize:   false,
    versionKey: false
});

ProfileSchema.index({ id: 1 }, { unique: true });

export default Mongoose.model('Profile', ProfileSchema);
