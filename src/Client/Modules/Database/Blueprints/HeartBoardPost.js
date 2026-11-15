'use strict';

import Mongoose from 'mongoose';

const HeartBoardPostSchema = new Mongoose.Schema(
    {
        oid: { type: String },
        eid: { type: String },
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

export default Mongoose.model('HeartBoardPost', HeartBoardPostSchema);
