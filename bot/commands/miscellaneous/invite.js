'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'invite',
    usage:       '=invite',
    description: 'Get links to the support server, Relaxy!\'s invite, the vote page and the donation page.',

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        const fallBack = !message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.EmbedLinks);

        if (fallBack)
        {
            return client.send(interaction
                ? 1
                : message.channel, `# Hope you like Relaxy!\n## Support server invite link\nhttps://discord.gg/xRAGVePxk6\n## Relaxy! invite link\nhttps://discord.com/api/oauth2/authorize?client_id=775358898088968202&permissions=3262528&scope=applications.commands%20bot\n\nPlease vote for Relaxy!\n${client.utils.voteLinks('\n')}\nAnd here if you want to support me directly:\nhttps://ko-fi.com/relaxy`);
        }

        return client.send(interaction
            ? 1
            : message.channel, null, [
            {
                color:       client.data.embedColor,
                title:       '**Hope you like Relaxy!**',
                description: `**1. [Website - relaxy.xyz](https://relaxy.xyz)**\n**2. [Support server](https://discord.gg/xRAGVePxk6)**  **3. [Invite Relaxy!](https://discord.com/api/oauth2/authorize?client_id=775358898088968202&permissions=3262528&scope=applications.commands%20bot)**\n**4. Vote:** ${client.utils.voteLinks()}\n**5. [Support me on Ko-fi](https://ko-fi.com/relaxy)**`,
                thumbnail:   { url: client.cdn.brand }
            }
        ]);
    }
};
