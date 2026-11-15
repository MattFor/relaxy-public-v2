'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    run(client, guild) {
        if (guild.available === false) {
            return client.log('WARN', `Guild unavailable (Discord outage), NOT a removal: ${guild.name} - ${guild.id}`);
        }

        client.log(
            'ERROR',
            `\n//////////////////////////////////////////////////////////////////////\nLeft guild: ${guild.name} - ${guild.id} - ${guild.memberCount}\n//////////////////////////////////////////////////////////////////////`
        );

        client.clog(`${guild.name} - \`${guild.id}\``, 'LEFT GUILD', 'bad');
    }
};
