'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    async run(client, sticker)
    {
        const guild = await client.module.database.Guild(sticker.guild.id);

        if (guild.ml.ev?.stickerDelete?.on)
        {
            let channel = await sticker.guild.channels.fetch(guild.ml.ev.stickerDelete.channel).catch(client.swallow('stickerDelete: fetch'));
            if (!channel)
            {
                return;
            }

            let user = await sticker.fetchUser().catch(client.swallow('stickerDelete: fetchUser'));
            if (!user)
            {
                user = 'Unavailable.';
            }

            client.pushModlog(sticker.guild.id, 'stickerDelete', new client.class.modlog({
                color:       'bad',
                event:       'Sticker deleted',
                image:       { url: sticker.url },
                description: `Info: **${sticker.name}** - **\`${sticker.id}\`**\nDescription:\n${sticker.description}\nAdded by: ${user}`
            }), null);
        }
    }
};
