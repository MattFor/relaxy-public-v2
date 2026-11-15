'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'devlog',
    aliases: ['dev'],
    usage: '=devlog',
    description: 'Show the features MattFor has been working on recently.',

    slash: new Discord.SlashCommandBuilder(),

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const fallBack = !message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.EmbedLinks);

        const file = await client.cdnText('devlog.txt');

        if (fallBack) {
            if (file.toString().length > 2048) {
                return client.qEmbed(
                    'Text too long for a normal message, please enable the `EmbedLinks` permission',
                    interaction ?? message
                );
            } else {
                return client.send(
                    interaction ? 1 : message.channel,
                    `# Here are the features I'm working on & other stuff!\n${file.toString().replaceAll('\r\n', '\n')}`
                );
            }
        }

        let embed = {
            title: "Here are the features I'm working on & other stuff!",
            description: '',
            color: client.data.embedColor,
            timestamp: new Date(),
            footer: client.data.footer,
            author: {
                name: "Relaxy's dev log!",
                icon_url: client.cdn.spinner
            }
        };

        embed = client.utils.createDescription(file.toString().replaceAll('\r\n', '\n'), embed, 5000);

        return client.send(interaction ? 1 : message.channel, null, [embed]);
    }
};
