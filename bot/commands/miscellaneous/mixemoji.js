'use strict';

import axios from 'axios';

import Discord                 from 'discord.js';
import mix, { checkSupported } from 'emoji-mixer';
import Relaxy                  from '../../../src/Client/Relaxy.js';

const downloadImage = async url =>
{
    const response = await axios({
        method:       'GET',
        url:          url,
        responseType: 'arraybuffer'
    });

    return response.data;
};

export default {
    name:        'mixemoji',
    aliases:     ['emojimix'],
    usage:       '=mixemoji <emoji1> <emoji2>',
    description: '```diff\n- Nitro emojis not supported -\n```Merge multiple emojis into one, some do not work.\nIf you use the "wand" emoji, you will the get the "blob" version.',

    slashDescription: 'Merge two emojis into one. Nitro emojis are not supported.',

    slash: new Discord.SlashCommandBuilder()
               .addStringOption(option => option.setName('first').setDescription('The first emoji.').setRequired(true))
               .addStringOption(option => option.setName('second').setDescription('The second emoji.').setRequired(true)),

    args: true,

    defer: true,

    permissionsUser: [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        for (let i = 0; i < args.length; i++)
        {
            if (!checkSupported(args[i], true))
            {
                return client.qEmbed(`Emoji ${i + 1} is not supported!`, interaction ?? message);
            }
        }

        const url = mix(args[0], args[1], false, true);

        if (!url)
        {
            return client.qEmbed('Something went wrong! These emojis might not be supported', interaction ?? message);
        }

        const buffer = await downloadImage(url);

        return client.send(interaction
            ? 1
            : message.channel, null, [
            {
                color: client.data.embedColor,
                title: 'Here\'s your emoji',
                url:   'https://www.npmjs.com/package/emoji-mixer',
                image: { url: 'attachment://emoji.png' }
            }
        ], [
            new Discord.AttachmentBuilder(buffer, { name: 'emoji.png' })
        ]);
    }
};
