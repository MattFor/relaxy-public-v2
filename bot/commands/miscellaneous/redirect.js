'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const TARGETS = {
    leveling: {
        path: 'lv.c',
        enabled: (guild) => guild.lv.on,
        label: 'Level up messages'
    },
    achievements: {
        path: 'ach.c',
        enabled: (guild) => guild.ach.on,
        label: 'Achievement messages',
        clearable: true
    },
    censoring: {
        path: 'cn.c',
        enabled: (guild) => guild.cn.on,
        label: 'Censoring messages'
    },
    counting: {
        path: 'co.c',
        enabled: (guild) => guild.co.on,
        label: 'Counting'
    },
    welcomes: {
        path: 'wc.j.c',
        enabled: (guild) => guild.wc.on,
        label: 'Welcome messages'
    },
    leaves: {
        path: 'wc.l.c',
        enabled: (guild) => guild.wc.on,
        label: 'Leave messages'
    },
    boosts: {
        path: ['cb.b.c', 'cb.l1.c', 'cb.l2.c', 'cb.l3.c'],
        enabled: (guild) => guild.cb.on,
        label: 'Boost messages'
    }
};
const ALIASES = {
    level: 'leveling',
    levels: 'leveling',
    levelling: 'leveling',
    achievement: 'achievements',
    achievs: 'achievements',
    censor: 'censoring',
    count: 'counting',
    welcome: 'welcomes',
    joins: 'welcomes',
    leave: 'leaves',
    boost: 'boosts',
    boostmessages: 'boosts',
    modlogs: 'modlog',
    logs: 'modlog',
    hearts: 'heartboard',
    forums: 'forum'
};

const OPTIONS = [...Object.keys(TARGETS), 'modlog', 'heartboard', 'forum'];

