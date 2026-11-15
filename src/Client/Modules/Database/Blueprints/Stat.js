'use strict';

import Mongoose from 'mongoose';

const StatSchema = new Mongoose.Schema(
    {
        g: { type: String },
        d: { type: Number },
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
StatSchema.index(
    {
        g: 1,
        d: -1
    },
    { unique: true }
);

export default Mongoose.model('Stat', StatSchema);
