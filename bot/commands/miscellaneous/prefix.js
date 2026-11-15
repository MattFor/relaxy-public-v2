'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'prefix',
    aliases: ['prefixadd', 'newprefix'],
    usage: '=prefix [set] [prefix...]',
    description:
        'Add one or more prefixes for Relaxy! on this server. Type =prefix set <prefix> to erase all others and keep only one. Type nothing to view the server prefixes.',

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_GUILD'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        if (args.length === 0) {
            return client.qEmbed(
                `_ ${guild.px
                    .map((p) => {
                        return `## ${p}`;
                    })
                    .join('\n')}`,
                interaction ?? message
            );
        }

        if (args.length === 2 && args[0] === 'set') {
            if (args[1].startsWith('/')) {
                return client.qEmbed('Prefix cannot start with /', interaction ?? message);
            }

            client.save(guild.id, {
                alter: 'px',
                value: [args[1]]
            });

            return client.qEmbed(`Set ${args[1]} as the only prefix!`, interaction ?? message);
        }

        if (guild.px.length >= 10 || guild.px.length + args.length > 10) {
            return client.qEmbed('Cannot have more than 10 prefixes!', interaction ?? message);
        }

        let flag = false;
        args.forEach((arg) => {
            if (flag) {
                return;
            }

            if (arg.length > 10) {
                flag = true;
                return client.qEmbed('Max prefix length is 10 characters!', interaction ?? message);
            }

            if (arg.includes('/')) {
                flag = true;
                return client.qEmbed('Prefix cannot start with /', interaction ?? message);
            }

            return guild.px.push(arg);
        });

        client.save(guild.id, {
            alter: 'px',
            value: guild.px
        });

        return client.qEmbed(
            `${args
                .map((arg) => {
                    return `**${arg}`;
                })
                .join(',** ')}** has been added to **${client.utils.firstLetterUp(message.guild.name)}**'s prefixes!`,
            interaction ?? message
        );
    }
};
