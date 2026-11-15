'use strict';

import Mongoose from 'mongoose';

const MemberSchema = new Mongoose.Schema(
    {
        id: { type: String },
        g: { type: String },
        v: {
            type: Number,
            default: 1
        }
    },
    {
        strict: false,
        minimize: false,
        versionKey: false
    }
);

MemberSchema.index(
    {
        g: 1,
        id: 1
    },
    { unique: true }
);

export default Mongoose.model('Member', MemberSchema);
