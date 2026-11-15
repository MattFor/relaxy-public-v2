'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, emoji) {
        const guild = await client.module.database.Guild(emoji.guild.id);

        if (guild.ml.ev?.emojiCreate?.on) {
            if (!client.channels.cache.get(guild.ml.ev.emojiCreate.channel)) {
                return client.save(guild.id, {
                    alter: 'ml.ev.emojiCreate.on',
                    value: false
                });
            }

            const Author = await client.utils
                .auditLog(emoji.guild, 'EmojiCreate', { rawAuthor: true })
                .catch(() => null);

            return client.pushModlog(
                emoji.guild.id,
                'emojiCreate',
                new client.class.modlog({
                    color: 'good',
                    event: 'Emoji created',

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
                            name: 'Added By:',
                            value: Author
                                ? `${Author} - ${client.utils.tag(Author)} - **\`${Author.id}\`**`
                                : 'Unavailable.'
                        }
                    ]
                }),
                Author
            );
        }
    }
};
