'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, emoji) {
        const guild = await client.module.database.Guild(emoji.guild.id);

        if (!guild.ml.ev?.emojiDelete?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.emojiDelete.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.emojiDelete.on',
                value: false
            });
        }

        const Author = await client.utils.auditLog(emoji.guild, 'EmojiDelete', { rawAuthor: true }).catch(() => null);

        return client.pushModlog(
            emoji.guild.id,
            'emojiDelete',
            new client.class.modlog({
                color: 'bad',
                event: 'Emoji deleted',

                thumbnail: emoji.imageURL({
                    extension: emoji.animated ? 'gif' : 'png',
                    size: 4096
                }),
                fields: [
                    {
                        name: 'Tag:',
                        value: `**\`${emoji.name}\`**`
                    },
                    {
                        name: 'ID:',
                        value: `**${emoji.id}**`
                    },
                    {
                        name: 'Deleted By:',
                        value: Author
                            ? `${Author} - ${client.utils.tag(Author)} - **\`${Author.id}\`**`
                            : 'Unavailable.'
                    }
                ]
            }),
            Author
        );
    }
};
