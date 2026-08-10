'use strict';

import Discord        from 'discord.js';
import Relaxy         from '../../../src/Client/Relaxy.js';
import { CASE_TYPES } from './case.js';

import {
    describeGuild,
    linkedGuilds,
    memberStandingIn
} from '../../../src/Client/Modules/Guilds/GuildLink.js';

import { inlineText } from '../../../src/Client/Modules/Core/Utilities.js';

const describe = record => CASE_TYPES[record.ty] ?? {
    label: record.ty || 'Unknown',
    emoji: '📁'
};
const BAN_CASES = [
    'ban',
    'tempban',
    'warn-ban',
    'censor-ban'
];

const RELATIONS = {
    pool:  {
        emoji: '🔗',
        short: 'Shares roles with this server',
        long:  'This server and that one **share roles** (`=syncrole`).'
    },
    host:  {
        emoji: '📤',
        short: 'Hosts this server\'s ban appeals',
        long:  'Members banned **here** appeal **there** (`=appealchannel`).'
    },
    guest: {
        emoji: '📥',
        short: 'Its banned members appeal here',
        long:  'Members banned **there** appeal **here** (`=appealchannel`).'
    }
};

const CASES_PER_PAGE = 8;
const stamp = ms => (ms
    ? `<t:${Math.floor(ms / 1000)}:R>`
    : 'unknown');

const seconds = ms => Math.floor(ms / 1000);

const gather = async (client, guildId, userId) =>
{
    const database = client.module.database;

    const [standing, guildDoc, records, warnings, memberDocument, mute] = await Promise.all([
        memberStandingIn(client, guildId, userId).catch(() => null),
        database.Guild(guildId).catch(() => null),
        database.casesInvolving(guildId, userId).catch(() => []),
        database.warningsOf(guildId, userId).catch(() => []),
        database.Member(userId, guildId).catch(() => null),
        database.getMute(guildId, userId).catch(() => null)
    ]);

    return {
        standing,
        guildDoc,
        records,
        warnings,
        memberDocument,
        mute,
        against: records.filter(record => record.u === userId),
        issued:  records.filter(record => record.md === userId && record.u !== userId)
    };
};
const format = record =>
{
    const type = describe(record);

    const outcomes = (Array.isArray(record.ou)
        ? record.ou
        : []).map(entry => entry.t).filter(Boolean);

    return `**#${record.n}** ${type.emoji} **${type.label}** - ${stamp(record.at)}${outcomes.length
        ? ` *(${[...new Set(outcomes)].join(', ')})*`
        : ''}\n${inlineText(record.rs, { limit: 80 })}`;
};
const casePage = (list, index) =>
{
    const pages = Math.max(1, Math.ceil(list.length / CASES_PER_PAGE));
    const page = Math.min(Math.max(0, index), pages - 1);
    const slice = list.slice(page * CASES_PER_PAGE, (page + 1) * CASES_PER_PAGE);

    return {
        pages,
        page,
        text: slice.length
                  ? slice.map(format).join('\n').slice(0, 1024)
                  : '*Nothing.*'
    };
};

const standingOf = (data, userId) =>
{
    const lines = [];
    const {
        standing,
        guildDoc,
        mute,
        memberDocument
    } = data;

    if (!standing)
    {
        lines.push('❓ **Relaxy cannot see this server right now** - everything below is from the database only.');
    }

    if (standing?.banned === true)
    {
        lines.push('🔨 **Banned from this server.**');
    }
    else if (standing?.banned === null)
    {
        lines.push('❓ **Ban status unknown** - Relaxy needs `Ban Members` here to check.');
    }

    if (standing && !standing.present && standing.banned !== true)
    {
        lines.push('🚪 **Not in this server.**');
    }

    if (mute)
    {
        lines.push(`🔇 **Muted**${mute.exp
            ? ` until <t:${seconds(mute.exp)}:R>`
            : ' - permanently'}.`);
    }

    if (standing?.timeoutUntil > Date.now())
    {
        lines.push(`⏳ **Timed out** until <t:${seconds(standing.timeoutUntil)}:R>.`);
    }

    if (guildDoc?.mbr?.el?.includes(userId))
    {
        lines.push('⭐ **Elevated** - treated as staff by Relaxy.');
    }

    if (guildDoc?.mbr?.ex?.includes(userId))
    {
        lines.push('🛡️ **Exempt** - censoring and restrictions do not apply.');
    }

    const grants = Object.entries(guildDoc?.cmd?.gr ?? {})
                         .filter(([, holders]) => Array.isArray(holders) && holders.includes(userId))
                         .map(([command]) => `\`=${command}\``);

    if (grants.length)
    {
        lines.push(`🔑 **Granted**: ${grants.join(', ')}`);
    }

    if (memberDocument?.lm > 0)
    {

        lines.push(`🗑️ Marked as departed ${stamp(memberDocument.lm)} - their member data is purged after 30 days away.`);
    }

    return lines.length
        ? lines.join('\n').slice(0, 1024)
        : '✅ *Nothing of note - present, unbanned, unmuted, no special permissions.*';
};

