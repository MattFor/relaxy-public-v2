'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'levelout',
    aliases:     [
        'lvlout',
        'lout'
    ],
    usage:       '=levelout',
    description: 'Toggle opting out of leveling. While opted out you won\'t appear on =leaderboard and others can\'t =level @you.',

    slashDescription: 'Toggle opting out of leveling.',

    slash:    new Discord.SlashCommandBuilder(),
    cooldown: 60,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        const user = await client.module.database.User(message.author.id);

        if (user.lo)
        {
            user.lo = false;

            client.saveProfile(message.author.id, {
                alter: 'lo',
                value: user.lo
            });

            return client.qEmbed('You\'re back into leveling!', interaction ?? message);
        }

        user.lo = true;

        client.saveProfile(message.author.id, {
            alter: 'lo',
            value: user.lo
        });

        return client.qEmbed('You opted out of leveling!', interaction ?? message);
    }
};
