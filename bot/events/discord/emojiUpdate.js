'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    async run(client, oldEmoji, newEmoji)
    {
        const guild = await client.module.database.Guild(newEmoji.guild.id);

        if (guild.ml.ev?.emojiUpdate?.on)
        {
            if (!client.channels.cache.get(guild.ml.ev.emojiUpdate.channel))
            {
                return client.save(guild.id, {
                    alter: 'ml.ev.emojiUpdate.on',
                    value: false
                });
            }

            const Author = await client.utils.auditLog(newEmoji.guild, 'EmojiUpdate', { rawAuthor: true }).catch(() => null);

            return client.pushModlog(newEmoji.guild.id, 'emojiUpdate', new client.class.modlog({
                color: 'good',
                event: 'Emoji updated',

                thumbnail: newEmoji.imageURL({
                    extension: newEmoji.animated
                                   ? 'gif'
                                   : 'png',
                    size:      4096
                }),
                fields:    [
                    {
                        name:  'OLD:',
                        value: `**${oldEmoji
                            ? oldEmoji.name
                            : 'unavailable'}**`
                    },
                    {
                        name:  'NEW:',
                        value: `**${newEmoji.name}**`
                    },
                    {
                        name:  'ID:',
                        value: `**${newEmoji.id}**`
                    },
                    {
                        name:  'Changed By:',
                        value: Author
                                   ? `${Author} - ${client.utils.tag(Author)} - **\`${Author.id}\`**`
                                   : 'Unavailable.'
                    }
                ]
            }), Author);
        }
    }
};