const banField = (data, userId) =>
{
    if (data.standing?.banned !== true)
    {
        return null;
    }

    const record = data.against.find(entry => BAN_CASES.includes(entry.ty)) ?? null;
    const lines = [];

    if (record)
    {
        const type = describe(record);

        lines.push(`${type.emoji} **${type.label}** - case **#${record.n}**, ${stamp(record.at)}`);

        if (record.md)
        {
            lines.push(`By <@${record.md}>`);
        }

        if (record.rs)
        {
            lines.push(`Case reason: ${inlineText(record.rs, { limit: 300 })}`);
        }
    }
    else
    {

        lines.push('🔨 Banned, but Relaxy has **no case** for it - it was placed before Relaxy saw this server, or while it was offline.');
    }

    lines.push(`Ban list reason: ${inlineText(data.standing.banReason, {
        limit:    300,
        fallback: 'None recorded.'
    })}`);

    return lines.join('\n').slice(0, 1024);
};
const muteField = data =>
{
    const mute = data.mute;

    if (!mute)
    {
        return null;
    }

    const lines = [
        mute.mod
            ? `By <@${mute.mod}> ${stamp(mute.at)}`
            : `Muted ${stamp(mute.at)} - no moderator recorded.`,
        `Reason: ${inlineText(mute.reason && mute.reason !== 'X'
            ? mute.reason
            : '', { limit: 300 })}`,
        mute.exp
            ? `Lifts <t:${seconds(mute.exp)}:R> (<t:${seconds(mute.exp)}:f>)`
            : 'Lifts **never** - this mute is permanent.'
    ];

    if (mute.roles?.length)
    {
        lines.push(`**${mute.roles.length}** role${mute.roles.length === 1
            ? ''
            : 's'} held for them until it lifts.`);
    }

    if (mute.ban)
    {
        lines.push('This mute also **unbans** them when it expires.');
    }

    return lines.join('\n').slice(0, 1024);
};

