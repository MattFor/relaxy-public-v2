'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'purgereactions',
    aliases:     [
        'deletereactions',
        'pr'
    ],
    usage:       '=purgereactions <amount> [channel]',
    description: 'Delete all reactions from a selected number of messages. The optional **channel** lets you clear reactions in a channel other than the one the command is used in.',

    slashDescription: 'Delete every reaction from a number of recent messages.',

    slash: new Discord.SlashCommandBuilder()
               .addIntegerOption(option => option.setName('amount').setDescription('How many recent messages to strip reactions from.').setRequired(true))
               .addChannelOption(option => option.setName('channel').setDescription('Where to strip them. Defaults to this channel.').setRequired(false)),

    args: true,

    defer: true,

    permissionsUser:         [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES'
    ],
    permissionsBot:          [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES'
    ],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        const number = Number(client.utils.nums(args[0]));

        if (isNaN(number))
        {
            return client.qEmbed('No number specified!', interaction ?? message);
        }

        if (number < 1 || number > 100)
        {
            return client.qEmbed('Invalid number specified, please use 1-100!', interaction ?? message);
        }

        const channel = await client.utils.channel(message, args, 1) ?? message.channel;

        if (!channel && isNaN(number))
        {
            return client.qEmbed('Channel doesn\'t exist!', interaction ?? message);
        }

        if (client.utils.isRestricted(guild, channel.id) && !message.member.permissions.has(Discord.PermissionFlagsBits.Administrator) && !client.utils.isExempt(guild, message))
        {
            return client.qEmbed('You are not allowed to alter reactions within this channel!', interaction ?? message);
        }

        let messages = await channel.messages.fetch({
            limit: number,
            cache: false
        });
        messages = messages.filter(m => m.reactions.cache.size !== 0);

        for (let i = 0; i < messages.size; i++)
        {
            await messages.at(i).reactions.removeAll().catch(client.swallow('purgereactions: removeAll'));
            await client.utils.sleep(1000);
        }
    }
};
