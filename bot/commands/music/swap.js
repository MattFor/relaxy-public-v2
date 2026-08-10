'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name:        'swap',
    usage:       '=swap <index_1> <index_2>',
    description: 'Swap places of 2 songs within the music queue by their indices.\nDoes not work on the current song.',

    slash: new Discord.SlashCommandBuilder()
               .addIntegerOption(option => option.setName('index_1').setDescription('Index of the first song.').setRequired(true).setMinValue(2))
               .addIntegerOption(option => option.setName('index_2').setDescription('Index of the second song.').setRequired(true).setMinValue(3)),

    args: true,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        const queue = useQueue(message.guild.id);

        if (!message.member.voice.channel)
        {
            return client.qEmbed('NotConnected', interaction ?? message);
        }

        if (message.guild?.members?.me?.voice?.channel && message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id)
        {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        if (!queue)
        {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        if (queue.tracks.size < 2)
        {
            return client.qEmbed('Queue too small to swap tracks!', interaction ?? message);
        }

        if (args.length !== 2)
        {
            return client.qEmbed('You must use 2 indices for this command to work. Too little arguments!', interaction ?? message);
        }

        const index1 = Number(args[0]) - 2;

        if (index1 < 0)
        {
            return client.qEmbed('Cannot swap the currently playing track! (index 1)', interaction ?? message);
        }

        if (!queue.tracks.data[index1])
        {
            return client.qEmbed('The first track does not exist!', interaction ?? message);
        }

        const index2 = Number(args[1]) - 2;

        if (index2 < 0)
        {
            return client.qEmbed('Cannot swap the currently playing track! (index 2)', interaction ?? message);
        }

        if (!queue.tracks.data[index2])
        {
            return client.qEmbed('The second track does not exist!', interaction ?? message);
        }

        queue.swapTracks(index1, index2);

        return client.qEmbed(`Swapped tracks ${args[0]} and ${args[1]}!`, interaction ?? message);
    }
};
