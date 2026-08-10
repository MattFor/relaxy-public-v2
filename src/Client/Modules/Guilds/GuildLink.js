'use strict';
import { inlineText } from '../Core/Utilities.js';

export const PROPOSAL_TTL = 30 * 60 * 1000;
const firstHit = results => (results ?? []).find(result => result !== null && result !== undefined) ?? null;

export async function describeGuild(client, guildId)
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);

        return guild && c.ws.shards.has(guild.shardId)
            ? {
                id:      guild.id,
                name:    guild.name,
                icon:    guild.iconURL({ size: 256 }) ?? null,
                members: guild.memberCount
            }
            : null;
    }, { context: { guildId } }).catch(() => []);

    return firstHit(results);
}

export async function refreshGuild(client, guildId)
{
    await client.module.database.flushGuild(guildId).catch(() => null);

    await client.cluster.broadcastEval(async (c, a) =>
    {
        const db = c.module?.database;

        if (!db?._cache?.servers?.has(a.guildId))
        {
            return null;
        }

        await db.reloadGuild(a.guildId);

        return true;
    }, { context: { guildId } }).catch(() => null);
}

export async function createChannelOn(client, guildId, {
    name,
    topic = '',
    reason = ''
})
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);
        if (!guild || !c.ws.shards.has(guild.shardId))
        {
            return null;
        }

        try
        {
            const channel = await guild.channels.create({
                name:   a.name,
                type:   c.imports.discord.ChannelType.GuildText,
                topic:  a.topic,
                reason: a.reason
            });

            return {
                id:   channel.id,
                name: channel.name
            };
        }
        catch (error)
        {
            return { error: String(error?.message ?? error) };
        }
    }, {
        context: {
            guildId,
            name,
            topic,
            reason
        }
    }).catch(() => []);

    return firstHit(results);
}

export async function inviteTo(client, guildId, channelId)
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);
        const channel = guild && c.ws.shards.has(guild.shardId)
            ? guild.channels.cache.get(a.channelId)
            : null;

        if (!channel)
        {
            return null;
        }

        try
        {
            const invite = await channel.createInvite({
                maxAge:  0,
                maxUses: 0,
                unique:  false,
                reason:  'Ban appeal invite'
            });

            return `https://discord.gg/${invite.code}`;
        }
        catch
        {
            return null;
        }
    }, {
        context: {
            guildId,
            channelId
        }
    }).catch(() => []);

    return firstHit(results);
}

export async function isBannedIn(client, guildId, userId)
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);

        if (!guild || !c.ws.shards.has(guild.shardId))
        {
            return null;
        }

        try
        {
            await guild.bans.fetch(a.userId);

            return { banned: true };
        }
        catch (error)
        {
            if (error?.code === 10026)
            {
                return { banned: false };
            }

            return {
                banned: false,
                error:  `${error?.code ?? '?'} ${error?.message ?? error}`
            };
        }
    }, {
        context: {
            guildId,
            userId
        }
    }).catch(() => []);

    const answer = firstHit(results);

    if (answer?.error)
    {
        client.log('WARN', `[Appeal] Could not read the ban list of guest ${guildId} for ${userId}: ${answer.error}. Relaxy needs \`Ban Members\` there to recognise an appellant.`);
    }

    return answer?.banned === true;
}

export async function memberStandingIn(client, guildId, userId)
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);

        if (!guild || !c.ws.shards.has(guild.shardId))
        {
            return null;
        }

        const member = await guild.members.fetch(a.userId).catch(() => null);

        let banned = null;
        let banReason = null;

        await guild.bans.fetch(a.userId).then(entry =>
        {
            banned = true;
            banReason = entry?.reason ?? null;
        }, error =>
        {
            banned = error?.code === 10026
                ? false
                : null;
        });

        return {
            name:         guild.name,
            present:      Boolean(member),
            joinedAt:     member?.joinedTimestamp ?? null,
            nickname:     member?.nickname ?? null,
            timeoutUntil: member?.communicationDisabledUntilTimestamp ?? null,
            banned,
            banReason
        };
    }, {
        context: {
            guildId,
            userId
        }
    }).catch(() => []);

    return firstHit(results);
}

export function linkedGuilds(guild)
{
    const seen = new Map();

    for (const id of syncMembers(guild))
    {
        if (id !== guild.id)
        {
            seen.set(id, 'pool');
        }
    }

    if (guild?.ap?.on && guild.ap.p && guild.ap.p !== guild.id && !seen.has(guild.ap.p))
    {
        seen.set(guild.ap.p, 'host');
    }

    for (const id of guild?.ap?.h ?? [])
    {
        if (id !== guild.id && !seen.has(id))
        {
            seen.set(id, 'guest');
        }
    }

    return [...seen].map(([id, relation]) => ({
        id,
        relation
    }));
}

