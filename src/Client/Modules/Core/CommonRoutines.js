'use strict';

import _             from 'lodash';
import Fetch         from 'request';
import Discord       from 'discord.js';
import Relaxy        from '../../Relaxy.js';
import {
    CDN,
    cdnText
}                    from '../../../Assets/CDN.js';
import { useQueue }  from '../MusicPlayer/index.js';
import {
    operatingMode,
    noMissingCmdResponse
}                    from '../../../Core/DataTable.js';
import {
    markScamImages,
    readImages,
    rememberImages,
    exportScamImages,
    setScamImagePublisher
}                    from '../Moderation/ScamOcr.js';
import { displayed } from '../Progression/LevelRewards.js';

import {
    loadBlacklist,
    saveBlacklist,
    BLACKLIST_ACTION_REASON
} from '../../../Config/Settings.js';

const VOTE_REMINDER_INTERVAL = 14 * 24 * 60 * 60 * 1000;
const VOTE_REMINDER_LIFETIME = 20 * 1000;
const XP_COOLDOWN_MS = 8 * 1000;
const xpCooldowns = new Map();

const offXpCooldown = (userId) =>
{
    const last = xpCooldowns.get(userId);

    if (last && Date.now() - last < XP_COOLDOWN_MS)
    {
        return false;
    }

    xpCooldowns.set(userId, Date.now());
    setTimeout(() => xpCooldowns.delete(userId), XP_COOLDOWN_MS).unref?.();

    return true;
};

