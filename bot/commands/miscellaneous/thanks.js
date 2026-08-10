'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'thanks',
    aliases:     ['credits'],
    usage:       '=thanks',
    description: 'Show the page listing the people who helped make the bot, along with what they contributed.',

    slash: new Discord.SlashCommandBuilder(),

    defer: true,

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
                : message.channel, `# Here's a list of people who I couldn't have been made without!\n${(await client.cdnText('credits.txt')).replaceAll('\r\n', '\n')}`);
        }

        return client.send(interaction
            ? 1
            : message.channel, null, [
            {
                title:       'Here\'s a list of people who I couldn\'t have been made without!',
                description: await client.cdnText('credits.txt'),
                color:       client.data.embedColor,
                timestamp:   new Date(),
                footer:      {
                    icon_url: client.config.text.links.relaxyImage,
                    text:     `Relaxy! version ${client.config.keys.version} made by MattFor and many others ;)`
                },
                author:      {
                    name:     'Relaxy\'s "thanks to" page!',
                    icon_url: client.cdn.thanks
                }
            }
        ]);
    }
};