const serverPage = (client, user, data, view) =>
{
    const {
        against,
        issued,
        warnings,
        memberDocument
    } = data;

    const cases = casePage(against, view.page);

    const KINDS = {
        u: 'username',
        d: 'display name',
        n: 'nickname'
    };

    const names = (memberDocument?.nh ?? [])
        .slice(-8)
        .reverse()
        .map(entry => `\`${entry.n}\` *(${KINDS[entry.k] ?? entry.k}, ${stamp(entry.t)})*`)
        .join('\n');

    const critical = warnings.filter(warning => warning.tier >= 2).length;
    const worst = warnings.reduce((highest, warning) => Math.max(highest, warning.tier ?? 0), 0);

    const warningSummary = warnings.length
        ? [
            `**${warnings.length}** warning${warnings.length === 1
                ? ''
                : 's'}${critical
                ? `, **${critical}** critical`
                : ''} - highest tier **${worst}**.`,
            ...warnings.slice(-3).reverse().map(warning => `• T${warning.tier} ${stamp(warning.date)} - ${inlineText(warning.reason, {
                limit:    70,
                fallback: 'No reason.'
            })}`),
            warnings.length > 3
                ? `*\`=warnings ${user.id}\` for all.*`
                : ''
        ].filter(Boolean).join('\n')
        : '*None.*';

    const activity = [
        `Messages **${(memberDocument?.msg ?? 0).toLocaleString()}** | Commands **${(memberDocument?.cmd ?? 0).toLocaleString()}**`,
        `Level **${memberDocument?.lvl ?? 0}** (**${(memberDocument?.xp ?? 0).toLocaleString()}** xp)`,
        `Voice **${client.imports.time(memberDocument?.vc ?? 0)}** | Reactions **${memberDocument?.rx ?? 0}** given, **${memberDocument?.rr ?? 0}** received`
    ].join('\n');

    const fields = [
        {
            name:  'Standing',
            value: standingOf(data, user.id)
        }
    ];

    const ban = banField(data, user.id);

    if (ban)
    {
        fields.push({
            name:  'The ban',
            value: ban
        });
    }

    const mute = muteField(data);

    if (mute)
    {
        fields.push({
            name:  'The mute',
            value: mute
        });
    }

    fields.push({
        name:  `Cases against them [${against.length}]${cases.pages > 1
            ? ` - page ${cases.page + 1}/${cases.pages}`
            : ''}`,
        value: cases.text
    }, {
        name:  `Cases they handed out [${issued.length}]`,
        value: issued.length
                   ? (issued.slice(0, 5).map(format).join('\n') + (issued.length > 5
                ? `\n*…and ${issued.length - 5} older. \`=case ${user.id}\` for all.*`
                : '')).slice(0, 1024)
                   : '*Nothing.*'
    }, {
        name:  `Warnings [${warnings.length}]`,
        value: warningSummary.slice(0, 1024)
    }, {
        name:  'Activity there',
        value: activity
    });

    if (names)
    {
        fields.push({
            name:  'Known there as',
            value: names.slice(0, 1024)
        });
    }

    const avatar = typeof user.displayAvatarURL === 'function'
        ? user.displayAvatarURL({
            dynamic: true,
            size:    1024
        })
        : view.icon ?? client.cdn.serverIcon;

    const relation = RELATIONS[view.relation] ?? null;

    return {
        color:       client.data.embedColor,
        author:      {
            name:     `Dossier - ${client.utils.tag(user) ?? user.username}`,
            icon_url: view.icon ?? client.cdn.serverIcon
        },
        description: [
                         `<@${user.id}> **\`${user.id}\`**`,
                         `Account created ${stamp(user.createdTimestamp)}${data.standing?.joinedAt
                             ? ` | Joined ${stamp(data.standing.joinedAt)}`
                             : ''}`,
                         `**${data.records.length}** case${data.records.length === 1
                             ? ''
                             : 's'} | **${warnings.length}** warning${warnings.length === 1
                             ? ''
                             : 's'}`,
                         `**In ${view.guildName}**${relation
                             ? ` - ${relation.long}`
                             : ' *(this server)*'}`
                     ].join('\n'),
        thumbnail:   { url: avatar },
        fields,
        footer:      client.data.footer,
        timestamp:   new Date().toISOString()
    };
};

const overview = async (client, user, entries) =>
{
    const fields = entries.map(entry =>
    {
        const relation = RELATIONS[entry.relation] ?? null;
        const data = entry.data;

        const state = [
            data.standing?.banned === true
                ? '🔨 banned'
                : data.standing?.banned === null
                    ? '❓ ban unknown'
                    : null,
            data.mute
                ? '🔇 muted'
                : null,
            data.standing?.timeoutUntil > Date.now()
                ? '⏳ timed out'
                : null,
            data.standing && !data.standing.present && data.standing.banned !== true
                ? '🚪 not a member'
                : null,
            data.standing?.present
                ? '✅ present'
                : null
        ].filter(Boolean);

        return {
            name:  `${relation?.emoji ?? '🏠'} ${entry.name}`.slice(0, 256),
            value: [
                       state.length
                           ? state.join(' · ')
                           : '*Relaxy cannot see this server right now.*',
                       `**${data.against.length}** case${data.against.length === 1
                           ? ''
                           : 's'} against them · **${data.warnings.length}** warning${data.warnings.length === 1
                           ? ''
                           : 's'}`,
                       data.against[0]
                           ? `Latest: ${describe(data.against[0]).emoji} **${describe(data.against[0]).label}** ${stamp(data.against[0].at)}`
                           : '*No cases there.*'
                   ].join('\n').slice(0, 1024)
        };
    });

    return {
        color:       client.data.embedColor,
        author:      {
            name:     `Dossier - ${client.utils.tag(user) ?? user.username}`,
            icon_url: typeof user.displayAvatarURL === 'function'
                          ? user.displayAvatarURL({ size: 128 })
                          : client.cdn.serverIcon
        },
        description: [
                         `<@${user.id}> **\`${user.id}\`**`,
                         `Across **${entries.length}** linked server${entries.length === 1
                             ? ''
                             : 's'}. Pick one below for its full file - the records are **not** merged, because each server's is its own.`
                     ].join('\n'),

        fields:    fields.slice(0, 25),
        footer:    client.data.footer,
        timestamp: new Date().toISOString()
    };
};

