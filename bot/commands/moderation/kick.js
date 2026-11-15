'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { moderateAcrossPool, syncReport } from '../../../src/Client/Modules/Guilds/GuildLink.js';

export default {
    name: 'kick',
    usage: '=kick <member> [reason] [sync]',
    description:
        'Kick someone from the server with the specified reason (optional).\n\nAdd **sync** anywhere in the reason to kick them from **every server this one is linked to** as well (`=syncservers`), each with its own case. Only servers that have run `=syncservers moderation on` are reached, and the reply names any that were not - along with any they were not in to begin with.',

    slashDescription: 'Kick someone from the server, optionally from every linked server too.',

    slash: new Discord.SlashCommandBuilder()
        .addUserOption((option) => option.setName('member').setDescription('The member to kick.').setRequired(true))
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for the kick. Add sync to kick from every linked server too.')
                .setRequired(false)
        ),
    args: true,

    defer: true,

    permissionsUser: ['SEND_MESSAGES', 'KICK_MEMBERS', 'MODERATE_MEMBERS'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES', 'KICK_MEMBERS'],

    async run(client, message, args, guild, interaction) {
        const member = (await client.utils.member(message, args, 0, { cut: true })) ?? null;

        if (!member) {
            return client.qEmbed("User doesn't exist on this server!", interaction ?? message);
        }

        if (!(await client.getUser(member.user.id))) {
            return client.qEmbed("User doesn't exist!", interaction ?? message);
        }

        const { reason, sync } = client.utils.takeSync(args[0] ? args.join(' ') : '');

        const result = await client.module.moderation.kick({
            guild: message.guild,
            guildDoc: guild,
            member,
            moderator: message.author.id,
            moderatorMember: message.member,
            reason,
            message
        });

        if (!result.ok) {
            return client.qEmbed(result.error, interaction ?? message);
        }

        const synced = sync
            ? await moderateAcrossPool(client, guild, 'kick', {
                  userId: member.user.id,
                  moderator: message.author.id,
                  reason: result.reason
              })
            : null;

        return client.send(interaction ? 1 : message.channel, null, [
            client.utils.moderationEmbed({
                verb: 'Kicked',
                emoji: '👢',
                user: member.user,
                member,
                moderator: message.author.id,
                reason: result.reason,
                caseNumber: result.caseNumber,
                sync: synced ? syncReport(synced, 'Kicked') : ''
            })
        ]);
    }
};
