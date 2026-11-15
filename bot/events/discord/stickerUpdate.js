'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, oldSticker, newSticker) {
        const guild = await client.module.database.Guild(newSticker.guild.id);

        if (guild.ml.ev?.stickerUpdate?.on) {
            let channel = await newSticker.guild.channels
                .fetch(guild.ml.ev.stickerUpdate.channel)
                .catch(client.swallow('stickerUpdate: fetch'));
            if (!channel) {
                return;
            }

            let user = await newSticker.fetchUser().catch(client.swallow('stickerUpdate: fetchUser'));
            if (!user) {
                user = 'Unavailable.';
            }

            client.pushModlog(
                newSticker.guild.id,
                'stickerUpdate',
                new client.class.modlog({
                    event: 'Sticker updated',
                    thumbnail: oldSticker.url !== newSticker.url ? { url: oldSticker.url } : null,
                    image: { url: newSticker.url },
                    description: `${
                        oldSticker.name !== newSticker.name
                            ? `Name changed **${oldSticker?.name ?? 'Unavailable.'}** -> **${newSticker?.name ?? 'Unavailable.'}**`
                            : `Name: **${newSticker?.name ?? 'Unavailable.'}**`
                    }\nSticker ID: **\`${newSticker.id}\`**\nDescription${
                        oldSticker.description !== newSticker.description
                            ? ` changed:\nOld:\n${oldSticker?.description ?? 'None.'}\n**New:**\n${newSticker?.description ?? 'None.'}`
                            : `:\n${newSticker?.description ?? 'None.'}`
                    }\nAdded by: ${user}`
                }),
                null
            );
        }
    }
};
