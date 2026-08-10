'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import warning from './warning.js';

export default {
    name:        'swarning',
    aliases:     [
        'swarn',
        'warnsync',
        'syncwarn'
    ],
    usage:       '=swarning <user> [reason] [tierN] [NX] [noappeal]',
    description: 'Warn someone in **this server and every server it is linked to** (`=syncservers`), each with its own warning entry and modlog line.\n\nExactly the same as `=warning … sync`, so everything `=warning` accepts works here too - the `tierN` form, the `NX` duplication count and `noappeal`.\n\n**The tier travels; the autoban does not.** A synced warning is recorded everywhere with the tier you gave it, but only *this* server evaluates its autoban off it - a warning that silently banned someone in four servers is not what "warn them everywhere" asks for, and `=sban` is right there and says so. Each linked server still bans on its own limit the next time it evaluates one locally.\n\nOnly servers that have run **`=syncservers moderation on`** are reached: linking servers is one decision, and each of them decides separately whether that also means your moderators may act there. The reply names every server it reached and every one it did not, with the reason.',

    slashDescription: 'Warn a member in every server this one is linked to.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('user').setDescription('The member to warn everywhere.').setRequired(true))
               .addStringOption(option => option.setName('reason').setDescription('Why they are being warned. Capped at 258 characters.').setRequired(false))
               .addIntegerOption(option => option.setName('tier').setDescription('Threat tier, 0-30. Recorded in every linked server too.').setMinValue(0).setMaxValue(30).setRequired(false))
               .addIntegerOption(option => option.setName('count').setDescription('Record this same warning N times. Capped by the server\'s autoban limit.').setMinValue(1).setRequired(false))
               .addBooleanOption(option => option.setName('noappeal').setDescription('If this warning triggers the autoban here, do not DM them the reason or appeal invite.').setRequired(false)),

    args:  true,
    defer: true,

    permissionsUser:         warning.permissionsUser,
    permissionsBot:          warning.permissionsBot,
    suggestedPermissionsBot: warning.suggestedPermissionsBot,

    async run(client, message, args, guild, interaction)
    {
        return warning.run(client, message, args, guild, interaction, { forceSync: true });
    }
};
