'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const options = [
    'Heads',
    'Tails'
];

export default {
    name:        'coinflip',
    aliases:     [
        'cf',
        'coinftoss'
    ],
    usage:       '=coinflip <heads|tails> <bet>',
    description: 'Bet on the outcome of a coin flip. **bet** is how much money you want to wager.',

    slash:    new Discord.SlashCommandBuilder()
                  .addStringOption(option => option.setName('side').setDescription('The side you bet on.').setRequired(true).addChoices({
                      name:  'Heads',
                      value: 'heads'
                  }, {
                      name:  'Tails',
                      value: 'tails'
                  }))
                  .addIntegerOption(option => option.setName('bet').setDescription('How much money you want to bet.').setRequired(true).setMinValue(1)),
    args:     true,
    cooldown: 20,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        const user = await client.module.database.User(message.author.id);

        let bet = Math.floor(Number(args[1]));

        if (!bet || isNaN(bet))
        {
            return client.qEmbed('Bet not present/not a number!', interaction ?? message);
        }
        if (bet < 1)
        {
            return client.qEmbed('Bet has to be at least 1!', interaction ?? message);
        }
        if (bet > user.m)
        {
            return client.qEmbed('Bet higher than the amount of money you have!', interaction ?? message);
        }

        let bet_option;

        try
        {
            bet_option = client.utils.firstLetterUp(args[0]);
        }
        catch
        {
        }

        if (!options.includes(bet_option))
        {
            return client.qEmbed('No option specified! [heads/tails]', interaction ?? message);
        }

        const result = options[Math.random() < 0.5
            ? 0
            : 1];

        const won = result === bet_option;

        if (won)
        {
            user.m += bet;
            client.qEmbed(`**${result}** - you won **\`${bet} money\`**!`, interaction ?? message);
        }
        else
        {
            user.m -= bet;
            client.qEmbed(`**${result}** - you lost **\`${bet} money\`**!`, interaction ?? message);
        }

        client.saveProfile(message.author.id, {
            alter: 'm',
            value: user.m
        });
    }
};
