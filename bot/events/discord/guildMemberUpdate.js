'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import { setRoleOn } from '../../../src/Client/Modules/Guilds/GuildLink.js';

const perms = {};
for (const perm of Object.getOwnPropertyNames(Discord.PermissionsBitField.Flags))
{
    perms[perm] = perm;
}
const findStringInArray = (array, keyword) =>
{
    for (let i = 0; i < array.length; i++)
    {
        if (array[i].includes(keyword))
        {
            return array[i];
        }
    }

    return false;
};

export default {
    async run(client, oldMember, newMember)
    {
        const guild = await client.module.database.Guild(newMember
            ? newMember.guild.id
            : oldMember.guild.id);

        if (!oldMember.partial)
        {
            await client.utils.recordMemberNames(oldMember).catch(client.swallow('guildMemberUpdate: recordMemberNames'));
        }

        await client.utils.recordMemberNames(newMember).catch(client.swallow('guildMemberUpdate: recordMemberNames'));

        if (!oldMember.partial && oldMember.pending && !newMember.pending)
        {
            await client.core.autoRole(newMember, guild).catch(client.swallow('guildMemberUpdate: autoRole'));
        }

        const roleChange = !oldMember.partial && oldMember.roles.cache.size !== newMember.roles.cache.size;

        if (roleChange && guild.sr?.on && guild.sr.r?.length)
        {
            const added = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
            const removed = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

            for (const shared of guild.sr.r)
            {
                const here = shared.m?.[guild.id];

                if (!here)
                {
                    continue;
                }

                const add = added.has(here);

                if (!add && !removed.has(here))
                {
                    continue;
                }

                for (const [guildId, roleId] of Object.entries(shared.m))
                {
                    if (guildId === guild.id)
                    {
                        continue;
                    }

                    await setRoleOn(client, guildId, {
                        roleId,
                        userId: newMember.id,
                        add,
                        reason: `Role sync: ${shared.n} ${add
                            ? 'given'
                            : 'taken'} in ${newMember.guild.name}`
                    }).catch(client.swallow('guildMemberUpdate: setRoleOn'));
                }
            }
        }

        const wasTimedOut = (oldMember.communicationDisabledUntilTimestamp ?? 0) > Date.now();
        const isTimedOut = (newMember.communicationDisabledUntilTimestamp ?? 0) > Date.now();

        let timeout = null;

        if (!oldMember.partial && wasTimedOut !== isTimedOut)
        {
            timeout = await recordTimeout(client, guild, oldMember, newMember, isTimedOut);
        }

        const auditUser = timeout?.actor ?? null;

        const invalidName = guild.cn.rn && (auditUser
            ? auditUser?.id !== newMember.user.id
            : false) && await client.utils.censorCheck([newMember.nickname ?? newMember.user.displayName ?? newMember.user.username], guild);

        const activeMute = await client.module.database.getMute(guild.id, newMember.user.id);
        if (guild.d.mut.id !== '' && roleChange && activeMute && activeMute.mod !== newMember.user.id)
        {
            return await newMember.roles.set([
                guild.d.mut.id,
                newMember.roles.cache.find(role => role?.tags?.premiumSubscriberRole) ?? null,
                newMember.roles.cache.find(role => role?.tags?.botId) ?? null
            ].filter(i => i !== null)).catch(client.swallow('guildMemberUpdate: filter'));
        }

        if (invalidName)
        {
            return await newMember.setNickname(`Renamed${Math.floor(Math.random() * 100000000000)}`,
                `Censoring pool word detected in the ${newMember.nickname
                    ? 'nickname'
                    : 'username'}!`);
        }

        if (guild.ml.ev?.guildMemberUpdate?.on)
        {
            if (!client.channels.cache.get(guild.ml.ev.guildMemberUpdate.channel))
            {
                await client.save(guild.id, {
                    alter: 'ml.ev.guildMemberUpdate.on',
                    value: false
                });
            }

            const oldPermissions = `${Object.entries(oldMember.permissions.serialize()).filter(perm => perm[1]).map(([perm]) => perms[perm]).join(', ')}.`;
            const newPermissions = `${Object.entries(newMember.permissions.serialize()).filter(perm => perm[1]).map(([perm]) => perms[perm]).join(', ')}.`;

            let oldRoles = oldMember.roles.cache.filter(r => r.id !== newMember.guild.id).map(role => `<@&${role.id}>`).join(' **|** ');
            oldRoles = oldRoles.length > 1017
                ? oldRoles.replaceAll(' **|** ', '')
                : oldRoles;
            oldRoles = oldRoles.length > 1017
                ? oldRoles.slice(0, 1017)
                : oldRoles;

            let newRoles = newMember.roles.cache.filter(r => r.id !== newMember.guild.id).map(role => `<@&${role.id}>`).join(' **|** ');
            newRoles = newRoles.length > 1017
                ? newRoles.replaceAll(' **|** ', '')
                : newRoles;
            newRoles = newRoles.length > 1017
                ? newRoles.slice(0, 1017)
                : newRoles;

            const lowSpam = guild.ml.ls
                ? !auditUser?.bot
                : true;

            let embed = new client.class.modlog({
                event:       'Member updated',
                thumbnail:   newMember.user.displayAvatarURL({
                    dynamic: true,
                    size:    4096
                }),
                fields:      [
                    timeout
                        ? {
                            name:  timeout.applied
                                       ? 'Timed out:'
                                       : 'Timeout lifted:',
                            value: `${timeout.applied
                                ? `Timed out until **\`${client.utils.formatDate(newMember.communicationDisabledUntil)}\`** **\`[${client.imports.time(newMember.communicationDisabledUntilTimestamp - Date.now())}]\`**`
                                : 'The timeout was lifted.'} **[Case: #${timeout.case}]**${auditUser
                                ? `\nBy user: ${auditUser} - ${client.utils.tag(auditUser)} - **\`${auditUser.id}\`**`
                                : ''}`
                        }
                        : null,
                    oldMember.user.username !== newMember.user.username
                        ? {
                            name:  'Name change:',
                            value: `Old name: **\`${oldMember.user.username}\`**\nNew name: **\`${newMember.user.username}\`**.`
                        }
                        : null,
                    oldMember.nickname !== newMember.nickname
                        ? {
                            name:  'Nickname change:',
                            value: `Old nickname: **\`${oldMember.nickname ?? 'Same as normal username. / Unavailable.'}\`**\nNew nickname: **\`${newMember.nickname
                                ? newMember.nickname
                                : newMember.user.username}\`**.`
                        }
                        : null,
                    !guild.ml.ls && client.utils.tag(oldMember.user) !== client.utils.tag(newMember.user)
                        ? {
                            name:  'Tag change:',
                            value: `Old tag: **\`${client.utils.tag(oldMember.user) ?? 'Same as normal username. / Unavailable.'}\`**\nNew tag: **\`${client.utils.tag(newMember.user) ?? 'Same as normal username. / Unavailable.'}\`**.`
                        }
                        : null,
                    !guild.ml.ls && oldMember.displayHexColor !== newMember.displayHexColor
                        ? {
                            name:  'Display color change:',
                            value: `Old color hex: **\`${oldMember.displayHexColor}\`**\nNew color hex: **\`${newMember.displayHexColor}\`**.`
                        }
                        : null,

                    oldMember.user.avatarURL({
                        dynamic: true,
                        size:    4096
                    }) !== newMember.user.avatarURL({
                        dynamic: true,
                        size:    4096
                    })
                        ? {
                            name:  'Avatar change:',
                            value: `[Old link](${oldMember.user.avatarURL({
                                dynamic: true,
                                size:    4096
                            })}) -> [New link](${newMember.user.avatarURL({
                                dynamic: true,
                                size:    4096
                            })})  [The new avatar is displayed in the thumbnail]`
                        }
                        : null,
                    lowSpam && oldMember.permissions.bitfield !== newMember.permissions.bitfield && oldPermissions !== newPermissions
                        ? {
                            name:  'Old Permission:',
                            value: `\`${oldPermissions
                                ? oldPermissions.length < 3
                                    ? 'None'
                                    : oldPermissions
                                : 'None'}\``
                        }
                        : null,
                    lowSpam && oldMember.permissions.bitfield !== newMember.permissions.bitfield && oldPermissions !== newPermissions
                        ? {
                            name:  'New Permission:',
                            value: `\`${newPermissions
                                ? newPermissions.length < 5
                                    ? 'None'
                                    : newPermissions
                                : 'None'}\``
                        }
                        : null,

                    lowSpam && roleChange
                        ? {
                            name:  'Old roles:',
                            value: `**${oldRoles || 'No Roles'}**.`
                        }
                        : null,
                    lowSpam && roleChange
                        ? {
                            name:  'New roles:',
                            value: `**${newRoles || 'No Roles'}**.`
                        }
                        : null
                ],
                description: `Member:\n**${newMember} - ${client.utils.tag(oldMember.user) !== client.utils.tag(newMember.user)
                    ? `${client.utils.tag(oldMember.user)} -> `
                    : ''}${client.utils.tag(newMember.user)} - \`${newMember.id}\`**`
            });

            if (embed.fields.length !== 0 && !client.isOwner(newMember.user.id))
            {
                if (auditUser)
                {
                    embed.fields.push({
                        name:  'Changed by:',
                        value: `${auditUser} - ${client.utils.tag(auditUser)} - **\`${auditUser.id}\`**`
                    });
                }

                client.pushModlog(newMember.guild.id, 'guildMemberUpdate', embed, auditUser);
            }
        }
    }
};

const recordTimeout = async (client, guild, oldMember, newMember, applied) =>
{
    const audit = await client.utils.auditActor(newMember.guild, 'MemberUpdate', newMember.id, {
        changed: 'communication_disabled_until'
    }).catch(() => null);

    if (!applied && !audit)
    {
        return null;
    }

    const existing = client.module.database.takeCase('timeout', guild.id, newMember.id);

    if (existing !== null)
    {
        return {
            case:  existing,
            applied,
            actor: audit?.executor ?? null
        };
    }

    const until = newMember.communicationDisabledUntilTimestamp;

    const number = await client.module.database.addCase(guild.id, {
        type:   applied
                    ? 'timeout'
                    : 'untimeout',
        user:   newMember.id,
        mod:    audit?.executor?.id ?? '',
        reason: audit?.entry?.reason || 'No reason given.',
        extra:  applied && until
                    ? `Timed out for: ${client.imports.time(until - Date.now())}`
                    : ''
    });

    return {
        case:  number,
        applied,
        actor: audit?.executor ?? null
    };
};
