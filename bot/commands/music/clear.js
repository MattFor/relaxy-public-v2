'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name:        'clear',
    aliases:     [
        'qclear',
        'clearq'
    ],
    usage:       '=clear [history]',
    description: 'Clear the queue. Pass any argument to also clear the queue history.',

    slash: new Discord.SlashCommandBuilder()
               .addBooleanOption(option => option.setName('history').setDescription('Should we clear queue history?').setRequired(false)),

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

        if (!queue)
        {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        if (queue.tracks.size < 1)
        {
            return client.qEmbed('Queue too small to clear!', interaction ?? message);
        }

        if (message.guild.members.me.voice && message.guild.members.me.voice.channel && (message.member.voice.channel.full && message.guild.members.me.voice.channel.id !== message.member.voice.channel.id) && message.guild.members.me.voice.channel.id !== message.member.voice.channel.id)
        {
            return client.qEmbed('Voice channel is full!', interaction ?? message);
        }

        if (message.guild?.members?.me?.voice?.channel && message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id)
        {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        queue.tracks.clear();
        if (args[0])
        {
            queue.history.clear();
        }

        return client.qEmbed('Queue has been cleared!', interaction ?? message);
    }
};
