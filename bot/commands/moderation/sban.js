'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import ban from './ban.js';

export default {
    name:             'sban',
    aliases:          [
        'bansync',
        'syncban',
        'globalban'
    ],
    usage:            '=sban <user|id|former name> [time] [reason] [noappeal]',
    description:      'Ban a member **here and in every server this one is linked to** (`=syncservers`), each with its own case, modlog entry and appeal channel.\n\nExactly the same as `=ban <user> [reason] sync`, so everything `=ban` accepts works here too - the message-deletion window, `noappeal`, and banning somebody who has already left by a name they used to use.\n\nOnly servers that have run **`=syncservers moderation on`** are reached: linking servers is one decision, and each of them decides separately whether that also means your moderators may act there. The reply names every server it reached and every one it did not, with the reason.\n\nThey are DM\'d **once**, by this server. `=sunban <id>` lifts it everywhere again.',
    slashDescription: 'Ban a member here and in every server this one is linked to.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('user').setDescription('The member to ban everywhere.').setRequired(true))
               .addStringOption(option => option.setName('reason').setDescription('Reason and/or message deletion window (e.g. "spam 1d").').setRequired(false)),

    args:  true,
    defer: true,

    permissionsUser: ban.permissionsUser,
    permissionsBot:  ban.permissionsBot,

    async run(client, message, args, guild, interaction)
    {
        return ban.run(client, message, [
            ...args,
            'sync'
        ], guild, interaction);
    }
};
