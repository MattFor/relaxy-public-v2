'use strict';

import Mongoose from 'mongoose';

const ServerSchema = new Mongoose.Schema(
    {
        id: { type: String },
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

ServerSchema.index({ id: 1 }, { unique: true });

export default Mongoose.model('Server', ServerSchema);
