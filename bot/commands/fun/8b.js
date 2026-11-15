'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: '8ball',
    aliases: ['8b'],
    usage: '=8ball <question>',
    description: 'Ask the magic 8-ball a yes/no question and receive a randomised answer.',

    slash: new Discord.SlashCommandBuilder().addStringOption((option) =>
        option.setName('text').setDescription('What do you wish for?').setRequired(true)
    ),
    defer: true,

    args: true,
    cooldown: 2,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const pregenerated = (await client.cdnText('8b.txt')).split('\n');

        return client.qEmbed(
            `${pregenerated[Math.floor(Math.random() * pregenerated.length)]}, ${message.member}`,
            interaction ?? message
        );
    }
};