const controls = (userId, guildId, {
    pages = 1,
    page = 0,
    links = [],
    homeId,
    homeName,
    solo = false
}) =>
{
    const rows = [];
    const paging = [];

    const scope = solo
        ? '_solo'
        : '';

    if (pages > 1)
    {
        paging.push(new Discord.ButtonBuilder()
            .setCustomId(`dossier_page_${userId}_${guildId}_${page - 1}${scope}`)
            .setLabel('Newer cases')
            .setEmoji('⬅️')
            .setStyle(Discord.ButtonStyle.Secondary)
            .setDisabled(page <= 0), new Discord.ButtonBuilder()
            .setCustomId(`dossier_page_${userId}_${guildId}_${page + 1}${scope}`)
            .setLabel('Older cases')
            .setEmoji('➡️')
            .setStyle(Discord.ButtonStyle.Secondary)
            .setDisabled(page >= pages - 1));
    }

    if (links.length)
    {
        paging.push(new Discord.ButtonBuilder()
            .setCustomId(`dossier_links_${userId}`)
            .setLabel(`All linked servers (${links.length + 1})`)
            .setEmoji('🔗')
            .setStyle(Discord.ButtonStyle.Primary));
    }

    if (paging.length)
    {
        rows.push(new Discord.ActionRowBuilder().addComponents(paging));
    }

    if (links.length)
    {
        const options = [
            {
                label:   `${homeName} (this server)`.slice(0, 100),
                value:   homeId,
                emoji:   '🏠',
                default: guildId === homeId
            },
            ...links.slice(0, 24).map(link => ({
                label:       String(link.name).slice(0, 100),
                value:       link.id,
                description: RELATIONS[link.relation]?.short,
                emoji:       RELATIONS[link.relation]?.emoji,
                default:     guildId === link.id
            }))
        ];

        rows.push(new Discord.ActionRowBuilder().addComponents(new Discord.StringSelectMenuBuilder()
            .setCustomId(`dossier_pick_${userId}`)
            .setPlaceholder('Show this person in another linked server…')
            .addOptions(options)));
    }

    return rows.reverse();
};
const resolveLinks = async (client, guild) =>
{
    const links = linkedGuilds(guild);

    return Promise.all(links.map(async link =>
    {
        const described = await describeGuild(client, link.id).catch(() => null);

        return {
            ...link,
            name: described?.name ?? link.id,
            icon: described?.icon ?? null
        };
    }));
};

const resolveUser = async (client, message, args) =>
{
    const looksLikeId = /^\d{17,20}$/.test(String(args?.[0] ?? '').trim());

    let user = message.mentions?.users?.first() ?? (looksLikeId
        ? await client.getUser(args[0]).catch(() => null)
        : null);

    if (user)
    {
        return { user };
    }

    const resolved = await client.utils.resolveTargetFromArgs(message.guild.id, args);

    if (resolved?.ambiguous?.length)
    {
        return { ambiguous: resolved };
    }

    if (resolved?.id)
    {
        user = await client.getUser(resolved.id).catch(() => null) ?? {
            id:       resolved.id,
            username: resolved.matched ?? resolved.id
        };
    }

    return { user };
};

