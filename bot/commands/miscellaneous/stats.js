'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import {
    describeChannel,
    describeGuild
} from '../../../src/Client/Modules/Guilds/GuildLink.js';

const perms = {};
for (const perm of Object.getOwnPropertyNames(Discord.PermissionsBitField.Flags))
{
    perms[perm] = perm;
}
const CHANNEL_LIST_PAGE = 3;

const SECTIONS = [
    {
        label:       'Overview',
        description: 'Server identity, security and assets'
    },
    {
        label:       'Members',
        description: 'Member, bot and presence breakdown'
    },
    {
        label:       'Channels',
        description: 'Channel counts by type'
    },
    {
        label:       'Channel list',
        description: 'Every channel, with a toggle'
    },
    {
        label:       'Roles',
        description: 'Every role on the server'
    },
    {
        label:       'Emojis and stickers',
        description: 'Custom emojis and stickers'
    },
    {
        label:       'Relaxy config',
        description: 'Every Relaxy feature and toggle'
    },
    {
        label:       'Permissions',
        description: 'Relaxy\'s permissions here'
    }
];

const links = async (client, Guild) =>
{
    const lines = [];

    if (Guild.ap?.on && Guild.ap.p)
    {
        const partner = await describeGuild(client, Guild.ap.p);
        const channel = Guild.ap.c
            ? await describeChannel(client, Guild.ap.p, Guild.ap.c)
            : null;

        lines.push(`Ban appeals: **${partner?.name ?? `\`${Guild.ap.p}\``}**${channel
            ? ` **-** **\`#${channel.name}\`**`
            : ' **-** *no channel set*'}.`);
    }
    else
    {
        lines.push('Ban appeals: **NO** *(`=appealchannel`)*.');
    }
    if (Guild.ap?.h?.length)
    {
        const guests = await Promise.all(Guild.ap.h.map(id => describeGuild(client, id)));

        lines.push(`Appeals hosted here: **${guests.map((guest, i) => guest?.name ?? `\`${Guild.ap.h[i]}\``).join('**, **')}**${Guild.ap.tr?.length
            ? ` **-** private threads, ${Guild.ap.tr.map(id => `<@&${id}>`).join(' ')}.`
            : ' **-** one shared channel.'}`);
    }

    if (Guild.sr?.on && Guild.sr.gs?.length)
    {
        const others = await Promise.all(Guild.sr.gs.map(id => describeGuild(client, id)));
        const roles = Guild.sr.r ?? [];

        lines.push(`Shared roles: **${roles.length}** across **${Guild.sr.gs.length + 1}** linked servers **-** **${others.map((other, i) => other?.name ?? Guild.sr.gs[i]).join('**, **')}**${roles.length
            ? `\n${roles.map(role => `**-** ${role.m?.[Guild.id]
                ? `<@&${role.m[Guild.id]}>`
                : `**${role.n}**`} *(${Object.keys(role.m ?? {}).length} servers)*`).join('\n')}`
            : ''}`);
    }
    else
    {
        lines.push('Shared roles: **NO** *(`=syncrole`)*.');
    }

    lines.push(`Ban message: **${Guild.bnm?.on && Guild.bnm.dt
        ? 'YES'
        : 'NO'}** *(\`=banmessage\`)*.`);

    return lines.join('\n').slice(0, 1024);
};

export default {
    name:        'stats',
    aliases:     [
        'guildstats',
        'serverstats'
    ],
    usage:       '=stats',
    description: 'Show an enormous amount of information about the server you\'re on.',

    slash:    new Discord.SlashCommandBuilder(),
    cooldown: 5,

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    async run(client, message, args, Guild, interaction)
    {
        const guild = message.guild;
        const owner = await guild.fetchOwner().catch(() => null);
        const authorId = interaction
            ? interaction.user.id
            : message.author.id;

        let showThreadNCategory = false;
        let page = 0;

        const activeMutes = await client.module.database.getMutes(Guild.id);
        const reactionRoleDoc = await client.module.database.getReactionRoles(Guild.id);

        const achievementChannel = Guild.ach?.c?.length
            ? await client.channels.fetch(Guild.ach.c).catch(() => null)
            : null;

        const bannerURL = guild.bannerURL({ size: 4096 });
        const splashURL = guild.splashURL({ size: 4096 });

        const thumbnail = { url: client.utils.guildIcon(guild) };

        const yn = value => value
            ? '`YES`'
            : '`NO`';
        const onOff = value => value
            ? '**`ON`**'
            : '**`OFF`**';
        const enumName = (object, value) => object?.[value] ?? `${value}`;
        const stamp = date => date
            ? `<t:${Math.floor(date.getTime() / 1000)}:F> (<t:${Math.floor(date.getTime() / 1000)}:R>)`
            : '`Unknown`';

        const splitToEmbed = (base, content) =>
        {
            const description = content.slice(0, 2048) || '`Nothing to show here.`';
            const fields = [];

            if (content.length > 2048)
            {
                const rest = content.slice(2048, 5800);
                let i = 0;

                while (i * 1024 < rest.length && fields.length <= 20)
                {
                    fields.push({
                        name:  'Continuation:',
                        value: rest.slice(i * 1024, (i + 1) * 1024)
                    });

                    i++;
                }
            }

            return {
                ...base,
                description,
                fields
            };
        };

        const baseEmbed = title => ({
            color:     client.data.embedColor,
            title,
            footer:    client.data.footer,
            timestamp: new Date(),
            thumbnail
        });

        const name = client.utils.firstLetterUp(guild.name);

        const channelCache = guild.channels.cache;
        const channelCounts = {
            category:     channelCache.filter(c => c.type === Discord.ChannelType.GuildCategory).size,
            text:         channelCache.filter(c => c.type === Discord.ChannelType.GuildText).size,
            voice:        channelCache.filter(c => c.type === Discord.ChannelType.GuildVoice).size,
            stage:        channelCache.filter(c => c.type === Discord.ChannelType.GuildStageVoice).size,
            announcement: channelCache.filter(c => c.type === Discord.ChannelType.GuildAnnouncement).size,
            forum:        channelCache.filter(c => c.type === Discord.ChannelType.GuildForum).size,
            media:        channelCache.filter(c => c.type === Discord.ChannelType.GuildMedia).size,
            thread:       channelCache.filter(c => c.isThread?.()).size
        };

        const roleCache = guild.roles.cache;
        const roleStats = {
            total:       roleCache.size,
            hoisted:     roleCache.filter(r => r.hoist).size,
            managed:     roleCache.filter(r => r.managed).size,
            colored:     roleCache.filter(r => r.color !== 0).size,
            mentionable: roleCache.filter(r => r.mentionable).size
        };

        const emojiCache = guild.emojis.cache;
        const emojiStats = {
            total:    emojiCache.size,
            animated: emojiCache.filter(e => e.animated).size,
            static:   emojiCache.filter(e => !e.animated).size
        };
        const stickerCount = guild.stickers.cache.size;

        const memberCache = guild.members.cache;
        const bots = memberCache.filter(m => m.user.bot).size;
        const humans = memberCache.size - bots;
        const presence = {
            online: memberCache.filter(m => m.presence?.status === 'online').size,
            idle:   memberCache.filter(m => m.presence?.status === 'idle').size,
            dnd:    memberCache.filter(m => m.presence?.status === 'dnd').size
        };
        const hasPresence = (presence.online + presence.idle + presence.dnd) > 0;

        const builders = [

            async () =>
            {
                const features = guild.features.length
                    ? guild.features.map(f => `\`${f}\``).join(', ')
                    : '`None`';

                const iconURL = guild.iconURL({ size: 4096 });

                const assets = [
                    iconURL
                        ? `[Icon](${iconURL})`
                        : null,
                    bannerURL
                        ? `[Banner](${bannerURL})`
                        : null,
                    splashURL
                        ? `[Invite splash](${splashURL})`
                        : null
                ].filter(Boolean).join(' - ') || '`None`';

                return {
                    ...baseEmbed(`Statistics for **${name}**`),
                    description: guild.description
                                     ? `*${guild.description}*`
                                     : null,
                    image:       bannerURL
                                     ? { url: bannerURL }
                                     : null,
                    fields:      [
                        {
                            name:  'Identity',
                            value: `**ID:** \`${guild.id}\`\n` + `**Owner:** ${owner
                                ? `${owner} \`${client.utils.tag(owner.user)}\``
                                : `\`${guild.ownerId}\``}\n` + `**Owner ID:** \`${guild.ownerId}\`\n` + `**Vanity:** ${guild.vanityURLCode
                                ? `\`discord.gg/${guild.vanityURLCode}\``
                                : '`None`'}\n` + `**Locale:** \`${guild.preferredLocale}\``
                        },
                        {
                            name:  'Age',
                            value: `**Created:** ${stamp(guild.createdAt)}\n` + `**Exists for:** \`${client.imports.time(guild.createdAt
                                ? (new Date() - guild.createdAt)
                                : 0)}\``
                        },
                        {
                            name:  'Size and boosts',
                            value: `**Members:** \`${guild.memberCount}\`\n` + `**Boost tier:** \`${enumName(Discord.GuildPremiumTier, guild.premiumTier)}\`\n` + `**Boosts:** **\`${guild.premiumSubscriptionCount ?? 0}\`**\n` + `**Max members:** \`${guild.maximumMembers ?? 'N/A'}\`\n` + `**Max video users:** \`${guild.maxVideoChannelUsers ?? 'N/A'}\``
                        },
                        {
                            name:  'Security',
                            value: `**Verification:** \`${enumName(Discord.GuildVerificationLevel, guild.verificationLevel)}\`\n` + `**Content filter:** \`${enumName(Discord.GuildExplicitContentFilter, guild.explicitContentFilter)}\`\n` + `**NSFW level:** \`${enumName(Discord.GuildNSFWLevel, guild.nsfwLevel)}\`\n` + `**2FA for mods:** \`${enumName(Discord.GuildMFALevel, guild.mfaLevel)}\`\n` + `**Notifications:** \`${enumName(Discord.GuildDefaultMessageNotifications, guild.defaultMessageNotifications)}\`\n` + `**Verified:** ${yn(guild.verified)} - **Partnered:** ${yn(guild.partnered)}`
                        },
                        {
                            name:  'System channels',
                            value: `**System:** ${guild.systemChannel ?? '`None`'}\n` + `**Rules:** ${guild.rulesChannel ?? '`None`'}\n` + `**Mod updates:** ${guild.publicUpdatesChannel ?? '`None`'}\n` + `**AFK:** ${guild.afkChannel
                                ? `${guild.afkChannel} \`(${client.imports.time(guild.afkTimeout * 1000)})\``
                                : '`Disabled`'}`
                        },
                        {
                            name:  'Discord features',
                            value: features.length > 1024
                                       ? `${features.slice(0, 1020)}...`
                                       : features
                        },
                        {
                            name:  'Assets',
                            value: assets
                        }
                    ]
                };
            },

            async () => ({
                ...baseEmbed(`Members of **${name}**`),
                fields: [
                    {
                        name:  'Totals',
                        value: `**Total members:** \`${guild.memberCount}\`\n` + `**Humans (cached):** \`${humans}\`\n` + `**Bots (cached):** \`${bots}\`\n` + `**Cached in memory:** \`${memberCache.size}\``
                    },
                    {
                        name:  'Presence (cached)',
                        value: hasPresence
                                   ? `**Online:** \`${presence.online}\` - **Idle:** \`${presence.idle}\` - **Do not disturb:** \`${presence.dnd}\``
                                   : '`Presence data unavailable (cached / no presence intent).`'
                    },
                    {
                        name:  'Boosting',
                        value: `**Boosters:** \`${guild.premiumSubscriptionCount ?? 0}\`\n` + `**Boost tier:** \`${enumName(Discord.GuildPremiumTier, guild.premiumTier)}\``
                    },
                    {
                        name:  'Roles',
                        value: `**Total:** \`${roleStats.total}\` - **Hoisted:** \`${roleStats.hoisted}\`\n` + `**Managed:** \`${roleStats.managed}\` - **Coloured:** \`${roleStats.colored}\``
                    }
                ]
            }),

            async () => ({
                ...baseEmbed(`Channels of **${name}**`),
                description: `**Total channels:** \`${channelCache.size}\``,
                fields:      [
                    {
                        name:  'By type',
                        value: `**Categories:** \`${channelCounts.category}\`\n` + `**Text:** \`${channelCounts.text}\`\n` + `**Voice:** \`${channelCounts.voice}\`\n` + `**Stage:** \`${channelCounts.stage}\``
                    },
                    {
                        name:  '​',
                        value: `**Announcement:** \`${channelCounts.announcement}\`\n` + `**Forum:** \`${channelCounts.forum}\`\n` + `**Media:** \`${channelCounts.media}\`\n` + `**Threads:** \`${channelCounts.thread}\``
                    }
                ]
            }),

            async () =>
            {
                const list = channelCache.sorted().map(c =>
                {
                    if (showThreadNCategory)
                    {
                        return c;
                    }

                    return [
                        Discord.ChannelType.PublicThread,
                        Discord.ChannelType.PrivateThread,
                        Discord.ChannelType.AnnouncementThread,
                        Discord.ChannelType.GuildCategory
                    ].includes(c.type)
                        ? null
                        : c;
                }).filter(Boolean).join(', ');

                return splitToEmbed(baseEmbed(`Channel list of **${name}**`),
                    `${showThreadNCategory
                        ? '*Showing threads and categories.*\n\n'
                        : '*Threads and categories hidden. Use the toggle below.*\n\n'}${list}`);
            },

            async () =>
            {
                const list = roleCache.sorted((a, b) => b.position - a.position).map(r => r).join(', ');

                return splitToEmbed(baseEmbed(`Roles of **${name}**`), `**\`${roleStats.total}\`** roles - ` + `\`${roleStats.hoisted}\` hoisted, \`${roleStats.managed}\` managed, \`${roleStats.mentionable}\` mentionable.\n\n${list}`);
            },

            async () =>
            {
                const emojiList = emojiCache.map(e => e.toString()).join(' ');

                return splitToEmbed(baseEmbed(`Emojis and stickers of **${name}**`), `**Emojis:** \`${emojiStats.total}\` (\`${emojiStats.static}\` static, \`${emojiStats.animated}\` animated)\n` + `**Stickers:** \`${stickerCount}\`\n\n${emojiList || '`This server has no custom emojis.`'}`);
            },

            async () => ({
                ...baseEmbed(`Relaxy configuration for **${name}**`),
                fields: [
                    {
                        name:  'General',
                        value: `**Joined:** \`${client.imports.time(guild.joinedAt
                            ? (new Date() - guild.joinedAt)
                            : 0)} ago\`\n` + `**Prefixes:** ${Guild.px.map(p => `**\`${p}\`**`).join(', ')}\n` + `**Messages seen:** \`${Guild.d.msg}\`\n` + `**Commands used:** \`${Guild.d.cg}\`\n` + `**Cases logged:** \`${Guild.d.ca ?? 0}\`\n` + `**Lockdown:** ${onOff(Guild.lk)}`
                    },
                    {
                        name:  'Shard and gateway',
                        value: `**Shard:** \`${guild.shardId}\` / \`${client.data.shardCount}\`\n` + `**WS ping:** \`${client.ws.ping}ms\``
                    },
                    {
                        name:  'Moderation',
                        value: `**Censoring:** ${onOff(Guild.cn.on)} ` + `${Guild.cn.on
                            ? `\`(rename: ${Guild.cn.rn
                                ? 'yes'
                                : 'no'}, list: ${Guild.cn.li.length})\``
                            : ''}\n` + `**Autoban:** ${Guild.cn.ab === 0
                            ? '**`OFF`**'
                            : `**\`threshold ${Guild.cn.ab}\`**`}\n` + `**Mod log:** ${onOff(Guild.ml.on)} \`(lowspam: ${Guild.ml.ls
                            ? 'on'
                            : 'off'})\`\n` + `**Raid protection:** ${onOff(Guild.rd.on)} ` + `${Guild.rd.on
                            ? `\`(ban: ${Guild.rd.bn
                                ? 'yes'
                                : 'no'}, threshold: ${Guild.rd.th})\``
                            : ''}\n` + `**Muted:** \`${activeMutes.length}\` - **Exempt:** \`${Guild.mbr.ex.length}\` - **Elevated:** \`${Guild.mbr.el.length}\``
                    },
                    {
                        name:  'Channel automation',
                        value: `**Clearing channels:** \`${Guild.ch.t.cl.length}\`\n` + `**Restricted channels:** \`${Guild.ch.t.rs.length}\`\n` + `**Private voice:** \`${Guild.ch.v.pv.length}\`\n` + `**Forums:** ${onOff(Guild.fo.on)} \`(${Guild.fo.cs.length})\``
                    },
                    {
                        name:  'Engagement',
                        value: `**Leveling:** ${onOff(Guild.lv.on)} ${Guild.lv.on
                            ? `\`(type ${Guild.lv.t})\``
                            : ''}\n` + `**Welcome channel:** ${onOff(Guild.wc.on)} ${Guild.wc.on
                            ? `\`(type ${Guild.wc.t})\``
                            : ''}\n` + `**DM greetings:** ${onOff(Guild.dg.on)}\n` + `**Reaction roles:** \`${reactionRoleDoc.e.length}\`\n` + `**Heartboard:** ${onOff(Guild.hb.on)} ${Guild.hb.on
                            ? `\`(${Guild.hb.cs.length})\``
                            : ''}\n` + `**Ticketing:** ${onOff(Guild.tk.on)} \`(${Object.keys(Guild.tk.sy ?? {}).length} systems)\`\n` + `**Custom boost msg:** ${onOff(Guild.cb.on)} - **Boost msg:** ${onOff(Guild.bm.on)}\n` + `**Achievements:** ${onOff(Guild.ach.on)} - ${achievementChannel ?? '`message\'s channel`'}`
                    },
                    {
                        name:  'Music options',
                        value: `**Leave on stop:** ${yn(Guild.mo.ls)}\n` + `**Leave on end:** ${yn(Guild.mo.le)}\n` + `**Initial volume:** \`${Guild.mo.iv}\`\n` + `**Buffering timeout:** \`${Guild.mo.bt}\``
                    },
                    {
                        name:  'Commands',
                        value: `**Disabled:** ${Guild.cmd.dis.length
                            ? Guild.cmd.dis.map(c => `\`${c}\``).join(', ')
                            : '`None`'}\n` + `**Custom permissions:** \`${Object.keys(Guild.cmd.cp ?? {}).length}\``
                    },
                    {
                        name:  'Linked servers',
                        value: await links(client, Guild)
                    }
                ]
            }),

            async () =>
            {
                const permissions = Object.entries(guild.members.me.permissions.serialize())
                                          .filter(([, has]) => has)
                                          .map(([perm]) => `\`${perms[perm]}\``);

                const total = Object.keys(Discord.PermissionFlagsBits).length;

                const value = permissions.length === total
                    ? '**`Has every permission [Administrator]`**'
                    : `${permissions.join(', ')}.`;

                return {
                    ...baseEmbed(`Relaxy's permissions in **${name}**`),
                    description: `Relaxy holds **\`${permissions.length}\`** / \`${total}\` permissions here.`,
                    fields:      [
                        {
                            name:  'Granted permissions',
                            value: value.length > 1024
                                       ? `${value.slice(0, 1020)}...`
                                       : value
                        }
                    ]
                };
            }
        ];

        const buildComponents = current =>
        {
            const jump = new Discord.StringSelectMenuBuilder()
                .setCustomId('stats_jump')
                .setPlaceholder('Jump to a section...')
                .addOptions(SECTIONS.map((section, index) => ({
                    label:       section.label,
                    description: section.description,
                    value:       `${index}`,
                    default:     index === current
                })));

            const nav = new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder()
                .setCustomId('stats_first').setLabel('First')
                .setStyle(Discord.ButtonStyle.Secondary).setDisabled(current === 0), new Discord.ButtonBuilder()
                .setCustomId('stats_prev').setLabel('Back')
                .setStyle(Discord.ButtonStyle.Primary).setDisabled(current === 0), new Discord.ButtonBuilder()
                .setCustomId('stats_indicator').setLabel(`${current + 1} / ${SECTIONS.length}`)
                .setStyle(Discord.ButtonStyle.Secondary).setDisabled(true), new Discord.ButtonBuilder()
                .setCustomId('stats_next').setLabel('Next')
                .setStyle(Discord.ButtonStyle.Primary).setDisabled(current === SECTIONS.length - 1), new Discord.ButtonBuilder()
                .setCustomId('stats_last').setLabel('Last')
                .setStyle(Discord.ButtonStyle.Secondary).setDisabled(current === SECTIONS.length - 1));

            const extra = new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder()
                .setCustomId('stats_toggle')
                .setLabel(showThreadNCategory
                    ? 'Hide threads and categories'
                    : 'Show threads and categories')
                .setStyle(Discord.ButtonStyle.Success)
                .setDisabled(current !== CHANNEL_LIST_PAGE), new Discord.ButtonBuilder()
                .setCustomId('stats_close').setLabel('Close')
                .setStyle(Discord.ButtonStyle.Danger));

            return [
                new Discord.ActionRowBuilder().addComponents(jump),
                nav,
                extra
            ];
        };

        const attachCollector = m =>
        {
            const collector = m.createMessageComponentCollector({
                filter: i => i.customId.startsWith('stats_'),
                time:   180 * 1000
            });

            collector.on('collect', async i =>
            {
                if (i.user.id !== authorId)
                {
                    return i.reply({
                        content:   `These controls belong to <@${authorId}>. Run \`=stats\` yourself to get your own.`,
                        ephemeral: true
                    }).catch(client.swallow('stats: foreign control'));
                }

                if (i.customId === 'stats_close')
                {
                    collector.stop('closed');

                    return i.deferUpdate().catch(client.swallow('stats: close'));
                }

                await i.deferUpdate().catch(client.swallow('stats: defer'));

                switch (i.customId)
                {
                    case 'stats_first':
                        page = 0;
                        break;
                    case 'stats_prev':
                        page = Math.max(0, page - 1);
                        break;
                    case 'stats_next':
                        page = Math.min(SECTIONS.length - 1, page + 1);
                        break;
                    case 'stats_last':
                        page = SECTIONS.length - 1;
                        break;
                    case 'stats_jump':
                        page = Math.min(SECTIONS.length - 1, Math.max(0, parseInt(i.values[0], 10) || 0));
                        break;
                    case 'stats_toggle':
                        showThreadNCategory = !showThreadNCategory;
                        break;
                    default:
                        return;
                }

                try
                {
                    return await client.edit(m, null, [await builders[page]()], [], buildComponents(page));
                }
                catch (error)
                {
                    client.data.errors++;
                    client.log('ERROR', `stats: page ${page} (${SECTIONS[page]?.label}) failed to render:`, error);

                    return i.followUp({
                        content:   `The **${SECTIONS[page]?.label ?? 'requested'}** page could not be built. This has been logged.`,
                        ephemeral: true
                    }).catch(client.swallow('stats: page failure notice'));
                }
            });

            collector.on('end', async () =>
            {
                return client.edit(m, null, [await builders[page]()], [], []).catch(client.swallow('stats: end'));
            });
        };

        if (!interaction)
        {
            const sent = await client.send(message.channel, null, [await builders[0]()], null, null, buildComponents(0));

            if (sent)
            {
                attachCollector(sent);
            }

            return Infinity;
        }

        const reply = await interaction.editReply({
            embeds:     [await builders[0]()],
            components: buildComponents(0)
        });

        if (reply)
        {
            attachCollector(reply);
        }

        return Infinity;
    }
};
