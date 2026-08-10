'use strict';

import Discord     from 'discord.js';
import { YouTube } from 'youtube-sr';
import Relaxy      from '../../../src/Client/Relaxy.js';

export default {
    name:        'youtubesearch',
    aliases:     ['yts'],
    usage:       '=youtubesearch <keywords>',
    description: 'Return a YouTube video URL from the given keywords.',

    slash: new Discord.SlashCommandBuilder().addStringOption(option => option.setName('video_name').setDescription('Name of what video to search.').setRequired(true)),
    args:  true,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],
    async run(client, message, args, guild, interaction)
    {
        const i = await YouTube.search(args.join(' '));

        if (!i || i.length === 0)
        {
            return client.qEmbed('No video found!', interaction ?? message);
        }

        return interaction
            ? {
                content: `https://www.youtube.com/watch?v=${i[0].id}`
            }
            : client.send(message.channel, `https://www.youtube.com/watch?v=${i[0].id}`);
    }
};