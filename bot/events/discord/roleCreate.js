'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    async run(client, role)
    {
        const guild = await client.module.database.Guild(role.guild.id);

        if (guild.ml.ev?.roleCreate?.on)
        {
            if (!client.channels.cache.get(guild.ml.ev.roleCreate.channel))
            {
                return client.save(guild.id, {
                    alter: 'ml.ev.roleCreate.on',
                    value: false
                });
            }

            let additional = [
                role.tags?.botId && 'Role managed by a bot.',
                role.tags?.premiumSubscriberRole && 'Nitro booster role.',
                role.tags?.integrationId && 'Role managed by an external integration.',
                role.tags?.subscriptionListingId && 'This role is a SKU subscription.',
                role.tags?.availableForPurchase && 'This role is available for purchase.'
            ].filter(Boolean);

            const auditUser = await client.utils.auditLog(role.guild, 'RoleCreate', {
                rawAuthor: true,
                target:    role
            }).catch(() => null);

            const rolePerms = Object.entries(role.permissions.serialize())
                                    .filter(([, v]) => v)
                                    .map(([k]) => k);

            return client.pushModlog(role.guild.id, 'roleCreate', new client.class.modlog({
                color:  'good',
                event:  'Role created',
                fields: [
                    {
                        name:   'New role:',
                        value:  `${role} - ${role.name}`,
                        inline: true
                    },
                    {
                        name:   'Role ID:',
                        value:  `\`${role.id}\``,
                        inline: true
                    },
                    {
                        name:   'Color:',
                        value:  role.hexColor,
                        inline: true
                    },
                    {
                        name:   'Hoisted:',
                        value:  role.hoist
                                    ? 'Yes.'
                                    : 'No.',
                        inline: true
                    },
                    {
                        name:   'Mentionable:',
                        value:  role.mentionable
                                    ? 'Yes.'
                                    : 'No.',
                        inline: true
                    },
                    {
                        name:   'Managed by external service:',
                        value:  role.managed
                                    ? 'Yes.'
                                    : 'No.',
                        inline: true
                    },
                    rolePerms.length > 0
                        ? {
                            name:  `Permissions [${rolePerms.length}]:`,
                            value: `\`${rolePerms.join('`, `')}\``.slice(0, 1024)
                        }
                        : null,
                    additional.length !== 0
                        ? {
                            name:  'Additional information:',
                            value: additional.join(', ')
                        }
                        : null,
                    auditUser
                        ? {
                            name:  'Created by:',
                            value: `${auditUser} - ${auditUser.username} - **\`${auditUser.id}\`**`
                        }
                        : null
                ]
            }), auditUser);
        }
    }
};
