'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name: 'skip',
    usage: '=skip [amount]',
    description: 'Skip the current song, or the **amount** of songs specified.',

    slash: new Discord.SlashCommandBuilder().addIntegerOption((option) =>
        option.setName('amount').setDescription('Amount of songs to skip.').setRequired(false).setMinValue(1)
    ),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],
    suggestedPermissionsBot: ['ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        const queue = useQueue(message.guild.id);

        if (!message.member.voice.channel) {
            return client.qEmbed('NotConnected', interaction ?? message);
        }

        if (!queue) {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        if (
            message.guild.members.me.voice &&
            message.guild.members.me.voice.channel &&
            message.member.voice.channel.full &&
            message.guild.members.me.voice.channel.id !== message.member.voice.channel.id &&
            message.guild.members.me.voice.channel.id !== message.member.voice.channel.id
        ) {
            return client.qEmbed('Voice channel is full!', interaction ?? message);
        }

        if (
            message.guild?.members?.me?.voice?.channel &&
            message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id
        ) {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        if (args[0]) {
            args[0] = Number(args[0]);

            if (args[0] < 2 || !queue.node.skipTo(args[0] - 1)) {
                return client.qEmbed('Number out of bounds or to low!', interaction ?? message);
            }
        } else {
            queue.node.skip();
        }

        if (!queue.currentTrack) {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        return client.send(interaction ?? message.channel, null, [
            {
                color: client.data.embedColor,
                title: client.utils.firstLetterUp(queue.currentTrack.title),
                url: queue.currentTrack.url,

                author: {
                    name: `Skipping ${args[0] ?? 1} track${(args[0] ?? 1) > 1 ? 's' : ''}`,
                    icon_url: client.config.text.links.musicImage
                },
                thumbnail: {
                    url: client.utils.trackThumbnail(queue.currentTrack)
                },

                timestamp: new Date()
            }
        ]);
    }
};
