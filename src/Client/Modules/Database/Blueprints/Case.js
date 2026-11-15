'use strict';

import Mongoose from 'mongoose';

const CaseSchema = new Mongoose.Schema(
    {
        g: { type: String },
        n: { type: Number },
        v: {
            type: Number,
            default: 1
        }
    },
    {
        collection: 'cases',
        strict: false,
        minimize: false,
        versionKey: false
    }
);

CaseSchema.index(
    {
        g: 1,
        n: 1
    },
    { unique: true }
);
CaseSchema.index({
    g: 1,
    u: 1
});

export default Mongoose.model('Case', CaseSchema);
