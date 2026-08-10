'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import {
    NO_APPEAL_TOKEN,
    SYNC_TOKEN,
    wholeToken
} from '../../../src/Client/Modules/Core/Utilities.js';

import {
    moderateAcrossPool,
    syncReport
} from '../../../src/Client/Modules/Guilds/GuildLink.js';

const NO_APPEAL_ARG = wholeToken(NO_APPEAL_TOKEN);
const SYNC_ARG = wholeToken(SYNC_TOKEN);

const tierOnly = /^tier$/i;
const numberOnly = /^(0|[1-9][0-9]?|30)?$/;
const tierWithNumber = /^tier(0|[1-9][0-9]?|30)?$/i;

const findTierIndices = args =>
{
    for (let i = 0; i < args.length; i++)
    {
        if (tierWithNumber.test(args[i]) && [
            5,
            6
        ].includes(args[i].length))
        {
            return [i];
        }
        else if (tierOnly.test(args[i]) && numberOnly.test(args[i + 1]))
        {
            return [
                i,
                i + 1
            ];
        }
    }

    return [];
};

const parse = async (client, message, args, interaction) =>
{
    const blank = {
        member:   null,
        reason:   '',
        tier:     0,
        count:    1,
        noAppeal: false,
        tiered:   false,
        sync:     false,
        error:    null
    };

    if (interaction?.isChatInputCommand?.())
    {
        const user = interaction.options.getUser('user');
        const member = user
            ? await client.getMember(message.guild, user.id).catch(() => null)
            : null;

        const tier = interaction.options.getInteger('tier');

        return {
            ...blank,
            member,
            reason:   (interaction.options.getString('reason') ?? '').trim(),
            tier:     tier ?? 0,
            tiered:   tier !== null,
            count:    interaction.options.getInteger('count') ?? 1,
            noAppeal: interaction.options.getBoolean('noappeal') ?? false,
            sync:     interaction.options.getBoolean('sync') ?? false
        };
    }

    const member = await client.utils.member(message, args, 0, { cut: true }) ?? null;

    if (!member)
    {
        return {
            ...blank,
            error: 'That user does not exist!'
        };
    }

    const { silent: noAppeal } = client.utils.takeNoAppeal(args.join(' '));
    const { sync } = client.utils.takeSync(args.join(' '));

    let rest = args.filter(word => !(noAppeal && NO_APPEAL_ARG.test(word)) && !(sync && SYNC_ARG.test(word)));

    const tierIndexes = findTierIndices(rest);
    const tierString = tierIndexes.length === 0
        ? null
        : tierIndexes.length === 1
            ? rest[tierIndexes[0]]
            : `${rest[tierIndexes[0]]}${rest[tierIndexes[1]]}`;

    const tier = tierString
        ? Number(client.utils.nums(tierString))
        : 0;

    if (tierString && (tier < 0 || tier > 30))
    {
        return {
            ...blank,
            member,
            error: 'Minimum warning tier is 0, maximum is 30!'
        };
    }

    rest = client.utils.removeIndices(rest, tierIndexes);

    const multiplication = rest.find(word => typeof word === 'string' && /^\d+X$/.test(word)) ?? null;

    if (multiplication)
    {
        rest = rest.filter(word => word !== multiplication);
    }

    return {
        ...blank,
        member,
        reason: rest.join(' ').trim(),
        tier,
        tiered: Boolean(tierString),
        count:  multiplication
                    ? parseInt(client.utils.nums(multiplication), 10)
                    : 1,
        noAppeal,
        sync
    };
};

