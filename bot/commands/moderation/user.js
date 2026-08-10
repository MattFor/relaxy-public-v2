'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'user',
    aliases:     ['allow'],
    usage:       '=user <user/role>',
    description: 'Toggle users or roles on the allow list. While the list has at least one entry, only those users (and members with a listed role) are allowed to use Relaxy.',

    slashDescription: 'Toggle a user or role on the allow list of who may use Relaxy.',

    slash: new Discord.SlashCommandBuilder()
               .addStringOption(option => option.setName('target').setDescription('The user or role to add to (or remove from) the allow list.').setRequired(true)),

    cooldown: 3,

    permissionsUser: [
        'SEND_MESSAGES',
        'MANAGE_GUILD'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    async run(client, message, args, guild, interaction)
    {
        const allowed = guild.mbr.el;

        const added = [];
        const removed = [];

        let embed = {
            color:       client.data.embedColor,
            title:       'Allowed users:',
            description: '',
            fields:      []
        };

        for (let i = 0; i < args.length; i++)
        {
            const member = await client.utils.member(message, args, i);
            const role = client.utils.role(message, args, i);

            if (!member && !role)
            {
                return client.qEmbed(`Item [${i + 1}] is neither a role nor a user!`, interaction ?? message);
            }

            if (member)
            {
                if (allowed.includes(member.user.id))
                {
                    removed.push(member.user.id);
                }
                else
                {
                    added.push(member.user.id);
                }
            }

            if (role)
            {
                if (allowed.includes(role.id))
                {
                    removed.push(role.id);
                }
                else
                {
                    added.push(role.id);
                }
            }
        }

        for (let i = 0; i < added.length; i++)
        {
            allowed.push(added[i]);
        }

        for (let i = 0; i < removed.length; i++)
        {
            if (allowed.includes(removed[i]))
            {
                allowed.splice(allowed.indexOf(removed[i]), 1);
            }
        }

        client.save(guild.id, {
            alter: 'mbr.el',
            value: allowed
        });

        if (added.length > 0)
        {
            embed.fields.push({
                name:  'Added:',
                value: await client.utils.makeList(added, message.guild.roles.cache, 0)
            });
        }

        if (removed.length > 0)
        {
            embed.fields.push({
                name:  'Removed:',
                value: await client.utils.makeList(removed, message.guild.roles.cache, 0)
            });
        }

        embed = client.utils.createDescription(await client.utils.makeList(allowed, message.guild.roles.cache, 0), embed);

        return client.send(interaction
            ? 1
            : message.channel, null, [embed]);
    }
};
