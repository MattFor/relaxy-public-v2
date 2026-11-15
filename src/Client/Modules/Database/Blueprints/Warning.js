'use strict';

import Mongoose from 'mongoose';

const WarningSchema = new Mongoose.Schema(
    {
        g: { type: String },
        u: { type: String },
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

WarningSchema.index(
    {
        g: 1,
        u: 1
    },
    { unique: true }
);

export default Mongoose.model('Warning', WarningSchema);