export default {
    name: 'redirect',
    aliases: ['switch'],
    usage: '=redirect <option> <#channel>',
    description: `Redirect a Relaxy! function to a given channel.\nF.e **=redirect leveling #bot-actions**\nAvailable redirectors:\n${OPTIONS.map((option) => `- ${option}`).join('\n')}\n\nAchievements accept **=redirect achievements here** to clear the override (they then announce in the channel they were earned in).\nTwo-channel forms:\n- **=redirect heartboard #(current heartboard) #(new channel)**\n- **=redirect forum #(current forum) #(new forum)**`,

    slashDescription: "Redirect one of Relaxy's functions to a given channel.",

    slash: new Discord.SlashCommandBuilder()
        .addStringOption((option) =>
            option
                .setName('option')
                .setDescription('The Relaxy! function to redirect.')
                .setRequired(true)
                .addChoices(
                    ...OPTIONS.map((name) => ({
                        name,
                        value: name
                    }))
                )
        )
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('Channel to redirect it to. (For heartboard/forum: the CURRENT channel.)')
                .setRequired(true)
        )
        .addChannelOption((option) =>
            option
                .setName('destination')
                .setDescription('Heartboard/forum only: the channel to move those settings onto.')
                .setRequired(false)
        ),

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_CHANNELS'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        if (!args[0]) {
            return client.qEmbed(
                `One of the options is missing! Pick one of: ${OPTIONS.join(', ')}.`,
                interaction ?? message
            );
        }

        const requested = args[0].toLowerCase();
        const option = ALIASES[requested] ?? requested;

        if (!OPTIONS.includes(option)) {
            return client.qEmbed(
                `**${requested}** isn't something Relaxy can redirect. Pick one of: ${OPTIONS.join(', ')}.`,
                interaction ?? message
            );
        }

        const isForum = option === 'forum';

        const allowedTypes = isForum
            ? [Discord.ChannelType.GuildForum]
            : [Discord.ChannelType.GuildText, Discord.ChannelType.GuildAnnouncement];

        const target = TARGETS[option];

        const clearing =
            target?.clearable && ['here', 'reset', 'clear', 'none'].includes((args[1] ?? '').toLowerCase());

        const channel = clearing ? null : await client.utils.channel(message, args, 1, { type: allowedTypes });

        if (!channel && !clearing) {
            return client.qEmbed(
                args[1]
                    ? `**${args[1]}** isn't a ${isForum ? 'forum channel' : 'text channel'} Relaxy can use.`
                    : 'No channel given!',
                interaction ?? message
            );
        }

        if (channel && guild.ch.t.rs.includes(channel.id) && !client.utils.isExempt(guild, message)) {
            return client.qEmbed('This channel is restricted from normal users!', interaction ?? message);
        }
        if (
            channel &&
            !isForum &&
            !client.permissions(
                message,
                {
                    permissionsBot: ['VIEW_CHANNEL', 'SEND_MESSAGES']
                },
                { textChannel: channel },
                {
                    report: false,
                    botOnly: true
                }
            )
        ) {
            return client.qEmbed(
                `Relaxy can't post in ${channel} - give it **View Channel** and **Send Messages** there first, otherwise the redirect would silently go nowhere.`,
                interaction ?? message
            );
        }
        if (target) {
            if (!target.enabled(guild)) {
                return client.qEmbed(`**${option}** isn't currently turned on on this server!`, interaction ?? message);
            }

            const paths = Array.isArray(target.path) ? target.path : [target.path];
            const value = clearing ? '' : channel.id;

            client.save(
                guild.id,
                ...paths.map((path) => ({
                    alter: path,
                    value
                }))
            );

            return client.qEmbed(
                clearing
                    ? `${target.label} will now appear in the channel they happen in.`
                    : `${target.label} will now be redirected to ${channel}.`,
                interaction ?? message
            );
        }

        if (option === 'modlog') {
            if (!guild.ml.on) {
                return client.qEmbed("**modlog** isn't currently turned on on this server!", interaction ?? message);
            }

            const events = {};

            for (const key of Object.keys(client.types.modlogEvents)) {
                events[key] = {
                    on: true,
                    channel: channel.id
                };
            }

            client.save(guild.id, {
                alter: 'ml',
                value: {
                    on: true,
                    ev: events
                }
            });

            return client.qEmbed(`Mod logs will now be redirected to ${channel}.`, interaction ?? message);
        }

        if (option === 'heartboard') {
            if (!guild.hb.on) {
                return client.qEmbed(
                    "**heartboard** isn't currently turned on on this server!",
                    interaction ?? message
                );
            }

            const destination = await client.utils.textChannel(message, args, 2);

            if (!destination) {
                return client.qEmbed(
                    'You need to provide two channels! First the heartboard you want to move, then the channel to move it onto.',
                    interaction ?? message
                );
            }

            if (destination.id === channel.id) {
                return client.qEmbed('That heartboard is already there!', interaction ?? message);
            }

            if (!(await client.module.database.findHeartBoard(channel.id, guild.id))) {
                return client.qEmbed('The first channel provided is not a heartboard!', interaction ?? message);
            }

            if (await client.module.database.findHeartBoard(destination.id, guild.id)) {
                return client.qEmbed(`${destination} is already a heartboard!`, interaction ?? message);
            }

            await client.saveHeartBoard(channel.id, guild.id, {
                alter: 'id',
                value: destination.id
            });

            const ids = guild.hb.cs.filter((id) => id !== channel.id);
            ids.push(destination.id);

            client.save(guild.id, {
                alter: 'hb.cs',
                value: ids
            });

            return client.qEmbed(`${channel} settings moved over onto ${destination}!`, interaction ?? message);
        }
        if (!guild.fo.on) {
            return client.qEmbed('Relaxy forums is not enabled on this server!', interaction ?? message);
        }

        const destination = await client.utils.channel(message, args, 2, { type: Discord.ChannelType.GuildForum });

        if (!destination) {
            return client.qEmbed(
                'You need to provide two forum channels! First the forum you want to move, then the forum to move it onto.',
                interaction ?? message
            );
        }

        if (destination.id === channel.id) {
            return client.qEmbed('Those are the same forum!', interaction ?? message);
        }

        if (!(await client.module.database.findForumChannel(channel.id, guild.id))) {
            return client.qEmbed(
                'The first channel provided does not have Relaxy forum settings on it!',
                interaction ?? message
            );
        }

        const forums = await client.module.database.findForumChannels(guild.id);

        if (forums.some((forum) => forum.id === destination.id)) {
            return client.qEmbed('Channel already has forum settings applied.', interaction ?? message);
        }

        await client.saveForum(channel.id, guild.id, {
            alter: 'id',
            value: destination.id
        });

        const ids = guild.fo.cs.filter((id) => id !== channel.id);
        ids.push(destination.id);

        client.save(guild.id, {
            alter: 'fo.cs',
            value: ids
        });

        return client.qEmbed(`Forum settings applied to ${destination}!`, interaction ?? message);
    }
};
