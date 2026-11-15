'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'tradeout',
    aliases: ['tout', 'notrade'],
    usage: '=tradeout',
    description:
        'Toggle opting out of trading. While opted out nobody can offer you a trade, and you cannot offer one either.',

    slashDescription: 'Toggle opting out of trading.',

    slash: new Discord.SlashCommandBuilder(),
    cooldown: 60,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const user = await client.module.database.User(message.author.id);

        const opted = !user.to;

        client.saveProfile(message.author.id, {
            alter: 'to',
            value: opted
        });

        return client.qEmbed(
            opted
                ? 'You opted out of trading! Nobody can offer you a trade, and you cannot offer one either.'
                : "You're back into trading!",
            interaction ?? message
        );
    }
};
