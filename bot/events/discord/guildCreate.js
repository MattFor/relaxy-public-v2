'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, guild) {
        return client.core.joinNewGuild(guild);
    }
};