export async function canReadBans(client, guildId)
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);

        if (!guild || !c.ws.shards.has(guild.shardId))
        {
            return null;
        }

        try
        {
            await guild.bans.fetch({
                limit: 1,
                cache: false
            });

            return {
                ok:     true,
                reason: null
            };
        }
        catch (error)
        {

            if (error?.code === 50013 || error?.code === 50001 || error?.status === 403)
            {
                return {
                    ok:     false,
                    reason: null
                };
            }

            return {
                ok:     false,
                reason: `${error?.code ?? '?'} ${error?.message ?? error}`
            };
        }
    }, { context: { guildId } }).catch(() => []);

    return firstHit(results);
}

export async function appealDossier(client, guestId, userId, caseTypes = {})
{
    const database = client.module.database;

    const [records, warnings, memberDocument] = await Promise.all([
        database.casesInvolving(guestId, userId).catch(() => []),
        database.warningsOf(guestId, userId).catch(() => []),
        database.Member(userId, guestId).catch(() => null)
    ]);

    const stamp = ms => (ms
        ? `<t:${Math.floor(ms / 1000)}:R>`
        : 'unknown');

    const against = records.filter(record => record.u === userId);

    const fields = [];

    if (against.length)
    {
        const lines = against.slice(0, 5).map(record =>
        {
            const type = caseTypes[record.ty] ?? {
                label: record.ty || 'Unknown',
                emoji: '📁'
            };

            return `**#${record.n}** ${type.emoji} **${type.label}** - ${stamp(record.at)}\n${inlineText(record.rs, { limit: 70 })}`;
        });

        if (against.length > 5)
        {
            lines.push(`*…and ${against.length - 5} older.*`);
        }

        fields.push({
            name:  `Prior record there [${against.length}]`,
            value: lines.join('\n').slice(0, 1024)
        });
    }

    if (warnings.length)
    {
        const worst = warnings.reduce((highest, warning) => Math.max(highest, warning.tier ?? 0), 0);
        const critical = warnings.filter(warning => warning.tier >= 2).length;

        fields.push({
            name:  `Warnings [${warnings.length}]`,
            value: [
                       `**${warnings.length}** warning${warnings.length === 1
                           ? ''
                           : 's'}${critical
                           ? `, **${critical}** critical`
                           : ''} - highest tier **${worst}**.`,
                       ...warnings.slice(-3).reverse().map(warning => `• T${warning.tier} ${stamp(warning.date)} - ${inlineText(warning.reason, {
                           limit:    60,
                           fallback: 'No reason.'
                       })}`)
                   ].join('\n').slice(0, 1024)
        });
    }

    if (memberDocument)
    {
        fields.push({
            name:  'Activity there',
            value: [
                       `Messages **${(memberDocument.msg ?? 0).toLocaleString()}** | Commands **${(memberDocument.cmd ?? 0).toLocaleString()}**`,
                       `Level **${memberDocument.lvl ?? 0}** | Voice **${client.imports.time(memberDocument.vc ?? 0)}**`
                   ].join('\n').slice(0, 1024)
        });

        const names = (memberDocument.nh ?? []).slice(-6).reverse().map(entry => `\`${entry.n}\``).join(', ');

        if (names)
        {
            fields.push({
                name:  'Known there as',
                value: names.slice(0, 1024)
            });
        }
    }

    return fields;
}

