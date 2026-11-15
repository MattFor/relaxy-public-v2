'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { useQueue, useTimeline } from '../../../src/Client/Modules/MusicPlayer/index.js';

const convertToVolume = (userInput) => (userInput / 100) * 10;
const convertFromVolume = (userInput) => (userInput * 100) / 10;

export default {
    name: 'volume',
    aliases: ['vol'],
    usage: '=volume [volume]',
    description:
        "Number: `1 - 100`\nChange the volume of music that Relaxy!' playing.\nTo see the queue volume simply do =volume.",
    slashDescription: "Change the volume of Relaxy' music.",

    slash: new Discord.SlashCommandBuilder().addIntegerOption((option) =>
        option.setName('volume').setDescription('Music volume.').setRequired(false).setMaxValue(1000).setMinValue(1)
    ),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const queue = useQueue(message.guild.id);

        if (!message.member.voice.channel) {
            return client.qEmbed('NotConnected', interaction ?? message);
        }

        if (!queue || !queue.currentTrack) {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        const timeline = useTimeline({ node: queue });
        const volume = parseInt(args.join(' ').replace('%', ''));

        if (!volume) {
            return client.qEmbed(
                `The current volume is: ${convertFromVolume(queue.options.volume)}%!`,
                interaction ?? message
            );
        }

        if (
            message.guild?.members?.me?.voice?.channel &&
            message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id
        ) {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        if (
            !interaction &&
            (isNaN(volume) ||
                (volume > 10000 && volume !== 69420) ||
                volume < 1 ||
                message.content.includes('-') ||
                message.content.includes('+') ||
                message.content.includes(',') ||
                message.content.includes('.'))
        ) {
            return client.qEmbed('InvalidNumber', interaction ?? message);
        }

        timeline.setVolume(convertToVolume(volume));

        return client.qEmbed(
            `Volume set to ${volume}%!${
                volume === 69420 ? '\nGood luck to your ears! Hope your friends still like you after this! ;)' : ''
            }`,
            interaction ?? message
        );
    }
};