export default {
    name:        'dossier',
    aliases:     [
        'modprofile',
        'record',
        'rap'
    ],
    usage:       '=dossier <user|id|former name> [server id]',
    description: 'The complete file on one member of this server: who they are, every name Relaxy has seen them use, their standing, **the ban and the mute they are serving right now**, every case for and against them, their warnings, and their activity.\n\nGive a **user** - a mention, an id, their name, or a nickname they have since dropped. Someone who has left can still be looked up: their record does not leave with them. Use the **Older cases** buttons to walk back through every case, not just the newest.\n\n**Linked servers.** Where this server is linked to another - it shares roles with it (`=syncrole`) or hosts / is hosted for ban appeals (`=appealchannel`) - the **All linked servers** button shows where that person stands in each, and the menu underneath opens any one of them in full. `=dossier <user> <server id>` goes straight to one.\n\nThe records are never merged, and only **linked** servers are shown. Relaxy will not tell one server about someone\'s conduct in a server it has nothing to do with.',

    slashDescription: 'The complete file on one member: names, standing, ban, mute, cases, warnings and activity.',

    slash: new Discord.SlashCommandBuilder()
               .addStringOption(option => option.setName('target').setDescription('A user - id, name, or a former nickname.').setRequired(true))
               .addStringOption(option => option.setName('server').setDescription('Id of a LINKED server to open instead of this one.').setRequired(false)),

    args:  true,
    defer: true,

    permissionsUser: [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES',
        'MODERATE_MEMBERS'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    async run(client, message, args, guild, interaction)
    {
        if (interaction?.isMessageComponent?.())
        {
            return component(client, message, guild, interaction);
        }

        const named = interaction?.options?.getString?.('server')?.trim() || null;

        const words = args.length === 1 && typeof args[0] === 'string'
            ? args[0].trim().split(/\s+/).filter(Boolean)
            : args.filter(value => value !== named).flatMap(value => typeof value === 'string'
                ? value.trim().split(/\s+/).filter(Boolean)
                : [value]);

        const requested = named ?? (words.length > 1 && /^\d{17,20}$/.test(words.at(-1))
            ? words.pop()
            : null);

        if (requested && !/^\d{17,20}$/.test(requested))
        {
            return client.qEmbed(`**\`${requested}\`** is not a server id. It should be 17-20 digits - right-click a server with Developer Mode on and choose **Copy Server ID**.`, interaction ?? message);
        }

        const {
            user,
            ambiguous
        } = await resolveUser(client, message, words);

        if (ambiguous)
        {
            return client.qEmbed(`**\`${ambiguous.matched}\`** has been used by ${ambiguous.ambiguous.length} different people here. Search by id instead:\n${ambiguous.ambiguous.map(hit => `• \`${hit.id}\``).join('\n')}`, interaction ?? message);
        }

        if (!user)
        {
            return client.qEmbed(`Nobody here is known by **\`${words.join(' ')}\`**, now or in the past. Try their id.`, interaction ?? message);
        }

        const links = await resolveLinks(client, guild);

        if (requested && requested !== guild.id)
        {
            const link = links.find(entry => entry.id === requested);

            if (!link)
            {
                return client.qEmbed(links.length
                    ? `This server is not linked to \`${requested}\`, so its records are not this server's to read.\n\nLinked with: **${links.map(entry => entry.name).join('**, **')}**.`
                    : `This server is not linked to any other, so \`${requested}\` is not something Relaxy will report here.\n\nLink one with \`=syncrole\` or \`=appealchannel\`.`, interaction ?? message);
            }

            return render(client, message, guild, user, links, {
                guildId: link.id,
                page:    0,
                interaction
            });
        }

        return render(client, message, guild, user, links, {
            guildId: guild.id,
            page:    0,
            interaction
        });
    }
};

const render = async (client, message, guild, user, links, {
    guildId,
    page,
    interaction,
    update = false,
    solo = false
}) =>
{
    const link = links.find(entry => entry.id === guildId) ?? null;
    const data = await gather(client, guildId, user.id);

    const embed = serverPage(client, user, data, {
        guildId,
        guildName: guildId === guild.id
                       ? message.guild.name
                       : link?.name ?? data.standing?.name ?? guildId,
        icon:      guildId === guild.id
                       ? client.utils.guildIcon(message.guild)
                       : link?.icon ?? null,
        relation:  link?.relation ?? null,
        page
    });

    const rows = controls(user.id, guildId, {
        pages:    Math.max(1, Math.ceil(data.against.length / CASES_PER_PAGE)),
        page:     Math.min(page, Math.max(0, Math.ceil(data.against.length / CASES_PER_PAGE) - 1)),
        links,
        homeId:   guild.id,
        homeName: message.guild.name,
        solo
    });
    if (update)
    {
        await interaction.editReply({
            embeds:     [embed],
            components: rows
        }).catch(client.swallow('dossier: update'));

        return;
    }

    return client.send(interaction
        ? 1
        : message.channel, null, [embed], null, null, rows);
};