export async function openAppealThread(client, guildId, channelId, {
    userId,
    roleIds = [],
    guestName,
    caseNumber = null,
    banReason = null,
    bannedBy = null,
    bannedAt = null,
    dossier = [],
    dossierEmbeds = [],
    dossierComponents = [],
    existingThreadId = null,
    threadName = '',
    legacyName = '',
    claimed = []
})
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);
        if (!guild || !c.ws.shards.has(guild.shardId))
        {
            return null;
        }

        const channel = guild.channels.cache.get(a.channelId) ?? await guild.channels.fetch(a.channelId).catch(() => null);

        if (!channel)
        {
            return { error: `Appeal channel ${a.channelId} does not exist in ${guild.name}.` };
        }

        try
        {
            const member = await guild.members.fetch(a.userId).catch(() => null);

            const name = a.threadName || `appeal-${member?.user?.username ?? a.userId}`.slice(0, 100);
            const legacy = a.legacyName || `appeal-${member?.user?.username ?? a.userId}`.slice(0, 100);

            let existing = null;

            if (a.existingThreadId)
            {
                const known = channel.threads.cache.get(a.existingThreadId) ?? await channel.threads.fetch(a.existingThreadId).catch(() => null);

                if (known && !known.archived && known.parentId === channel.id)
                {
                    existing = known;
                }
            }

            if (!existing)
            {
                const active = await channel.threads.fetchActive().catch(() => null);

                existing = active?.threads?.find(entry => entry.name === name) ?? null;

                if (!existing && legacy !== name)
                {
                    const stale = active?.threads?.find(entry => entry.name === legacy) ?? null;

                    existing = stale && !(a.claimed ?? []).includes(stale.id)
                        ? stale
                        : null;
                }
            }

            if (existing)
            {
                const warnings = [];

                await existing.members.add(a.userId).catch(error => warnings.push(`could not re-add the appellant to their existing thread (${error?.message ?? error})`));

                return {
                    id:     existing.id,
                    name:   existing.name,
                    reused: true,
                    warnings
                };
            }

            const thread = await channel.threads.create({
                name,
                type:      c.imports.discord.ChannelType.PrivateThread,
                invitable: false,
                reason:    `Ban appeal thread for ${a.guestName}`
            });

            const warnings = [];

            const rescan = await channel.threads.fetchActive().catch(() => null);

            const rival = rescan?.threads?.filter(entry => entry.name === name && entry.id !== thread.id && BigInt(entry.id) < BigInt(thread.id)).sort((x, y) => (BigInt(x.id) < BigInt(y.id)
                ? -1
                : 1)).first() ?? null;

            if (rival)
            {
                await thread.delete('Duplicate ban appeal thread - another cluster opened one first').catch(error => warnings.push(`could not delete the duplicate appeal thread ${thread.id} (${error?.message ?? error})`));

                await rival.members.add(a.userId).catch(error => warnings.push(`could not add the appellant to the surviving thread (${error?.message ?? error})`));

                return {
                    id:       rival.id,
                    name:     rival.name,
                    reused:   true,
                    warnings: [
                        `a duplicate thread was opened at the same moment and was removed; ${rival.id} is the one to use`,
                        ...warnings
                    ]
                };
            }

            await thread.members.add(a.userId).catch(error => warnings.push(`could not add the appellant to the thread (${error?.message ?? error})`));

            const mentions = [`<@${a.userId}>`];

            const humanModerator = a.bannedBy && a.bannedBy !== a.userId && a.bannedBy !== c.user.id
                ? a.bannedBy
                : null;

            if (humanModerator)
            {
                mentions.push(`<@${humanModerator}>`);
            }

            const liveRoles = (a.roleIds ?? []).filter(roleId => guild.roles.cache.has(roleId));

            for (const roleId of liveRoles)
            {
                mentions.push(`<@&${roleId}>`);
            }

            const rosterComplete = guild.members.cache.size >= guild.memberCount;
            const staffed = liveRoles.some(roleId => guild.roles.cache.get(roleId)?.members?.some(one => !one.user?.bot));

            const autoPicked = [];

            if (!liveRoles.length || (rosterComplete && !staffed))
            {
                let roster = guild.members.cache;

                const rank = one => (one.permissions.has(c.imports.discord.PermissionFlagsBits.Administrator)
                    ? 8
                    : 0) + (one.permissions.has(c.imports.discord.PermissionFlagsBits.BanMembers)
                    ? 4
                    : 0) + (one.permissions.has(c.imports.discord.PermissionFlagsBits.ModerateMembers)
                    ? 2
                    : 0) + (one.permissions.has(c.imports.discord.PermissionFlagsBits.ManageMessages)
                    ? 1
                    : 0);

                const eligible = list => [...list.values()].filter(one =>
                {
                    if (one.partial || !one.user || one.user.bot || one.id === a.userId)
                    {
                        return false;
                    }

                    try
                    {
                        return rank(one) > 0;
                    }
                    catch
                    {
                        return false;
                    }
                });

                let candidates = eligible(roster);

                if (!candidates.length)
                {
                    roster = await guild.members.fetch().catch(() => null);
                    candidates = roster
                        ? eligible(roster)
                        : [];
                }

                candidates.sort((x, y) => rank(y) - rank(x) || y.roles.highest.position - x.roles.highest.position);

                for (const one of candidates.slice(0, 3))
                {
                    autoPicked.push(one.id);
                    mentions.push(`<@${one.id}>`);
                }

                if (!autoPicked.length)
                {
                    warnings.push(`${liveRoles.length
                        ? 'the appeal staff role is empty'
                        : 'no appeal staff role is set'} and nobody in the server holds a moderation permission, so the thread was opened with nobody to answer it`);
                }
            }

            const notice = [
                `<@${a.userId}> is appealing a ban in **${a.guestName}**.`,
                humanModerator
                    ? 'The moderator who placed it has been pinged.'
                    : 'Relaxy issued this ban automatically.',
                autoPicked.length
                    ? `${liveRoles.length
                        ? 'The appeal staff role has nobody in it'
                        : 'No appeal staff role is set here'}, so the moderators above were picked automatically - \`=appealchannel thread <role>\` sets one.`
                    : ''
            ].filter(Boolean).join(' ');

            const summary = [
                `<@${a.userId}> was banned from **${a.guestName}**${a.bannedAt
                    ? ` <t:${Math.floor(a.bannedAt / 1000)}:R>`
                    : ''}.`
            ];

            if (a.caseNumber)
            {
                summary.push(`**Case #${a.caseNumber}**${humanModerator
                    ? ` - by <@${humanModerator}>`
                    : a.bannedBy
                        ? ' - placed automatically by Relaxy'
                        : ''}`);
            }

            if (a.banReasonText)
            {
                summary.push(`Reason: ${a.banReasonText}`);
            }

            const embeds = [
                {
                    color:       0x5865F2,
                    title:       `Ban appeal - ${a.guestName}`,
                    description: summary.join('\n')
                }
            ];

            if (a.dossierEmbeds?.length)
            {
                embeds.push(...a.dossierEmbeds);
            }
            else if (a.dossier?.length)
            {
                embeds.push({
                    color:  0x5865F2,
                    title:  `Their record in ${a.guestName}`,
                    fields: a.dossier
                });
            }

            const opening = {
                content:    `${mentions.join(' ')}\n-# ${notice}`,
                embeds,
                components: a.dossierComponents ?? []
            };

            await thread.send(opening).catch(async error =>
            {
                warnings.push(`could not post the opening message with its dossier controls (${error?.message ?? error}) - retrying without them`);

                await thread.send({
                    content: opening.content,
                    embeds
                }).catch(retry => warnings.push(`could not post the opening message, so no staff role was added to the thread (${retry?.message ?? retry})`));
            });

            return {
                id:     thread.id,
                name:   thread.name,
                reused: false,
                warnings
            };
        }
        catch (error)
        {
            return { error: String(error?.message ?? error) };
        }
    }, {
        context: {
            guildId,
            channelId,
            userId,
            roleIds,
            guestName,
            caseNumber,

            banReasonText: banReason
                               ? inlineText(banReason, {
                    limit:    400,
                    fallback: ''
                })
                               : '',
            bannedBy,
            bannedAt,
            dossier,
            dossierEmbeds,
            dossierComponents,
            existingThreadId,
            threadName,
            legacyName,
            claimed
        }
    }).catch(() => []);

    return firstHit(results);
}

