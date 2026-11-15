'use strict';

import Mongoose from 'mongoose';

const SettingsSchema = new Mongoose.Schema(
    {
        _id: {
            type: String,
            default: 'global'
        },

        version: { type: String },

        wmStatus: { type: String },

        clientStatus: { type: String },

        ownerIds: {
            type: [String],
            default: []
        },

        youtubeCookie: { type: String },

        operatingMode: { type: Number },

        requestNumber: {
            type: Number,
            default: 0
        },

        blacklist: {
            type: [
                {
                    _id: false,
                    id: { type: String },
                    k: { type: String },
                    at: { type: Number },
                    by: { type: String },
                    rs: { type: String },
                    ex: { type: Number }
                }
            ],
            default: []
        }
    },
    {
        collection: 'settings',
        minimize: false,
        versionKey: false,
        timestamps: true
    }
);

export default SettingsSchema;
