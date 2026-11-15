'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import unmute from './unmute.js';

export default {
    name: 'sunmute',
    aliases: ['unmutesync', 'syncunmute'],
    usage: '=sunmute <user> [reason]',
    description:
        'Unmute someone in **this server and every server it is linked to** (`=syncservers`), each with its own case and modlog entry.\n\nExactly the same as `=unmute … sync`, so everything `=unmute` accepts works here too. Each server restores the roles **it** took away, because those are the only ones it recorded.\n\nOnly servers that have run **`=syncservers moderation on`** are reached: linking servers is one decision, and each of them decides separately whether that also means your moderators may act there. The reply names every server it reached and every one it did not, with the reason.',
    slashDescription: 'Unmute a member in every server this one shares roles with.',

    slash: new Discord.SlashCommandBuilder().addUserOption((option) =>
        option.setName('user').setDescription('The member to unmute everywhere.').setRequired(true)
    ),

    args: true,
    defer: true,

    permissionsUser: unmute.permissionsUser,
    permissionsBot: unmute.permissionsBot,

    async run(client, message, args, guild, interaction) {
        return unmute.run(client, message, [...args, 'sync'], guild, interaction);
    }
};