export async function canOpenPrivateThreads(client, guildId, channelId)
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);

        if (!guild || !c.ws.shards.has(guild.shardId))
        {
            return null;
        }

        const channel = guild.channels.cache.get(a.channelId);

        if (!channel)
        {
            return null;
        }

        if (channel.type !== c.imports.discord.ChannelType.GuildText)
        {
            return {
                ok:      false,
                missing: [],
                reason:  'notText'
            };
        }

        const cachedMe = guild.members.me;
        const me = cachedMe && !cachedMe.partial
            ? cachedMe
            : await guild.members.fetchMe().catch(() => null);

        if (!me)
        {
            return null;
        }

        const permissions = channel.permissionsFor(me);

        if (!permissions)
        {
            return null;
        }

        const needed = {
            'View Channel':             'ViewChannel',
            'Create Private Threads':   'CreatePrivateThreads',
            'Send Messages in Threads': 'SendMessagesInThreads'
        };

        const missing = Object.entries(needed)
                              .filter(([, flag]) => !permissions.has(c.imports.discord.PermissionFlagsBits[flag]))
                              .map(([label]) => label);

        return {
            ok:     missing.length === 0,
            missing,
            reason: null
        };
    }, {
        context: {
            guildId,
            channelId
        }
    }).catch(() => []);

    return firstHit(results);
}

export async function describeChannel(client, guildId, channelId)
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);

        const channel = guild && c.ws.shards.has(guild.shardId)
            ? guild.channels.cache.get(a.channelId)
            : null;

        return channel
            ? {
                id:    channel.id,
                name:  channel.name,
                guild: guild.name
            }
            : null;
    }, {
        context: {
            guildId,
            channelId
        }
    }).catch(() => []);

    return firstHit(results);
}

export async function findOrCreateRoleOn(client, guildId, {
    name,
    color = null,
    reason = ''
})
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);
        if (!guild || !c.ws.shards.has(guild.shardId))
        {
            return null;
        }

        const wanted = String(a.name).toLowerCase();

        const existing = guild.roles.cache.find(role => role.name.toLowerCase() === wanted && role.id !== guild.roles.everyone.id) ?? null;

        if (existing)
        {
            if (existing.managed)
            {
                return { error: `**${existing.name}** already exists there but is managed by another service, so Relaxy cannot hand it out.` };
            }

            const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);

            if (!me)
            {
                return { error: `Relaxy could not read its own member in ${guild.name}.` };
            }

            if (existing.position >= me.roles.highest.position)
            {
                return { error: `**${existing.name}** already exists there but sits above Relaxy's highest role, so Relaxy cannot grant or take it. Move Relaxy's role above it.` };
            }

            return {
                id:      existing.id,
                name:    existing.name,
                created: false
            };
        }

        try
        {
            const role = await guild.roles.create({
                name:   a.name,
                color:  a.color ?? undefined,
                reason: a.reason
            });

            return {
                id:      role.id,
                name:    role.name,
                created: true
            };
        }
        catch (error)
        {
            return { error: String(error?.message ?? error) };
        }
    }, {
        context: {
            guildId,
            name,
            color,
            reason
        }
    }).catch(() => []);

    return firstHit(results);
}

