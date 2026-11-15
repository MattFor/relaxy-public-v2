'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'exempt',
    usage: '=exempt [users|roles]',
    description:
        "Toggle exemption from ALL danger checks for ALL Relaxy commands for the given users / roles.\nDon't input anything to show current exemptions.",

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_GUILD'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const exemptions = guild.mbr.ex;

        const added = [];
        const removed = [];

        let embed = {
            color: client.data.embedColor,
            title: 'Exemptions:',
            fields: []
        };

        for (let i = 0; i < args.length; i++) {
            const user = (await client.utils.member(message, args, i))?.user;
            const role = client.utils.role(message, args, i);

            if (!user && !role) {
                return client.qEmbed(`Item [${i + 1}] is neither a role nor a user!`, interaction ?? message);
            }

            if (user) {
                if (exemptions.includes(user.id)) {
                    removed.push(user.id);
                    exemptions.splice(exemptions.indexOf(user.id), 1);
                } else {
                    added.push(user.id);
                    exemptions.push(user.id);
                }
            }

            if (role) {
                if (exemptions.includes(role.id)) {
                    removed.push(role.id);
                    exemptions.splice(exemptions.indexOf(role.id), 1);
                } else {
                    added.push(role.id);
                    exemptions.push(role.id);
                }
            }
        }

        client.save(guild.id, {
            alter: 'mbr.ex',
            value: exemptions
        });

        if (added.length > 0) {
            embed.fields.push({
                name: 'Added:',
                value: await client.utils.makeList(added, message.guild.roles.cache, 0)
            });
        }

        if (removed.length > 0) {
            embed.fields.push({
                name: 'Removed:',
                value: await client.utils.makeList(removed, message.guild.roles.cache, 0)
            });
        }

        embed = client.utils.createDescription(
            await client.utils.makeList(exemptions, message.guild.roles.cache, 0),
            embed
        );

        return client.send(message.channel, null, [embed]);
    }
};
