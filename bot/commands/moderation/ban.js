'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { moderateAcrossPool, syncReport } from '../../../src/Client/Modules/Guilds/GuildLink.js';

const BAN_MESSAGE_KEYWORDS = new Set(['message', 'msg', 'banmessage', 'bmsg']);

const banMessage = async (client, message, args, guild, interaction) => {
    if (!message.member.permissions.has(Discord.PermissionFlagsBits.ManageGuild)) {
        return client.qEmbed('Changing the ban message needs the MANAGE_SERVER permission!', interaction ?? message);
    }

    if (args[0].toLowerCase() === 'no') {
        await client.save(
            guild.id,
            {
                alter: 'bnm.on',
                value: false
            },
            {
                alter: 'bnm.dt',
                value: ''
            }
        );

        return client.qEmbed(
            "Ban message cleared - banned members will no longer be DM'd one.",
            interaction ?? message
        );
    }

    const embedMaker = new client.class.customEmbed(client);
    const parts = await embedMaker.fullRoutine(message, args, guild, {
        preset: true,
        noChannel: true,
        valuesOnly: true,
        ignoreEmbed: true
    });

    if (!parts || (!parts[0] && !parts[1]?.length)) {
        return client.qEmbed(
            'That did not build into a message. Write the text (and/or embed) a banned member should receive.',
            interaction ?? message
        );
    }
    await client.save(
        guild.id,
        {
            alter: 'bnm.on',
            value: true
        },
        {
            alter: 'bnm.dt',
            value: args.join(' ')
        }
    );

    return client.send(
        interaction ? 1 : message.channel,
        `Ban message saved. This is what a banned member will receive${
            guild.ap?.on ? ', followed by the appeal invite' : ''
        }:`,
        parts[1]?.length ? parts[1] : null,
        parts[2] ?? null
    );
};

export default {
    name: 'ban',
    aliases: ['vanish', 'disappear'],
    usage: '=ban <user|id|former name> [time] [reason] [noappeal] [sync] | =ban message <message|no>',
    description:
        "Ban a member from the server. **time** sets how far back their messages are deleted (e.g. \"1d\", up to 7 days), and can be placed before or after the reason.\nMentioning the **@everyone** role bans every member (requires the ADMINISTRATOR permission).\nAdd **noappeal** anywhere in the reason to ban without DMing them the reason or the appeal invite. The case is still recorded either way.\nAdd **sync** to ban them in **every server this one is linked to** as well (`=syncservers`), each with its own case - the same thing `=bansync` does. Only servers that have run `=syncservers moderation on` are reached, and the reply names any that were not. They are only DM'd once, by this server.\n\n**`=ban message <message|no>`** *(was `=banmessage`)* - build the Relaxy Embed a member is DM'd as they are banned; 'no' clears it. Needs MANAGE_SERVER.\nPlaceholders: `|U|` the banned user, `|G|` this server, `|R|` the ban reason, `|CN|` the case number.\nWhen this server has an appeal channel (`=appealchannel`), the invite to it is sent right after this message.",
    slashDescription: 'Ban a member from the server.',

    slash: new Discord.SlashCommandBuilder()
        .addUserOption((option) => option.setName('user').setDescription('The member to ban.').setRequired(true))
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription(
                    'Reason and/or message deletion window (e.g. "spam 1d"). Add sync to ban in every linked server.'
                )
                .setRequired(false)
        ),
    args: true,
    defer: true,

    permissionsUser: ['SEND_MESSAGES', 'BAN_MEMBERS', 'MODERATE_MEMBERS'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES', 'BAN_MEMBERS'],

    async run(client, message, args, guild, interaction) {
        if (BAN_MESSAGE_KEYWORDS.has(args[0]?.toLowerCase()) && args.length > 1) {
            return banMessage(client, message, args.slice(1), guild, interaction);
        }

        const role = client.utils.role(message, args, 0);
        const member = await client.utils.member(message, args, 0, { cut: true });

        if (role?.id === message.guild.roles.everyone.id) {
            if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
                return client.qEmbed(
                    'Only members with the ADMINISTRATOR permission can do that!',
                    interaction ?? message
                );
            }

            message.guild.members.cache.forEach(async (m) => {
                if (m.id !== client.user.id) {
                    await m.ban().catch(client.swallow('ban: ban'));
                }
            });

            return client.qEmbed('Banning all members...', interaction ?? message);
        }

        let absent = null;

        if (!member) {
            const resolved = await client.utils.resolveTargetFromArgs(message.guild.id, args);

            if (resolved?.ambiguous?.length) {
                return client.qEmbed(
                    `**\`${resolved.matched}\`** has been used by ${resolved.ambiguous.length} different people here. Ban by id instead:\n${resolved.ambiguous.map((hit) => `• \`${hit.id}\``).join('\n')}`,
                    interaction ?? message
                );
            }

            if (resolved?.id) {
                absent = await client.getUser(resolved.id);

                if (absent) {
                    args.splice(0, resolved.consumed);
                }
            }
        }

        if (!member && !absent) {
            return client.qEmbed(
                "User doesn't exist on this server, and no one here is known by that name!",
                interaction ?? message
            );
        }

        const user = member?.user ?? absent;

        if (!(await client.getUser(user.id))) {
            return client.qEmbed("User doesn't exist!", interaction ?? message);
        }

        let reason = '';
        let time = client.utils.getTime(args);
        const timeArgs = client.utils.getTime(args, true);

        if (!time) {
            reason = args.join(' ');
        } else if (time) {
            args = args.filter((_, i) => !timeArgs.includes(i));
            reason = args.join(' ');
        }
        const { reason: withoutFlag, silent: noAppeal } = client.utils.takeNoAppeal(reason);
        reason = withoutFlag;
        const { reason: withoutSync, sync } = client.utils.takeSync(reason);
        reason = withoutSync;

        time = time / 1000;

        const result = await client.module.moderation.ban({
            guild: message.guild,
            guildDoc: guild,
            user,
            member,
            moderator: message.author.id,
            moderatorMember: message.member,
            reason,
            deleteSeconds: time < 0 ? 1 : time,
            noAppeal,
            message
        });

        if (!result.ok) {
            return client.qEmbed(result.error, interaction ?? message);
        }

        const notice = result.notice;

        const synced = sync
            ? await moderateAcrossPool(client, guild, 'ban', {
                  userId: user.id,
                  moderator: message.author.id,
                  reason: result.reason,
                  deleteSeconds: time < 0 ? 1 : time
              })
            : null;

        return client.send(interaction ? 1 : message.channel, null, [
            client.utils.moderationEmbed({
                verb: 'Banned',
                emoji: '🔨',
                user,
                member,
                moderator: message.author.id,
                reason: result.reason,
                caseNumber: result.caseNumber,
                note: absent ? 'Already left - matched on name history.' : '',
                extra: [
                    {
                        name: 'Messages deleted',
                        value: time ? `**${client.imports.time(time * 1000)}** worth` : '`None`',
                        inline: true
                    },
                    {
                        name: 'Appeal',
                        value: noAppeal
                            ? '`Not sent - noappeal was used.`'
                            : notice.appeal
                              ? notice.sent
                                  ? 'Invite sent to them.'
                                  : '`Could not DM them - their DMs are closed.`'
                              : '`No appeal server configured.`',
                        inline: true
                    }
                ],
                sync: synced ? syncReport(synced, 'Banned') : ''
            })
        ]);
    }
};