export async function deleteRoleOn(client, guildId, roleId, reason = '')
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);
        if (!guild || !c.ws.shards.has(guild.shardId))
        {
            return null;
        }

        const role = guild.roles.cache.get(a.roleId);

        if (!role)
        {
            return { ok: true };
        }

        return role.delete(a.reason).then(() => ({ ok: true }), error => ({ error: String(error?.message ?? error) }));
    }, {
        context: {
            guildId,
            roleId,
            reason
        }
    }).catch(() => []);

    return firstHit(results);
}

export async function setRoleOn(client, guildId, {
    roleId,
    userId,
    add,
    reason = ''
})
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);
        if (!guild || !c.ws.shards.has(guild.shardId))
        {
            return null;
        }

        const role = guild.roles.cache.get(a.roleId);

        if (!role)
        {
            return { status: 'no-role' };
        }

        const member = await guild.members.fetch(a.userId).catch(() => null);

        if (!member)
        {
            return { status: 'no-member' };
        }

        if (member.roles.cache.has(a.roleId) === a.add)
        {
            return { status: 'noop' };
        }

        try
        {
            await (a.add
                ? member.roles.add(role, a.reason)
                : member.roles.remove(role, a.reason));

            return { status: 'ok' };
        }
        catch (error)
        {
            return {
                status: 'error',
                error:  String(error?.message ?? error)
            };
        }
    }, {
        context: {
            guildId,
            roleId,
            userId,
            add,
            reason
        }
    }).catch(() => []);

    return firstHit(results) ?? { status: 'no-guild' };
}

export async function moderateOn(client, guildId, action, {
    userId,
    moderator,
    reason = '',
    deleteSeconds = 0,
    durationMs = 0,
    forever = false,
    tier = 0,
    count = 1
})
{
    const results = await client.cluster.broadcastEval(async (c, a) =>
    {
        const guild = c.guilds.cache.get(a.guildId);
        if (!guild || !c.ws.shards.has(guild.shardId))
        {
            return null;
        }

        const guildDoc = await c.module.database.Guild(a.guildId).catch(() => null);

        if (!guildDoc)
        {
            return {
                ok:    false,
                error: 'Relaxy could not read that server\'s configuration.'
            };
        }
        if (!guildDoc.sr?.ma)
        {
            return {
                ok:     false,
                status: 'declined'
            };
        }

        const moderation = c.module?.moderation;

        if (!moderation)
        {
            return {
                ok:    false,
                error: 'That server\'s cluster is still starting up.'
            };
        }

        const member = await guild.members.fetch(a.userId).catch(() => null);
        const user = member?.user ?? await c.users.fetch(a.userId).catch(() => null);

        const flatten = result => (result?.ok
            ? {
                ok:         true,
                caseNumber: result.caseNumber ?? null
            }
            : {
                ok:    false,
                error: result?.error ?? 'It did not work.'
            });

        try
        {
            switch (a.action)
            {
                case 'ban':
                {
                    if (!user)
                    {
                        return {
                            ok:    false,
                            error: 'Discord does not know that user.'
                        };
                    }

                    return flatten(await moderation.ban({
                        guild,
                        guildDoc,
                        user,
                        member,
                        moderator:     a.moderator,
                        reason:        a.reason,
                        deleteSeconds: a.deleteSeconds,
                        noAppeal:      true
                    }));
                }

                case 'kick':
                {
                    if (!member)
                    {
                        return {
                            ok:     false,
                            status: 'absent',
                            error:  'They are not in that server.'
                        };
                    }

                    return flatten(await moderation.kick({
                        guild,
                        guildDoc,
                        member,
                        moderator: a.moderator,
                        reason:    a.reason
                    }));
                }

                case 'mute':
                {
                    if (!member)
                    {
                        return {
                            ok:     false,
                            status: 'absent',
                            error:  'They are not in that server.'
                        };
                    }

                    return flatten(await moderation.mute({
                        guild,
                        guildDoc,
                        member,
                        moderator:  a.moderator,
                        reason:     a.reason,
                        durationMs: a.durationMs,
                        forever:    a.forever
                    }));
                }

                case 'unmute':
                {
                    if (!member)
                    {
                        return {
                            ok:     false,
                            status: 'absent',
                            error:  'They are not in that server.'
                        };
                    }

                    return flatten(await moderation.unmute({
                        guild,
                        guildDoc,
                        member,
                        moderator: a.moderator,
                        reason:    a.reason
                    }));
                }

                case 'warn':
                {
                    if (!member)
                    {
                        return {
                            ok:     false,
                            status: 'absent',
                            error:  'They are not in that server.'
                        };
                    }

                    return flatten(await moderation.warn({
                        guild,
                        guildDoc,
                        member,
                        moderator: a.moderator,
                        reason:    a.reason,
                        tier:      a.tier,
                        count:     a.count,
                        ladder:    false
                    }));
                }

                case 'unban':
                {

                    const existing = await guild.bans.fetch(a.userId).catch(() => null);

                    if (!existing)
                    {
                        return {
                            ok:     false,
                            status: 'absent',
                            error:  'They are not banned there.'
                        };
                    }

                    const banCase = await c.utils.banCase(a.guildId, a.userId).catch(() => null);

                    await guild.bans.remove(a.userId, a.reason || 'Synced unban');

                    return {
                        ok:         true,
                        caseNumber: banCase?.n ?? null
                    };
                }

                default:
                    return {
                        ok:    false,
                        error: `Unknown action "${a.action}".`
                    };
            }
        }
        catch (error)
        {
            return {
                ok:    false,
                error: String(error?.message ?? error)
            };
        }
    }, {
        context: {
            guildId,
            action,
            userId,
            moderator,
            reason,
            deleteSeconds,
            durationMs,
            forever,
            tier,
            count
        }
    }).catch(error => [
        {
            ok:    false,
            error: String(error?.message ?? error)
        }
    ]);

    return firstHit(results) ?? {
        ok:     false,
        status: 'no-guild',
        error:  'No cluster can see that server.'
    };
}

