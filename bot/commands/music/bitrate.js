'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name: 'bitrate',
    usage: '=bitrate <bitrate>',
    description: "Set the bitrate of Relaxy!'s music (the maximum depends on the server's boost level).",

    slash: new Discord.SlashCommandBuilder().addNumberOption((option) =>
        option
            .setName('bitrate')
            .setDescription('Bitrate in kb/s from 1 to the maximum nitro boost allows.')
            .setMinValue(1)
            .setMaxValue(384)
            .setRequired(true)
    ),

    args: true,

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

        if (isNaN(args[0])) {
            return client.qEmbed('Argument is not a number!', interaction ?? message);
        }

        let maxBitrate = 96;
        let bitrate = Number(args[0]);

        switch (message.guild.premiumTier) {
            case 1:
                maxBitrate = 128;
                break;

            case 2:
                maxBitrate = 256;
                break;

            case 3:
                maxBitrate = 384;
                break;

            default:
                maxBitrate = 96;
        }

        if (bitrate < 1) {
            return client.qEmbed('Bitrate cannot be lower than 1!', interaction ?? message);
        }

        if (bitrate > maxBitrate) {
            return client.qEmbed(
                `Bitrate too high, max for your server is ${maxBitrate}!\nTo increase this, boost your server with nitro!`,
                interaction ?? message
            );
        }

        queue.node.setBitrate(bitrate * 1000);

        return client.qEmbed(`Bitrate set to ${bitrate}!`, interaction ?? message);
    }
};
