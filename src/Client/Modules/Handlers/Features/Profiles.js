'use strict';

import Discord  from 'discord.js';
import Mongoose from 'mongoose';
import Relaxy   from '../../../Relaxy.js';
import { CDN }  from '../../../../Assets/CDN.js';
import {
    shopData,
    achievements
}               from '../../../../Core/DataTable.js';

const ACHIEVEMENT_SIZE = 11;

export default class ProfileManager
{

    constructor(client)
    {
        this.client = client;
    }

    async getShopEmbed(message)
    {
        const user = await this.client.module.database.User(message.author.id);

        const backgrounds = Object.values(shopData.itemNames[1]).map((background, i) =>
        {
            return `**\`${i + 1}\` - ${background} [\`${shopData.itemPrices[1][i + 1][1]}\`]**`;
        }).join('\n');

        const titles = Object.values(shopData.itemNames[2]).map((title, i) =>
        {
            return `\`${i + 1}\` **${title.replace('Title: ', '')} [\`${shopData.itemPrices[2][i + 1][1]}\`]**`;
        }).join('\n');

        return [
            new Discord.EmbedBuilder().setColor('#FF69B4')
                                      .setTitle('Relaxy! Shop:')
                                      .addFields([
                                          {
                                              name:  '[1] - Profile backgrounds:',
                                              value: backgrounds
                                          },
                                          {
                                              name:  '[2] - Titles:',
                                              value: titles
                                          }
                                      ])
                                      .setThumbnail(CDN.profile.shop)
                                      .setDescription(`Your money: **${user.m > 10000
                                          ? `${user.m > 1000000
                                              ? `\`${user.m}\`    🤑`
                                              : `\`${user.m}\`    💰`}`
                                          : `\`${user.m}\`    💵`}**\n**[color]** Change status outline color on profile level image: **\`400\` 💰**`)
        ];
    }

    getRankBG(number)
    {
        return new Discord.AttachmentBuilder(CDN.background(number), { name: 'bg.png' });
    }

    _achievementEmbed(message, type, user, xpGain, moneyGain, guild)
    {
        if (!message.member)
        {
            return;
        }

        let achievements_user_number = 0;
        let first_achievement_flag = false;

        for (const [key = null, value] of Object.entries(user.ach))
        {
            if (value === true)
            {
                achievements_user_number++;
            }
        }

        if (achievements_user_number === 1)
        {
            first_achievement_flag = true;
        }

        type = achievements[type];

        this.client.save(guild.id, {
            alter: 'ach.n',
            value: ++guild.ach.n
        });

        if (!guild.ach.on)
        {
            return;
        }

        if (guild.ach?.c)
        {
            return this.client.send(this.client.channels.cache.get(guild.ach.c), null, [
                new Discord.EmbedBuilder().setDescription(`Congratulations ${message.member}!\n${first_achievement_flag
                    ? `**You just got your first achievement:** ${type}!`
                    : `**You got another achievement:** ${type}!`}\n**Progress: [${this.client.imports.progressbar.splitBar(ACHIEVEMENT_SIZE, achievements_user_number, ACHIEVEMENT_SIZE, '▬', '⭐')[0]}]  \`${achievements_user_number}\` / \`${ACHIEVEMENT_SIZE}\` **\nMoney gained: **\`${moneyGain}\` 💵**  Experience gained: **\`${xpGain}\` 🔆**`).setThumbnail(CDN.profile.achievement).setColor(this.client.data.embedColor)
            ]);
        }
        return this.client.send(message.channel, null, [
            new Discord.EmbedBuilder().setDescription(`Congratulations ${message.member}!\n${first_achievement_flag
                ? `**You just got your first achievement:** ${type}!`
                : `**You got another achievement:** ${type}!`}\n**Progress: [${this.client.imports.progressbar.splitBar(ACHIEVEMENT_SIZE, achievements_user_number, ACHIEVEMENT_SIZE, '▬', '⭐')[0]}]  \`${achievements_user_number}\` / \`${ACHIEVEMENT_SIZE}\` **\nMoney gained: **\`${moneyGain}\` 💵**  Experience gained: **\`${xpGain}\` 🔆**`).setThumbnail(CDN.profile.achievement).setColor(this.client.data.embedColor)
        ]);
    }

    async Achievement(message, type, guild)
    {
        const serialized = message?.channel?.permissionsFor(message.guild.members.me).serialize();

        if ((!message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.EmbedLinks) || !message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.AttachFiles)) && (!serialized['AttachFiles'] || !serialized['EmbedLinks']))
        {
            return;
        }

        const user = await this.client.module.database.User(message.author.id);

        try
        {
            if (user.ach[type])
            {
                return;
            }
        }
        catch (e)
        {
            return this.client.log('ERROR', e);
        }

        let [xpGain, moneyGain] = [
            0,
            0
        ];
        switch (type)
        {
            case 'playedtrack':
                [
                    xpGain,
                    moneyGain
                ] = [
                    300,
                    50
                ];
                break;
            case 'playedplaylist':
                [
                    xpGain,
                    moneyGain
                ] = [
                    700,
                    50
                ];
                break;
            case 'setwelcome':
                [
                    xpGain,
                    moneyGain
                ] = [
                    4000,
                    150
                ];
                break;
            case 'saved':
            case 'fetched':
                [
                    xpGain,
                    moneyGain
                ] = [
                    2000,
                    70
                ];
                break;
            case 'madepoll':
                [
                    xpGain,
                    moneyGain
                ] = [
                    2000,
                    100
                ];
                break;
            case 'got_heart':
                [
                    xpGain,
                    moneyGain
                ] = [
                    7000,
                    300
                ];
                break;
            case 'madeheartboard':
                [
                    xpGain,
                    moneyGain
                ] = [
                    2000,
                    100
                ];
                break;
            case 'lockeddown':
                [
                    xpGain,
                    moneyGain
                ] = [
                    1000,
                    90
                ];
                break;
            case 'image':
                [
                    xpGain,
                    moneyGain
                ] = [
                    500,
                    60
                ];
                break;
            case 'lvldup':
                [
                    xpGain,
                    moneyGain
                ] = [
                    300,
                    150
                ];
                break;
        }

        user.xp += xpGain;
        user.m += moneyGain;
        user.la = type;
        user.ach[type] = true;

        this.client.saveProfile(message.author.id, {
            alter: 'xp',
            value: user.xp
        }, {
            alter: 'm',
            value: user.m
        }, {
            alter: 'la',
            value: user.la
        }, {
            alter: `ach.${type}`,
            value: user.ach[type]
        });

        return this._achievementEmbed(message, type, user, xpGain, moneyGain, guild);
    }

    getAchievement(string)
    {
        return achievements[string]
            ? `\`${achievements[string]}\``
            : '';
    }

    _calculateGuildRank(guildMembers, member)
    {
        const ranked = this.client.utils.rankedBy(guildMembers, 'lvl', 'xp');
        const at = ranked.findIndex(row => row.id === member.id);

        return at === -1
            ? ranked.length + 1
            : at + 1;
    }

    async _calculateRarestAchievement(User)
    {
        const achievements = Object.keys(User.ach);
        const userAchievements = achievements.filter(key => User.ach[key]);

        if (userAchievements.length === 0)
        {
            return [
                null,
                0
            ];
        }

        const globalCounts = await this.client.module.database.aggregateModelData('Profile', [
            {
                $project: {
                    'achievements': {
                        $objectToArray: '$ach'
                    }
                }
            },
            { $unwind: '$achievements' },
            {
                $match: {
                    'achievements.v': true
                }
            },
            {
                $group: {
                    _id:   '$achievements.k',
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    achievement: '$_id',
                    count:       1,
                    _id:         0
                }
            }
        ]);

        const globalMap = new Map(globalCounts.map(({
            achievement,
            count
        }) => [
            achievement,
            count
        ]));

        let rarest = null;
        let minCount = Infinity;

        for (const key of userAchievements)
        {
            const count = globalMap.get(key) ?? 0;

            if (count < minCount)
            {
                rarest = key;
                minCount = count;
            }
        }

        return [
            rarest,
            userAchievements.length
        ];
    }

    async ProcessTrade(message, args)
    {
        let cachedMember = await this.client.utils.member(message, args, 0, { cut: true });

        if (!cachedMember)
        {
            return this.client.qEmbed('Specified user doesn\'t exist on this server!', message);
        }

        cachedMember = cachedMember.user;

        if (cachedMember.id === message.author.id)
        {
            return this.client.qEmbed('Cannot trade with yourself!', message);
        }

        if (cachedMember.bot)
        {
            return this.client.qEmbed('Cannot trade with bots!', message);
        }

        let user_2 = await this.client.module.database.User(cachedMember.id);
        let user_1 = await this.client.module.database.User(message.author.id);

        if (user_1.to)
        {
            return this.client.qEmbed('You have opted out of trading. Run `=tradeout` to opt back in.', message);
        }

        if (user_2.to)
        {
            return this.client.qEmbed(`**${this.client.utils.norm(cachedMember.username)}** has opted out of trading.`, message);
        }

        let item_1 = args[0];
        let item_2 = args[1];

        if (!item_1 || !item_2)
        {
            return this.client.qEmbed('One of the items needed for the trade not mentioned!', message);
        }

        let moneyFlag1 = false;
        let moneyFlag2 = false;

        let money_1 = 0;
        let money_2 = 0;

        if (item_1.toLowerCase().includes('money'))
        {

            moneyFlag1 = true;
            money_1 = Number(this.client.utils.nums(item_1));

            if (!money_1)
            {
                return this.client.qEmbed('No money provided in the first argument!', message);
            }
        }

        if (item_2.toLowerCase().includes('money'))
        {

            moneyFlag2 = true;
            money_2 = Number(this.client.utils.nums(item_2));

            if (!money_2)
            {
                return this.client.qEmbed('No money provided in the second argument!', message);
            }
        }

        item_1 = this.client.utils.nums(item_1) - 1;
        item_2 = this.client.utils.nums(item_2) - 1;

        if (moneyFlag1)
        {
            if (user_1.m < money_1)
            {
                return this.client.qEmbed('You don\'t have enough money that you specified!', message);
            }

        }
        else if (!user_1.inv[item_1])
        {
            return this.client.qEmbed('There\'s no item with that ID in your inventory!', message);
        }

        if (moneyFlag2)
        {
            if (user_2.m < money_2)
            {
                return this.client.qEmbed('The specified user doesn\'t have the amount of money you specified!', message);
            }

        }
        else if (!user_2.inv[item_2])
        {
            return this.client.qEmbed('There\'s no item with that ID in that user\'s inventory!', message);
        }

        const string_1 = moneyFlag1
            ? null
            : user_1.inv[item_1];
        const string_2 = moneyFlag2
            ? null
            : user_2.inv[item_2];

        const describeItem = itemString =>
        {
            const props = itemString.split('.');

            switch (props[props.length - 2])
            {
                case 'sclr':
                    return `🎨 Status colour **\`${props[0].toLowerCase() === 'null'
                        ? 'Default'
                        : props[0].toUpperCase()}\`**`;
                case 'bg':
                    return `🖼️ Background **${(shopData.backgroundNames[props[0]] ?? props[0]).split('_')[0]}**`;
                case 't':
                    return `🏷️ Title \`${props[0]}\``;
                default:
                    return `📦 \`${itemString}\``;
            }
        };

        const sideOne = moneyFlag1
            ? `💵 **${money_1}** money`
            : describeItem(string_1);
        const sideTwo = moneyFlag2
            ? `💵 **${money_2}** money`
            : describeItem(string_2);

        const EXPIRY_MS = 120 * 1000;

        const offerEmbed = {
            color:       this.client.data.embedColor,
            author:      {
                name:     'Trade request',
                icon_url: this.client.cdn.profile.mail
            },
            description: `**${this.client.utils.tag(message.author)}** wants to trade with ${cachedMember}.\n\n` + `**${message.author.username} gives**\n${sideOne}\n\n` + `**${cachedMember.username} gives**\n${sideTwo}\n\n` + `${cachedMember}, do you accept? Only you can accept; either of you can decline.\n*Expires in ${this.client.imports.time(EXPIRY_MS)}.*`,
            footer:      this.client.data.footer,
            timestamp:   new Date().toISOString()
        };

        const controls = enabled => [
            new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder()
                .setCustomId('tradeui_accept')
                .setLabel('Accept')
                .setEmoji('✅')
                .setStyle(Discord.ButtonStyle.Success)
                .setDisabled(!enabled), new Discord.ButtonBuilder()
                .setCustomId('tradeui_decline')
                .setLabel('Decline')
                .setEmoji('❌')
                .setStyle(Discord.ButtonStyle.Danger)
                .setDisabled(!enabled))
        ];

        const tradeMessage = await this.client.send(message.channel, `${cachedMember}`, [offerEmbed], [], [], controls(true)).catch(() => null);

        if (!tradeMessage)
        {
            return this.client.qEmbed('Something went wrong, aborting trade!', message);
        }

        const finish = (colour, text) => this.client.edit(tradeMessage, null, [
            {
                color:       colour,
                description: text,
                footer:      this.client.data.footer
            }
        ], [], controls(false)).catch(this.client.swallow('Profiles: controls'));

        const collector = tradeMessage.createMessageComponentCollector({
            filter: pressed => pressed.user.id === cachedMember.id || pressed.user.id === message.author.id,
            time:   EXPIRY_MS
        });

        let resolved = false;

        collector.on('collect', async pressed =>
        {
            if (pressed.customId === 'tradeui_decline')
            {
                resolved = true;
                collector.stop('declined');

                const who = pressed.user.id === message.author.id
                    ? message.author.tag
                    : this.client.utils.tag(cachedMember);

                return pressed.update({
                    content:    null,
                    embeds:     [
                        {
                            color:       this.client.data.embedColor,
                            description: `**${who}** declined the trade.`,
                            footer:      this.client.data.footer
                        }
                    ],
                    components: controls(false)
                }).catch(this.client.swallow('Profiles: controls'));
            }

            if (pressed.user.id !== cachedMember.id)
            {
                return pressed.reply({
                    content: 'Only the person the trade was offered to can accept it.',
                    flags:   Discord.MessageFlags.Ephemeral
                }).catch(this.client.swallow('Profiles: reply'));
            }

            const fresh_1 = await this.client.module.database.User(message.author.id);
            const fresh_2 = await this.client.module.database.User(cachedMember.id);

            const index_1 = moneyFlag1
                ? -1
                : fresh_1.inv.indexOf(string_1);
            const index_2 = moneyFlag2
                ? -1
                : fresh_2.inv.indexOf(string_2);

            const problem = (moneyFlag1 && fresh_1.m < money_1)
                ? `${message.author.username} no longer has enough money.`
                : (moneyFlag2 && fresh_2.m < money_2)
                    ? `${cachedMember.username} no longer has enough money.`
                    : (!moneyFlag1 && index_1 === -1)
                        ? `${message.author.username} no longer has that item.`
                        : (!moneyFlag2 && index_2 === -1)
                            ? `${cachedMember.username} no longer has that item.`
                            : null;

            if (problem)
            {
                resolved = true;
                collector.stop('invalid');

                return pressed.update({
                    content:    null,
                    embeds:     [
                        {
                            color:       16711680,
                            description: `Trade cancelled - ${problem}`,
                            footer:      this.client.data.footer
                        }
                    ],
                    components: controls(false)
                }).catch(this.client.swallow('Profiles: controls'));
            }

            if (moneyFlag1)
            {
                fresh_1.m -= money_1;
                fresh_2.m += money_1;
            }
            else
            {
                fresh_2.inv.push(string_1);
                fresh_1.inv.splice(index_1, 1);
            }

            if (moneyFlag2)
            {
                fresh_2.m -= money_2;
                fresh_1.m += money_2;
            }
            else
            {
                fresh_1.inv.push(string_2);
                fresh_2.inv.splice(index_2, 1);
            }

            this.client.saveProfile(fresh_1.id, {
                alter: 'm',
                value: fresh_1.m
            }, {
                alter: 'inv',
                value: fresh_1.inv
            });
            this.client.saveProfile(fresh_2.id, {
                alter: 'm',
                value: fresh_2.m
            }, {
                alter: 'inv',
                value: fresh_2.inv
            });

            resolved = true;
            collector.stop('accepted');

            await pressed.update({
                content:    null,
                embeds:     [
                    {
                        color:       this.client.data.embedColor,
                        author:      {
                            name:     'Trade complete!',
                            icon_url: this.client.cdn.profile.paymentComplete
                        },
                        description: `**${message.author.username}** ⇄ **${cachedMember.username}**\n\n${message.author.username} gave ${sideOne}\n${cachedMember.username} gave ${sideTwo}`,
                        footer:      this.client.data.footer,
                        timestamp:   new Date().toISOString()
                    }
                ],
                components: controls(false)
            }).catch(this.client.swallow('Profiles: controls'));

            this.client.send(cachedMember, null, [
                {
                    color:       this.client.data.embedColor,
                    description: `Your trade with **${this.client.utils.tag(message.author)}** went through - check \`=inventory\`.`
                }
            ]).catch(this.client.swallow('Profiles: tag'));
            this.client.send(message.author, null, [
                {
                    color:       this.client.data.embedColor,
                    description: `Your trade with **${this.client.utils.tag(cachedMember)}** went through - check \`=inventory\`.`
                }
            ]).catch(this.client.swallow('Profiles: tag'));
        });

        collector.on('end', () =>
        {
            if (!resolved)
            {
                finish(this.client.data.embedColor, '**Trade expired.** No response in time.');
            }
        });
    }

    async getInventoryEmbed(message, User, user)
    {
        message.author = User ?? message.author;

        let titles = '';
        let backgrounds = '';
        let color = '';

        let embed = new Discord.EmbedBuilder()
            .setTimestamp()
            .setColor(this.client.data.embedColor)
            .setTitle(this.client.utils.tag(message.author))
            .setThumbnail(message.author.displayAvatarURL({
                dynamic: true,
                size:    4096
            }))
            .setFooter(this.client.data.footer)
            .setAuthor({
                name:    'Inventory of:',
                iconURL: CDN.spinner
            });

        for (let i = 0; i < user.inv.length; i++)
        {
            const props = user.inv[i].split('.');
            const type = props[props.length - 2];
            const used = props[props.length - 1] === 'u';

            switch (type)
            {
                case 'sclr':
                    if (used)
                    {
                        color = `**\`${i + 1}:\`** used color: **\`${props[0].toLowerCase() === 'null'
                            ? 'Default status color'
                            : props[0].toUpperCase()}\`**`;
                    }

                    break;
                case 'bg':
                    backgrounds += `**\`${i + 1}:\`** **${shopData.backgroundNames[props[0]]}**\n${used
                        ? '\`     ⬑ currently used.\`\n'
                        : ''}`;
                    break;
                case 't':
                    titles += `**\`${i + 1}:\`** \`\`\`${shopData.profileTitles[props[0]]}\n${props[0]}\n\`\`\`\`${used
                        ? '     ⬑ currently used.\`\n'
                        : ''}`;
                    break;
            }
        }

        embed.addFields([
            color
                ? {
                    name:  'Color used:',
                    value: color
                }
                : null,
            backgrounds
                ? {
                    name:  'Backgrounds:',
                    value: backgrounds
                }
                : null,
            titles
                ? {
                    name:  'Titles:',
                    value: titles
                }
                : null
        ].filter(item => item !== null));

        if (!color && !backgrounds && !titles)
        {
            embed = new Discord.EmbedBuilder()
                .setColor(this.client.data.embedColor)
                .setDescription('**There are no items in this inventory!**');
        }

        return embed;
    }

    async getProfileEmbed(message, u)
    {
        const user = u ?? message.author;

        if (user.bot && user.id !== this.client.user.id)
        {
            return new Discord.EmbedBuilder().setColor(this.client.data.embedColor).setDescription('Bots don\'t have profiles!');
        }

        const User = await this.client.module.database.User(user.id);
        const god_text = User.inv.find(t => t.endsWith('.t.u')) || null;
        const [actual_title, color, special_title_addition] = god_text
            ? god_text.split('.')
            : [];

        const nxtLvl = this.client.utils.nextLevel(User.lvl);
        const result = await this.client.utils.calculateGlobalRank(message, User);

        let rank = new this.client.cards.Rank()
            .setAvatar(user.displayAvatarURL({
                extension: 'png',
                size:      4096
            }))
            .setCurrentXP(User.xp)
            .setRequiredXP(nxtLvl)
            .setLevel(User.lvl + 1)
            .setLevelColor('#FF69B4')
            .setRankColor('#FF69B4')

            .setProgressBar('#FF69B4', 'COLOR')
            .setDisplayName(this.client.utils.norm(user.displayName ?? user.username))
            .setUsername(this.client.utils.norm(user.username))
            .setDiscriminator(this.client.utils.tag(user).match(/#\d{1,4}/g)?.[0].replace('#', ''))
            .setRank(result, result, true);

        let getBg = this.decodeProfileBackgroundStringArray(User.inv);

        if (getBg !== -1)
        {
            rank.setBackground('IMAGE', CDN.background(getBg[0][0][0]));
        }

        let getStatusColor = this.decodeProfileStatusColorStringArray(User.inv);

        if (getStatusColor !== -1)
        {
            rank.setCustomStatusColor(getStatusColor[0][0][0]);
        }

        if (!(await this.client.pathExists(`./storage/users/${user.id}`)))
        {
            await this.client.mkdir(`./storage/users/${user.id}`);
        }

        const count = (await this.client.readDir(`./storage/users/${user.id}`))?.length;

        const shownName = message?.guild?.members?.cache?.get(user.id)?.nickname ?? user.displayName ?? user.globalName ?? user.username;

        const authorLine = shownName && shownName !== user.username
            ? `${shownName}'s profile`
            : `${user.username}'s profile`;

        const registered = User.ra
            ? `🗓️ Registered <t:${Math.floor(User.ra / 1000)}:D> (<t:${Math.floor(User.ra / 1000)}:R>)`
            : '🗓️ Registration date unknown';

        return Promise.all([
            rank.build(),
            this._calculateRarestAchievement(User)
        ]).then(([result1, result3]) =>
        {

            let rarest = this.getAchievement(result3[0]);
            let achievements_user_number = result3[1];
            let embed = new Discord.AttachmentBuilder(result1, { name: 'rank.png' });

            return [
                [
                    new Discord.EmbedBuilder().setColor(this.client.data.embedColor).setAuthor({
                        name:    authorLine,
                        iconURL: CDN.person
                    }).setThumbnail(user.displayAvatarURL({
                                                  dynamic: true,
                                                  size:    4096
                                              }))
                                              .setTitle(`**${shownName && shownName !== user.username
                                                  ? `${shownName} - `
                                                  : ''}${this.client.utils.tag(user)}**`)
                                              .setDescription(`${god_text
                                                  ? `\`\`\`${color}\n${actual_title}\n\`\`\`${special_title_addition
                                                      ? special_title_addition === 'nnnn'
                                                          ? '\n'
                                                          : ''
                                                      : ''}`
                                                  : ''}${registered}\n**Sent \`${User.msg.toLocaleString()}\` messages and \`${User.cmd.toLocaleString()}\` commands since!**\nExperience: **\`${User.xp.toLocaleString()}\`** 🔆\nMoney: **${User.m > 10000
                                                  ? `${User.m > 1000000
                                                      ? `\`${User.m}\`    🤑`
                                                      : `\`${User.m}\`    💰`}`
                                                  : `\`${User.m}\`    💵`}**\nRep: ${User.rep.length === 0
                                                  ? `**\`${User.rep.length}\`** 😕`
                                                  : `**\`${User.rep.length}\`** 😎`}`)
                                              .addFields([
                                                  {
                                                      name:  'Achievements:',
                                                      value: `**Progress: [${this.client.imports.progressbar.splitBar(ACHIEVEMENT_SIZE, achievements_user_number, ACHIEVEMENT_SIZE, '▬', '⭐')[0]}]  \`${achievements_user_number}\` / \`${ACHIEVEMENT_SIZE}\`**${achievements_user_number !== 0
                                                          ? `\n**Latest achievement: \`${this.getAchievement(User.la)}\`**\n**Rarest achievement: \`${rarest}\`**`
                                                          : ``}`
                                                  },
                                                  {
                                                      name:   'Opted out of leveling?',
                                                      value:  `${User.lo
                                                          ? `Yes!`
                                                          : `No!`}`,
                                                      inline: true
                                                  },
                                                  {
                                                      name:   'Opted out of dm WM/LM?',
                                                      value:  `${User.dm
                                                          ? `Yes!`
                                                          : `No!`}`,
                                                      inline: true
                                                  },
                                                  {
                                                      name:   'Opted out of trading?',
                                                      value:  `${User.to
                                                          ? `Yes!`
                                                          : `No!`}`,
                                                      inline: true
                                                  },
                                                  {
                                                      name:   'Active reminds:',
                                                      value:  `${User.rm.length === 0
                                                          ? '`0`  💤'
                                                          : `\`${User.rm.length}\` ⏰`}`,
                                                      inline: true
                                                  },
                                                  {
                                                      name:   'Inventory size:',
                                                      value:  `**\`${User.inv.length}\`**`,
                                                      inline: true
                                                  },
                                                  {
                                                      name:   'Files stored:',
                                                      value:  `**${count}** ${count > 0
                                                          ? '🗃️'
                                                          : '📂'}`,
                                                      inline: true
                                                  }
                                              ])
                                              .setImage('attachment:
                                                  .setFooter(this.client.data.footer)
                                                  .setTimestamp()
                ],
                [embed]
            ];
        });
    }

    encodeProfileBackgroundString(string)
    {
        return [
            string.replaceAll(' ', '.').replace('background', 'bg').replace('unused', 'X').replace('used', 'u'),
            string.indexOf('used')
        ];
    }

    decodeProfileBackgroundString(string)
    {
        return [
            string.replace('bg', 'background').replace('.u', '.used').replace('.X', '.unused').split('.'),
            string.indexOf('.u')
        ];
    }

    decodeProfileBackgroundStringArray(array)
    {
        let arr_len = array.length;
        if (arr_len === 0)
        {
            return -1;
        }

        for (let i = 0; i < arr_len; i++)
        {
            if (array[i].indexOf('.u') !== -1 && array[i].indexOf('bg') !== -1)
            {
                return [
                    this.decodeProfileBackgroundString(array[i]),
                    i
                ];
            }
        }

        return -1;
    }

    encodeProfileStatusColorString(string)
    {
        return [
            string.replaceAll(' ', '.').replace('statuscolor', 'sclr').replace('used', 'u').replace('unused', 'X'),
            string.indexOf('used')
        ];
    }

    decodeProfileStatusColorString(string)
    {
        return [
            string.replace('sclr', 'statuscolor').replace('.u', '.used').replace('.X', '.unused').split('.'),
            string.indexOf('.u')
        ];
    }

    decodeProfileStatusColorStringArray(array)
    {
        let i = 0;
        let arr_len = array.length;
        if (arr_len === 0)
        {
            return -1;
        }

        while (i < arr_len)
        {
            if (array[i].indexOf('.u') !== -1 && array[i].indexOf('sclr') !== -1)
            {
                return [
                    this.decodeProfileBackgroundString(array[i]),
                    i
                ];
            }
            i++;
        }

        return -1;
    }
}