export async function moderateAcrossPool(client, guild, action, payload)
{
    const partners = syncMembers(guild).filter(id => id !== guild.id);

    return Promise.all(partners.map(async id =>
    {
        const [described, result] = await Promise.all([
            describeGuild(client, id).catch(() => null),
            moderateOn(client, id, action, payload)
        ]);

        return {
            id,
            name: described?.name ?? id, ...result
        };
    }));
}

export function syncReport(results, verb)
{
    if (!results.length)
    {
        return '\n**Sync:** this server shares roles with nobody, so there was nowhere to sync to. Link one with `=syncrole`.';
    }

    const done = results.filter(entry => entry.ok);
    const declined = results.filter(entry => entry.status === 'declined');
    const absent = results.filter(entry => entry.status === 'absent');
    const failed = results.filter(entry => !entry.ok && entry.status !== 'declined' && entry.status !== 'absent');

    const lines = [
        `\n**Synced across ${results.length} linked server${results.length === 1
            ? ''
            : 's'}:**`
    ];

    if (done.length)
    {
        lines.push(`✅ ${verb} in **${done.map(entry => `${entry.name}${entry.caseNumber
            ? ` [#${entry.caseNumber}]`
            : ''}`).join('**, **')}**`);
    }

    if (absent.length)
    {
        lines.push(`➖ Nothing to do in **${absent.map(entry => entry.name).join('**, **')}** - ${absent[0].error}`);
    }

    if (declined.length)
    {
        lines.push(`🔒 **${declined.map(entry => entry.name).join('**, **')}** ${declined.length === 1
            ? 'has'
            : 'have'} not turned synced moderation on. Run \`=syncservers on\` there.`);
    }

    if (failed.length)
    {
        lines.push(`❌ ${failed.map(entry => `**${entry.name}** (${entry.error})`).join(', ')}`);
    }

    return lines.join('\n');
}

const openProposal = (profile, type) => Boolean(profile?.lp?.g) && profile.lp.t === type && Date.now() - (profile.lp.at ?? 0) < PROPOSAL_TTL;

export async function readProposal(client, userId, type)
{
    const profile = await client.module.database.reloadUser(userId).catch(() => null);

    if (!openProposal(profile, type))
    {
        return null;
    }

    return {
        guild: profile.lp.g,
        at:    profile.lp.at
    };
}

export async function writeProposal(client, userId, type, guildId)
{
    await client.saveProfile(userId, {
        alter: 'lp.t',
        value: type
    }, {
        alter: 'lp.g',
        value: guildId
    }, {
        alter: 'lp.at',
        value: Date.now()
    });

    await client.module.database.flushProfile(userId);
}

export async function clearProposal(client, userId)
{
    await client.saveProfile(userId, {
        alter: 'lp.t',
        value: ''
    }, {
        alter: 'lp.g',
        value: ''
    }, {
        alter: 'lp.at',
        value: 0
    });

    await client.module.database.flushProfile(userId);
}