export const appealThreadDossier = async (client, guestId, user, guest = {}) =>
{
    const data = await gather(client, guestId, user.id);

    const embed = serverPage(client, user, data, {
        guildId:   guestId,
        guildName: guest.name ?? guestId,
        icon:      guest.icon ?? null,

        relation: 'guest',
        page:     0
    });

    const pages = Math.max(1, Math.ceil(data.against.length / CASES_PER_PAGE));

    const rows = controls(user.id, guestId, {
        pages,
        page: 0,
        solo: true
    });

    return {
        embeds:     [embed],
        components: rows.map(row => row.toJSON())
    };
};

const mayRead = async (client, guild, interaction, targetGuild, userId) =>
{

    if (interaction.memberPermissions?.has(Discord.PermissionFlagsBits.Administrator))
    {
        return true;
    }

    if (interaction.memberPermissions?.has([
        Discord.PermissionFlagsBits.ManageMessages,
        Discord.PermissionFlagsBits.ModerateMembers
    ]))
    {
        return true;
    }

    const held = interaction.member?.roles?.cache
        ? [...interaction.member.roles.cache.keys()]
        : Array.isArray(interaction.member?.roles)
            ? interaction.member.roles
            : [];

    if ((guild?.ap?.tr ?? []).some(roleId => held.includes(roleId)))
    {
        return true;
    }

    if (targetGuild && /^\d{17,20}$/.test(targetGuild))
    {
        const ban = await client.utils.banCase(targetGuild, userId).catch(() => null);

        if (ban?.md && ban.md === interaction.user?.id)
        {
            return true;
        }
    }

    return false;
};

const component = async (client, message, guild, interaction) =>
{
    const [, action, userId, targetGuild, page, scope] = interaction.customId.split('_');

    const solo = scope === 'solo';

    if (!await mayRead(client, guild, interaction, targetGuild, userId))
    {
        await interaction.reply({
            content: 'Reading someone\'s moderation file needs `Manage Messages` and `Timeout Members` - or, in a ban appeal, one of this server\'s appeal-staff roles.',
            flags:   Discord.MessageFlags.Ephemeral
        }).catch(client.swallow('dossier: denied'));

        return;
    }
    await interaction.deferUpdate().catch(client.swallow('dossier: deferUpdate'));

    const user = await client.getUser(userId).catch(() => null) ?? {
        id:       userId,
        username: userId
    };

    const links = solo
        ? []
        : await resolveLinks(client, guild);

    if (action === 'links')
    {

        const entries = await Promise.all([
            {
                id:       guild.id,
                name:     message.guild.name,
                relation: null
            },
            ...links
        ].map(async entry => ({
            ...entry,
            data: await gather(client, entry.id, user.id)
        })));

        await interaction.editReply({
            embeds:     [await overview(client, user, entries)],
            components: controls(user.id, null, {
                links,
                homeId:   guild.id,
                homeName: message.guild.name
            })
        }).catch(client.swallow('dossier: overview'));

        return;
    }

    if (action === 'pick')
    {
        const chosen = interaction.values?.[0];

        if (chosen !== guild.id && !links.some(entry => entry.id === chosen))
        {
            await interaction.followUp({
                content: 'That server is no longer linked to this one.',
                flags:   Discord.MessageFlags.Ephemeral
            }).catch(client.swallow('dossier: unlinked'));

            return;
        }

        return render(client, message, guild, user, links, {
            guildId: chosen,
            page:    0,
            interaction,
            update:  true
        });
    }

    if (action === 'page')
    {
        return render(client, message, guild, user, links, {
            guildId: targetGuild,
            page:    Math.max(0, Number(page) || 0),
            interaction,
            update:  true,
            solo
        });
    }

    client.log('WARN', `[dossier] Unhandled component "${interaction.customId}".`);
};
