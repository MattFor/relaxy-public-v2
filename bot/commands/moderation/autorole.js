'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'autorole',
    usage:       '=autorole [roles|off|exempt <role|user>]',
    description: 'Maintain a list of roles automatically given to anyone joining the server. Listing a role that is already present removes it.\nPass \'off\' to disable, or nothing to view the current autoroles.\n\n**`=autorole exempt <role|user>`** - never autorole that member, or anyone holding that role. Naming one already exempt removes the exemption; run bare to list them.\n\nOn a server with **onboarding**, autoroles are given once the member finishes onboarding rather than the instant they join - otherwise Discord applies the roles their answers earn them afterwards and the autorole is lost with them.',

    permissionsUser: [
        'SEND_MESSAGES',
        'MANAGE_ROLES'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'MANAGE_ROLES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const result = guild.rl.a;

        const added = [];
        const removed = [];

        const embed = {
            color:  client.data.embedColor,
            title:  'Autoroles:',
            fields: []
        };

        const exemptions = guild.rl.x ?? [];

        const renderExemption = id => message.guild.roles.cache.has(id)
            ? `<@&${id}>`
            : `<@${id}>`;

        if (args.length === 0)
        {
            return client.send(message.channel, null, [
                {
                    color:       client.data.embedColor,
                    title:       'Autoroles:',
                    description: `${result.map(r =>
                    {
                        return `<@&${r}>`;
                    }).join(', ') || 'None'}.${exemptions.length
                        ? `\n\n**Exempt:** ${exemptions.map(renderExemption).join(', ')}.`
                        : ''}`
                }
            ]);
        }

        if (args[0].toLowerCase() === 'exempt')
        {
            const targets = args.slice(1);

            if (targets.length === 0)
            {
                return client.send(message.channel, null, [
                    {
                        color:       client.data.embedColor,
                        title:       'Autorole exemptions:',
                        description: `${exemptions.map(renderExemption).join(', ') || 'None'}.\n\nName a role or member to add or remove one.`
                    }
                ]);
            }

            const list = [...exemptions];
            const on = [];
            const off = [];

            for (const item of targets)
            {
                const id = client.utils.nums(item);

                const role = message.guild.roles.cache.get(id);
                const member = id
                    ? await message.guild.members.fetch(id).catch(() => null)
                    : null;

                if (!role && !member)
                {
                    return client.qEmbed(`[${item}] is not a role or a member of this server!`, interaction ?? message);
                }

                if (list.includes(id))
                {
                    off.push(id);
                    list.splice(list.indexOf(id), 1);
                }
                else
                {
                    on.push(id);
                    list.push(id);
                }
            }

            client.save(guild.id, {
                alter: 'rl.x',
                value: list
            });

            return client.send(message.channel, null, [
                {
                    color:       client.data.embedColor,
                    title:       'Autorole exemptions:',
                    fields:      [
                                     on.length
                                         ? {
                                             name:  'Now exempt:',
                                             value: `${on.map(renderExemption).join(', ')}.`
                                         }
                                         : null,
                                     off.length
                                         ? {
                                             name:  'No longer exempt:',
                                             value: `${off.map(renderExemption).join(', ')}.`
                                         }
                                         : null
                                 ].filter(Boolean),
                    description: `${list.map(renderExemption).join(', ') || 'None'}.`
                }
            ]);
        }

        if (args[0].toLowerCase() == 'off')
        {
            client.save(guild.id, {
                alter: 'rl.a',
                value: []
            });

            return client.send(message.channel, null, {
                color: client.data.embedColor,
                title: 'Autoroles have been turned off.'
            });
        }

        for (const item of args)
        {
            const i = message.guild.roles.cache.find(role => role.id === client.utils.nums(item));

            if (!i)
            {
                return client.qEmbed(`Role: [${item}] is invalid!`, interaction ?? message);
            }

            if (i.managed)
            {
                return client.qEmbed(`Role: [${item}] cannot be added as it's managed another service!`, interaction ?? message);
            }

            if (i.position > message.guild.members.me.roles.highest.position)
            {
                return client.qEmbed(`Role: [${item}] is above Relaxy's highest role!`, interaction ?? message);
            }

            if (guild.rl.a.includes(i.id))
            {
                removed.push(i.id);
                result.splice(result.indexOf(i.id), 1);
            }
            else
            {
                added.push(i.id);
                result.push(i.id);
            }
        }

        client.save(guild.id, {
            alter: 'rl.a',
            value: result
        });

        if (added.length > 0)
        {
            embed.fields.push({
                name:  'Added roles:',
                value: `${added.map(r =>
                {
                    return `<@&${r}>`;
                }).join(', ')}.`
            });
        }

        if (removed.length > 0)
        {
            embed.fields.push({
                name:  'Removed roles:',
                value: `${removed.map(r =>
                {
                    return `<@&${r}>`;
                }).join(', ')}.`
            });
        }

        embed.description = `${result.map(r =>
        {
            return `<@&${r}>`;
        }).join(', ') || 'None'}.`;

        return client.send(message.channel, null, [embed]);
    }
};
