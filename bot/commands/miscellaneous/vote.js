'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'vote',
    usage:       '=vote',
    description: 'Get the links to vote for Relaxy.',

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],
    async run(client, message, args, guild, interaction)
    {

        return client.send(interaction
            ? 1
            : message.channel, null, {
            default:   [
                {
                    color:       client.data.embedColor,
                    description: `### Vote for Relaxy!\nEvery vote is free, takes ten seconds, and is the main way anyone finds the bot.\n\n${client.utils.voteLinks('\n')}`,
                    footer:      client.data.footer
                }
            ],
            alternate: `### Vote for Relaxy!\n\n${client.utils.voteLinks('\n')}`
        }, [], [], [new Discord.ActionRowBuilder().addComponents(...client.utils.voteButtons())]);
    }
};
