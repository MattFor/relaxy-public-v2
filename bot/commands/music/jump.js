'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name: 'jump',
    aliases: ['hop', 'jumpto', 'hopto'],
    usage: '=jump <index>',
    description: 'Jump to and play a specific track in the queue. **index** is its position shown in =queue.',

    slash: new Discord.SlashCommandBuilder().addIntegerOption((option) =>
        option
            .setName('index')
            .setDescription('Index of the song in =queue to skip to.')
            .setRequired(true)
            .setMinValue(1)
    ),

    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        const queue = useQueue(message.guild.id);

        if (!message.member.voice.channel) {
            return client.qEmbed('NotConnected', interaction ?? message);
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

        if (!queue?.currentTrack) {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        const queueLength = queue.tracks.size;

        const trackIndexToSkipTo = Number(args[0]);

        if (isNaN(trackIndexToSkipTo)) {
            return client.qEmbed('Specified track to skip is not a number!', interaction ?? message);
        }

        if (trackIndexToSkipTo < 2) {
            return client.qEmbed(
                'Pick a track number of 2 or higher (1 is the current track).',
                interaction ?? message
            );
        }

        if (trackIndexToSkipTo - 1 > queueLength) {
            return client.qEmbed(
                `Queue length is ${queueLength}, you input ${trackIndexToSkipTo}. Out of bounds!`,
                interaction ?? message
            );
        }

        queue.node.jump(trackIndexToSkipTo - 2);

        return client.qEmbed('Jumping...', interaction ?? message);
    }
};
