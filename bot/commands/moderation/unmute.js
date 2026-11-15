'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { moderateAcrossPool, syncReport } from '../../../src/Client/Modules/Guilds/GuildLink.js';

export default {
    name: 'unmute',
    aliases: ['um'],
    usage: '=unmute <user> [reason] [sync]',
    description:
        'Unmute a member, restoring the roles they had before being muted. Optionally include a reason for the modlog.\n\nAdd **sync** to lift it in **every server this one is linked to** as well (`=syncservers`) - the counterpart of `=mute … sync`. Each server restores the roles **it** took away, because those are the only ones it recorded. Only servers that have run `=syncservers moderation on` are reached.',

    slashDescription: 'Unmute a member, restoring the roles they had before.',

    slash: new Discord.SlashCommandBuilder().addUserOption((option) =>
        option.setName('user').setDescription('User that will be unmuted.').setRequired(true)
    ),

    args: true,
    defer: true,

    permissionsUser: ['SEND_MESSAGES', 'EMBED_LINKS', 'MANAGE_MESSAGES', 'MODERATE_MEMBERS'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'MANAGE_ROLES'],

    async run(client, message, args, guild, interaction) {
        const member = (await client.utils.member(message, args, 0, { cut: true })) ?? null;

        if (!member) {
            return client.qEmbed("Member doesn't exist!", interaction ?? message);
        }

        if (member.user.id === message.author.id) {
            return client.qEmbed('Cannot unmute yourself!', interaction ?? message);
        }

        const { reason, sync } = client.utils.takeSync(args.join(' '));

        const result = await client.module.moderation.unmute({
            guild: message.guild,
            guildDoc: guild,
            member,
            moderator: message.author.id,
            reason,
            message
        });

        if (!result.ok) {
            return client.qEmbed(result.error, interaction ?? message);
        }

        const synced = sync
            ? await moderateAcrossPool(client, guild, 'unmute', {
                  userId: member.user.id,
                  moderator: message.author.id,
                  reason
              })
            : null;

        return client.send(interaction ? 1 : message.channel, null, [
            client.utils.moderationEmbed({
                verb: 'Unmuted',
                emoji: '🔊',
                user: member.user,
                member,
                moderator: message.author.id,
                reason,
                caseNumber: null,
                note: result.hadRecord ? '' : 'No mute record was found, so the roles they held before it are lost.',
                extra: [
                    {
                        name: 'Recorded',
                        value: result.caseNumber
                            ? `As an outcome on the mute's case, **#${result.caseNumber}**.`
                            : '`No mute case to attach it to - the mute predates Relaxy here.`',
                        inline: true
                    }
                ],
                sync: synced ? syncReport(synced, 'Unmuted') : ''
            })
        ]);
    }
};
