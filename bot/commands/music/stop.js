'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name: 'stop',
    aliases: ['disconnect', 'leave', 'end', 'die'],
    usage: '=stop',
    description: "Stop the music queue and make Relaxy! leave the voice channel he's in.",

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

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

        queue.delete();

        return client.qEmbed('Stopped playing music on the server!', interaction ?? message);
    }
};
