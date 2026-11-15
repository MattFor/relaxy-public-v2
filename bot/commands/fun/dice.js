'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'dice',
    aliases: ['d'],
    usage: '=dice <number>',
    description: 'Roll a random number from 1 up to the number you specify (max 1,000,000).',

    slash: new Discord.SlashCommandBuilder().addStringOption((option) =>
        option.setName('number').setDescription('Maximum number to roll up to. (max 1000000)').setRequired(true)
    ),
    args: true,
    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        if (args[0] === '0' || args[0].includes('-')) {
            return client.qEmbed('not a number or above 1000000!', interaction ?? message);
        }

        return client.qEmbed(
            `${Math.floor(Math.random() * parseInt(client.utils.nums(args[0]))) + 1}`,
            interaction ?? message
        );
    }
};
