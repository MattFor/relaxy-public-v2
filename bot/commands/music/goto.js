'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name:        'goto',
    aliases:     ['seek'],
    usage:       '=goto <time>',
    description: 'Seek to a specific timestamp in the current song. **time** is in HH:MM:SS, MM:SS or seconds.',

    slash: new Discord.SlashCommandBuilder().addStringOption(option => option.setName('time').setDescription('Time to which the video will be skipped. Format: HH:MM:SS.').setRequired(true).setMinLength(2).setMaxLength(800)),

    args:     true,
    cooldown: 5,

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

        if (message.guild?.members?.me?.voice?.channel && message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id)
        {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        const track = queue.currentTrack;

        if (!track)
        {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        if (isNaN(args[0]) && !args[0].includes(':'))
        {
            return client.qEmbed('Time is not a number', interaction ?? message);
        }

        if (!args[0].includes(':'))
        {
            args[0] = `${args[0]}:`;
        }

        let time = client.utils.cleanup(args[0].split(':'));

        switch (time.length)
        {
            case 1:
                time = parseInt(time[0]) * 1000;
                break;

            case 2:
                time = parseInt(time[0]) * 60000 + parseInt(time[1]) * 1000;
                break;

            case 3:
                time = parseInt(time[0]) * 3600000 + parseInt(time[1]) * 60000 + parseInt(time[2]) * 1000;
                break;

            default:
                return client.qEmbed('Time too long!', interaction ?? message);
        }

        time = time < 0
            ? 0
            : time;
        time = time >= track.duration
            ? track.duration - 1000
            : time;

        queue.node.seek(time);

        return client.qEmbed(`Skipping to **${client.imports.time(time)}**`, interaction ?? message);
    }
};
