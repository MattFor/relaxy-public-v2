'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name:        'shuffle',
    aliases:     ['mix'],
    usage:       '=shuffle',
    description: 'Shuffles the queue randomly.',

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],
    async run(client, message, args, guild, interaction)
    {
        if (message.guild?.members?.me?.voice?.channel && message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id)
        {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        const queue = useQueue(message.guild.id);

        if (!queue)
        {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        if (queue.tracks.size < 2)
        {
            return client.qEmbed('Not enough tracks to shuffle the queue!', interaction ?? message);
        }

        queue.tracks.shuffle();

        return client.qEmbed(`Queue of ${queue.tracks.size + 1} tracks has been shuffled!`, interaction ?? message);
    }
};