const messageEarnsXp = (content) =>
{
    const meaningful = String(content ?? '')
        .replace(/<a?:\w+:\d+>/g, ' ')
        .replace(/<@[!&]?\d+>|<#\d+>/g, ' ')
        .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
        .replace(/[*_~`>|]/g, ' ')
        .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (meaningful.length < 2)
    {
        return false;
    }
    const compact = meaningful.replace(/\s/g, '').toLowerCase();

    return !(compact.length >= 6 && new Set(compact).size <= 2);
};

const acceptableChannelNames = [
    'general',
    'chat',
    'general-chat',
    'gaming',
    'memes',
    'main',
    'main-chat',
    'ogólny',
    'ogolny',
    'chat-general',
    'lounge',
    'degeneral'
];
const PERMISSION_NOTICE_INTERVAL = 24 * 60 * 60 * 1000;

const PERMISSION_NOTICE_FALLBACKS = 3;

const SCAM_NEW_ACCOUNT_MS = 14 * 24 * 60 * 60 * 1000;
const SCAM_IMAGE_WINDOW_MS = 10 * 60 * 1000;
const SCAM_IMAGE_CHANNEL_HITS = 2;
const SCAM_IMAGE_BURST = 3;

const SCAM_IMAGE_SINGLE_MESSAGE = 4;
const SCAM_IMAGE_TOTAL = 6;
const SCAM_IMAGE_OCR_MAX = 4;
const SCAM_NEVER_SPOKE_MAX = 3;

const SCAM_IMAGE_MEMORY_HOURS = 24;

const CENSOR_WARN_WINDOW_MS = 10 * 1000;

const AUTOBAN_GUARD_MS = 60 * 1000;

const SCAM_OCR_LOG_WINDOW_MS = 30 * 1000;

const SCAM_IMAGE_SHARE_WINDOW_MS = 2 * 1000;

const SCAM_IMAGE_SHARE_MAX = 64;
const HEARTBOARD_REACTOR_PAGE = 100;

const HEARTBOARD_REACTOR_LIMIT = 5000;

const HEARTBOARD_DRIFT_TOLERANCE = 3;

const HEARTBOARD_RECONCILE_INTERVAL = 60 * 1000;

const HEARTBOARD_EDIT_INTERVAL = 5 * 1000;

const scamReadSummary = scanned => `${scanned.read} image(s) - ${scanned.reused === scanned.read
    ? 'all from the OCR memory'
    : scanned.reused
        ? `${scanned.reused} from the OCR memory, ${scanned.read - scanned.reused} read now`
        : 'all read now'}${scanned.known
    ? `, ${scanned.known} already confirmed as a scam`
    : ''}`;

const scamMatchLine = censored => String(censored)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'unspecified';

Array.prototype.equals = function (array)
{
    if (!array || this.length !== array.length)
    {
        return false;
    }

    for (let i = 0; i < this.length; i++)
    {
        if (this[i] instanceof Array && array[i] instanceof Array)
        {
            if (!this[i].equals(array[i]))
            {
                return false;
            }
        }
        else if (this[i] !== array[i])
        {
            return false;
        }
    }

    return true;
};
Object.defineProperty(Array.prototype, 'equals', { enumerable: false });

const heartBoardStringContent = (channel, post, voteRequirement, heartBoardChannel) =>
{
    let emoji;
    if (post.n >= voteRequirement * 2 && post.n < voteRequirement * 3)
    {
        emoji = heartBoardChannel.em[0];
    }
    else if (post.n >= voteRequirement * 2 && post.n < Math.ceil(voteRequirement * 5.7))
    {
        emoji = heartBoardChannel.em[1];
    }
    else if (post.n >= Math.ceil(voteRequirement * 5.7) && post.n < voteRequirement * 10)
    {
        emoji = heartBoardChannel.em[2];
    }
    else if (post.n >= voteRequirement * 10)
    {
        emoji = heartBoardChannel.em[3];
    }
    else
    {
        emoji = heartBoardChannel.em[0];
    }

    let newEmoji;
    if (post.n >= voteRequirement * 2 && post.n < voteRequirement * 3)
    {
        newEmoji = heartBoardChannel.em[1];
    }
    else if (post.n >= voteRequirement * 3 && post.n < Math.ceil(voteRequirement * 5.7))
    {
        newEmoji = heartBoardChannel.em[2];
    }
    else if (post.n >= Math.ceil(voteRequirement * 5.7) && post.n < voteRequirement * 10)
    {
        newEmoji = heartBoardChannel.em[3];
    }
    else if (post.n >= voteRequirement * 10)
    {
        newEmoji = heartBoardChannel.em[4];
    }
    else
    {
        newEmoji = heartBoardChannel.em[0];
    }

    if (emoji !== newEmoji)
    {
        emoji = newEmoji;
    }

    return `**${emoji} ${post.n} | ${channel}**`;
};

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

const COUNTING_STREAK_TIERS = [
    {
        at:         1000,
        multiplier: 10
    },
    {
        at:         500,
        multiplier: 5
    },
    {
        at:         250,
        multiplier: 3
    },
    {
        at:         100,
        multiplier: 2
    },
    {
        at:         50,
        multiplier: 1.5
    }
];

const countingPayout = (pay, streak) =>
{
    const base = Number(pay);

    if (!Number.isFinite(base) || base <= 0)
    {
        return 0;
    }

    const tier = COUNTING_STREAK_TIERS.find(entry => streak >= entry.at);

    return Math.max(0, Math.floor(base * (tier?.multiplier ?? 1)));
};

export default class CommonRoutines
{
    constructor(client)
    {
        this.client = client;
        this.intervals = [];

        this._scamImageSeen = new Map();

        this._scamImageDigests = new Map();

        this._scamImageOutbox = new Map();
        this._scamImageShareTimer = null;

        setScamImagePublisher(entries => this._shareScamImages(entries));
    }

    async Leveling(message, isCommand, guild)
    {
        if (message.content.includes('level') && isCommand && guild.lv.on)
        {
            return;
        }

        const timestamp = this.client.collections.levelingCooldowns.get(message.author.id);
        if (timestamp && Date.now() < timestamp + 500)
        {
            return;
        }

        this.client.collections.levelingCooldowns.set(message.author.id, Date.now());
        setTimeout(async () => this.client.collections.levelingCooldowns.delete(message.author.id), 500);

        return Promise.all([
            this.client.module.database.Member(message.author.id, message.guild.id),
            this.client.module.database.User(message.author.id)
        ]).then(async ([member, user]) =>
        {
            const originalUser = _.cloneDeep(user);
            const originalMember = _.cloneDeep(member);

            const isBot = message.author.bot;

            let userMessages = user.msg;
            let userCommands = user.cmd;
            let userRecurrence = user.rc;

            let memberMessages = member.msg;
            let memberCommands = member.cmd;
            let memberRecurrence = member.rc;

            userMessages++;
            memberMessages++;

            if (isCommand)
            {
                userCommands++;
                memberCommands++;
            }

            if (!guild.lv.on || isBot)
            {

                if (!isBot)
                {
                    this.client.saveProfile(user.id,
                        {
                            alter: 'msg',
                            value: userMessages
                        },
                        isCommand
                            ? {
                                alter: 'cmd',
                                value: userCommands
                            }
                            : null);

                    this.client.saveMember(message.guild.id,
                        member.id,
                        {
                            alter: 'msg',
                            value: memberMessages
                        },
                        isCommand
                            ? {
                                alter: 'cmd',
                                value: memberCommands
                            }
                            : null);
                }

                return;
            }

            if (!(messageEarnsXp(message.content) && offXpCooldown(message.author.id)))
            {
                this.client.saveProfile(user.id,
                    {
                        alter: 'msg',
                        value: userMessages
                    },
                    isCommand
                        ? {
                            alter: 'cmd',
                            value: userCommands
                        }
                        : null);

                this.client.saveMember(message.guild.id,
                    member.id,
                    {
                        alter: 'msg',
                        value: memberMessages
                    },
                    isCommand
                        ? {
                            alter: 'cmd',
                            value: memberCommands
                        }
                        : null);

                return;
            }

            let userExp = user.xp;
            let memberExp = member.xp;

            let experienceGained = Math.floor(Math.random() * 14 + 5);

            const userRecurrences = message.content !== user.rc;
            const memberRecurrences = message.content !== member.rc;

            if (userRecurrences)
            {
                userRecurrence = message.content;
                userExp += experienceGained + isCommand * 10;
            }

            if (memberRecurrences)
            {
                memberRecurrence = message.content;
                memberExp += experienceGained + isCommand * 10;
            }

            const globalLevelling = this.client.utils.levelUp(userExp, user.lvl);

            userExp = globalLevelling.xp;

            const userLevel = globalLevelling.level;

            this.client.module?.stats?.count('leveling.global', globalLevelling.gained);

            this.client.saveProfile(user.id,
                originalUser.xp != userExp
                    ? {
                        alter: 'xp',
                        value: userExp
                    }
                    : null,
                userRecurrences
                    ? {
                        alter: 'rc',
                        value: userRecurrence
                    }
                    : null,
                originalUser.lvl != userLevel
                    ? {
                        alter: 'lvl',
                        value: userLevel
                    }
                    : null,
                {

                    alter: 'msg',
                    value: userMessages
                },
                isCommand
                    ? {
                        alter: 'cmd',
                        value: userCommands
                    }
                    : null);

            this.client.saveMember(message.guild.id,
                member.id,
                originalMember.xp != memberExp
                    ? {
                        alter: 'xp',
                        value: memberExp
                    }
                    : null,
                memberRecurrences
                    ? {
                        alter: 'rc',
                        value: memberRecurrence
                    }
                    : null,
                {
                    alter: 'msg',
                    value: memberMessages
                },
                isCommand
                    ? {
                        alter: 'cmd',
                        value: memberCommands
                    }
                    : null);

            const memberLevelling = this.client.utils.levelUp(memberExp, member.lvl);

            if (memberLevelling.gained > 0)
            {
                memberExp = memberLevelling.xp;

                const memberLevel = memberLevelling.level;
                const nextLevelExpCap = this.client.utils.nextLevel(memberLevel);

                this.client.module?.stats?.count('leveling.server', memberLevelling.gained);

                this.client.saveMember(message.guild.id, member.id, {
                    alter: 'xp',
                    value: memberExp
                }, {
                    alter: 'lvl',
                    value: memberLevel
                });

                this.client.module?.levelRewards?.apply({
                    guild:    message.guild,
                    guildDoc: guild,
                    member:   message.member,
                    from:     displayed(originalMember.lvl),
                    to:       displayed(memberLevel),
                    profile:  user
                })?.catch(error => this.client.log('WARN', `[Level tiers] ${message.guild.id}: could not settle level ${displayed(memberLevel)} rewards for ${member.id}: ${error?.message ?? error}`));

                Promise.all([
                    this.client.module.database.findMembers(message.guild.id),
                    Promise.resolve()
                ]).then(([guild_member_database_fetch]) =>
                {
                    const memberGuildRank = this.client.module.profiles._calculateGuildRank(guild_member_database_fetch, member);
                    const rank = new this.client.cards.Rank().setAvatar(message.member.displayAvatarURL({
                                                                 extension: 'png',
                                                                 size:      4096
                                                             }))
                                                             .setCurrentXP(memberExp)
                                                             .setRequiredXP(nextLevelExpCap)
                                                             .setLevel(memberLevel + 1)
                                                             .setLevelColor('#FF69B4')
                                                             .setRank(memberGuildRank, memberGuildRank, true)
                                                             .setRankColor('#FF69B4')

                                                             .setProgressBar('#FF69B4', 'COLOR')
                                                             .setDisplayName(this.client.utils.norm(message.member.displayName))
                                                             .setUsername(this.client.utils.norm(message.member.user.username))
                                                             .setDiscriminator(this.client.utils.tag(message.member.user).match(/#\d{1,4}/g)?.[0].replace('#', ''));
                    let background = this.client.module.profiles.decodeProfileBackgroundStringArray(user.inv);

                    if (background !== -1)
                    {
                        rank.setBackground('IMAGE', CDN.background(background[0][0][0]));
                    }

                    let custom_color = this.client.module.profiles.decodeProfileStatusColorStringArray(user.inv);

                    if (custom_color !== -1)
                    {
                        rank.setCustomStatusColor(custom_color[0][0][0]);
                    }

                    Promise.all([
                        rank.build(),
                        Promise.resolve()
                    ]).then(([buffer]) =>
                    {

                        this.client.module.profiles.Achievement(message, 'lvldup', guild);

                        let levelEmbed = null;
                        let levelMessage = null;

                        if ([
                            1,
                            3
                        ].includes(guild.lv.t))
                        {
                            levelEmbed = new Discord.AttachmentBuilder(buffer, { name: 'level_up.png' });
                        }

                        if ([
                            1,
                            2
                        ].includes(guild.lv.t))
                        {

                            levelMessage = `Congrats ${message.member} you've reached level **${memberLevel + 1}!**`;
                        }

                        if (levelEmbed || levelMessage)
                        {
                            if (guild.lv.c)
                            {
                                return this.client.send(this.client.channels.cache.get(guild.lv.c), levelMessage, null, [levelEmbed]).catch(() =>
                                {
                                    return this.client.saveHeartBoardPost(originalId, {
                                        alter: 'lv',
                                        value: {
                                            on: false,
                                            t:  0,
                                            c:  ''
                                        }
                                    });
                                });
                            }

                            return this.client.send(message.channel, levelMessage, null, [levelEmbed]).catch(() =>
                            {
                                return this.client.save(guild.id, {
                                    alter: 'lv',
                                    value: {
                                        on: false,
                                        t:  0,
                                        c:  ''
                                    }
                                });
                            });
                        }

                        return null;
                    });
                });
            }
        });
    }

    ClearingChannels()
    {
        const advancedChannelClear = async (channel, cache_size) =>
        {
            let flag = true;

            while (flag && cache_size > 0)
            {
                try
                {
                    const messages = await channel.bulkDelete(100);
                    cache_size -= messages.size;

                    if (messages.size <= 0)
                    {
                        flag = false;
                    }
                    else
                    {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                catch
                {
                    flag = false;
                }
            }
        };

        const MIN_CLEAR_MS = 60 * 1000;
        const DEFAULT_CLEAR_MS = 3 * 60 * 1000;
        const lastCleared = new Map();

        const _ = setInterval(() =>
        {
            const now = Date.now();

            this.client.module.database._cache.servers.forEach(async Guild =>
            {
                const list = Guild?.ch?.t?.cl;
                if (!list?.length)
                {
                    return;
                }

                let migrated = false;
                const entries = list.map(entry =>
                {
                    if (typeof entry === 'string')
                    {
                        migrated = true;
                        return {
                            id:       entry,
                            interval: DEFAULT_CLEAR_MS
                        };
                    }
                    return entry;
                });

                if (migrated)
                {
                    Guild.ch.t.cl = entries;
                    this.client.save(Guild.id, {
                        alter: 'ch.t.cl',
                        value: entries
                    });
                }

                for (const entry of entries)
                {
                    const interval = Math.max(MIN_CLEAR_MS, Number(entry.interval) || DEFAULT_CLEAR_MS);
                    if (now - (lastCleared.get(entry.id) ?? 0) < interval)
                    {
                        continue;
                    }

                    let channel = null;
                    try
                    {
                        channel = await this.client.channels.fetch(entry.id);
                    }
                    catch
                    {
                    }

                    if (!channel)
                    {
                        continue;
                    }

                    lastCleared.set(entry.id, now);
                    this.client.module?.stats?.count('channel.cleared.messages', channel.messages.cache.size);
                    this.client.module?.stats?.count('channel.cleared');
                    advancedChannelClear(channel, channel.messages.cache.size);
                }
            });
        }, MIN_CLEAR_MS);

        this.intervals.push(_);
    }

    LockdownMessage(message, guild)
    {
        if (guild.lockeddown && message.author.id !== message.guild.ownerId)
        {
            return this.client.delete(message, null);
        }
    }

    async runCommand(message, args, commandName, cmd, guild, owner, execStart)
    {
        const command = this.client.collections.commands.get(commandName) || this.client.collections.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
        const userExempt = this.client.utils.isExempt(guild, message);

        if (message.channel.type === Discord.ChannelType.GuildStageVoice && !userExempt)
        {
            return;
        }

        if (guild.cmd.dis.includes(commandName) && !userExempt && !owner)
        {
            return this.client.qEmbed(`${commandName} has been disabled on this server!`, message);
        }

        if ((['caption'].includes(command.name)) && this.client.data.platform !== 'win' && !owner)
        {
            return this.client.qEmbed(`Relaxy is running in low performance mode. Feature disabled.\nCheck "${guild.px[0]}help status" for more information.`, message);
        }

        if (command.undergoingchange)
        {
            this.client.qEmbed(`${commandName} is currently undergoing changes, it is unstable if used!`, message);
        }

        if (!userExempt && (command.leaveout || !command))
        {
            return;
        }

        if (!userExempt && (command.nsfw && !message.channel.nsfw))
        {
            return this.client.qEmbed(`${message.member}, the **${command.name}** command can only be used in nsfw on channels!`, message);
        }

        const granted = this.client.utils.isGranted(guild, message, command.name);

        let permissionsFlag = this.client.permissions(message, {
            permissionsUser:          guild.cmd.cp?.[command.name]?.length > 0
                                          ? guild.cmd.cp[command.name]
                                          : command.permissionsUser,
            suggestedPermissionsUser: command.suggestedPermissionsUser,
            permissionsBot:           command.permissionsBot,
            suggestedPermissionsBot:  command.suggestedPermissionsBot
        }, {
            textChannel:  message.channel,
            voiceChannel: message.member?.voice?.channel ?? null
        }, { userExempt: userExempt || granted });

        if (!owner && (permissionsFlag.bot || (!userExempt && !granted && permissionsFlag.user)))
        {
            return;
        }

        if (command.args && !args.length)
        {
            return this.client.qEmbed('You provided no arguments!', message);
        }

        if (!this.client.collections.cooldowns.has(command.name))
        {
            this.client.collections.cooldowns.set(command.name, new Discord.Collection());
        }

        const timestamps = this.client.collections.cooldowns.get(command.name);
        const cooldownAmount = (command.cooldown || 3) * 1000;
        if ((timestamps?.has(message.author.id) && !userExempt) && (Date.now() < timestamps.get(message.author.id) + cooldownAmount) && !this.client.isOwner(message.author.id))
        {
            return this.client.qEmbed(`${message.member}, Please wait **${this.client.imports.time(this.client.collections.cooldowns.get(command.name).get(message.author.id)
                ? cooldownAmount - (new Date() - this.client.collections.cooldowns.get(command.name).get(message.author.id))
                : 0)}** before using \`${commandName}\` again!`, message);
        }

        timestamps.set(message.author.id, Date.now());
        setTimeout(async () => timestamps.delete(message.author.id), cooldownAmount);

        await this.client.countCommandUse(guild, message.guild.id, message.author.id, cmd.name);

        this.client.module?.stats?.count('command.run');
        this.client.module?.stats?.count('command.prefix');
        this.client.module?.stats?.count(`command.name.${cmd.name}`);

        const startedAt = process.hrtime.bigint();

        try
        {
            await cmd.run(this.client, message, args, guild);
        }
        catch (error)
        {
            this.client.module?.stats?.count('command.error');
            this.client.module?.stats?.count(`command.error.${cmd.name}`);

            this.client.data.errors++;
            this.client.log('ERROR', `Command "${cmd.name}" threw:`, error);
            this.client.qEmbed('Something went wrong running that command.', message);
        }

        this.client.module?.stats?.count('command.ms', Number(process.hrtime.bigint() - startedAt) / 1e6);

        this.client.log('DATA', `${cmd.name} | ${message.author.id} -> ${this.client.utils.shortGuildName(message.guild.name)} ${message.guild.id}/${message?.channel?.id ?? 'Unavailable.'} ${this.client.imports.time(Date.now() - execStart)}`);
    }

    async ThreadCommand(message, guild, isOwner, execStart)
    {
        const prefix = guild.px.find(p => message.content.startsWith(p) && message.content[p.length] !== ' ');

        if (!prefix)
        {
            return;
        }

        const args = message.content.slice(prefix.length).trim().split(/[ 　]+/g);
        const commandName = args.shift()?.toLowerCase();

        if (!commandName || noMissingCmdResponse.includes(commandName))
        {
            return;
        }

        const cmd = this.client.collections.commands.get(commandName) || this.client.collections.aliases.get(commandName);

        if (!cmd || (cmd.owner && !isOwner))
        {
            return;
        }

        await message.guild.members.fetchMe().catch(this.client.swallow('CommonRoutines: fetchMe'));

        return this.runCommand(message, args, commandName, cmd, guild, isOwner, execStart);
    }

    async CensorVoiceStatus(data)
    {
        const channelId = data?.id;
        const guildId = data?.guild_id;
        const status = data?.status;

        if (!channelId || !guildId || !status || typeof status !== 'string')
        {
            return;
        }

        const guild = await this.client.module.database.Guild(guildId);

        if (!guild?.cn?.on)
        {
            return;
        }

        const discordGuild = this.client.guilds.cache.get(guildId);

        const censored = await this.client.utils.censorCheck(status.split(' '), guild, discordGuild, true, null, false, {
            content: status,
            embeds:  []
        });

        if (censored === false)
        {
            return;
        }

        await this.client.rest.put(`/channels/${channelId}/voice-status`, {
            body: { status: '' }
        }).catch(e => this.client.log('WARN', `Failed to clear censored voice status in ${channelId}: ${e?.message ?? e}`));

        if (guild.ml?.on)
        {
            const logChannelId = guild.ml?.ev?.other?.on
                ? guild.ml.ev.other.channel
                : null;
            const logChannel = logChannelId
                ? this.client.channels.cache.get(logChannelId)
                : null;

            if (logChannel)
            {
                this.client.send(logChannel, null, [
                    {
                        color:       16711680,
                        author:      {
                            name:     'Voice status censored',
                            icon_url: this.client.cdn.brand
                        },
                        description: `A voice-channel status in <#${channelId}> was cleared for hitting the censor pool.`,
                        footer:      this.client.data.footer,
                        timestamp:   new Date().toISOString()
                    }
                ]).catch(this.client.swallow('CommonRoutines: toISOString'));
            }
        }
    }

    async scamImageSuspect(message, images, guild = null)
    {
        if (!images.length)
        {
            return false;
        }

        if (message.author.bot || message.webhookId)
        {
            return true;
        }

        const key = `${message.guild.id}:${message.author.id}`;
        const now = Date.now();
        const sig = [...message.attachments.values()].map(a => `${a.size}:${a.name}`).join('|');

        const fresh = (this._scamImageSeen.get(key) ?? []).filter(entry => now - entry.ts < SCAM_IMAGE_WINDOW_MS);

        fresh.push({
            sig,
            ch: message.channel.id,
            ts: now,

            n: images.length
        });

        this._scamImageSeen.set(key, fresh);

        if (this._scamImageSeen.size > 5000)
        {
            for (const [k, entries] of this._scamImageSeen)
            {
                if (entries.every(entry => now - entry.ts >= SCAM_IMAGE_WINDOW_MS))
                {
                    this._scamImageSeen.delete(k);
                }
            }
        }

        const spread = new Set(fresh.filter(entry => entry.sig === sig).map(entry => entry.ch)).size >= SCAM_IMAGE_CHANNEL_HITS;

        const burst = fresh.length >= SCAM_IMAGE_BURST;

        const dump = images.length >= SCAM_IMAGE_SINGLE_MESSAGE;

        const total = fresh.reduce((sum, entry) => sum + (entry.n ?? 1), 0) >= SCAM_IMAGE_TOTAL;

        if (spread || burst || dump || total)
        {
            return true;
        }

        const member = message.member;

        if (!member)
        {
            return false;
        }

        if ((now - message.author.createdTimestamp) < SCAM_NEW_ACCOUNT_MS)
        {
            return true;
        }

        const autoRoles = new Set(guild?.rl?.a ?? []);
        const earned = member.roles.cache.filter(role => role.id !== message.guild.id && !autoRoles.has(role.id));

        if (earned.size === 0)
        {
            return true;
        }

        try
        {
            const doc = await this.client.module.database.Member(message.author.id, message.guild.id);

            return (doc?.msg ?? Infinity) <= SCAM_NEVER_SPOKE_MAX;
        }
        catch
        {
            return false;
        }
    }

    async scamImageArgs(message, guild)
    {
        if (!guild?.cn?.on || !guild.cn.li?.includes('scams') || !message?.guild)
        {
            return [];
        }

        const images = this.client.utils.getImages(message);

        if (!images.length)
        {
            return [];
        }

        const dump = images.length >= SCAM_IMAGE_SINGLE_MESSAGE;

        const suspect = await this.scamImageSuspect(message, images, guild);

        const reads = await readImages(images, {
            log:         (level, ...msg) => this.client.log(level, ...msg),
            max:         dump || suspect
                             ? Math.min(images.length, SCAM_IMAGE_OCR_MAX)
                             : 1,
            concurrency: SCAM_IMAGE_OCR_MAX
        });

        const digests = reads.map(read => read.digest).filter(Boolean);

        const reused = reads.filter(read => read.cached).length;
        const known = reads.filter(read => read.scam).length;

        if (digests.length)
        {
            this._scamImageDigests.set(message.id, {
                digests,
                at:   Date.now(),
                read: reads.length,
                reused,
                known,

                blank: !message.content?.trim()
            });

            if (this._scamImageDigests.size > 200)
            {
                const cutoff = Date.now() - 60_000;

                for (const [id, entry] of this._scamImageDigests)
                {
                    if (entry.at < cutoff)
                    {
                        this._scamImageDigests.delete(id);
                    }
                }
            }
        }

        if (known)
        {
            this._recordScamOcr(message, {
                recognised: true,
                read:       reads.length,
                reused,
                known
            });
        }
        else if (reused && this.client.flags.logs.debug)
        {
            this.client.log('DEBUG', `[Scam] ${reused}/${reads.length} image(s) in ${message.id} were answered from the OCR memory - no read needed.`);
        }

        const text = reads
            .map(read => read.text)
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        if (!text)
        {
            return [];
        }

        if (this.client.flags.logs.debug)
        {
            const hits = this.client.utils.scamTermsIn(text);

            if (hits.length)
            {
                this.client.log('DEBUG', `[Scam] Image from ${message.author?.id} in ${message.guild.id} contains scam term(s): ${hits.join(', ')}`);
            }
        }

        return text.split(' ');
    }

    async ScamGuard(message, guild)
    {
        if (!guild?.cn?.on || !guild.cn.li?.includes('scams') || this.client.utils.isExempt(guild, message))
        {
            return false;
        }

        const scamOnly = {
            ...guild,
            cn: {
                ...guild.cn,
                li: ['scams']
            }
        };

        const censorArgs = message.content.split(' ').concat(await this.scamImageArgs(message, guild));

        const censored = await this.client.utils.censorCheck(censorArgs, scamOnly, message.guild, true, null, false, message);

        const scanned = this._scamImageDigests.get(message.id);

        if (scanned)
        {
            this._scamImageDigests.delete(message.id);
        }

        if (censored === false)
        {
            return false;
        }

        await this.client.delete(message).catch(this.client.swallow('CommonRoutines: delete'));

        if (message.webhookId)
        {
            await this.client.fetchWebhook(message.webhookId)
                      .then(webhook => webhook.delete('Relaxy: scam content posted through this webhook.'))
                      .catch(this.client.swallow('CommonRoutines: delete'));
        }
        else if (message.member?.bannable)
        {
            await message.guild.members.ban(message.author.id, {
                reason:               'Relaxy: scam bot caught by scam censoring.',
                deleteMessageSeconds: 24 * 60 * 60
            }).catch(this.client.swallow('CommonRoutines: ban'));
        }

        this.client.log('INFO',
            `[Scam] Removed ${message.webhookId
                ? `webhook ${message.webhookId}`
                : `bot ${this.client.utils.tag(message.author)} (${message.author.id})`} in ${message.guild.name} (${message.guild.id}) for scam content${scanned
                ? `, read out of ${scamReadSummary(scanned)}`
                : ''}. Match: ${scamMatchLine(censored)}`);

        if (scanned)
        {
            const marked = markScamImages(scanned.digests);

            if (marked)
            {

                this._recordScamOcr(message, { marked });
            }
        }

        if (guild.ml?.on)
        {
            const logChannelId = guild.ml?.ev?.other?.on
                ? guild.ml.ev.other.channel
                : null;
            const logChannel = logChannelId
                ? this.client.channels.cache.get(logChannelId)
                : null;

            if (logChannel)
            {
                this.client.send(logChannel, null, [
                    {
                        color:       16711680,
                        author:      {
                            name:     'Scam source removed',
                            icon_url: this.client.cdn.brand
                        },
                        description: `Removed ${message.webhookId
                            ? 'a webhook'
                            : `the bot **${this.client.utils.tag(message.author)}**`} in <#${message.channel.id}> for posting scam content.\n${typeof censored === 'string'
                            ? `\`\`\`\n${censored.slice(0, 500)}\n\`\`\``
                            : ''}`,
                        footer:      this.client.data.footer,
                        timestamp:   new Date().toISOString()
                    }
                ]).catch(this.client.swallow('CommonRoutines: toISOString'));
            }
        }

        return true;
    }

    autoRoleExempt(member, guild)
    {
        const exempt = guild.rl?.x ?? [];

        if (!exempt.length)
        {
            return false;
        }

        return exempt.includes(member.id) || member.roles.cache.some(role => exempt.includes(role.id));
    }

    async autoRole(member, guild)
    {
        if (!guild.rl?.a?.length)
        {
            return false;
        }

        if (member.pending)
        {
            if (this.client.flags.logs.debug)
            {
                this.client.log('DEBUG', `Autorole deferred for ${member.id} in ${member.guild.id} - still pending onboarding.`);
            }

            return false;
        }

        if (this.autoRoleExempt(member, guild))
        {
            return false;
        }

        const me = await member.guild.members.fetchMe();

        let availableChannel = null;

        const missing = [];

        for (const roleId of guild.rl.a)
        {
            const role = member.guild.roles.cache.get(roleId);

            if (!role)
            {
                continue;
            }

            if (role.position > me.roles.highest.position)
            {
                if (!availableChannel)
                {
                    availableChannel = await member.guild.channels.fetch().catch(() => null);

                    if (availableChannel)
                    {
                        availableChannel = availableChannel.filter(c => c.isSendable()).first();
                    }
                }

                if (availableChannel)
                {
                    this.client.send(availableChannel, null, [
                        {
                            color:       this.client.data.embedColor,
                            description: `**Relaxy Autorole error:**\nCannot add **${role}** to users.\nIt is above Relaxy's highest role!`
                        }
                    ]);
                }

                break;
            }

            if (!member.roles.cache.has(roleId))
            {
                missing.push(role);
            }
        }

        if (!missing.length)
        {
            return false;
        }

        await member.roles.add(missing, 'Relaxy! Autorole').catch(this.client.swallow('CommonRoutines: autoRole add'));

        return true;
    }

    async Censor(message, guild, repeat_offender)
    {

        if (!guild.cn.on || this.client.utils.isExempt(guild, message) || message?.author?.id === this.client.user.id || message?.member?.permissions?.has(Discord.PermissionFlagsBits['BanMembers']))
        {
            return false;
        }

        for (let i = 0; i < guild.px.length; i++)
        {
            if (message.content.toLowerCase().startsWith(`${guild.px[i]}censor`) || message.content.toLowerCase().startsWith(`${guild.px[i]}ban`) || message.content.toLowerCase().startsWith(`${guild.px[i]}warn`) || message.content.toLowerCase().startsWith(`${guild.px[i]}kick`) || message.content.toLowerCase().startsWith(`${guild.px[i]}mute`))
            {
                return false;
            }
        }

        const args = message.content.split(' ').concat(await this.scamImageArgs(message, guild));
        let censored = await this.client.utils.censorCheck(args,
            guild,
            message.guild,
            true,
            null,
            repeat_offender
                ? repeat_offender.filter(w => w.author === this.client.user.id).length > 0
                : false,
            message);

        const scanned = this._scamImageDigests.get(message.id);

        if (scanned)
        {
            this._scamImageDigests.delete(message.id);

            if (censored !== false)
            {
                const marked = markScamImages(scanned.digests);

                this._recordScamOcr(message, {
                    censored: true,
                    match:    censored,
                    blank:    scanned.blank,
                    read:     scanned.read,
                    reused:   scanned.reused,
                    known:    scanned.known,
                    marked
                });
            }
        }

        if (censored !== false)
        {
            await this.Autoban(message, guild, censored, scanned ?? null);
            return true;
        }

        return false;
    }

    async Autoban(message, guild, word, scanned = null)
    {
        const member = message.member;

        if (!member || guild.cn.ab <= 0 || member.permissions.has(Discord.PermissionFlagsBits['Administrator']) || this.client.isOwner(message.author.id) || message.author.id === message.guild.ownerId || this.client.utils.isExempt(guild, message))
        {
            return;
        }

        const db = this.client.module.database;
        const limit = guild.cn.ab;

        const maxThreat = await db.guildMaxWarningTier(guild.id);

        await db.addWarning(guild.id, message.author.id, {
            reason: `Saying a censored word. [${word}]`,
            tier:   maxThreat,
            author: this.client.user.id
        });

        const escalations = await this.client.module.moderation?.applyWarningTiers?.({
            guild:     message.guild,
            guildDoc:  guild,
            member,
            moderator: this.client.user.id,
            tier:      maxThreat,
            added:     1,
            message
        }).catch(error =>
        {
            this.client.log('WARN', `[Warn tiers] Censor warning ladder failed in ${guild.id}: ${error?.message ?? error}`);

            return [];
        }) ?? [];

        const removed = escalations.find(step => step.ok && (step.action === 'ban' || step.action === 'kick'));

        if (removed)
        {
            this._claimAutoban(guild.id, message.author.id);

            return this.client.send(this.client.channels.cache.get(guild.cn.c) ?? message.channel,
                `${member} has been ${removed.action === 'ban'
                    ? 'banned'
                    : 'kicked'} - the warning ladder. **[Case: #${removed.caseNumber}]**`).catch(this.client.swallow('Autoban: ladder report'));
        }

        const warns = await db.warningsOf(guild.id, message.author.id);

        let threat = 0;
        for (const warn of warns)
        {
            if (warn.tier >= Math.ceil(maxThreat / 2) || (warn.author === this.client.user.id && warn.tier !== -1))
            {
                threat++;
            }
        }

        let maxUserThreat = 0;
        for (const warn of warns)
        {
            if (warn.tier > maxUserThreat)
            {
                maxUserThreat = warn.tier;
            }
        }

        const evidence = this.client.utils.describeMessage(message);

        const burst = this._recordCensorWarning(guild, member, {
            word,
            evidence,
            maxThreat,
            maxUserThreat,
            total:       warns.length,
            threat,
            limit,
            channel:     this.client.channels.cache.get(guild.cn.c) ?? message.channel,
            deleteAfter: guild.cn.dt
        });

        const warningTiersMember = [
            ...new Set((warns.length
                ? warns
                : [{ tier: 0 }])
                .map(warn => warn.tier)
                .filter(tier => typeof tier === 'number' && !isNaN(tier)))
        ].sort((a, b) =>
        {
            return a - b;
        });

        if (!this.client.data.serverCache?.[guild.id])
        {
            this.client.data.serverCache[guild.id] = {};
        }

        if (!this.client.data.serverCache?.[guild.id]?.[message.author.id])
        {
            this.client.data.serverCache[guild.id][message.author.id] = {};
        }

        if (!this.client.data.serverCache?.[guild.id]?.[message.author.id]?.warn_tiers)
        {
            this.client.data.serverCache[guild.id][message.author.id].warn_tiers = warningTiersMember.filter(t => t <= 0).sort((a, b) =>
            {
                return b - a;
            });
        }

        if (threat < limit)
        {
            return;
        }

        if (!this._claimAutoban(guild.id, message.author.id))
        {
            this._silenceCensorWarnings(burst?.key);

            this.client.log('DEBUG', `[Censor] ${guild.id}: ${message.author.id} is already being autobanned by another message in this run - not repeating it.`);

            return;
        }

        this._flushCensorWarnings(burst?.key, { immediate: member.bannable });

        if (!member.bannable)
        {

            this._releaseAutoban(guild.id, message.author.id);

            return;
        }

        const banReason = `${this.client.utils.formatDate(new Date())} - Exceeding the Relaxy warn limit.\n${warns.every(warning => warning.reason === warns[0].reason)
            ? `Reason: ${warns[0].reason}`
            : ''}`.slice(0, 512);

        const caseNumber = await this.client.module.database.addCase(guild.id, {
            type:     'ban',
            user:     message.author.id,
            mod:      this.client.user.id,
            reason:   banReason,
            extra:    `Automatic: ${threat}/${limit} warnings.`,
            guildBan: true
        });

        await this.client.utils.sendBanNotice(guild, message.author, {
            message,
            reason: banReason,
            num:    caseNumber
        }).catch(this.client.swallow('Autoban: ban notice'));

        let banned = true;

        await member.ban({
            reason:               banReason,
            deleteMessageSeconds: 604800
        }).catch(error =>
        {
            banned = false;

            this.client.data.errors++;
            this.client.log('ERROR', `[Censor] Could not ban ${this.client.utils.tag(message.author)} (${message.author.id}) in ${message.guild.id} after ${threat}/${limit} warnings [Case #${caseNumber}]: ${error?.message ?? error}`);
        });

        if (!banned)
        {
            this._releaseAutoban(guild.id, message.author.id);

            return this.client.send(this.client.channels.cache.get(guild.cn.c) ?? message.channel, `${member} is over the warning limit **(${threat}/${limit})** but could not be banned - check Relaxy's permissions and role position. **[Case: #${caseNumber}]**`).catch(this.client.swallow('Autoban: ban failure notice'));
        }

        this.client.log('INFO',
            `[Censor] Banned ${this.client.utils.tag(message.author)} (${message.author.id}) from ${message.guild.name} (${message.guild.id}) - ${threat}/${limit} warnings. [Case #${caseNumber}]${scanned
                ? ` Triggered by text read out of ${scamReadSummary(scanned)}.`
                : ''}`);

        const announceIn = this.client.channels.cache.get(guild.cn.c);

        const announced = announceIn
            ? await this.client.send(announceIn, `${member} has been banned. **[Case: #${caseNumber}]**`).catch(this.client.swallow('Autoban: ban announcement'))
            : null;

        return announced ?? this.client.send(message.channel, `${message.author} has been banned. **[Case: #${caseNumber}]**`).catch(this.client.swallow('Autoban: ban announcement fallback'));
    }

    _claimAutoban(guildId, userId)
    {
        this._autobanGuard ??= new Map();

        const now = Date.now();

        for (const [seen, at] of this._autobanGuard)
        {
            if (now - at >= AUTOBAN_GUARD_MS)
            {
                this._autobanGuard.delete(seen);
            }
        }

        const key = `${guildId}:${userId}`;

        if (now - (this._autobanGuard.get(key) ?? -Infinity) < AUTOBAN_GUARD_MS)
        {
            return false;
        }

        this._autobanGuard.set(key, now);

        return true;
    }

    _releaseAutoban(guildId, userId)
    {
        this._autobanGuard?.delete(`${guildId}:${userId}`);
    }

    _shareScamImages(entries)
    {

        if (!entries?.length || !this.client.cluster)
        {
            return;
        }

        for (const entry of entries)
        {
            if (!entry?.digest)
            {
                continue;
            }

            const held = this._scamImageOutbox.get(entry.digest);

            if (!held || entry.scam === true || entry.at > held.at)
            {
                this._scamImageOutbox.set(entry.digest, entry);
            }
        }

        if (this._scamImageShareTimer)
        {
            return;
        }

        this._scamImageShareTimer = setTimeout(() => this._flushScamImageShare(), SCAM_IMAGE_SHARE_WINDOW_MS);
        this._scamImageShareTimer.unref?.();
    }

    _flushScamImageShare()
    {
        this._scamImageShareTimer = null;

        const entries = [...this._scamImageOutbox.values()].slice(0, SCAM_IMAGE_SHARE_MAX);

        this._scamImageOutbox.clear();

        if (!entries.length)
        {
            return;
        }

        void this.client.cluster.broadcastEval((c, a) => c.core?.receiveScamImages?.(a.entries), { context: { entries } })
                 .catch(this.client.swallow('CommonRoutines: scam image share'));
    }

    receiveScamImages(entries)
    {
        const applied = rememberImages(entries);

        if (applied && this.client.flags?.logs?.debug)
        {
            this.client.log('DEBUG', `[Scam OCR] Learned ${applied} image(s) from another cluster.`);
        }

        return applied;
    }

    async syncScamImageMemory()
    {
        if (!this.client.cluster)
        {
            return 0;
        }

        const answers = await this.client.cluster.broadcastEval(c => c.core?.exportScamImages?.() ?? null)
                                  .catch(() => null);

        if (!Array.isArray(answers))
        {
            return 0;
        }

        let applied = 0;

        for (const answer of answers)
        {
            if (Array.isArray(answer))
            {
                applied += rememberImages(answer);
            }
        }

        if (applied)
        {
            this.client.log('INFO', `[Scam OCR] Seeded ${applied} known image(s) from the rest of the fleet.`);
        }

        return applied;
    }

    exportScamImages()
    {
        return exportScamImages();
    }

    _recordScamOcr(message, part = {})
    {
        if (!message?.guild || !message.author)
        {
            return;
        }

        this._scamOcrBursts ??= new Map();

        const key = `${message.guild.id}:${message.author.id}`;
        let burst = this._scamOcrBursts.get(key);

        if (!burst)
        {
            burst = {
                key,
                who:        `${this.client.utils.tag(message.author)} (${message.author.id})`,
                where:      `${message.guild.name} (${message.guild.id})`,
                censored:   0,
                recognised: 0,
                read:       0,
                reused:     0,
                known:      0,
                marked:     0,
                blank:      0,
                matches:    new Set(),

                counted: new Set()
            };

            burst.timer = setTimeout(() => this._flushScamOcr(key), SCAM_OCR_LOG_WINDOW_MS);
            burst.timer.unref?.();

            this._scamOcrBursts.set(key, burst);
        }

        if (part.read !== undefined && !burst.counted.has(message.id))
        {
            burst.counted.add(message.id);

            burst.read += part.read ?? 0;
            burst.reused += part.reused ?? 0;
            burst.known += part.known ?? 0;
        }

        burst.marked += part.marked ?? 0;

        if (part.recognised)
        {
            burst.recognised++;
        }

        if (part.censored)
        {
            burst.censored++;

            if (part.blank)
            {
                burst.blank++;
            }

            if (part.match)
            {
                burst.matches.add(scamMatchLine(part.match));
            }
        }
    }

    _flushScamOcr(key)
    {
        const burst = this._scamOcrBursts?.get(key);

        if (!burst)
        {
            return;
        }

        clearTimeout(burst.timer);
        this._scamOcrBursts.delete(key);

        const matches = [...burst.matches].slice(0, 3).join(' | ') || 'unspecified';

        const remembered = burst.marked
            ? ` Remembered ${burst.marked} image(s) as confirmed scams for ${SCAM_IMAGE_MEMORY_HOURS}h - later copies are recognised without a read.`
            : '';

        if (burst.censored)
        {

            const subject = burst.censored === 1
                ? `${burst.who} in ${burst.where}`
                : `${burst.censored} messages from ${burst.who} in ${burst.where}`;

            const blank = burst.blank === 0
                ? ''
                : (burst.blank === burst.censored
                    ? (burst.censored === 1
                        ? ' - the message carried no text of its own'
                        : ' - none of them carried any text of their own')
                    : ` - ${burst.blank} of them carried no text of their own`);

            this.client.log('INFO', `[Scam OCR] Censored ${subject} on text read out of ${scamReadSummary(burst)}${blank}. Match: ${matches}.${remembered}`);

            return;
        }

        if (burst.recognised)
        {
            const times = burst.recognised === 1
                ? ''
                : ` across ${burst.recognised} messages`;

            this.client.log('INFO', `[Scam OCR] ${burst.known}/${burst.read} image(s) from ${burst.who} in ${burst.where}${times} are already-confirmed scam images - recognised from memory, no read needed. Nothing was censored.${remembered}`);

            return;
        }

        if (burst.marked)
        {
            this.client.log('INFO', `[Scam OCR]${remembered}`);
        }
    }

    _recordCensorWarning(guild, member, entry)
    {
        this._censorWarnBursts ??= new Map();

        const key = `${guild.id}:${member.user.id}`;
        const open = this._censorWarnBursts.get(key);

        if (open)
        {
            open.count++;
            open.latest = entry;
            open.words.add(entry.word);

            return { key };
        }

        const burst = {
            key,
            guildId:  guild.id,
            modlogOn: Boolean(guild.ml?.on),
            member,
            count:    1,
            words:    new Set([entry.word]),
            latest:   entry
        };

        burst.timer = setTimeout(() => this._flushCensorWarnings(key), CENSOR_WARN_WINDOW_MS);
        burst.timer.unref?.();

        this._censorWarnBursts.set(key, burst);

        return { key };
    }

    _silenceCensorWarnings(key)
    {
        const burst = key
            ? this._censorWarnBursts?.get(key)
            : null;

        if (burst)
        {
            burst.banned = true;
        }
    }

    _flushCensorWarnings(key, options = {})
    {
        const burst = key
            ? this._censorWarnBursts?.get(key)
            : null;

        if (!burst)
        {
            return;
        }

        clearTimeout(burst.timer);
        this._censorWarnBursts.delete(key);

        const {
            member,
            count
        } = burst;
        const {
            word,
            evidence,
            maxThreat,
            maxUserThreat,
            total,
            threat,
            limit,
            channel,
            deleteAfter
        } = burst.latest;

        const words = [...burst.words].filter(Boolean).slice(0, 10).join(', ') || word;

        const times = count === 1
            ? ''
            : ` ×${count}`;

        if (burst.modlogOn)
        {
            try
            {
                this.client.pushModlog(burst.guildId, 'warning', new Discord.EmbedBuilder()
                    .setColor(this.client.data.embedColor)
                    .setDescription(evidence)
                    .setTitle(`Warned ${member.nickname
                        ? `${member.nickname}#${member.user.discriminator}`
                        : `${member.user.username}#${member.user.discriminator}`}${times}`)
                    .addFields([
                        {
                            name:  'By:',
                            value: `**${this.client.user}**`
                        },
                        {
                            name:  'Reason:',
                            value: count === 1
                                       ? `Saying a censored word. [${words}]`
                                       : `Saying a censored word in **${count}** messages. [${words}]`
                        },
                        {
                            name:  'Tier:',
                            value: `Warning tier: **\`(${maxThreat}/${maxThreat})\`**`
                        },
                        {
                            name:  'Additional:',
                            value: `**${member}** **\`(${total})\`** **\`[${threat}/${limit}]\`** **\`{${maxUserThreat}/${limit}}\`**`
                        }
                    ])
                    .setThumbnail(member.displayAvatarURL({
                        dynamic: true,
                        size:    4096
                    }))
                    .setFooter({
                        text:    'Event emitted',
                        iconURL: this.client.config.text.links.relaxyImage
                    })
                    .setTimestamp(), null);
            }
            catch (error)
            {
                this.client.data.errors++;
                this.client.log('ERROR', `Autoban modlog embed failed in ${burst.guildId}:`, error);
            }
        }

        if (options.immediate || options.banned || burst.banned || !channel)
        {
            return;
        }

        void this.client.send(channel,
            count === 1
                ? `${member}, you have received a warning for saying a censored word. **(${threat}/${limit})**`
                : `${member}, you have received **${count}** warnings for saying censored words. **(${threat}/${limit})**`).then(m =>
        {
            if (deleteAfter !== 0)
            {
                setTimeout(() => this.client.delete(m), deleteAfter);
            }
        }).catch(this.client.swallow('Autoban: warning notice'));
    }

    async LockdownVoice(newState, guild)
    {
        const member = newState.member;

        if (!newState?.channelId || !member?.permissions.has(Discord.PermissionFlagsBits['MoveMembers']) || !guild.lockeddown)
        {
            return;
        }

        try
        {
            await member.voice.setChannel(null, 'Disconnected due to guild lockdown.');
        }
        catch
        {
            return;
        }
    }

    async voteReminder(message, guild)
    {
        const now = Date.now();

        if (!guild?.d || now - (guild.d.vt ?? 0) < VOTE_REMINDER_INTERVAL)
        {
            return;
        }

        const me = message.guild?.members?.me;
        const permissions = message.channel?.permissionsFor?.(me);

        if (!me || !permissions?.has(Discord.PermissionFlagsBits.SendMessages) || !permissions.has(Discord.PermissionFlagsBits.ManageMessages))
        {
            return;
        }

        if (this.client.utils.isRestricted(guild, message.channel.id) || this.client.utils.isExempt(guild, message))
        {
            return;
        }

        guild.d.vt = now;

        await this.client.save(message.guild.id, {
            alter: 'd.vt',
            value: now
        });

        const body = `### Enjoying Relaxy?\nA vote takes ten seconds and is the only reason anyone finds it.\n\n${this.client.utils.voteLinks()}`;

        const sent = await this.client.send(message.channel, null, {
            default:   [
                {
                    color:       this.client.data.embedColor,
                    description: body,
                    footer:      this.client.data.footer
                }
            ],
            alternate: body
        }, [], [], [new Discord.ActionRowBuilder().addComponents(...this.client.utils.voteButtons())]).catch(this.client.swallow('CommonRoutines: voteReminder'));

        if (!sent)
        {
            return;
        }

        setTimeout(() => void this.client.delete(sent).catch(this.client.swallow('CommonRoutines: voteReminder delete')), VOTE_REMINDER_LIFETIME);
    }

    async joinNewGuild(guild)
    {
        if (!guild)
        {
            return null;
        }

        if (this.client.utils.blacklisted(guild.id) > 1 || this.client.utils.blacklisted(guild.ownerId) > 1)
        {
            this.client.log('DATA',
                `[Blacklist] Refused to join [${guild.name}] (${guild.id}) - ${this.client.utils.blacklisted(guild.id) > 1
                    ? 'the server is blacklisted'
                    : `its owner (${guild.ownerId}) is blacklisted`}.`);

            return guild.leave();
        }

        await this.client.clog(`${guild.name} **\`[${guild.memberCount}]\`** - \`${guild.id}\``, 'JOINED GUILD', 'good').catch(e => this.client.log('ERROR', e));

        const guildDb = await this.client.module.database.Guild(guild.id);

        if (guildDb.dm)
        {
            await this.client.save(guild.id, {
                alter: 'dm',
                value: -1
            });
        }

        const owner = await guild.fetchOwner().catch(() => null);

        this.client.log(`\n//////////////////////////////////////////////////////////////////////\nJoined new guild: ${guild.name} - ${guild.id} - [${guild.memberCount}] | ${owner?.user?.username ?? 'unknown owner'} - ${owner?.id ?? guild.ownerId}\n//////////////////////////////////////////////////////////////////////`);

        this.client.newGuild(guild);

        const fallBack = !guild.members.me.permissions.has(Discord.PermissionFlagsBits.EmbedLinks);

        const serverJoinText = await cdnText('server_join.txt', e => this.client.log('WARN', 'server_join.txt served from cache:', e));

        const row1 = new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder().setLabel('Website').setEmoji('<:relaxy:1526916768159895702>').setStyle(Discord.ButtonStyle.Link).setURL('https://relaxy.xyz'), new Discord.ButtonBuilder().setLabel('Dashboard').setEmoji('<:discordgear:1526918854863749150>').setStyle(Discord.ButtonStyle.Link).setURL('https://dashboard.relaxy.xyz'), ...this.client.utils.voteButtons());

        const row2 = new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder().setLabel('Support Relaxy!').setEmoji('<:relaxygif:1526921690481819798>').setStyle(Discord.ButtonStyle.Link).setURL('https://pay.relaxy.xyz'));

        const messageData = {
            color:       this.client.data.embedColor,
            author:      {
                name:     'Thanks for getting Relaxy on your server!',
                icon_url: this.client.cdn.brand
            },
            description: serverJoinText,
            fields:      [
                {
                    name:  'Want to know more?',
                    value: 'Visit the website or dashboard using the buttons below! <a:hypnoheart:1526916969347940425>\nThere you\'ll find guides, feature overviews, usage instructions, and technical documentation.'
                }
            ],
            footer:      this.client.data.footer,
            timestamp:   new Date()
        };

        const channels = Array.from((await guild.channels.fetch()).values()).filter(channel => channel.type === Discord.ChannelType.GuildText);
        const canSend = channel => !!channel?.permissionsFor(guild.members.me)?.has(Discord.PermissionFlagsBits.SendMessages);

        const channelToSend = channels.find(channel => acceptableChannelNames.includes(channel.name) && canSend(channel)) ?? (canSend(guild.systemChannel)
            ? guild.systemChannel
            : null) ?? channels.find(canSend) ?? null;

        if (channelToSend)
        {
            if (!fallBack)
            {
                this.client.send(channelToSend, null, [messageData]);
            }
            else
            {
                this.client.send(channelToSend, `# Thanks for getting Relaxy on your server!\n${serverJoinText}\n# non-embed fallback version, enabling the \`embedLinks\` permission is highly recommended.`);
            }
        }

        if (!owner?.user)
        {
            return null;
        }

        return this.client.send(owner.user, null, [messageData], null, null, [
            row1,
            row2
        ]).catch(this.client.swallow('CommonRoutines: send'));
    }

    async notifyMissingPermissions(guild, {
        channel = null,
        missing = [],
        what = ''
    } = {})
    {
        if (!guild?.id || !this.client.isReady())
        {
            return false;
        }

        this._permissionNotices ??= new Set();

        if (this._permissionNotices.has(guild.id))
        {
            return false;
        }

        this._permissionNotices.add(guild.id);

        try
        {
            const stored = await this.client.module.database.Guild(guild.id).catch(() => null);

            if (!stored || Date.now() - (stored.pn ?? 0) < PERMISSION_NOTICE_INTERVAL)
            {
                return false;
            }
            await this.client.save(guild.id, {
                alter: 'pn',
                value: Date.now()
            });

            const owner = await guild.fetchOwner().catch(() => null);

            const ranked = [];

            const roster = await guild.members.fetch().catch(() => null);

            for (const member of (roster ?? new Discord.Collection()).values())
            {
                if (member.user.bot || member.id === owner?.id || this.client.utils.blacklisted(member.id) > 0)
                {
                    continue;
                }

                const weight = (member.permissions.has(Discord.PermissionFlagsBits.Administrator)
                    ? 4
                    : 0) + (member.permissions.has(Discord.PermissionFlagsBits.ManageGuild)
                    ? 2
                    : 0) + (member.permissions.has(Discord.PermissionFlagsBits.ManageChannels)
                    ? 1
                    : 0);

                if (weight > 0)
                {
                    ranked.push({
                        member,
                        weight
                    });
                }
            }

            ranked.sort((a, b) => b.weight - a.weight || b.member.roles.highest.position - a.member.roles.highest.position);

            const recipients = [
                owner,
                ...ranked.slice(0, PERMISSION_NOTICE_FALLBACKS).map(entry => entry.member)
            ].filter(Boolean);

            if (!recipients.length)
            {
                this.client.log('WARN', `[Permissions] ${guild.name} (${guild.id}) is missing permissions and there is nobody reachable to tell.`);

                return false;
            }

            const embed = {
                color:       this.client.data.embedColor,
                author:      {
                    name:     'Relaxy is missing a permission',
                    icon_url: this.client.cdn.brand
                },
                description: `In **${guild.name}**, Relaxy tried ${what || 'to post a message'}${channel
                    ? ` in **#${channel.name}**`
                    : ''} and could not - it does not have the permission it needs there.\n\nUntil it is granted, that will keep silently failing.`,
                fields:      [
                    {
                        name:  'What is missing',
                        value: missing.length
                                   ? `\`${missing.join('`, `')}\``
                                   : '`Send Messages` (or `Embed Links` / `Attach Files`) in that channel'
                    },
                    {
                        name:  'How to fix it',
                        value: `Open **${channel
                            ? `#${channel.name}`
                            : 'the channel'} → Edit Channel → Permissions**, add Relaxy's role, and allow it there. A permission granted server-wide does **not** apply in a channel whose own settings deny it - that is the usual cause.`
                    }
                ],
                footer:      { text: 'Relaxy sends this at most once a day per server.' },
                timestamp:   new Date()
            };

            for (const recipient of recipients)
            {
                const user = recipient.user ?? recipient;
                const sent = await this.client.send(user, null, [embed]).catch(() => null);

                if (sent)
                {
                    this.client.log('DATA',
                        `[Permissions] Told ${this.client.utils.tag(user)} (${user.id}) that ${guild.name} (${guild.id}) is missing permissions${channel
                            ? ` in #${channel.name}`
                            : ''}.`);

                    return true;
                }
            }

            this.client.log('WARN', `[Permissions] ${guild.name} (${guild.id}) is missing permissions; none of the ${recipients.length} staff tried would accept a DM.`);

            return false;
        }
        catch (error)
        {
            this.client.log('WARN', `[Permissions] Could not notify ${guild?.id}: ${error?.message ?? error}`);

            return false;
        }
        finally
        {
            this._permissionNotices.delete(guild.id);
        }
    }

    async LockdownJoin(member, guild)
    {
        const isAdmin = member.permissions.has(Discord.PermissionsBitField.Flags.Administrator);
        const canBanMembers = member.permissions.has(Discord.PermissionsBitField.Flags.BanMembers);
        const isException = guild.mbr.ex.includes(member.user.id);
        const isLockedDown = guild.lockeddown;

        if (isAdmin || canBanMembers || isException || !isLockedDown)
        {
            return;
        }

        member.ban();
    }

    raidStore(guildId)
    {
        const existing = this.client.data.raidPrevention[guildId];

        if (!existing || Array.isArray(existing) || !Array.isArray(existing.recent))
        {
            return this.client.data.raidPrevention[guildId] = {
                recent:         [],
                triggeredUntil: 0
            };
        }

        return existing;
    }

    async raidBoot(discordGuild)
    {
        const guild = await this.client.module.database.Guild(discordGuild.id).catch(() => null);

        if (!guild?.rd?.tr)
        {
            return false;
        }

        this.raidStore(discordGuild.id);

        this.client.save(discordGuild.id, {
            alter: 'rd.tr',
            value: false
        });

        this.client.log('WARN', `Cleared a stale raid flag for [${discordGuild.name}] - it was left set by a restart mid-raid.`);

        return true;
    }

    async raidCheck(member, guild)
    {
        const rd = guild.rd;

        if (!rd?.on)
        {
            return false;
        }

        const now = Date.now();
        const store = this.raidStore(guild.id);

        const young = (now - member.user.createdTimestamp) < rd.al;

        store.recent = store.recent.filter(entry => now - entry.at < rd.tp);

        if (store.triggeredUntil > now)
        {
            if (young || member.user.bot)
            {
                await this.raidPunish(member, guild);
                return true;
            }

            return false;
        }

        if (store.triggeredUntil && rd.tr)
        {
            store.triggeredUntil = 0;

            this.client.save(guild.id, {
                alter: 'rd.tr',
                value: false
            });

            this.raidAlert(member.guild, guild, 0, { over: true }).catch(this.client.swallow('CommonRoutines: raidAlert'));
        }

        if (!young)
        {
            return false;
        }

        store.recent.push({
            id: member.user.id,
            at: now
        });

        if (store.recent.length < rd.th)
        {
            return false;
        }

        store.triggeredUntil = now + rd.tp;

        this.client.save(guild.id, {
            alter: 'rd.tr',
            value: true
        });

        const suspects = store.recent.splice(0);

        store.suspects = suspects.map(entry => entry.id);

        let punished = 0;
        for (const entry of suspects)
        {
            const suspect = entry.id === member.user.id
                ? member
                : await member.guild.members.fetch(entry.id).catch(() => null);

            if (suspect && await this.raidPunish(suspect, guild))
            {
                punished++;
            }
        }

        this.raidAlert(member.guild, guild, punished).catch(this.client.swallow('CommonRoutines: raidAlert'));
        this.client.log('WARN',
            `Raid protection triggered in [${member.guild.name}] - ${punished} member(s) ${rd.bn
                ? 'banned'
                : 'kicked'}.`);

        return true;
    }

    async raidPunish(member, guild)
    {
        try
        {
            if (guild.rd.bn && member.bannable)
            {
                await member.ban({
                    reason:               'Relaxy! raid protection: suspected of raiding.',
                    deleteMessageSeconds: 7 * 24 * 60 * 60
                });
                return true;
            }

            if (member.kickable)
            {
                await member.kick('Relaxy! raid protection: suspected of raiding.');
                return true;
            }
        }
        catch
        {
            this.client.data.errors++;
        }

        return false;
    }

    async raidAlert(discordGuild, guild, punished, { over = false } = {})
    {
        const channel = this.client.channels.cache.get(guild.ml?.c) ?? discordGuild.systemChannel ?? null;

        if (!channel?.permissionsFor(discordGuild.members.me)?.has(Discord.PermissionFlagsBits.SendMessages))
        {
            return;
        }

        return this.client.send(channel, null, [
            over
                ? {
                    color:       0x57F287,
                    title:       '✅ Raid protection stood down',
                    description: 'No further suspicious joins inside the detection window, so the raid is treated as over.\nNew accounts are no longer being removed on sight.',
                    thumbnail:   { url: this.client.utils.guildIcon(discordGuild) },
                    footer:      this.client.data.footer,
                    timestamp:   new Date()
                }
                : {
                    color:       0xED4245,
                    title:       '🚨 Raid protection triggered!',
                    description: `A burst of suspicious joins tripped raid protection.\n**${punished}** member(s) were ${guild.rd.bn
                        ? 'banned'
                        : 'kicked'}.\nNew suspicious accounts will be removed automatically until the raid subsides.`,
                    thumbnail:   { url: this.client.utils.guildIcon(discordGuild) },
                    footer:      this.client.data.footer,
                    timestamp:   new Date()
                }
        ]);
    }

    async handleCounting(message, guild)
    {
        const co = guild.co;

        if (!co?.on || message.channel.id !== co.c || message.author.bot)
        {
            return false;
        }

        const client = this.client;
        const content = message.content.trim();

        if (!/^\d+$/.test(content))
        {
            return false;
        }

        const number = Number(content);

        const expected = co.cur + 1;

        if (co.last && co.last === message.author.id)
        {
            await client.react(message, '❌').catch(this.client.swallow('CommonRoutines: react'));

            if (co.rst)
            {
                await this.resetCount(message, guild, `${message.author} tried to count twice in a row!`);
            }

            return true;
        }

        if (number !== expected)
        {
            await client.react(message, '❌').catch(this.client.swallow('CommonRoutines: react'));

            if (co.rst)
            {
                await this.resetCount(message, guild, `${message.author} broke the count at **${co.cur}** - the next number was **${expected}**.`);
            }

            return true;
        }

        const isRecord = expected > co.hi;

        co.cur = expected;
        co.last = message.author.id;
        client.save(guild.id, {
            alter: 'co.cur',
            value: expected
        });
        client.save(guild.id, {
            alter: 'co.last',
            value: message.author.id
        });

        if (isRecord)
        {
            co.hi = expected;
            client.save(guild.id, {
                alter: 'co.hi',
                value: expected
            });
        }

        const member = await client.module.database.Member(message.author.id, guild.id);
        if (member)
        {
            client.saveMember(guild.id, member.id, {
                alter: 'co',
                value: (member.co ?? 0) + 1
            });
        }

        const payout = countingPayout(co.pay, expected);

        if (payout > 0)
        {
            const profile = await client.module.database.User(message.author.id).catch(() => null);

            if (profile)
            {

                client.saveProfile(message.author.id, {
                    alter: 'm',
                    value: (profile.m ?? 0) + payout
                });
            }
        }

        await client.react(message,
            isRecord && expected > 1
                ? '🏆'
                : '✅').catch(this.client.swallow('CommonRoutines: react'));

        return true;
    }

    async resetCount(message, guild, reason)
    {
        guild.co.cur = 0;
        guild.co.last = '';
        this.client.save(guild.id, {
            alter: 'co.cur',
            value: 0
        });
        this.client.save(guild.id, {
            alter: 'co.last',
            value: ''
        });

        return this.client.send(message.channel, null, [
            {
                color:       0xED4245,
                title:       '💥 Count reset!',
                description: `${reason}\nStart again from **1**. The record to beat is **${guild.co.hi}**.`,
                footer:      this.client.data.footer
            }
        ]);
    }

    async Status()
    {
        if (this.client.data.status === operatingMode.SPECIAL)
        {
            this.client.data.status = operatingMode.NORMAL;
        }

        const setStatus = async () =>
        {

            switch (this.client.data.status)
            {
                case operatingMode.NORMAL:
                    const [users, guilds] = await Promise.all([
                        this.client.utils.getUserCount(),
                        this.client.utils.getServerCount()
                    ]);
                    const status = this.client.config.text.clientStatus.toString().split('
                    return this.client.setActivity(status, this.client.config.text.clientStatus.toString().split('//')[1]);
                case operatingMode.DEBUG:
                    return this.client.setActivity('DEBUG MODE', 'PLAYING');
                case operatingMode.MAINTENANCE:
                    return this.client.setActivity('MAINTENANCE MODE', 'PLAYING');
                case operatingMode.OFFLINE:
                    return this.client.setActivity('SHUTTING DOWN', 'WATCHING');
            }
        };

        setInterval(async () =>
        {
            return new Promise(async () =>
            {
                if (!this.client.data.refreshStatus)
                {
                    return;
                }
                setStatus();
            });
        }, 2 * 60 * 1000);
    }

    async ReactionAdd(reaction, user, guild)
    {
        const member = reaction.message.guild.members.resolve(user.id);

        const muted = await this.client.module.database.isMuted(guild.id, user.id);
        if (user.bot || !member || (guild.d.mut.id !== '' && muted))
        {
            return;
        }

        const reactionRoles = (await this.client.module.database.getReactionRoles(guild.id)).e;
        const Rmessage = reactionRoles.find(r => r.id === reaction.message.id);

        if (!Rmessage || Rmessage.length === 0)
        {
            return;
        }

        let flag = false;
        let reactionMessageRolesLength = Rmessage.roles.length;

        for (let i = 0; i < reactionMessageRolesLength; i++)
        {
            if (Rmessage.emojis[i].includes(reaction.emoji.name))
            {
                reactionMessageRolesLength = i;
            }
        }

        const roles1 = Object.keys(guild.rt[1]);
        const roles2 = Object.keys(guild.rt[2]);
        const roles3 = Object.keys(guild.rt[3]);
        const roles4 = Object.keys(guild.rt[4]);
        for (let i = 0; i < roles1.length; i++)
        {
            if (flag)
            {
                return;
            }

            guild.rt[1][roles1[i]].forEach(async r =>
            {
                if (Rmessage.roles[reactionMessageRolesLength] == roles1[i] && reaction.message.guild.members.resolve(user).roles.cache.has(r) && !this.client.utils.isExempt(guild, reaction.message))
                {
                    flag = true;
                    return reaction.message.reactions.cache.find(r => r.emoji.name === reaction.emoji.name)
                                   ?.users.remove(user.id)
                                   .catch(this.client.swallow('reactionRoles: remove reaction'));
                }
            });
        }

        for (let i = 0; i < roles2.length; i++)
        {
            if (flag)
            {
                return;
            }

            guild.rt[2][roles2[i]].forEach(async r =>
            {
                if (Rmessage.roles[reactionMessageRolesLength] == r && !reaction.message.guild.members.resolve(user).roles.cache.has(roles2[i]) && !this.client.utils.isExempt(guild, reaction.message))
                {
                    flag = true;

                    return reaction.message.reactions.cache.find(r => r.emoji.name === reaction.emoji.name)
                                   ?.users.remove(user.id)
                                   .catch(this.client.swallow('reactionRoles: remove reaction'));
                }
            });
        }

        for (let i = 0; i < roles3.length; i++)
        {
            if (flag)
            {
                return;
            }

            guild.rt[3][roles3[i]].forEach(async r =>
            {
                if (Rmessage.roles[reactionMessageRolesLength] == roles3[i] && !reaction.message.guild.members.resolve(user).roles.cache.has(r) && !this.client.utils.isExempt(guild, reaction.message))
                {
                    flag = true;

                    return reaction.message.reactions.cache.find(r => r.emoji.name === reaction.emoji.name)
                                   ?.users.remove(user.id)
                                   .catch(this.client.swallow('reactionRoles: remove reaction'));
                }
            });
        }

        for (let i = 0; i < roles4.length; i++)
        {
            if (flag)
            {
                return;
            }

            guild.rt[4][roles4[i]].forEach(async r =>
            {
                if (Rmessage.roles[reactionMessageRolesLength] == roles4[i] && reaction.message.guild.members.resolve(user).roles.cache.has(r) && !this.client.utils.isExempt(guild, reaction.message))
                {
                    flag = true;

                    return reaction.message.reactions.cache.find(r => r.emoji.name === reaction.emoji.name)
                                   ?.users.remove(user.id)
                                   .catch(this.client.swallow('reactionRoles: remove reaction'));
                }
            });
        }

        return reaction.message.guild.members.resolve(user).roles.add(reaction.message.guild.roles.cache.find(role => role.id === Rmessage.roles[reactionMessageRolesLength]));
    }

    async ReactionRemove(reaction, user, guild)
    {
        let member = reaction.message.guild.members.resolve(user.id);

        if (user.bot || !member)
        {
            return;
        }

        let emojiIndex = null;

        const guildRestrictors2 = Object.keys(guild.rt[2]);
        const reactionRoles = (await this.client.module.database.getReactionRoles(guild.id)).e;
        const reactionRoleMessage = reactionRoles.find(r => r.id === reaction.message.id);

        if (!reactionRoleMessage)
        {
            return;
        }

        for (let i = 0; i < reactionRoleMessage.roles.length; i++)
        {
            if (reactionRoleMessage.emojis[i].includes(reaction.emoji.name))
            {
                emojiIndex = i;
            }
        }

        for (let i = 0; i < guildRestrictors2.length; i++)
        {
            if (reactionRoleMessage.roles[emojiIndex] == guildRestrictors2[i])
            {
                guild.rt[2][guildRestrictors2[i]].forEach(async role =>
                {
                    if (member.roles.cache.has(role))
                    {
                        member.roles.remove(role);

                        reactionRoles.forEach(async message =>
                        {
                            this.client.channels.cache.get(message.channel).messages.fetch(message.id, {
                                cache: false,
                                limit: 1
                            }).then(Message =>
                            {
                                if (!Message)
                                {
                                    return;
                                }

                                Message.reactions.cache.forEach(async reaction =>
                                {
                                    if (reactionRoleMessage.emojis[emojiIndex].includes(reaction.emoji.name))
                                    {
                                        return Message.reactions.cache.find(W => W.emoji.name === reaction.emoji.name).users.remove(user.id);
                                    }
                                });
                            });
                        });
                    }
                });
            }
        }

        return member.roles.remove(reaction.message.guild.roles.cache.find(role => role.id === reactionRoleMessage.roles[emojiIndex]));
    }

    async ReactionRoles(message, guild)
    {
        const reactionRoles = (await this.client.module.database.getReactionRoles(guild.id)).e;
        await this.client.react(message, reactionRoles.find(r => r.id === message.id).emojis);
    }

    async HeartBoard(reaction, user, eventType, guild)
    {
        if (!reaction || !user)
        {
            return;
        }

        let message = reaction.message;

        if (!message)
        {
            return;
        }

        if (message.partial)
        {
            try
            {
                message = await message.fetch();
            }
            catch
            {
                return;
            }
        }

        if (!message?.author)
        {
            return;
        }

        const lockKey = message.author.id === this.client.user.id && message?.embeds?.[0]?.footer?.text?.includes('ID:')
            ? message.embeds[0].footer.text.split(' ')[1]
            : message.id;

        return this._withHeartBoardLock(lockKey, () => this._heartBoard(reaction, user, eventType, guild, message));
    }

    _withHeartBoardLock(key, task)
    {
        this._heartBoardLocks ??= new Map();

        const previous = this._heartBoardLocks.get(key) ?? Promise.resolve();

        const run = previous.catch(this.client.swallow('CommonRoutines: resolve')).then(task);

        this._heartBoardLocks.set(key, run);

        void run.catch(this.client.swallow('CommonRoutines: set')).finally(() =>
        {
            if (this._heartBoardLocks.get(key) === run)
            {
                this._heartBoardLocks.delete(key);
            }
        });

        return run;
    }

    _heartBoardReaction(message, board)
    {
        return message?.reactions?.cache?.find(entry => board.em[0].includes(entry.emoji.name) && (entry.emoji.id
            ? board.em[0].includes(entry.emoji.id)
            : true)) ?? null;
    }

    async _heartBoardVoters(reaction)
    {
        if (!reaction)
        {
            return null;
        }

        const voters = [];

        let after;

        while (voters.length < HEARTBOARD_REACTOR_LIMIT)
        {
            const page = await reaction.users.fetch(after
                ? {
                    limit: HEARTBOARD_REACTOR_PAGE,
                    after
                }
                : { limit: HEARTBOARD_REACTOR_PAGE }).catch(this.client.swallow('CommonRoutines: heartboard reactors'));

            if (!page)
            {
                return null;
            }

            for (const reactor of page.values())
            {
                if (!reactor.bot)
                {
                    voters.push(reactor.id);
                }
            }

            if (page.size < HEARTBOARD_REACTOR_PAGE)
            {
                return voters;
            }

            after = page.lastKey();
        }

        return voters;
    }

    async _reconcileHeartBoardVotes(message, post, board)
    {
        const reaction = this._heartBoardReaction(message, board);

        if (!reaction)
        {
            return false;
        }

        const seen = Math.max(0,
            (reaction.count ?? 0) - (reaction.me
                ? 1
                : 0));

        if (Math.abs(seen - post.or.length) <= HEARTBOARD_DRIFT_TOLERANCE)
        {
            return false;
        }

        this._heartBoardReconciles ??= new Map();

        const now = Date.now();
        const last = this._heartBoardReconciles.get(post.oid) ?? 0;

        if (now - last < HEARTBOARD_RECONCILE_INTERVAL)
        {
            return false;
        }

        for (const [id, at] of this._heartBoardReconciles)
        {
            if (now - at >= HEARTBOARD_RECONCILE_INTERVAL)
            {
                this._heartBoardReconciles.delete(id);
            }
        }

        this._heartBoardReconciles.set(post.oid, now);

        const voters = await this._heartBoardVoters(reaction);

        if (!voters)
        {
            return false;
        }

        post.or = voters.filter(id => !post.er.includes(id));
        post.n = post.or.length + post.er.length;

        this.client.saveHeartBoardPost(post.oid, {
            alter: 'n',
            value: post.n
        }, {
            alter: 'or',
            value: post.or
        });

        if (this.client.flags.logs.debug)
        {
            this.client.log('DEBUG', `[heartboard] Rebuilt ${post.oid} from the original: ${post.n} vote(s) across ${post.or.length} on the message and ${post.er.length} on the board.`);
        }

        return true;
    }

    _queueHeartBoardEdit(message, render)
    {
        this._heartBoardEdits ??= new Map();

        if (!message?.id)
        {
            return;
        }

        const pending = this._heartBoardEdits.get(message.id);

        if (pending)
        {
            pending.message = message;
            pending.render = render;
            pending.dirty = true;

            return;
        }

        const entry = {
            message,
            render,
            dirty: false
        };

        const flush = () =>
        {
            if (!entry.dirty)
            {

                clearInterval(entry.timer);
                this._heartBoardEdits.delete(message.id);

                return;
            }

            entry.dirty = false;

            const {
                content,
                embeds
            } = entry.render();

            void this.client.edit(entry.message, content, embeds).catch(this.client.swallow('CommonRoutines: heartboard edit'));
        };

        entry.timer = setInterval(flush, HEARTBOARD_EDIT_INTERVAL);
        entry.timer.unref?.();

        this._heartBoardEdits.set(message.id, entry);

        const {
            content,
            embeds
        } = render();

        void this.client.edit(message, content, embeds).catch(this.client.swallow('CommonRoutines: heartboard edit'));
    }

    _cancelHeartBoardEdit(messageId)
    {
        const pending = this._heartBoardEdits?.get(messageId);

        if (!pending)
        {
            return;
        }

        clearInterval(pending.timer);
        this._heartBoardEdits.delete(messageId);
    }

    async _heartBoard(reaction, user, eventType, guild, message)
    {
        const heartBoardChannel = await this.client.module.database.findCorrectHeartBoardChannel(message.guild.id, reaction.emoji.name, reaction.emoji.id);

        if (!message.author || !heartBoardChannel || !guild.hb.on || user.bot || !(heartBoardChannel.em[0].includes(reaction.emoji.name) && (reaction.emoji.id
            ? heartBoardChannel.em[0].includes(reaction.emoji.id)
            : true)))
        {
            return;
        }

        const voteRequirement = heartBoardChannel.rq;
        const isEmbed = message.author.id === this.client.user.id && message?.embeds?.[0]?.footer?.text.includes('ID:');
        const originalId = isEmbed
            ? message.embeds[0].footer.text.split(' ')[1]
            : message.id;
        const post = await this.client.module.database.HeartBoardPost(isEmbed, originalId);

        if (isEmbed && !post)
        {
            return;
        }

        if (!voteRequirement)
        {
            this.client.saveHeartBoard(heartBoardChannel.id, guild.id, {
                alter: 'rq',
                value: 3
            });
        }

        switch (eventType)
        {
            case 'messageReactionAdd':
            {

                if (!post || isEmbed && post?.oid === '')
                {
                    return;
                }

                switch (message.id)
                {
                    case post.eid:
                    {
                        if (post.or.includes(user.id))
                        {
                            return message.reactions.cache.find(r => heartBoardChannel.em[0].includes(r.emoji.name) && r.emoji.id
                                ? heartBoardChannel.em[0].includes(r.emoji.id)
                                : true).users.remove(user.id);
                        }
                        if (post.er.includes(user.id))
                        {
                            return;
                        }
                        post.n += 1;
                        post.er.push(user.id);
                        post.or = post.or.filter(r => r !== user.id);

                        this.client.saveHeartBoardPost(originalId, {
                            alter: 'n',
                            value: post.n
                        }, {
                            alter: 'er',
                            value: post.er
                        }, {
                            alter: 'or',
                            value: post.or
                        });

                        return this._queueHeartBoardEdit(message, () => ({
                            content: heartBoardStringContent(this.client.channels.cache.get(post.oc), post, voteRequirement, heartBoardChannel),
                            embeds:  [message.embeds[0].data]
                        }));
                    }

                    case post.oid:
                    {

                        if (post.eid === '')
                        {
                            break;
                        }
                        if (post.er.includes(user.id))
                        {
                            return message.reactions.cache.find(r => heartBoardChannel.em[0].includes(r.emoji.name) && r.emoji.id
                                ? heartBoardChannel.em[0].includes(r.emoji.id)
                                : true).users.remove(user.id);
                        }
                        else if (post.or.includes(user.id))
                        {
                            return;
                        }
                        else
                        {
                            post.n += 1;
                            post.or.push(user.id);
                            post.er = post.er.filter(r => r !== user.id);

                            this.client.saveHeartBoardPost(originalId, {
                                alter:  'n',
                                value:  post.n,
                                data:   [
                                    isEmbed,
                                    originalId
                                ],
                                filter: { originalId }
                            }, {
                                alter:  'or',
                                value:  post.or,
                                data:   [
                                    isEmbed,
                                    originalId
                                ],
                                filter: { originalId }
                            }, {
                                alter:  'er',
                                value:  post.er,
                                data:   [
                                    isEmbed,
                                    originalId
                                ],
                                filter: { originalId }
                            });

                            await this._reconcileHeartBoardVotes(message, post, heartBoardChannel);

                            const embedMessage = await this.client.channels.cache.get(heartBoardChannel.id)?.messages?.fetch(post.eid).catch(this.client.swallow('CommonRoutines: heartboard embed')) ?? null;

                            if (!embedMessage)
                            {
                                return;
                            }

                            return this._queueHeartBoardEdit(embedMessage, () => ({
                                content: heartBoardStringContent(this.client.channels.cache.get(post.oc), post, voteRequirement, heartBoardChannel),
                                embeds:  [embedMessage.embeds[0].data]
                            }));
                        }
                    }
                }

                if (post.n === 0 && (this._heartBoardReaction(message, heartBoardChannel)?.count ?? 0) > 1)
                {
                    const voters = await this._heartBoardVoters(this._heartBoardReaction(message, heartBoardChannel));

                    if (!voters)
                    {
                        return;
                    }

                    for (const voter of voters)
                    {
                        if (post.or.includes(voter))
                        {
                            continue;
                        }

                        post.n += 1;
                        post.or.push(voter);
                    }
                }
                else if (!post.or.includes(user.id))
                {
                    post.n += 1;
                    post.or.push(user.id);
                }

                post.oc = message.channel.id;

                let embedIdModified = false;
                if (post.n >= voteRequirement)
                {

                    const hbEmbed = await this.client.class.heartboardpost.from(this.client, message, heartBoardChannel);

                    if (!hbEmbed)
                    {
                        return;
                    }

                    const hbc = await this.client.channels.fetch(heartBoardChannel.id);

                    const embedMessage = await this.client.send(hbc, heartBoardStringContent(message.channel, post, voteRequirement, heartBoardChannel), [hbEmbed]);

                    if (!embedMessage)
                    {
                        return;
                    }

                    post.eid = embedMessage.id;
                    embedIdModified = true;

                    await this.client.react(embedMessage, heartBoardChannel.em[0]);
                    this.client.module.profiles.Achievement(message, 'got_heart', guild);
                }

                return this.client.saveHeartBoardPost(originalId,
                    {
                        alter:  'n',
                        value:  post.n,
                        data:   [
                            isEmbed,
                            originalId
                        ],
                        filter: { originalId }
                    },
                    {
                        alter:  'or',
                        value:  post.or,
                        data:   [
                            isEmbed,
                            originalId
                        ],
                        filter: { originalId }
                    },
                    {
                        alter:  'oc',
                        value:  post.oc,
                        data:   [
                            isEmbed,
                            originalId
                        ],
                        filter: { originalId }
                    },
                    embedIdModified
                        ? {
                            alter:  'eid',
                            value:  post.eid,
                            data:   [
                                isEmbed,
                                originalId
                            ],
                            filter: { originalId }
                        }
                        : null,
                    4);
            }

            case 'messageReactionRemove':
            {
                if (isEmbed
                    ? post.or.includes(user.id)
                    : post.er.includes(user.id))
                {
                    return;
                }

                switch (message.id)
                {
                    case post.oid:
                    {
                        post.n -= 1;
                        post.or = post.or.filter(id => id !== user.id);

                        this.client.saveHeartBoardPost(originalId, {
                            alter: 'n',
                            value: post.n
                        }, {
                            alter: 'or',
                            value: post.or
                        });

                        if (post.eid === '')
                        {
                            return;
                        }

                        const embedMessage = await this.client.getMessage(this.client.channels.cache.get(heartBoardChannel.id), post.eid);

                        if (!embedMessage)
                        {
                            return;
                        }
                        if (post.n <= 0)
                        {
                            this._cancelHeartBoardEdit(embedMessage.id);
                            await this.client.module.database.deleteHeartBoardPost(post.oid);

                            return this.client.delete(embedMessage);
                        }

                        return this._queueHeartBoardEdit(embedMessage, () => ({
                            content: heartBoardStringContent(message.channel, post, voteRequirement, heartBoardChannel),
                            embeds:  [embedMessage.embeds[0].data]
                        }));
                    }

                    case post.eid:
                    {
                        post.n -= 1;
                        post.er = post.er.filter(id => id !== user.id);

                        this.client.saveHeartBoardPost(originalId, {
                            alter:  'n',
                            value:  post.n,
                            data:   [
                                isEmbed,
                                originalId
                            ],
                            filter: { originalId }
                        }, {
                            alter:  'er',
                            value:  post.er,
                            data:   [
                                isEmbed,
                                originalId
                            ],
                            filter: { originalId }
                        });

                        if (post.n <= 0)
                        {
                            this._cancelHeartBoardEdit(message.id);
                            await this.client.module.database.deleteHeartBoardPost(post.oid);

                            return this.client.delete(message);
                        }

                        return this._queueHeartBoardEdit(message, () => ({
                            content: heartBoardStringContent(this.client.channels.cache.get(post.oc), post, voteRequirement, heartBoardChannel),
                            embeds:  [message.embeds[0].data]
                        }));
                    }

                    default:
                        return;
                }
            }
        }
    }

    Reminds()
    {
        let delivering = false;

        const _ = setInterval(async () =>
        {

            if (!this.client.databaseLoaded || delivering)
            {
                return;
            }

            delivering = true;

            try
            {
                for (const User of [...this.client.module.database._cache.users.values()])
                {
                    await this.deliverReminds(User).catch(error =>
                    {
                        this.client.data.errors++;
                        this.client.log('ERROR', `Reminds: ${User?.id}`, error);
                    });
                }
            }
            catch (error)
            {
                this.client.data.errors++;
                this.client.log('ERROR', 'Reminds', error);
            }
            finally
            {
                delivering = false;
            }
        }, 10000);

        this.intervals.push(_);
    }

    async deliverReminds(User)
    {
        if (!Array.isArray(User?.rm) || !User.rm.length)
        {
            return;
        }

        const now = Date.now();
        const due = [];
        const keep = [];

        for (const entry of User.rm)
        {

            const at = Number(String(entry ?? '').split('_')[0]);

            if (!Number.isFinite(at))
            {
                continue;
            }

            (at <= now
                ? due
                : keep).push(entry);
        }

        if (!due.length && keep.length === User.rm.length)
        {
            return;
        }

        User.rm = keep;

        await this.client.saveProfile(User.id, {
            alter: 'rm',
            value: keep
        });

        if (!due.length)
        {
            return;
        }

        const user = await this.client.users.fetch(User.id).catch(this.client.swallow('CommonRoutines: Reminds fetch'));

        if (!user)
        {
            return;
        }

        for (const entry of due)
        {
            const split = String(entry).split('_');
            const at = Number(split[0]);
            const note = split.slice(1).join('_');

            const late = at - Date.now();

            this.client.module?.stats?.count('reminder.completed');

            await this.client.send(user,
                `Hey ${user}, here's your reminder!${late <= -150000
                    ? ` (Overdue **\`${this.client.imports.time(Math.abs(late))}\`** due to Relaxy downtime)`
                    : ''}`,
                [
                    {
                        color:       this.client.data.embedColor,
                        description: `**${note}**`
                    }
                ]).catch(this.client.swallow('CommonRoutines: Reminds send'));
        }
    }

    Mutes()
    {
        let inProgress = false;
        const db = this.client.module.database;

        const _ = setInterval(async () =>
        {
            if (inProgress)
            {
                return;
            }

            inProgress = true;

            try
            {

                const due = await db.dueMutes();

                for (const mute of due)
                {
                    const guild = this.client.guilds.cache.get(mute.g);

                    if (!guild || !this.client.ws.shards.has(guild.shardId))
                    {
                        continue;
                    }

                    const Guild = await db.getGuild(mute.g);

                    if (mute.ban)
                    {
                        const user = await this.client.getUser(mute.user);
                        const fetchedBan = await guild.bans.fetch(user).catch(this.client.swallow('CommonRoutines: fetch')) ?? null;

                        if (!fetchedBan)
                        {
                            await db.removeMute(mute.g, mute.user);
                            continue;
                        }

                        try
                        {
                            await guild.bans.remove(fetchedBan.user);
                        }
                        catch
                        {
                            await db.removeMute(mute.g, mute.user);
                            continue;
                        }

                        this.client.cacheFor(mute.g, `unban_${mute.user}`, 30000);

                        await db.removeMute(mute.g, mute.user);
                        continue;
                    }

                    const mutedMember = await this.client.getMember(guild, mute.user);

                    if (!mutedMember)
                    {
                        await db.removeMute(mute.g, mute.user);
                        continue;
                    }

                    if (mutedMember.roles.cache.get(Guild.d.mut.id))
                    {
                        await db.removeMute(mute.g, mute.user);

                        await db.addCaseOutcome(mute.g, mute.user, {
                            type:  'unmute',
                            mod:   '',
                            types: ['mute']
                        }).catch(this.client.swallow('CommonRoutines: mute expiry addCaseOutcome'));

                        if (!mute.roles.length)
                        {
                            mutedMember.roles.set([]).catch(this.client.swallow('CommonRoutines: set'));
                        }
                        else
                        {
                            mutedMember.roles.set(mute.roles.concat([
                                mutedMember.roles?.premiumSubscriberRole,
                                mutedMember.roles?.botRole
                            ].filter(i => i !== null))).catch(this.client.swallow('CommonRoutines: filter'));
                        }

                        const muteTime = this.client.imports.time(Number(mute.dur));
                        const muteAuthor = await this.client.getMember(guild, mute.mod);

                        this.client.module?.stats?.count('moderation.unmute');

                        if (Guild.ml.on)
                        {
                            this.client.pushModlog(mute.g, 'memberUnmuted', new this.client.class.modlog({
                                color:     'good',
                                event:     'Member unmuted',
                                fields:    [
                                               {
                                                   name:   'User:',
                                                   value:  mutedMember.toString(),
                                                   inline: true
                                               },
                                               {
                                                   name:   'User ID:',
                                                   value:  `\`${mutedMember.user.id}\``,
                                                   inline: true
                                               },
                                               {
                                                   name:  'Mute time:',
                                                   value: `\`${muteTime}\``
                                               },
                                               {
                                                   name:  'Muted by:',
                                                   value: `${muteAuthor} [unmute timeout reached]`
                                               },
                                               {
                                                   name:  'Reason:',
                                                   value: mute.reason.length > 1
                                                              ? mute.reason
                                                              : 'No reason provided.'
                                               }
                                           ].filter(i => i !== null),
                                thumbnail: mutedMember.user.displayAvatarURL({
                                    dynamic: true,
                                    size:    4096
                                })
                            }), null);
                        }
                    }
                    else
                    {
                        await db.removeMute(mute.g, mute.user);
                    }
                }
            }
            catch (e)
            {
                this.client.log('ERROR', e);
            }

            inProgress = false;
        }, 10 * 1000);

        this.intervals.push(_);
    }

    Modlogs()
    {
        const _ = setInterval(async () =>
        {
            return new Promise(async () =>
            {
                this.client.module.database._cache.servers.forEach(async Guild =>
                {
                    const queue = this.client.data.modlogs[Guild.id];

                    if (!queue?.length)
                    {
                        return;
                    }

                    if (!Guild.ml.on)
                    {
                        queue.length = 0;

                        return;
                    }

                    const [event, embed, files] = queue.shift();

                    const route = this.client.types.modlogEvents[event]
                        ? Guild.ml.ev[event]
                        : null;

                    if (!route?.on)
                    {
                        return;
                    }

                    const channel = this.client.channels.cache.get(route.channel);

                    if (!channel)
                    {
                        return;
                    }

                    await this.client.send(channel, null, [embed], files ?? null).catch(() => this.client.send(channel, 'Missing permissions to display modlogs, please enable `EmbedLinks`, `AttachFiles` and `ViewAuditLogs`.')
                                                                                                  .catch(this.client.swallow('CommonRoutines: Modlogs fallback')));
                });
            });
        }, 2500);

        const __ = setInterval(async () =>
        {
            return new Promise(async () =>
            {
                this.client.module.database._cache.servers.forEach(async Guild =>
                {
                    if (this.client.data.joinMessages[Guild.id] && this.client.data.joinMessages[Guild.id].length !== 0 && Guild.wc.on)
                    {
                        const joinMessage = this.client.data.joinMessages[Guild.id].shift();

                        switch (joinMessage[0])
                        {
                            case 'welcome':
                                if (this.client.channels.cache.get(Guild.wc.j.c))
                                {
                                    return this.client.send(this.client.channels.cache.get(Guild.wc.j.c), joinMessage[1][0], joinMessage[1][1], joinMessage[1][2]);
                                }
                                else
                                {
                                    return this.client.save(Guild.id, {
                                        alter: 'wc.j.c',
                                        value: ''
                                    });
                                }
                            case 'leave':
                                if (this.client.channels.cache.get(Guild.wc.l.c))
                                {
                                    return this.client.send(this.client.channels.cache.get(Guild.wc.l.c), joinMessage[1][0], joinMessage[1][1], joinMessage[1][2]);
                                }
                                else
                                {
                                    return this.client.save(Guild.id, {
                                        alter: 'wc.l.c',
                                        value: ''
                                    });
                                }
                        }
                    }
                });
            });
        }, 10000);

        this.intervals.push(_);
        this.intervals.push(__);
    }

    async refreshBlacklist(entries = null)
    {
        const cache = this.client.data.blacklist;

        let list = entries;

        if (!list)
        {
            const read = await loadBlacklist(this.client.config.keys.dbtoken,
                error => this.client.log('WARN',
                    `[Blacklist] Could not read the blacklist (${error?.message ?? error}). Keeping the ${cache.entries.length} entr${cache.entries.length === 1
                        ? 'y'
                        : 'ies'} already cached.`));

            if (!read.fromDatabase)
            {
                return false;
            }

            list = read.entries;
        }

        const now = Date.now();

        cache.entries = list;
        cache.enforced = new Set(list.filter(entry => !entry.ex || entry.ex <= now).map(entry => entry.id));
        cache.grace = new Set(list.filter(entry => entry.ex > now).map(entry => entry.id));
        cache.at = now;
        cache.loaded = true;

        return true;
    }

    async broadcastBlacklist(entries)
    {
        await this.client.cluster.broadcastEval((client, { list }) => client.core.refreshBlacklist(list), { context: { list: entries } })
                  .catch(error => this.client.log('WARN', `[Blacklist] Wrote the blacklist but could not push it to every cluster (${error?.message ?? error}). They will pick it up on their next sweep.`));
    }

    async enforceBlacklistUserBan(userId)
    {
        const results = await this.client.cluster.broadcastEval(async (c, {
            userId,
            reason
        }) =>
        {
            let banned = 0;

            for (const guild of c.guilds.cache.values())
            {
                const member = await guild.members.fetch(userId).catch(() => null);

                if (!member || !member.bannable)
                {
                    continue;
                }

                const ok = await guild.bans.create(userId, { reason }).then(() => true, () => false);

                if (ok)
                {
                    banned++;
                }
            }

            return banned;
        }, {
            context: {
                userId,
                reason: BLACKLIST_ACTION_REASON
            }
        }).catch(error =>
        {
            this.client.log('WARN', `[Blacklist] Could not ban ${userId} across the fleet: ${error?.message ?? error}`);

            return [];
        });

        return (results ?? []).reduce((total, count) => total + (Number(count) || 0), 0);
    }

    async nukeBlacklistedGuild(guild)
    {
        for (const channel of guild.channels.cache.values())
        {
            if (!channel?.deletable)
            {
                continue;
            }

            await channel.delete(BLACKLIST_ACTION_REASON).catch(error => this.client.log('WARN', `[Blacklist] Could not delete channel ${channel.id} in ${guild.id}: ${error?.message ?? error}`));
        }

        for (const role of guild.roles.cache.values())
        {

            if (role.id === guild.id || role.managed || !role.editable)
            {
                continue;
            }

            await role.delete(BLACKLIST_ACTION_REASON).catch(error => this.client.log('WARN', `[Blacklist] Could not delete role ${role.id} in ${guild.id}: ${error?.message ?? error}`));
        }

        const left = await guild.leave().then(() => true, error =>
        {
            this.client.log('WARN', `[Blacklist] Could not leave blacklisted server ${guild.id} after stripping it: ${error?.message ?? error}`);

            return false;
        });

        if (!left)
        {
            return false;
        }

        const deleted = await this.client.module.database.purgeGuild(guild.id).catch(error =>
        {
            this.client.log('ERROR', `[Blacklist] Left blacklisted server ${guild.id} but could not purge its data: ${error?.message ?? error}`);

            return null;
        });

        if (deleted)
        {
            this.client.log('DATA', `[Blacklist] Nuked and purged blacklisted server ${guild.id}. Deleted ${Object.entries(deleted).map(([model, count]) => `${count} ${model}`).join(', ') || 'no'} document(s).`);
        }

        return true;
    }

    async migrateLegacyBlacklist()
    {
        const raw = await this.client.readFile('./assets/config/blacklist.json').catch(() => null);

        if (!raw)
        {
            return null;
        }

        const legacy = await this.client.parseJSON(raw.toString()).catch(() => null);

        if (!legacy)
        {
            return null;
        }

        const now = Date.now();
        const entries = [];

        const take = (list, kind, graced) =>
        {
            for (const item of list ?? [])
            {
                const id = String(graced
                    ? (item?.u ?? item?.s ?? '')
                    : (item ?? '')).trim();

                if (!/^\d{17,20}$/.test(id))
                {
                    continue;
                }

                entries.push({
                    id,
                    k:  kind,
                    at: Number(item?.ct) || now,
                    by: '',
                    rs: 'Migrated from blacklist.json',
                    ex: graced
                            ? (Number(item?.ct) || now) + (Number(item?.t) || 0)
                            : 0
                });
            }
        };

        take(legacy.total?.users, 'u', false);
        take(legacy.total?.servers, 'g', false);
        take(legacy.grace?.users, 'u', true);
        take(legacy.grace?.servers, 'g', true);

        return entries.length
            ? entries
            : null;
    }

    blackListProcessing()
    {

        const SWEEP_INTERVAL = 60 * 1000;

        const MAX_LEAVES_PER_SWEEP = 5;

        if (this._blacklistSweep)
        {
            clearInterval(this._blacklistSweep);
        }

        let sweeping = false;

        const sweep = async () =>
        {
            const fresh = await this.refreshBlacklist();

            if (!fresh && !this.client.data.blacklist.loaded)
            {
                return;
            }

            const cache = this.client.data.blacklist;

            if (this.client._trueRelaxy && this.client.isReady())
            {
                const now = Date.now();
                const elapsed = cache.entries.filter(entry => entry.ex > 0 && entry.ex <= now);

                if (elapsed.length)
                {
                    const promoted = cache.entries.map(entry => (entry.ex > 0 && entry.ex <= now
                        ? {
                            ...entry,
                            ex: 0
                        }
                        : entry));

                    const written = await saveBlacklist(this.client.config.keys.dbtoken, promoted, error => this.client.log('ERROR', `[Blacklist] Could not promote ${elapsed.length} elapsed grace period(s): ${error?.message ?? error}`));

                    if (written)
                    {
                        await this.refreshBlacklist(promoted);
                        await this.broadcastBlacklist(promoted);

                        for (const entry of elapsed)
                        {
                            this.client.log('DATA',
                                `[Blacklist] Grace period elapsed for ${entry.k === 'g'
                                    ? 'guild'
                                    : 'user'} ${entry.id} - now enforced.`);
                        }

                        for (const entry of elapsed)
                        {
                            if (entry.k === 'u' && this.client.utils.blacklisted(entry.id) > 1)
                            {
                                const count = await this.enforceBlacklistUserBan(entry.id);

                                this.client.log('DATA', `[Blacklist] ${entry.id}'s grace elapsed - banned from ${count} server(s).`);
                            }
                        }

                        await this.client.clog(elapsed.map(entry => `**${entry.k === 'g'
                            ? 'Server'
                            : 'User'}** \`${entry.id}\`${entry.rs
                            ? ` - ${entry.rs}`
                            : ''}`).join('\n'), 'Blacklist grace period elapsed', 'bad').catch(() =>
                        {
                        });
                    }
                }
            }

            if (!this.client.isReady())
            {
                return;
            }

            const enforcedUsers = cache.entries.filter(entry => entry.k === 'u' && this.client.utils.blacklisted(entry.id) > 1);

            for (const entry of enforcedUsers)
            {
                for (const guild of this.client.guilds.cache.values())
                {
                    const member = guild.members.cache.get(entry.id);

                    if (!member || !member.bannable)
                    {
                        continue;
                    }

                    await guild.bans.create(entry.id, { reason: BLACKLIST_ACTION_REASON })
                               .then(() => this.client.log('DATA', `[Blacklist] Banned ${entry.id} from [${guild.name}] (${guild.id}).`))
                               .catch(error => this.client.log('WARN', `[Blacklist] Could not ban ${entry.id} from ${guild.id}: ${error?.message ?? error}`));
                }
            }

            const nuking = [];
            const leaving = [];

            for (const guild of this.client.guilds.cache.values())
            {

                if (this.client.utils.blacklisted(guild.id) > 1)
                {
                    nuking.push(guild);

                    continue;
                }

                if (guild.ownerId && this.client.utils.blacklisted(guild.ownerId) > 1)
                {
                    leaving.push({
                        guild,
                        why: `its owner (${guild.ownerId}) is blacklisted`
                    });
                }
            }

            const total = nuking.length + leaving.length;

            if (!total)
            {
                return;
            }

            if (total > MAX_LEAVES_PER_SWEEP)
            {
                this.client.data.errors++;

                this.client.log('ERROR', `[Blacklist] REFUSING TO ACT. ${total} guilds became blacklist-eligible in one sweep (${nuking.length} to nuke, ${leaving.length} to leave), which is an incident rather than ${total} decisions. Nothing was touched. Check the blacklist.`);

                return this.client.clog(`${total} guilds became blacklist-eligible at once on cluster ${this.client.data.id} (${nuking.length} to nuke, ${leaving.length} to leave). **Nothing was touched.** Check the blacklist before the next sweep.`, 'BLACKLIST ENFORCE REFUSED - CIRCUIT BREAKER', 'bad').catch(() =>
                {
                });
            }

            for (const guild of nuking)
            {
                const name = guild.name;
                const id = guild.id;

                const done = await this.nukeBlacklistedGuild(guild).catch(error =>
                {
                    this.client.log('ERROR', `[Blacklist] Nuke of ${id} threw: ${error?.message ?? error}`);

                    return false;
                });

                if (done)
                {
                    await this.client.clog(`Stripped and left **${name}** \`${id}\` - the server is blacklisted. Its data was purged immediately.`, 'Blacklist enforced', 'bad').catch(() =>
                    {
                    });
                }
            }

            for (const {
                guild,
                why
            } of leaving)
            {
                const left = await guild.leave().then(() => true, error =>
                {
                    this.client.log('WARN', `[Blacklist] Could not leave [${guild.name}] (${guild.id}): ${error?.message ?? error}`);

                    return false;
                });

                if (!left)
                {
                    continue;
                }

                this.client.log('DATA', `[Blacklist] Left [${guild.name}] (${guild.id}) - ${why}.`);

                await this.client.clog(`Left **${guild.name}** \`${guild.id}\` - ${why}.`, 'Blacklist enforced', 'bad').catch(() =>
                {
                });
            }
        };

        const _ = setInterval(async () =>
        {

            if (!this.client.databaseLoaded || sweeping)
            {
                return;
            }

            sweeping = true;

            try
            {
                await sweep();
            }
            catch (error)
            {
                this.client.data.errors++;
                this.client.log('ERROR', '[Blacklist] sweep failed:', error);
            }
            finally
            {
                sweeping = false;
            }
        }, SWEEP_INTERVAL);

        this._blacklistSweep = _;
        this.intervals.push(_);

        void (async () =>
        {

            if (this.client._trueRelaxy)
            {
                const existing = await loadBlacklist(this.client.config.keys.dbtoken, () =>
                {
                });

                if (existing.fromDatabase && !existing.entries.length)
                {
                    const legacy = await this.migrateLegacyBlacklist().catch(() => null);

                    if (legacy?.length)
                    {
                        const written = await saveBlacklist(this.client.config.keys.dbtoken, legacy, error => this.client.log('ERROR', `[Blacklist] Migration write failed: ${error?.message ?? error}`));

                        if (written)
                        {
                            this.client.log('DATA',
                                `[Blacklist] Migrated ${legacy.length} entr${legacy.length === 1
                                    ? 'y'
                                    : 'ies'} out of assets/config/blacklist.json into the database.`);
                        }
                    }
                }
            }

            await this.refreshBlacklist().catch(error => this.client.log('WARN', `[Blacklist] Initial load failed: ${error?.message ?? error}`));
        })();
    }

    async ForumPost(reaction, user)
    {

        if (user.id === this.client.user.id || !reaction.message)
        {
            return;
        }

        let forum = await this.client.getForum(reaction.message.channel.parentId, reaction.message.guild.id);

        if (!forum || reaction?.message?.channel?.appliedTags.includes(forum.tg.a))
        {
            return;
        }

        let start = await this.client.getMessage(reaction.message.channel, null, true);

        let member = await this.client.getMember(reaction.message.guild, user.id);

        if (!start)
        {
            start = await this.client.getMessage(reaction.message.channel, null, true);

            if (!start)
            {
                if (forum.ck.og)
                {
                    return this.client.delete(reaction.message.channel);
                }
                else
                {
                    return;
                }
            }
        }

        if (reaction.message.id !== start.id)
        {
            return reaction.message.reactions.cache.get(reaction.emoji.name)
                ? await reaction.message.reactions.cache.get(reaction.emoji.name).users.remove(user.id).catch(this.client.swallow('CommonRoutines: remove'))
                : null;
        }

        let approvedUser = false;
        for (let i = 0; i < forum.rl.length; i++)
        {
            if (member.roles.cache.has(forum.rl[i]))
            {
                approvedUser = true;
            }
        }

        if (!approvedUser && !member.permissions.has(this.client.imports.discord.PermissionFlagsBits.Administrator))
        {
            return reaction.message.reactions.cache.get(reaction.emoji.name)
                ? await reaction.message.reactions.cache.get(reaction.emoji.name).users.remove(user.id).catch(this.client.swallow('CommonRoutines: remove'))
                : null;
        }

        const Guild = await this.client.module.database.Guild(reaction.message.guild.id);

        if (reaction.emoji.name === forum.em)
        {
            if (forum.rp.ac.length > 1)
            {
                this.client.send(reaction.message.author, forum.rp.ac.replaceAll('|U|', reaction.message.author).replaceAll('|T|', reaction.message.channel.name).replaceAll('|G|', reaction.message.guild.name));
            }

            if (Guild.ml.ev?.other?.on)
            {
                this.client.pushModlog(reaction.message.guild.id, 'other', new this.client.class.modlog({
                    color:       'good',
                    event:       'Forum post accepted',
                    description: `${reaction.message.channel} (${reaction.message.channel.name})\nHas been accepted by ${user} ${this.client.utils.tag(user)}`,
                    thumbnail:   reaction.message.guild.iconURL({
                        dynamic: true,
                        size:    4096
                    })
                }), null);
            }

            let promises = [
                reaction.message.reactions.removeAll().catch(this.client.swallow('CommonRoutines: removeAll')),
                this.client.react(reaction.message, reaction.message.channel.parent.defaultReactionEmoji ?? '✅'),
                reaction.message.channel.setArchived(false)
            ];

            let i = 0;
            let interval = setInterval(async () =>
            {
                if (i === promises.length - 1)
                {
                    clearInterval(interval);

                    if (!reaction.message.channel.parent.availableTags.find(t => t.id === forum.tg.a))
                    {
                        await reaction.message.channel.parent.setAvailableTags([
                            {
                                name:      'Pending approval',
                                moderated: true,
                                emoji:     '🗃️'
                            },
                            {
                                name:      'Approved',
                                moderated: true,
                                emoji:     '🗃️'
                            }
                        ]);
                        forum.tg.p = reaction.message.channel.parent.availableTags.find(t => t.name === 'Pending approval').id;
                        forum.tg.a = reaction.message.channel.parent.availableTags.find(t => t.name === 'Approved').id;
                        this.client.saveForum(forum.id, forum.g, {
                            alter: 'tg.p',
                            value: forum.tg.p
                        }, {
                            alter: 'tg.a',
                            value: forum.tg.a
                        });
                    }

                    let tags = reaction.message.channel.appliedTags;
                    tags.splice(tags.indexOf(forum.tg.p), 1);
                    tags.push(forum.tg.a);

                    return reaction.message.channel.setAppliedTags([...new Set(tags)]);
                }

                await promises[i];
                i++;
            }, 1500);
            return;
        }

        if (reaction.emoji.name === '❌')
        {
            const author = reaction.message.author;
            const guildName = reaction.message.guild.name;
            const channelName = reaction.message.channel.name;

            if (Guild.ml.ev?.other?.on)
            {
                this.client.pushModlog(reaction.message.guild.id, 'other', new this.client.class.modlog({
                    color:       'bad',
                    event:       'Forum post denied',
                    description: `${reaction.message.channel} (${reaction.message.channel.name})\nHas been denied by ${user} ${this.client.utils.tag(user)}`,
                    thumbnail:   reaction.message.guild.iconURL({
                        dynamic: true,
                        size:    4096
                    })
                }), null);
            }

            await this.client.delete(reaction.message.channel);

            if (forum.st.pr)
            {
                let m = await this.client.send(user, 'Write why the post has been denied, if I do not get a reply in 3 minutes I will automatically send a response to the thread author.');

                return setTimeout(async () =>
                {
                    let channel = await user.createDM();

                    if (!channel)
                    {
                        return;
                    }

                    let message = await channel.messages.fetch({
                        limit:  2,
                        cache:  false,
                        around: m.id
                    });

                    if (!message)
                    {
                        return;
                    }

                    message = message.first();

                    if (message.author.bot)
                    {
                        if (forum.rp.rj.length > 0)
                        {
                            this.client.send(author, forum.rp.rj.replaceAll('|U|', author).replaceAll('|T|', channelName).replaceAll('|G|', guildName).slice(0, 2048));
                            return this.client.send(user, `Automatic response for **${channelName}** sent successfully.`);
                        }

                        return;
                    }

                    this.client.send(author, `Rejection response for **|T|:**\n${message.content}`.replaceAll('|U|', author).replaceAll('|T|', channelName).replaceAll('|G|', guildName).slice(0, 2048)).catch(this.client.swallow('CommonRoutines: slice'));
                    return this.client.send(user, `Response for **${channelName}** sent successfully.`);
                }, 3 * 60 * 1000);
            }

            return forum.rp.rj.length > 0
                ? this.client.send(author, forum.rp.rj.replaceAll('|U|', author).replaceAll('|T|', channelName).replaceAll('|G|', guildName))
                : null;
        }

        return reaction.message.reactions.cache.get(reaction.emoji.name)?.users?.remove(user.id);
    }

    async ForumPostMessage(message, guild)
    {
        let forum = await this.client.getForum(message.channel.parentId, message.guild.id);

        if (!forum || message?.channel?.appliedTags.includes(forum?.tg?.a))
        {
            return 0;
        }

        let start = null;

        try
        {
            start = await this.client.getMessage(message.channel, null, true);
        }
        catch
        {
        }

        if (!start || start.id === message.id || !start.reactions.cache.find(r => r.me))
        {
            return 0;
        }

        let no_role = true;

        message?.member?.roles?.cache?.forEach(role =>
        {
            if (forum.rl.includes(role.id))
            {
                no_role = false;
            }
        });

        if (no_role && message.author.id !== start.author.id && !forum.rl.includes(message.author.id) && !this.client.utils.isExempt(guild, message))
        {
            await this.client.delete(message);
        }

        return await message.channel.setArchived(true);
    }

    RaidPrevention()
    {
        return;

    }

    async cacheImage(message, isModLogOn)
    {

        const attachment = message.attachments.first();
        if (!attachment || !attachment?.contentType?.includes('image') || !isModLogOn)
        {
            return;
        }

        const path = `./storage/cache/users/${message.author.id}`;
        if (!await this.client.pathExists(path))
        {
            await this.client.mkdir(path);
        }

        this.client.downloadFile(attachment.url, `${path}/${message.id}`);

        setTimeout(async () =>
        {
            if (await this.client.pathExists(`${path}/${message.id}`))
            {
                this.client.unlink(`${path}/${message.id}`);
            }
        }, 5 * 60 * 60 * 1000);
    }

    async ModalResponse(interaction)
    {
        switch (interaction.customId)
        {
            case 'forumPostRejection':
            default:
                return false;
        }
    }

    leaveVoiceChannels()
    {
        const _ = setInterval(async () =>
        {
            new Promise(() =>
            {
                this.client.guilds.cache.forEach(async g =>
                {
                    if (!g.members.me)
                    {
                        return;
                    }

                    if (g.members.me?.voice?.channel && g.members.me?.voice?.channel?.members?.size <= 1)
                    {
                        try
                        {
                            const queue = useQueue(g.id);

                            if (queue)
                            {
                                queue.delete();
                            }

                            g.members.me.voice.disconnect();
                        }
                        catch (e)
                        {
                            this.client.log(e);
                        }
                    }
                });
            });
        }, 5 * 1000);
        this.intervals.push(_);
    }

    initiateTopGGVotePrompt(guild)
    {
        if ((guild.d.vt + (15 * 60 * 60 * 1000)) <= Date.now())
        {
            this.client.save(guild.id, {
                alter: 'd.vt',
                value: Date.now()
            });
            return true;
        }

        return false;
    }

    async CustomBoostMessage(message, guild)
    {
        let type = null;

        switch (message.type)
        {
            case Discord.MessageType.GuildBoost:
                type = 'b';
                break;
            case Discord.MessageType.GuildBoostTier1:
                type = 'l1';
                break;
            case Discord.MessageType.GuildBoostTier2:
                type = 'l2';
                break;
            case Discord.MessageType.GuildBoostTier3:
                type = 'l3';
                break;
            default:
                type = null;
        }

        if (!type || !guild.cb.on || !guild.cb[type]?.dt)
        {
            return false;
        }

        const channelId = guild.cb[type].c;

        if (channelId === 'none')
        {
            return false;
        }

        const channel = channelId === ''
            ? message.channel
            : await this.client.channels.fetch(channelId).catch(() => null);

        if (!channel)
        {
            return false;
        }

        const customMessageCreator = new this.client.class.customEmbed(this.client);
        const settings = guild.cb[type].dt.split('Ą-=|||SPLITTER_FLAG|||=-Ą');

        const parts = await customMessageCreator.fullRoutine(message, settings?.[1]?.split(' ') ?? [], guild, {
            preset:      true,
            noChannel:   true,
            valuesOnly:  true,
            ignoreEmbed: true
        });

        if (!parts)
        {
            return false;
        }

        const fill = text => text
            .replaceAll('|U|', message.member)
            .replaceAll('|G|', message.guild.name)
            .replaceAll('|C|', message.channel);

        await this.client.send(channel,
            parts[0]
                ? fill(parts[0])
                : null,
            parts[1]?.length !== 0
                ? await this.client.parseJSON(fill(await this.client.stringifyJSON(parts[1])))
                : null,
            parts[2]);
        if (guild.cb.del)
        {
            await this.client.delete(message).catch(this.client.swallow('CommonRoutines: delete'));
        }

        return true;
    }

    privateChannelClearing()
    {
        this.client.log('Private channel clearing started.');

        const ignored = new Set();

        const strikes = new Map();
        const channelStrikes = new Map();

        const EMPTY_STRIKES = 2;
        const MISSING_STRIKES = 3;

        const forget = async (Guild, channelId) =>
        {
            strikes.delete(channelId);
            channelStrikes.delete(channelId);

            Guild.ch.v.pv = Guild.ch.v.pv.filter(entry => entry.id !== channelId);

            await this.client.save(Guild.id, {
                alter: 'ch.v.pv',
                value: Guild.ch.v.pv
            });

            if (this.client.data.serverCache[Guild.id]?.[channelId])
            {
                delete this.client.data.serverCache[Guild.id][channelId];
            }
        };

        const sweepGuild = async Guild =>
        {

            if (ignored.has(Guild.id) || !this.client.guilds.cache.has(Guild.id))
            {
                return;
            }

            const entries = Guild.ch?.v?.pv;

            if (!Array.isArray(entries) || !entries.length)
            {
                return;
            }

            if (!this.client.data.serverCache[Guild.id])
            {
                this.client.data.serverCache[Guild.id] = {};
            }

            for (const entry of [...entries])
            {
                if (!entry?.id || !entry.temporary)
                {
                    continue;
                }

                const channel = await this.client.channels.fetch(entry.id).catch(() => null);

                if (channel && channel.guild?.shardId !== this.client.data.id)
                {
                    ignored.add(Guild.id);

                    return;
                }

                if (!channel)
                {
                    const count = (channelStrikes.get(entry.id) ?? 0) + 1;

                    channelStrikes.set(entry.id, count);

                    if (count >= MISSING_STRIKES)
                    {
                        await forget(Guild, entry.id);
                    }

                    continue;
                }

                channelStrikes.delete(entry.id);

                const occupied = channel.guild.members.cache.some(member => member.voice.channelId === channel.id);

                if (occupied)
                {
                    strikes.delete(channel.id);

                    continue;
                }

                const count = (strikes.get(channel.id) ?? 0) + 1;

                strikes.set(channel.id, count);

                if (count >= EMPTY_STRIKES)
                {
                    await channel.delete('Temporary private channel became empty.').catch(this.client.swallow('CommonRoutines: privateChannelClearing delete'));

                    await forget(Guild, channel.id);
                }
            }
        };

        let sweeping = false;

        const _ = setInterval(async () =>
        {
            if (!this.client.databaseLoaded || sweeping)
            {
                return;
            }

            sweeping = true;

            try
            {
                for (const Guild of [...this.client.module.database._cache.servers.values()])
                {

                    await sweepGuild(Guild).catch(error =>
                    {
                        this.client.data.errors++;
                        this.client.log('ERROR', `privateChannelClearing: ${Guild?.id}`, error);
                    });
                }
            }
            catch (error)
            {
                this.client.data.errors++;
                this.client.log('ERROR', 'privateChannelClearing', error);
            }
            finally
            {
                sweeping = false;
            }
        }, 20 * 1000);

        this.intervals.push(_);
    }
}
