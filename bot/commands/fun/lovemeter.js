'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:             'lovemeter',
    usage:            '=lovemeter <user> [other]',
    description:      'Gives back a percentage of \'love\' you have for that user.\nThe first user is required; if a second user is given, it measures the love between the two of them instead.',
    slashDescription: 'Measure the percentage of love between users.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('user').setDescription('The user to measure your love for.').setRequired(true))
               .addUserOption(option => option.setName('other').setDescription('Optionally, measure the love between two users.').setRequired(false)),
    args:  true,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        const user1 = await client.utils.member(message, args, 0, { cut: true });

        const user2 = await client.utils.member(message, args, 0);

        if (!user1 || (user2 && user1.id === user2.id))
        {
            return client.qEmbed('You provided no lover!', interaction ?? message);
        }

        if (message.author.id === user1.id && !user2)
        {
            return client.qEmbed('Cannot love yourself! (loser)', interaction ?? message);
        }

        const lovePercentage = client.isOwner(message.author.id) && user1.user.id === client.user.id
            ? 100
            : Math.floor(Math.random() * 101);

        if (user1 && !user2)
        {
            return client.qEmbed(`${message.member}, your love for ${user1} is **${lovePercentage}%** ${lovePercentage === 69
                ? '💗.... Ready for it...'
                : lovePercentage === 100
                    ? 'Oh yes oh my god!'
                    : lovePercentage >= 90
                        ? '💗'
                        : lovePercentage > 76 && lovePercentage < 90
                            ? '💖'
                            : lovePercentage >= 50 && lovePercentage <= 76
                                ? '💓'
                                : lovePercentage >= 30 && lovePercentage < 50
                                    ? '💔'
                                    : lovePercentage >= 15 && lovePercentage < 30
                                        ? '🤍'
                                        : lovePercentage >= 0 && lovePercentage < 15
                                            ? '🖤 Sadge ;('
                                            : null}`, interaction ?? message);
        }

        if (client.isOwner(user1.user.id))
        {
            return client.qEmbed(client.utils.randErr(), interaction ?? message);
        }

        return client.qEmbed(`${user1}'s love for ${user2} is **${lovePercentage}%** ${lovePercentage === 69
            ? '💗.... Ready for it...'
            : lovePercentage === 100
                ? 'Oh yes oh my god!'
                : lovePercentage >= 90
                    ? '💗'
                    : lovePercentage > 76 && lovePercentage < 90
                        ? '💖'
                        : lovePercentage >= 50 && lovePercentage <= 76
                            ? '💓'
                            : lovePercentage >= 30 && lovePercentage < 50
                                ? '💔'
                                : lovePercentage >= 15 && lovePercentage < 30
                                    ? '🤍'
                                    : lovePercentage >= 0 && lovePercentage < 15
                                        ? '🖤 Sadge ;('
                                        : null}`, interaction ?? message);
    }
};
