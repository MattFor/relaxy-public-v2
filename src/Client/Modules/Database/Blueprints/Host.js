'use strict';

import Mongoose from 'mongoose';

const HostSchema = new Mongoose.Schema({

    _id: { type: String },

    hostname: {
        type:    String,
        default: ''
    },
    shards:   {
        type:    [Number],
        default: []
    },

    clusters: {
        type:    Number,
        default: 0
    },

    guilds:  {
        type:    Number,
        default: 0
    },
    users:   {
        type:    Number,
        default: 0
    },
    players: {
        type:    Number,
        default: 0
    },

    cpuCount: {
        type:    Number,
        default: 0
    },
    cpuLoad:  {
        type:    Number,
        default: 0
    },
    memUsed:  {
        type:    Number,
        default: 0
    },
    memTotal: {
        type:    Number,
        default: 0
    },

    uptime: {
        type:    Number,
        default: 0
    },

    version: {
        type:    String,
        default: ''
    },

    bridged: {
        type:    Boolean,
        default: false
    },

    lastSeen: {
        type:    Number,
        default: 0
    }
}, {
    collection: 'hosts',
    minimize:   false,
    versionKey: false,
    timestamps: true
});

export default HostSchema;
