'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'relaxytime',
    usage: '=relaxytime',
    description: "Show Relaxy!'s internal clock.",

    slash: new Discord.SlashCommandBuilder(),
    args: false,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const date = new Date().toLocaleString().split(',');

        const fallBack = !message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.EmbedLinks);

        if (fallBack) {
            return client.send(
                interaction ? 1 : message.channel,
                `# Relaxy\'s internal clock\n\`${date[1].slice(1)}\`  **-  ${date[0]}**`
            );
        }

        return client.send(interaction ? 1 : message.channel, null, [
            {
                color: client.data.embedColor,
                title: "Relaxy's internal clock:",
                description: `\`${date[1].slice(1)}\`  **-  ${date[0]}**`
            }
        ]);
    }
};
