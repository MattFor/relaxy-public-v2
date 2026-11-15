'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { buildNodeOptions } from '../../../src/Client/Modules/Music/MusicOptions.js';

import { useQueue, useMainPlayer } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name: 'join',
    aliases: ['vcjoin', 'summon'],
    usage: '=join',
    description: 'Make Relaxy! join your voice channel.',

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser: ['SEND_MESSAGES', 'CONNECT'],
    permissionsBot: ['SEND_MESSAGES', 'CONNECT'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        if (!message.member.voice.channel) {
            return client.qEmbed('You have to be in a voice channel to initiate this command!', interaction ?? message);
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

        const player = useMainPlayer();
        const queue = useQueue(message.guild.id);

        if (queue) {
            return client.qEmbed('Already in a voice channel!', interaction ?? message);
        }

        try {
            const newQueue = player?.queues.create(guild.id, buildNodeOptions(client, guild, interaction ?? message));

            await newQueue?.connect(message.member.voice.channel.id);

            if (interaction) {
                return client.utils.interactionReplySpecial('Successfully connected!', interaction, true);
            }

            return client.qEmbed('Successfully connected!', interaction ?? message);
        } catch (e) {
            return client.qEmbed("Can't connect!", interaction ?? message);
        }
    }
};
