'use strict';

import Mongoose from 'mongoose';

const GuildConfigSchema = new Mongoose.Schema({
    g: { type: String },
    v: {
        type:    Number,
        default: 1
    }
}, {
    collection: 'guildconfig',
    strict:     false,
    minimize:   false,
    versionKey: false
});

GuildConfigSchema.index({ g: 1 }, { unique: true });

export default Mongoose.model('GuildConfig', GuildConfigSchema);
