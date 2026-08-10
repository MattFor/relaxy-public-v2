'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const perms = {};
for (const perm of Object.getOwnPropertyNames(Discord.PermissionsBitField.Flags))
{
    perms[perm] = perm;
}

export default {
    async run(client, oldRole, newRole)
    {
        const role = newRole ?? oldRole;
        const guild = await client.module.database.Guild(newRole.guild.id || oldRole.guild.id);

        if (guild.d.mut.id.length > 0 && newRole.id === guild.d.mut.id)
        {
            const Guild = client.guilds.cache.get(guild.id);

            const mute_role = Guild.roles.cache.find(role => role.id == guild.d.mut.id);

            Guild.channels.cache.forEach(async channel =>
            {
                channel = await Guild.channels.fetch(channel.id);

                if (channel && channel.permissionOverwrites && !channel.permissionOverwrites.cache.get(mute_role.id))
                {
                    return await channel.permissionOverwrites.create(mute_role, {
                        'SendMessages': false,
                        'AddReactions': false,
                        'Speak':        false,
                        'Connect':      false
                    }).catch(client.swallow('roleUpdate: create'));
                }
            });
        }

        if (guild.ml.ev?.roleUpdate?.on)
        {
            if (!client.channels.cache.get(guild.ml.ev.roleUpdate.channel))
            {
                return client.save(guild.id, {
                    alter: 'ml.ev.roleUpdate.on',
                    value: false
                });
            }

            const oldPermissions = `\`${Object.entries(oldRole.permissions.serialize()).filter(perm => perm[1]).map(([perm]) => perms[perm]).join('`, `')}.\``;
            const newPermissions = `\`${Object.entries(newRole.permissions.serialize()).filter(perm => perm[1]).map(([perm]) => perms[perm]).join('`, `')}.\``;

            const auditUser = await client.utils.auditLog(newRole.guild, 'RoleUpdate', {
                rawAuthor: true,
                target:    role,
                changes:   true
            }).catch(() => null);

            let embed = new client.class.modlog({
                event:     'Role updated',
                thumbnail: (!oldRole.icon && newRole.icon) || (oldRole.icon !== newRole.icon)
                               ? newRole.iconURL({
                        dynamic: true,
                        size:    4096
                    })
                               : null,
                fields:    [
                    {
                        name:   'Role:',
                        value:  `${newRole} - \`${newRole.name}\``,
                        inline: true
                    },
                    {
                        name:   'Role ID:',
                        value:  `\`${newRole.id}\``,
                        inline: true
                    },
                    ((!oldRole.unicodeEmoji && newRole.unicodeEmoji) || oldRole.unicodeEmoji !== newRole.unicodeEmoji) || ((!oldRole.icon && newRole.icon) || (oldRole.icon !== newRole.icon))
                        ? {
                            name:  'Icon change:',
                            value: `${!oldRole.unicodeEmoji && newRole.unicodeEmoji || oldRole.unicodeEmoji !== newRole.unicodeEmoji
                                ? `Emoji changed: ${oldRole.unicodeEmoji ?? 'None'} -> ${newRole.unicodeEmoji ?? 'None'}.`
                                : 'The new icon is shown in the thumbnail, if there is none it was simply deleted.'}`
                        }
                        : null,
                    oldRole.name !== newRole.name
                        ? {
                            name:  'Name change:',
                            value: `Old name: **\`${oldRole.name}\`**\nNew name: **\`${newRole.name}\`**.`
                        }
                        : null,
                    oldRole.color !== newRole.color
                        ? {
                            name:  'Color change:',
                            value: `Old hex: \`${oldRole.hexColor}\`\nNew hex: \`${newRole.hexColor}\`.`
                        }
                        : null,
                    oldRole.hoist !== newRole.hoist
                        ? {
                            name:  'Hoist change:',
                            value: 'The role now displays separately from others.'
                        }
                        : null,
                    oldRole.rawPosition !== newRole.rawPosition
                        ? {
                            name:  'Position change:',
                            value: `Old position: **\`${oldRole.rawPosition}\`**\nNew position: **\`${newRole.rawPosition}\`**`
                        }
                        : null,
                    oldRole.mentionable !== newRole.mentionable
                        ? {
                            name:  'Mentionality change:',
                            value: `Old status: ${oldRole.mentionable
                                ? 'Can be mentioned.'
                                : 'Can\'t be mentioned.'}\nNew status: ${newRole.mentionable
                                ? 'Can be mentioned.'
                                : 'Can\'t be mentioned.'}.`
                        }
                        : null,
                    oldRole.permissions.bitfield !== newRole.permissions.bitfield && oldPermissions !== newPermissions
                        ? {
                            name:  'Old permissions:',
                            value: `${oldPermissions ?? 'None'}`
                        }
                        : null,
                    oldRole.permissions.bitfield !== newRole.permissions.bitfield && oldPermissions !== newPermissions
                        ? {
                            name:  'New permissions:',
                            value: `${newPermissions ?? 'None'}`
                        }
                        : null,
                    auditUser
                        ? {
                            name:  'Changed by:',
                            value: `${auditUser} - ${client.utils.tag(auditUser)} - **\`${auditUser.id}\`**`
                        }
                        : null
                ]
            });

            if (embed.fields.length !== 0)
            {
                return client.pushModlog(role.guild.id, 'roleUpdate', embed, auditUser);
            }
        }
    }
};