export async function pairHandshake(client, guild, userId)
{
    const key = 'ap';

    const proposal = await readProposal(client, userId, key);

    if (!proposal)
    {
        if (guild[key]?.on && guild[key]?.p)
        {
            return { status: 'busy-here' };
        }

        await writeProposal(client, userId, key, guild.id);

        return { status: 'proposed' };
    }

    if (proposal.guild === guild.id)
    {
        return { status: 'self' };
    }

    const partner = await describeGuild(client, proposal.guild);

    if (!partner)
    {
        await clearProposal(client, userId);

        return { status: 'unknown-guild' };
    }

    const partnerDoc = await client.module.database.reloadGuild(proposal.guild);

    if (partnerDoc[key]?.on && partnerDoc[key]?.p === guild.id)
    {
        await clearProposal(client, userId);

        return {
            status: 'already',
            partner,
            partnerDoc
        };
    }

    if (partnerDoc[key]?.on && partnerDoc[key]?.p)
    {
        await clearProposal(client, userId);

        return {
            status: 'busy-there',
            partner,
            partnerDoc
        };
    }

    const hosted = [
        ...new Set([
            ...(guild[key]?.h ?? []),
            proposal.guild
        ])
    ];

    await Promise.all([
        client.save(proposal.guild, {
            alter: `${key}.on`,
            value: true
        }, {
            alter: `${key}.p`,
            value: guild.id
        }),
        client.save(guild.id, {
            alter: `${key}.h`,
            value: hosted
        })
    ]);

    await clearProposal(client, userId);

    await Promise.all([
        refreshGuild(client, guild.id),
        refreshGuild(client, proposal.guild)
    ]);

    return {
        status:     'accepted',
        partner,
        partnerDoc: await client.module.database.Guild(proposal.guild)
    };
}

export async function unpair(client, guild, extra = {})
{
    const key = 'ap';
    const hostId = guild[key]?.p;
    const guests = [...(guild[key]?.h ?? [])];

    await client.save(guild.id, {
        alter: `${key}.on`,
        value: false
    }, {
        alter: `${key}.p`,
        value: ''
    }, {
        alter: `${key}.h`,
        value: []
    }, {
        alter: `${key}.rq`,
        value: ''
    }, {
        alter: `${key}.rqu`,
        value: ''
    }, {
        alter: `${key}.rqt`,
        value: 0
    }, ...Object.entries(extra).map(([path, value]) => ({
        alter: `${key}.${path}`,
        value
    })));

    await refreshGuild(client, guild.id);
    if (hostId)
    {
        const hostDoc = await client.module.database.reloadGuild(hostId).catch(() => null);

        if (hostDoc)
        {
            await client.save(hostId, {
                alter: `${key}.h`,
                value: (hostDoc[key]?.h ?? []).filter(id => id !== guild.id)
            });

            await refreshGuild(client, hostId);
        }
    }
    for (const guestId of guests)
    {
        await client.save(guestId, {
            alter: `${key}.on`,
            value: false
        }, {
            alter: `${key}.p`,
            value: ''
        }, {
            alter: `${key}.c`,
            value: ''
        });

        await refreshGuild(client, guestId);
    }

    return hostId ?? null;
}

export async function appealInvite(client, guild)
{
    if (!guild?.ap?.on || !guild.ap.p || !guild.ap.c)
    {
        return null;
    }

    return inviteTo(client, guild.ap.p, guild.ap.c);
}

export function syncMembers(guild)
{
    return guild?.sr?.on
        ? [
            guild.id,
            ...(guild.sr.gs ?? [])
        ]
        : [];
}

export function syncedRoleOf(guild, roleId)
{
    return (guild?.sr?.r ?? []).find(role => role.m?.[guild.id] === roleId) ?? null;
}

const commitGroup = async (client, members, roles) =>
{
    await Promise.all(members.map(id => client.save(id, {
        alter: 'sr.on',
        value: members.length > 1
    }, {
        alter: 'sr.gs',
        value: members.filter(other => other !== id)
    }, {
        alter: 'sr.r',
        value: roles
    }, {
        alter: 'sr.rq',
        value: ''
    }, {
        alter: 'sr.rqu',
        value: ''
    }, {
        alter: 'sr.rqt',
        value: 0
    })));

    await Promise.all(members.map(id => refreshGuild(client, id)));
};

export async function joinSyncHandshake(client, guild, userId)
{
    const proposal = await readProposal(client, userId, 'sr');

    if (!proposal)
    {
        await writeProposal(client, userId, 'sr', guild.id);

        return { status: 'proposed' };
    }

    if (proposal.guild === guild.id)
    {
        return { status: 'self' };
    }

    const targetId = proposal.guild;
    const target = await describeGuild(client, targetId);

    if (!target)
    {
        await clearProposal(client, userId);

        return { status: 'unknown-guild' };
    }

    const targetDoc = await client.module.database.reloadGuild(targetId);

    const hereMembers = syncMembers(guild);
    const thereMembers = syncMembers(targetDoc);

    if (hereMembers.includes(targetId))
    {
        await clearProposal(client, userId);

        return {
            status: 'already',
            target
        };
    }

    if (hereMembers.length > 1 && thereMembers.length > 1)
    {
        await clearProposal(client, userId);

        return {
            status: 'busy-both',
            target
        };
    }

    await clearProposal(client, userId);

    const joining = hereMembers.length > 1
        ? [targetId]
        : thereMembers.length > 1
            ? [guild.id]
            : [];
    const existing = hereMembers.length > 1
        ? guild
        : thereMembers.length > 1
            ? targetDoc
            : null;

    const members = existing
        ? [
            ...syncMembers(existing),
            ...joining
        ]
        : [
            guild.id,
            targetId
        ];

    const roles = existing
        ? [...(existing.sr.r ?? [])]
        : [];
    const created = [];
    const failed = [];

    for (const newcomer of joining)
    {
        for (let i = 0; i < roles.length; i++)
        {
            if (!roles[i].a || roles[i].m?.[newcomer])
            {
                continue;
            }

            const made = await findOrCreateRoleOn(client, newcomer, {
                name:   roles[i].n,
                reason: `Shared role, synced across ${members.length} servers`
            });

            if (made?.id)
            {
                roles[i] = {
                    ...roles[i],
                    m: {
                        ...roles[i].m,
                        [newcomer]: made.id
                    }
                };
                created.push(roles[i].n);
            }
            else
            {

                failed.push({
                    name:  roles[i].n,
                    error: made?.error ?? 'Relaxy could not create it'
                });
            }
        }
    }

    await commitGroup(client, members, roles);

    return {
        status: 'accepted',
        target,
        members,
        created,
        failed
    };
}

