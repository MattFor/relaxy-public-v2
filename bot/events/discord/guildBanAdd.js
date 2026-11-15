'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, ban) {
        const guild = await client.module.database.Guild(ban.guild.id);

        const fetchedBan = await ban.guild.bans.fetch(ban.user).catch(() => null);
        const member = fetchedBan?.user ?? ban.user;

        let caseNumber = client.module.database.takeCase('ban', guild.id, ban.user.id);

        const audit =
            caseNumber === null
                ? await client.utils.auditActor(ban.guild, 'MemberBanAdd', ban.user.id).catch(() => null)
                : null;

        if (caseNumber === null) {
            caseNumber = await client.module.database.addCase(guild.id, {
                type: 'ban',
                user: ban.user.id,
                mod: audit?.executor && !audit.executor.bot ? audit.executor.id : '',
                reason: audit?.entry?.reason ?? fetchedBan?.reason ?? 'No reason given.'
            });
        }

        const memberWarnings = await client.module.database.warningsOf(guild.id, member.id);

        if (memberWarnings.length) {
            if (!client.data.serverCache?.[guild.id]) {
                client.data.serverCache[guild.id] = {};
            }

            if (!client.data.serverCache[guild.id]?.[member.id]) {
                client.data.serverCache[guild.id][member.id] = {};
            }

            if (!client.data.serverCache[guild.id][member.id]?.warn_tiers) {
                const warningTiersMember = [
                    ...new Set(
                        memberWarnings
                            .filter((warn) => typeof warn.tier === 'number' && !isNaN(warn.tier))
                            .map((warn) => warn.tier)
                    )
                ].sort((a, b) => {
                    return a - b;
                });

                client.data.serverCache[guild.id][member.id].warn_tiers = warningTiersMember
                    .filter((t) => t <= 0)
                    .sort((a, b) => {
                        return b - a;
                    });
            }

            const newMinimumNegativeTier = Math.min(...client.data.serverCache[guild.id][member.id].warn_tiers, 0) - 1;
            client.data.serverCache[guild.id][member.id].warn_tiers.push(newMinimumNegativeTier);

            for (let i = 0; i < memberWarnings.length; i++) {
                if (!client.data.serverCache[guild.id][member.id].warn_tiers.includes(memberWarnings[i].tier)) {
                    memberWarnings[i].tier = newMinimumNegativeTier;
                }
            }

            await client.module.database.setWarnings(guild.id, member.id, memberWarnings);
        }

        if (!guild.ml.ev?.guildBanAdd?.on) {
            return;
        }

        const caseRecord = await client.module.database.getCase(guild.id, caseNumber);
        const auditUser = caseRecord?.md ? await client.getUser(caseRecord.md).catch(() => null) : null;

        return client.pushModlog(
            guild.id,
            'guildBanAdd',
            new client.class.modlog({
                color: 'bad',
                title: `**Event |** \`Ban\` - Case #${caseNumber}`,
                thumbnail: ban.user.displayAvatarURL({
                    dynamic: true,
                    size: 4096
                }),
                fields: [
                    {
                        name: 'User banned:',
                        value: `${ban.user}\n(${client.utils.tag(ban.user)})`,
                        inline: true
                    },
                    {
                        name: 'User ID:',
                        value: `\`${ban.user.id}\``,
                        inline: true
                    },
                    {
                        name: 'Ban reason:',
                        value: caseRecord?.rs || fetchedBan?.reason || 'No reason given'
                    },
                    auditUser
                        ? {
                              name: 'Banned by:',
                              value: `${auditUser} - ${client.utils.tag(auditUser)} **\`${auditUser.id}\`**`
                          }
                        : null
                ]
            }),
            auditUser
        );
    }
};
