'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'autoban',
    usage: '=autoban [number]',
    description:
        'Set the autoban threshold for the server (only works while `=censor` is on). The number is how many warnings a member may receive before being banned (1-100). Run with no number to use the default of 3, or to deactivate autobans if one is already set.\nThis number also caps how many times one warning may be duplicated at once with `=warning <user> <reason> NX`.\n```fix\nDoes not affect admins or members with ban permissions.\n```',

    slashDescription: 'Set how many warnings a member may collect before Relaxy bans them.',

    slash: new Discord.SlashCommandBuilder().addIntegerOption((option) =>
        option
            .setName('number')
            .setDescription('Warnings allowed before a ban (1-100). Omit to reset to 3, or to turn autobans off.')
            .setRequired(false)
    ),

    cooldown: 20,

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_MESSAGES', 'BAN_MEMBERS'],
    permissionsBot: ['SEND_MESSAGES', 'MANAGE_MESSAGES', 'BAN_MEMBERS'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        if (!guild.cn.on) {
            return client.qEmbed(`Cannot enable autoban without censoring first!`, interaction ?? message);
        }

        if (guild.cn.ab && !args[0]) {
            client.save(guild.id, {
                alter: 'cn.ab',
                value: 0
            });
            return client.qEmbed(`Autobans deactivated for ${message.guild.name}!`, interaction ?? message);
        }

        if (!args[0]) {
            client.save(guild.id, {
                alter: 'cn.ab',
                value: 3
            });
            return client.qEmbed(`No warning number specified, using default preset - 3!`, interaction ?? message);
        }

        const num = Number(args[0]);

        if (isNaN(num) || num <= 0 || num > 100) {
            return client.qEmbed('Input is not a number/invalid', interaction ?? message);
        }

        client.save(guild.id, {
            alter: 'cn.ab',
            value: num
        });
        return client.qEmbed(`Autobans changed to ${args[0]} for ${message.guild.name}!`, interaction ?? message);
    }
};
