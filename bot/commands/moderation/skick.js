'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import kick from './kick.js';

export default {
    name:             'skick',
    aliases:          [
        'kicksync',
        'synckick'
    ],
    usage:            '=skick <member> [reason]',
    description:      'Kick someone from **this server and every server it is linked to** (`=syncservers`), each with its own case and modlog entry.\n\nExactly the same as `=kick … sync`, so everything `=kick` accepts works here too.\n\nOnly servers that have run **`=syncservers moderation on`** are reached: linking servers is one decision, and each of them decides separately whether that also means your moderators may act there. The reply names every server it reached and every one it did not, with the reason.\n\n`=skick` cannot be undone - a kick is not a state to lift.',
    slashDescription: 'Kick a member from every server this one shares roles with.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('member').setDescription('The member to kick everywhere.').setRequired(true))
               .addStringOption(option => option.setName('reason').setDescription('Reason for the kick.').setRequired(false)),

    args:  true,
    defer: true,

    permissionsUser: kick.permissionsUser,
    permissionsBot:  kick.permissionsBot,

    async run(client, message, args, guild, interaction)
    {

        return kick.run(client, message, [
            ...args,
            'sync'
        ], guild, interaction);
    }
};