export default {
    name:        'warning',
    aliases:     ['warn'],
    usage:       '=warning <user> [reason] [tierN] [NX] [noappeal] [sync]',
    description: 'Warn a member and emit the event to the modlog; the reason is capped at 258 characters.\nAssign a tier by including \'tierX\' (X being 0 to 30, e.g. tier5), written lowercase and joined - it is stripped from the reason and added to the member\'s threat level.\nA warning whose tier is above half the highest tier on the server counts towards an autoban when autobanning is enabled.\n**Duplicate a warning** by including \'NX\' - the count, then a capital X (e.g. `=warning @user spamming 3X` records that same warning three times). Handy for someone who earned several at once, and for pushing a member over the autoban limit deliberately. The duplicate count cannot exceed the server\'s autoban limit (`=autoban`).\nAdd **noappeal** to suppress the DM if this warning is the one that tips them over the autoban limit. The case is still recorded either way.\n\nAdd **sync** to record the same warning in **every server this one is linked to** (`=syncservers`), each with its own warning entry and modlog line - or use `=swarning`, which is the same thing under a name you can find. The tier travels with it; the **autoban does not**, so a synced warning never bans anybody anywhere but here. Only servers that have run `=syncservers moderation on` are reached.\n\n**`/warning`** takes the same things as real options - `user`, `reason`, `tier`, `count`, `noappeal` and `sync` - so none of the `tierN` / `NX` / `noappeal` encoding is needed there.',

    slashDescription: 'Warn a member, optionally with a tier, a repeat count and no appeal DM.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('user').setDescription('The member to warn.').setRequired(true))
               .addStringOption(option => option.setName('reason').setDescription('Why they are being warned. Capped at 258 characters.').setRequired(false))
               .addIntegerOption(option => option.setName('tier').setDescription('Threat tier, 0-30. Counts toward an autoban above half the server\'s highest tier.').setMinValue(0).setMaxValue(30).setRequired(false))
               .addIntegerOption(option => option.setName('count').setDescription('Record this same warning N times. Capped by the server\'s autoban limit.').setMinValue(1).setRequired(false))
               .addBooleanOption(option => option.setName('noappeal').setDescription('If this warning triggers the autoban, do not DM them the reason or appeal invite.').setRequired(false))
               .addBooleanOption(option => option.setName('sync').setDescription('Also record it in every server this one is linked to. Never bans there.').setRequired(false)),

    args:  true,
    defer: true,

    permissionsUser:         [
        'SEND_MESSAGES',
        'MODERATE_MEMBERS'
    ],
    permissionsBot:          [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],
    suggestedPermissionsBot: ['BAN_MEMBERS'],

    async run(client, message, args, guild, interaction, options = {})
    {
        const parsed = await parse(client, message, args, interaction);

        if (parsed.error)
        {
            return client.qEmbed(parsed.error, interaction ?? message);
        }

        const member = parsed.member;

        if (!member)
        {
            return client.qEmbed('That user does not exist!', interaction ?? message);
        }

        if (client.isOwner(member.user.id))
        {
            return client.qEmbed(client.utils.randErr(), interaction ?? message);
        }

        let memberWarnings = await client.module.database.warningsOf(guild.id, member.user.id);
        const warningTiersMember = [
            ...new Set((memberWarnings.length
                ? memberWarnings
                : [{ tier: 0 }])
                .map(warn => warn.tier)
                .filter(tier => typeof tier === 'number' && !isNaN(tier)))
        ].sort((a, b) =>
        {
            return a - b;
        });

        if (!client.data.serverCache?.[guild.id])
        {
            client.data.serverCache[guild.id] = {};
        }

        if (!client.data.serverCache?.[guild.id]?.[member.user.id])
        {
            client.data.serverCache[guild.id][member.user.id] = {};
        }

        if (!client.data.serverCache?.[guild.id]?.[member.user.id]?.warn_tiers)
        {
            client.data.serverCache[guild.id][member.user.id].warn_tiers = warningTiersMember.filter(t => t <= 0).sort((a, b) =>
            {
                return b - a;
            });
        }

        if (member.permissions.has(client.imports.discord.PermissionFlagsBits['Administrator']))
        {
            return client.qEmbed('Can\'t warn user with administrator privileges!', interaction ?? message);
        }

        if (member.roles.highest.position >= message.member.roles.highest.position)
        {
            return client.qEmbed('You can not warn a member that is equal to or higher than yourself!', interaction ?? message);
        }

        const {
            noAppeal,
            tier: number,
            tiered,
            count: multiplication
        } = parsed;

        const sync = parsed.sync || options.forceSync === true;

        const limit = guild.cn.ab;

        if (multiplication > limit && limit !== 0)
        {
            return client.qEmbed(`Maximum warning duplication for this server is **${limit}**!`, interaction ?? message);
        }

        const warned = await client.module.moderation.warn({
            guild:           message.guild,
            guildDoc:        guild,
            member,
            moderator:       message.author.id,
            moderatorMember: message.member,
            reason:          parsed.reason
                                 ? parsed.reason.replace(/\bdate\b/i, client.utils.formatDate(new Date())).replace(/\blog\b/i, client.utils.formatDate(new Date()))
                                 : 'No reason provided.',
            tier:            number,
            count:           multiplication,
            message
        });

        if (!warned.ok)
        {
            return client.qEmbed(warned.error, interaction ?? message);
        }

        const reason = warned.reason;

        const synced = sync
            ? await moderateAcrossPool(client, guild, 'warn', {
                userId:    member.user.id,
                moderator: message.author.id,
                reason,
                tier:      number,
                count:     multiplication
            })
            : null;

        memberWarnings = await client.module.database.warningsOf(guild.id, member.user.id);

        const maxThreat = await client.module.database.guildMaxWarningTier(guild.id);

        let threat = 0;
        for (const warn of memberWarnings)
        {
            if (warn.tier >= Math.ceil(maxThreat / 2) || (warn.author === client.user.id && warn.tier !== -1))
            {
                threat++;
            }
        }

        let maxUserThreat = 0;
        for (const warn of memberWarnings)
        {
            if (warn.tier > maxUserThreat)
            {
                maxUserThreat = warn.tier;
            }
        }

        let embed = new Discord.EmbedBuilder()
            .setColor(client.data.embedColor)
            .setTitle(`Warned ${member?.nickname ?? member?.displayName ?? member?.user?.username}`)
            .addFields([
                {
                    name:  'User:',
                    value: `**${member}** - **${member?.user?.username}** - **\`${member?.user?.id}\`**`
                },
                {
                    name:  'By:',
                    value: `**${message.member}**`
                },
                {
                    name:  'Reason:',
                    value: `${reason.length > 1
                        ? reason
                        : 'No reason provided.'}`
                },
                tiered
                    ? {
                        name:  'Tier:',
                        value: `Warning tier: **\`(${number}/${maxThreat})\`**`
                    }
                    : null,
                {
                    name:  'Current standing:',
                    value: `Warning count: **\`(${memberWarnings.length})\`**\nContributing to autoban: **\`[${threat}/${limit}]\`**\nHighest threat level: **\`{${maxUserThreat}/${maxThreat}}\`**`
                },

                ...(warned.escalations ?? []).map(step => ({
                    name:  step.ok
                               ? 'Warning ladder:'
                               : 'Warning ladder (failed):',
                    value: step.ok
                               ? `Reaching **${step.n}** ${step.tier === 'any'
                            ? ''
                            : `tier ${step.tier} `}warning(s) means **${step.label.toLowerCase()}**${step.role
                            ? ` - **${step.role}**`
                            : ''}${step.durationMs
                            ? ` for **${client.imports.time(step.durationMs)}**`
                            : ''}.${step.caseNumber
                            ? ` **[Case: #${step.caseNumber}]**`
                            : ''}`
                               : `**${step.label}** was due at **${step.n}**, but it did not apply: ${step.error ?? 'unknown reason'}`
                })),

                synced
                    ? {
                        name:  'Synced:',
                        value: syncReport(synced, 'Warned').replace(/^\n/, '').slice(0, 1024)
                    }
                    : null
            ].filter(f => f !== null))
            .setThumbnail(member.displayAvatarURL({
                dynamic: true,
                size:    4096
            }))
            .setFooter({
                text:    'Event emitted',
                iconURL: client.config.text.links.relaxyImage
            })
            .setTimestamp();

        if (guild.ml.on)
        {
            client.pushModlog(guild.id, 'warning', embed, null);
        }

        const removed = (warned.escalations ?? []).find(step => step.ok && (step.action === 'ban' || step.action === 'kick'));

        if (removed)
        {
            return client.send(interaction
                    ? 1
                    : message.channel,
                `${multiplication > 1
                    ? `The warning was duplicated **${multiplication}** times.\n`
                    : ''}${member} has been ${removed.action === 'ban'
                    ? 'banned'
                    : 'kicked'} - the warning ladder.${removed.caseNumber
                    ? ` **[Case: #${removed.caseNumber}]**`
                    : ''}`,
                [embed]);
        }

        const fallBack = !message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.BanMembers);

        if (limit > 0 && threat >= (limit - 1) && !member.bannable)
        {
            return client.qEmbed('User is close to being banned but Relaxy lacks the `BanMembers` permission!', interaction ?? message);
        }

        if (limit > 0 && threat >= limit && !fallBack)
        {
            if (member.roles.highest.position >= message.guild.members.me.roles.highest.position)
            {
                return client.qEmbed('User exceeded allowed limit, but his role is higher than mine, cannot ban!', interaction ?? message);
            }

            if (!member.bannable)
            {
                return client.qEmbed('User cannot be banned!', interaction ?? message);
            }

            embed.setTitle(`Banned ${member.nickname
                ? `${member.nickname}#${member.user.discriminator}`
                : `${member.user.username}#${member.user.discriminator}`}`);

            const banReason = `${client.utils.formatDate(new Date())} - Exceeding the Relaxy warn limit.\n${memberWarnings.every(warning => warning.reason === memberWarnings[0].reason)
                ? `Reason: ${reason}`
                : ''}`.slice(0, 258);
            const caseNumber = await client.module.database.addCase(message.guild.id, {
                type:     'warn-ban',
                user:     member.user.id,
                mod:      message.author.id,
                reason:   banReason,
                extra:    'Exceeded the warn limit.',
                guildBan: true
            });

            if (!noAppeal)
            {
                await client.utils.sendBanNotice(guild, member.user, {
                    message,
                    reason: banReason,
                    num:    caseNumber
                });
            }

            await member.ban({
                reason: banReason
            });

            const banMessage = `${multiplication > 1
                ? `The warning was duplicated **${multiplication}** times.\n`
                : ''}${member} has been banned. **[Case: #${caseNumber}]**`;

            const censorChannel = guild.cn.c
                ? client.channels.cache.get(guild.cn.c)
                : null;

            if (guild.cn.c && !censorChannel)
            {
                client.save(message.guild.id, {
                    alter: 'cn.c',
                    value: ''
                });
            }
            else if (censorChannel && censorChannel.id !== message.channel?.id)
            {
                client.send(censorChannel, banMessage, [embed]).catch(client.swallow('warning: censor channel report'));
            }

            return client.send(interaction
                ? 1
                : message.channel, banMessage, [embed]);
        }

        return client.send(interaction
                ? 1
                : message.channel,
            multiplication > 1
                ? `The warning was duplicated **${multiplication}** times.`
                : null,
            [embed]);
    }
};
