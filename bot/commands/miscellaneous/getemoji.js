'use strict';

import Discord       from 'discord.js';
import Relaxy        from '../../../src/Client/Relaxy.js';
import { emojiList } from '../../../src/Core/DataTable.js';

const emojiKeys = Object.keys(emojiList);
const emojiValues = Object.values(emojiList);

export default {
    name:        'getemoji',
    aliases:     [
        'emoji',
        'getsticker',
        'sticker'
    ],
    usage:       '=getemoji [multiple] <emoji|sticker>',
    description: 'Get the image or link of the provided emoji(s) or sticker(s). Type "multiple" as the first argument to list several emojis/stickers at once (they will be listed as links, not displayed as images).',

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        if (!args[0] && !message.stickers.first())
        {
            return client.qEmbed('No input provided!', interaction ?? message);
        }

        if (args[0] && args[0].toLowerCase() == 'multiple')
        {
            args.shift();

            let emojis = [];
            let stickers = [];

            if (message.stickers.size > 0)
            {
                let i = 0;
                message.stickers.forEach(sticker =>
                {
                    stickers.push(`${i + 1}. [${sticker.name}](${sticker.url})`);
                    i++;
                });
            }

            if (args.length > 0)
            {
                for (let i = 0; i < args.length; i++)
                {
                    if (!client.utils.isValidEmoji(args[i]) && !client.utils.nums(args[i]))
                    {
                        return client.qEmbed(`Item number [${i + 1}] is not a valid emoji/is a default discord emoji.`, interaction ?? message);
                    }

                    if (emojiKeys.includes(args[i]) || emojiValues.includes(args[i]))
                    {
                        continue;
                    }

                    let emoji = args[i].split(':');
                    emojis.push(`${i + 1}. [${emoji[1]}](https://cdn.discordapp.com/emojis/${client.utils.nums(emoji[2])}.${emoji[0].includes('a')
                        ? 'gif'
                        : 'png'})`);
                }
            }

            if (emojis.length === 0 && stickers.length === 0)
            {
                return client.qEmbed('Invalid input provided! Only stickers and emojis are accepted!', interaction ?? message);
            }

            return client.send(message.channel, null, [
                {
                    color:       client.data.embedColor,
                    description: `${emojis.length > 0
                        ? `**Emojis:**\n${emojis.join('\n')}\n`
                        : ''}${stickers.length > 0
                        ? `**Stickers:**\n${stickers.join('\n')}`
                        : ''}`.slice(0, 2048)
                }
            ]);
        }

        if (message.stickers.size > 0)
        {
            let sticker = message.stickers.first();

            return client.send(message.channel, null, [
                {
                    color:  client.data.embedColor,
                    title:  sticker.name,
                    image:  { url: sticker.url },
                    footer: { text: 'Stickers do not animate, they are apng not gif.' }
                }
            ]);
        }

        if (!client.utils.isValidEmoji(args[0]) && (!emojiKeys.includes(args[0]) && !emojiValues.includes(args[0])))
        {
            return client.qEmbed('Input is not a valid emoji.', interaction ?? message);
        }

        if (emojiKeys.includes(args[0]) || emojiValues.includes(args[0]))
        {
            return client.qEmbed('Cannot display default discord emoji.', interaction ?? message);
        }

        let emoji = args[0].split(':');

        return client.send(message.channel, null, [
            {
                color: client.data.embedColor,
                title: emoji[1],
                image: {
                    url: `attachment://emoji.${emoji[0].includes('a')
                        ? 'gif'
                        : 'png'}`
                }
            }
        ], [
            {
                attachment: `https://cdn.discordapp.com/emojis/${client.utils.nums(emoji[2])}.${emoji[0].includes('a')
                    ? 'gif'
                    : 'png'}`,
                name:       `emoji.${emoji[0].includes('a')
                    ? 'gif'
                    : 'png'}`
            }
        ]);
    }
};
