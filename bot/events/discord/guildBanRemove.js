'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    async run(client, ban)
    {
        const Guild = await client.module.database.Guild(ban.guild.id);

        const auditUser = await client.utils.auditLog(ban.guild, 'MemberBanRemove', {
            rawAuthor: true,
            target:    ban.user
        }).catch(() => null);

        await client.module.database.addCaseOutcome(Guild.id, ban.user.id, {
            type:  'unban',
            mod:   auditUser?.id ?? '',
            types: [
                'ban',
                'tempban',
                'warn-ban'
            ]
        }).catch(client.swallow('guildBanRemove: addCaseOutcome'));

        if (Guild.ml.ev?.guildBanRemove?.on)
        {
            let unbanReason = null;

            try
            {
                unbanReason = Object.keys(client.data.serverCache[Guild.id]).find(e => e.startsWith(`unban_${ban.user.id}_`)).replace(`unban_${ban.user.id}_`, '').replaceAll('+', ' ');
            }
            catch
            {
            }

            return client.pushModlog(Guild.id, 'guildBanRemove', new client.class.modlog({
                color:     'good',
                title:     `**Event |** \`Unban\``,
                thumbnail: ban.user.displayAvatarURL({
                    dynamic: true,
                    size:    4096
                }),
                fields:    [
                    {
                        name:   'User unbanned:',
                        value:  `${ban.user}\n${ban.user.username}`,
                        inline: true
                    },
                    {
                        name:   'User ID:',
                        value:  `\`${ban.user.id}\``,
                        inline: true
                    },
                    {
                        name:  'Account created:',
                        value: `\`${client.utils.formatDate(ban.user.createdAt)}\` (\`${client.imports.time(Date.now() - ban.user.createdTimestamp)}\` ago)`
                    },
                    {
                        name:  'Original ban reason:',
                        value: ban.reason ?? 'No reason given'
                    },
                    {
                        name:  'Unban reason:',
                        value: unbanReason ?? 'No reason given'
                    },
                    auditUser
                        ? {
                            name:  'Unbanned by:',
                            value: `${auditUser} - ${auditUser.username} **\`${auditUser.id}\`**`
                        }
                        : null
                ]
            }), auditUser);
        }
    }
};