export async function leaveSync(client, guild)
{
    const members = syncMembers(guild);
    const remaining = members.filter(id => id !== guild.id);

    if (remaining.length)
    {
        const roles = (guild.sr.r ?? [])
            .map(role =>
            {
                const map = { ...role.m };
                delete map[guild.id];

                return {
                    ...role,
                    m: map
                };
            })
            .filter(role => Object.keys(role.m).length > 1);

        await commitGroup(client, remaining, roles);
    }

    await client.save(guild.id, {
        alter: 'sr.on',
        value: false
    }, {
        alter: 'sr.gs',
        value: []
    }, {
        alter: 'sr.r',
        value: []
    }, {
        alter: 'sr.rq',
        value: ''
    }, {
        alter: 'sr.rqu',
        value: ''
    }, {
        alter: 'sr.rqt',
        value: 0
    });

    await refreshGuild(client, guild.id);

    return remaining;
}

export async function addSyncedRole(client, guild, name, targets = null)
{
    const members = syncMembers(guild);
    const carriers = targets?.length
        ? targets
        : members;
    const everywhere = carriers.length === members.length;

    const made = {};

    const created = [];
    const adopted = [];

    for (const id of carriers)
    {
        const role = await findOrCreateRoleOn(client, id, {
            name,
            reason: `Shared role, synced across ${carriers.length} servers`
        });

        if (!role?.id)
        {
            const partner = await describeGuild(client, id);

            await Promise.all(created.map(entry => deleteRoleOn(client, entry.guild, entry.role, 'Shared role rolled back - it could not be set up in every server it covers')));

            return {
                status: 'failed',
                error:  role?.error ?? 'Relaxy could not create it',
                guild:  partner?.name ?? id
            };
        }

        made[id] = role.id;

        (role.created
            ? created
            : adopted).push({
            guild: id,
            role:  role.id
        });
    }

    const role = {
        n: name,
        a: everywhere,
        m: made
    };
    const roles = [
        ...(guild.sr.r ?? []),
        role
    ];

    await commitGroup(client, members, roles);

    return {
        status:  'ok',
        role,
        roles,
        adopted: adopted.map(entry => entry.guild),
        created: created.map(entry => entry.guild)
    };
}

export async function attachSyncedRole(client, guild, groupName, roleId, open = false)
{
    const members = syncMembers(guild);
    const roles = [...(guild.sr?.r ?? [])];

    const index = roles.findIndex(role => String(role.n).toLowerCase() === String(groupName).toLowerCase());

    if (index === -1)
    {
        if (!open)
        {
            return {
                status: 'no-group',
                groups: roles.map(role => role.n)
            };
        }

        const opened = {
            n: String(groupName),
            a: false,
            m: { [guild.id]: roleId }
        };

        const next = [
            ...roles,
            opened
        ];

        await commitGroup(client, members, next);

        return {
            status: 'created',
            role:   opened,
            roles:  next
        };
    }

    if (roles[index].m?.[guild.id])
    {
        return {
            status: 'taken',
            role:   roles[index]
        };
    }

    if (roles.some(role => role.m?.[guild.id] === roleId))
    {
        return {
            status: 'in-use',
            role:   roles.find(role => role.m?.[guild.id] === roleId)
        };
    }

    roles[index] = {
        ...roles[index],

        a: false,
        m: {
            ...roles[index].m,
            [guild.id]: roleId
        }
    };

    await commitGroup(client, members, roles);

    return {
        status: 'ok',
        role:   roles[index],
        roles
    };
}

export async function removeSyncedRole(client, guild, role)
{
    const members = syncMembers(guild);
    const roles = (guild.sr.r ?? []).filter(item => item !== role);

    await commitGroup(client, members, roles);

    return roles;
}
