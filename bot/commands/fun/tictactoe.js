'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:             'tictactoe',
    aliases:          [
        'ttt',
        'noughtsandcrosses'
    ],
    usage:            '=tictactoe <user>',
    description:      'Challenge someone to a game of Tic Tac Toe on nine buttons.\nYou are ❌ and go first; they are ⭕. The winner earns a little xp and money.',
    slashDescription: 'Challenge someone to Tic Tac Toe.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('user').setDescription('The person you want to challenge.').setRequired(true)),
    args:  true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    async run(client, message, args, guild, interaction)
    {
        const opponent = await client.utils.member(message, args, 0);

        if (!opponent)
        {
            return client.qEmbed('Who do you want to challenge? Mention someone.', interaction ?? message);
        }

        if (opponent.id === message.author.id)
        {
            return client.qEmbed('You can\'t play against yourself!', interaction ?? message);
        }

        if (opponent.user.bot)
        {
            return client.qEmbed('You can\'t challenge a bot.', interaction ?? message);
        }

        if (interaction)
        {
            await client.respond(`Challenge sent to ${opponent}!`, interaction, { hidden: true });
        }

        new client.class.tictactoe(client, message, guild, opponent);
    }
};
