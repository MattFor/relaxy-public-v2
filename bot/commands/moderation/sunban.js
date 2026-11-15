'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import unban from './unban.js';

export default {
    name: 'sunban',
    aliases: ['unbansync', 'syncunban'],
    usage: '=sunban <userId|name|former nickname> [reason]',
    description:
        'Unban someone in **this server and every server it is linked to** (`=syncservers`), each with its own case and modlog entry.\n\nExactly the same as `=unban … sync`, so everything `=unban` accepts works here too - including naming them by any **name they are known by now or used to use**, rather than by id. The counterpart of `=sban`, and the reason it exists: a ban that syncs outward and a pardon that does not is a trap.\n\nOnly servers that have run **`=syncservers moderation on`** are reached: linking servers is one decision, and each of them decides separately whether that also means your moderators may act there. The reply names every server it reached and every one it did not, with the reason.',
    slashDescription: 'Unban a user in every server this one shares roles with.',

    slash: new Discord.SlashCommandBuilder()
        .addStringOption((option) =>
            option
                .setName('userid')
                .setDescription('Their id, or a name/nickname they have used here.')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('reason').setDescription('Reason for the unban.').setRequired(false)
        ),

    args: true,
    defer: true,

    permissionsUser: unban.permissionsUser,
    permissionsBot: unban.permissionsBot,

    async run(client, message, args, guild, interaction) {
        return unban.run(client, message, [...args, 'sync'], guild, interaction);
    }
};
