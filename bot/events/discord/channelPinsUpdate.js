'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    async run(client, channel)
    {
        if (!channel.guild)
        {
            return;
        }

        const guild = await client.module.database.Guild(channel.guild.id);

        if (!guild.ml.ev?.channelPinsUpdate?.on)
        {
            return;
        }

        if (guild.fo.on && guild.fo.cs.includes(channel.parentId) && guild.ml.ls)
        {
            return;
        }

        return client.pushModlog(channel.guild.id, 'channelPinsUpdate', new client.class.modlog({
            event:       'Channel pins updated',
            description: `In the channel: ${channel} - **${channel.name}** - **\`${channel.id}\`**`
        }), null);
    }
};
