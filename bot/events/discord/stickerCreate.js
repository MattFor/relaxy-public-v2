'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    async run(client, sticker)
    {
        const guild = await client.module.database.Guild(sticker.guild.id);

        if (guild.ml.ev?.stickerCreate?.on)
        {
            let channel = await sticker.guild.channels.fetch(guild.ml.ev.stickerCreate.channel).catch(client.swallow('stickerCreate: fetch'));
            if (!channel)
            {
                return;
            }

            let user = await sticker.fetchUser().catch(client.swallow('stickerCreate: fetchUser'));
            if (!user)
            {
                user = 'Unavailable.';
            }

            client.pushModlog(sticker.guild.id, 'stickerCreate', new client.class.modlog({
                color:       'good',
                event:       'Sticker created',
                image:       { url: sticker.url },
                description: `Info: **${sticker.name}** - **\`${sticker.id}\`**\nDescription:\n${sticker.description}\nAdded by: ${user}`
            }), null);
        }
    }
};
