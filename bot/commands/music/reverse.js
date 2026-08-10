'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name:        'reverse',
    usage:       '=reverse',
    description: 'Reverses the tracks in the queue. Requires at least 2 tracks in the non-playing queue.',

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    async run(client, message, args, guild, interaction)
    {
        if (!message.member.voice.channel)
        {
            return client.qEmbed('NotConnected', interaction ?? message);
        }

        const queue = useQueue(message.guild.id);

        if (!queue)
        {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        if (message.guild?.members?.me?.voice?.channel && message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id)
        {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        if (queue.tracks.size < 2)
        {
            return client.qEmbed('Too little tracks to reverse!', interaction ?? message);
        }

        queue.tracks.store.reverse();

        return client.qEmbed('The queue has been reversed!', interaction ?? message);
    }
};
