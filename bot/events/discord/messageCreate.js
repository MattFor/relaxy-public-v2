'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';
import { bump } from '../../../src/Client/Modules/Progression/DailyStats.js';
import { noMissingCmdResponse } from '../../../src/Core/DataTable.js';

export default {
    async run(client, message) {
        let z = 0;
        const isOwner = client.isOwner(message.author.id);

        const now = Date.now();

        client.module?.stats?.count('message.seen');

        if (message.system) {
            return;
        }

        if (isOwner && client.flags.logs.message_debug) {
            client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
        }

        const isDMs = [Discord.ChannelType.DM, Discord.ChannelType.GroupDM].includes(message.channel.type);

        if (isDMs && message.content.includes('=help') && !client.data.allUsersCache[`dm_${message.author.id}`]) {
            await client.send(
                message.channel,
                'Hello! I only respond to commands **in servers**, try =help there. (or whichever prefix the server uses)'
            );

            client.data.allUsersCache[`dm_${message.author.id}`] = true;

            setTimeout(() => {
                delete client.data.allUsersCache[`dm_${message.author.id}`];
            }, 10 * 1000);
        }

        if (isOwner && client.flags.logs.message_debug) {
            client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
        }

        if (isOwner && client.flags.logs.message_debug) {
            client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
        }

        if (!!message.author && isDMs) {
            const outgoing = message.author.id === client.user.id;

            const counterpart =
                (message.channel?.recipient && message.channel.recipient.id !== client.user.id
                    ? message.channel.recipient.username
                    : null) ??
                [...(message.channel?.recipients?.values?.() ?? [])].find((u) => u.id !== client.user.id)?.username ??
                message.channel?.recipientId ??
                'Unknown';

            const to = outgoing ? counterpart : client.user.username;

            const msg = `\nFrom ${message.author?.username} to ${to} at ${client.utils.formatDate(message.createdAt)} - ${message?.author?.id} - ${message.id}:\n\n${
                message.content.length > 0 ? message.content : 'None.'
            }${
                message.attachments.size > 0
                    ? `\n\nAttachment ${message.attachments.first().name}\n${message.attachments.first().url}`
                    : ''
            }${message.embeds[0] ? `\nEmbeds:\n\n ${await client.stringifyJSON(message.embeds[0].data)}` : ''}`;

            if (msg.endsWith('None.') && message.attachments.size === 0 && !message.embeds[0]) {
                return;
            }

            client.log(msg);

            if (message.author.id === client.user.id) {
                return;
            }

            return;
        }

        if (client.utils.blacklisted(message?.guild?.id) > 1) {
            return;
        }

        if (client.utils.blacklisted(message.author.id) > 0) {
            if (message.guild && message.deletable) {
                message.delete().catch(client.swallow('messageCreate: blacklist silence'));
            }

            return;
        }

        if (isOwner && client.flags.logs.message_debug) {
            client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
        }

        let guild = null;
        if (message.guild?.id) {
            guild = await client.module.database.Guild(message.guild.id);
        }

        const isExempt = client.utils.isExempt(guild, message);

        if (
            guild &&
            message.author &&
            message.author.id !== client.user.id &&
            (message.author.bot || message.webhookId)
        ) {
            if (await client.core.ScamGuard(message, guild)) {
                return;
            }
        }

        if (!message.member || !message.author || message.author.id === client.user.id) {
            return;
        }

        if (message.channel.isThread()) {
            return client.core.ThreadCommand(message, guild, isOwner, now);
        }

        if (
            ![
                Discord.ChannelType.GuildText,
                Discord.ChannelType.GuildVoice,
                Discord.ChannelType.GuildStageVoice,
                Discord.ChannelType.GuildAnnouncement
            ].includes(message?.channel?.type)
        ) {
            return;
        }

        if (isOwner && client.flags.logs.message_debug) {
            client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
        }

        if (isOwner && client.flags.logs.message_debug) {
            client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
        }

        await client.save(message.guild.id, {
            alter: 'd.msg',
            value: ++guild.d.msg
        });

        bump(message.guild.id, 'm');

        if (isOwner && client.flags.logs.message_debug) {
            client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
        }

        if (await client.core.handleCounting(message, guild)) {
            return;
        }

        if (await client.core.CustomBoostMessage(message, guild)) {
            return;
        }

        if (isOwner && client.flags.logs.message_debug) {
            client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
        }

        for (const u of message.mentions.users.values()) {
            if (u.id === client.user.id && client.isOwner(message.author.id)) {
                if (message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.AddReactions)) {
                    await client.react(message, '💗');
                }

                break;
            }
        }

        if (isOwner && client.flags.logs.message_debug) {
            client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
        }

        client.core.cacheImage(message, guild.ml.on);

        const member = await client.module.database.Member(message.author.id, guild.id);

        if (member) {
            client.saveMember(
                message.guildId,
                member.id,
                {
                    alter: 'rc',
                    value: message?.content
                },
                {
                    alter: 'lc',
                    value: message?.channel?.id
                }
            );
        }

        if (isOwner && client.flags.logs.message_debug) {
            client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
        }

        client.core.LockdownMessage(message, guild);

        client.core
            .Censor(message, guild, await client.module.database.warningsOf(guild.id, message.author.id))
            .then(async (result) => {
                if (result) {
                    return client.delete(message);
                }

                if (isOwner && client.flags.logs.message_debug) {
                    client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
                }

                if (isOwner && client.flags.logs.message_debug) {
                    client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
                }

                const allowed = client.utils.isAllowedUser(guild, message);
                if (allowed < 1 && allowed !== -1) {
                    return client.core.Leveling(message, false, guild);
                }

                if (isOwner && client.flags.logs.message_debug) {
                    client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
                }

                if (
                    message?.channel?.type === Discord.ChannelType.PublicThread &&
                    guild.fo.on &&
                    guild.fo.cs.includes(message.channel?.parent?.id)
                ) {
                    if (client.core.ForumPostMessage(message, guild) === 0) {
                        return client.core.Leveling(message, false, guild);
                    }
                }

                if (client.utils.isRestricted(guild, message.channel.id) && !isExempt) {
                    return client.core.Leveling(message, false, guild);
                }

                if (isOwner && client.flags.logs.message_debug) {
                    client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
                }

                if (!message.guild.members.me) {
                    await message.guild.members.fetchMe().catch(client.swallow('messageCreate: fetchMe'));
                }

                const prefix =
                    guild.px.find(
                        (prefix) => message.content.startsWith(prefix) && message.content[prefix.length] !== ' '
                    ) ?? '=';
                const args = message.content
                    .slice(prefix.length)
                    .trim()
                    .split(/[ 　]+/g);
                const command = args.shift()?.toLowerCase();

                if (noMissingCmdResponse.includes(command)) {
                    return;
                }

                if (isOwner && client.flags.logs.message_debug) {
                    client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
                }

                const prefixIndex = message.content.indexOf(prefix) === 0;
                const cmd = client.collections.commands.get(command) || client.collections.aliases.get(command);

                if (prefixIndex && (cmd ? cmd.owner && !isOwner : true)) {
                    if (
                        !['!', '?'].includes(message.content.replace(/ /g, '')) &&
                        message.content[prefix.length] !== ' ' &&
                        message.content[prefix.length] !== prefix
                    ) {
                        const guess = client.utils.suggestCommand(command, isOwner);

                        client.qEmbed(
                            guess
                                ? `There's no **${guild.px[0]}${command}** - did you mean **${guild.px[0]}${guess.name}**?\n\`${guess.usage ?? `${guild.px[0]}${guess.name}`}\`\n${guess.slashDescription ?? guess.description?.split('\n')[0] ?? ''}`
                                : `There's no command like that, see all commands in **${guild.px[0]}help**!`,
                            message
                        );
                    }

                    return client.core.Leveling(message, false, guild);
                }

                if (isOwner && client.flags.logs.message_debug) {
                    client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
                }

                if (message.content[prefix.length] === ' ' || message.content.replace(/[!?]/g, '').length === 0) {
                    return client.core.Leveling(message, false, guild);
                }

                if (prefixIndex) {
                    Promise.resolve().then(() => {
                        client.log(
                            'DATA',
                            `${cmd.name} | ${message.author.id} -> ${client.utils.shortGuildName(message.guild.name)} ${message.guild.id}/${message.channel.id}`
                        );
                    });

                    client.core.Leveling(message, true, guild);

                    void client.core.voteReminder(message, guild).catch(client.swallow('messageCreate: voteReminder'));

                    client.core.runCommand(message, args, command, cmd, guild, isOwner, now);

                    if (isOwner && client.flags.logs.message_debug) {
                        client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
                    }

                    return;
                }

                if (isOwner && client.flags.logs.message_debug) {
                    client.log('DATA', `${++z}. ${client.imports.time(Date.now() - now)}`);
                }

                return client.core.Leveling(message, false, guild);
            })
            .catch((error) => {
                client.data.errors++;
                client.log(
                    'ERROR',
                    `messageCreate pipeline threw for ${message.author?.id} in ${message.guild?.id}/${message.channel?.id}:`,
                    error
                );
            });
    }
};
