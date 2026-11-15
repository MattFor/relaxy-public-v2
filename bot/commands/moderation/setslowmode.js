'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'setslowmode',
    aliases: ['slowmode', 'cooldown', 'setcooldown'],
    usage: '=setslowmode [channel] <time|off>',
    description:
        "Set a slowmode for a channel (defaults to the current one). To turn slowmode off instead of a duration type 'off'.",

    slashDescription: 'Set a slowmode on this channel, or turn it off.',

    slash: new Discord.SlashCommandBuilder().addStringOption((option) =>
        option
            .setName('time')
            .setDescription('Slowmode delay for THIS channel (e.g. 10s, 2m), or "off".')
            .setRequired(true)
    ),

    args: true,
    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_CHANNELS'],
    permissionsBot: ['SEND_MESSAGES', 'MANAGE_CHANNELS'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const channel = (await client.utils.channel(message, args, 0)) ?? message.channel;

        if (channel.id !== message.channel.id) {
            args = client.utils.cutObjectDataFromArgs(args, channel);
        }

        let time = 0;
        if (!channel && args[0]) {
            return client.qEmbed("Channel doesn't exist/invalid id/mention!", interaction ?? message);
        }

        if (!args[0]) {
            return client.qEmbed("No time specified! Provide a number of seconds or 'off'.", interaction ?? message);
        }

        if (args[0].toLowerCase() === 'off' || args[0] === '0') {
            channel.setRateLimitPerUser(0);
        } else {
            time = client.utils.getTime(args) / 1000;

            if (!time) {
                return client.qEmbed('No time number specified!', interaction ?? message);
            }

            try {
                channel.setRateLimitPerUser(time);
            } catch {
                return client.qEmbed('Time in seconds should be under 21600! (6 hours)', interaction ?? message);
            }
        }

        return client.qEmbed(
            `${channel} slowmode ${args[0] === 'off' ? 'turned off' : `set to ${client.imports.time(time * 1000)}`}`,
            interaction ?? message
        );
    }
};
