'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import {
    useQueue,
    QueueRepeatMode
} from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name:        'loop',
    aliases:     ['lp'],
    usage:       '=loop',
    description: 'Toggle looping of the entire queue.',

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

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

        if (message.guild.members.me.voice && message.guild.members.me.voice.channel && (message.member.voice.channel.full && message.guild.members.me.voice.channel.id !== message.member.voice.channel.id) && message.guild.members.me.voice.channel.id !== message.member.voice.channel.id)
        {
            return client.qEmbed('Voice channel is full!', interaction ?? message);
        }

        if (queue.repeatMode === QueueRepeatMode.QUEUE)
        {
            queue.setRepeatMode(QueueRepeatMode.AUTOPLAY);

            return client.send(interaction
                ? 1
                : message.channel, null, [
                {
                    color:       client.data.embedColor,
                    author:      {
                        name:     'Loop on for',
                        icon_url: client.config.text.links.musicImage
                    },
                    title:       `${client.utils.firstLetterUp(message.guild.name)}`,
                    description: `**Channel - ${message.guild.members.me.voice.channel}**`,
                    thumbnail:   {
                        url: client.utils.guildIcon(message.guild)
                    },
                    timestamp:   new Date()
                }
            ]);
        }

        queue.setRepeatMode(QueueRepeatMode.QUEUE);

        return client.send(interaction
            ? 1
            : message.channel, null, [
            {
                color:       client.data.embedColor,
                author:      {
                    name:     'Loop on for',
                    icon_url: client.config.text.links.musicImage
                },
                title:       `${client.utils.firstLetterUp(message.guild.name)}`,
                description: `**Channel - ${message.guild.members.me.voice.channel}**`,
                thumbnail:   {
                    url: client.utils.guildIcon(message.guild)
                },
                timestamp:   new Date()
            }
        ]);
    }
};
