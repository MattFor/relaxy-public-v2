'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { moderateAcrossPool, syncReport } from '../../../src/Client/Modules/Guilds/GuildLink.js';

export default {
    name: 'unban',
    usage: '=unban <userId|name|former nickname> [reason] [sync]',
    description:
        'Unban a user from the server. Give an **id**, or any **name they are known by - now or in the past**: a banned member is in no member list and no mention picker, so the name they had when they were banned is usually the only thing anyone remembers. Optionally specify a reason for the unban.\n\nThe unban is recorded on the case the ban was opened under, so `=case <number>` reads as one story rather than a ban that never ended.\n\nAdd **sync** to lift it in **every server this one is linked to** as well (`=syncservers`) - the counterpart of `=ban … sync`, and the reason it exists: a ban that syncs outward and a pardon that does not is a trap. Only servers that have run `=syncservers moderation on` are reached.',
    slashDescription: 'Unban a user - by id, or by a name they are known by now or used to use.',

    slash: new Discord.SlashCommandBuilder()
        .addStringOption((option) =>
            option
                .setName('userid')
                .setDescription('Their id, or a name/nickname they have used here.')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for the unban. Add sync to lift it in every linked server too.')
                .setRequired(false)
        ),

    args: true,
    defer: true,

    permissionsUser: ['SEND_MESSAGES', 'BAN_MEMBERS', 'MODERATE_MEMBERS'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'BAN_MEMBERS'],
    async run(client, message, args, guild, interaction) {
        const resolved = await client.utils.resolveTargetFromArgs(message.guild.id, args);

        if (resolved?.ambiguous?.length) {
            return client.qEmbed(
                `**\`${resolved.matched}\`** has been used by ${resolved.ambiguous.length} different people here. Unban by id instead:\n${resolved.ambiguous.map((hit) => `• \`${hit.id}\``).join('\n')}`,
                interaction ?? message
            );
        }

        const userId = resolved?.id ?? null;

        if (!userId) {
            return client.qEmbed(
                `Nobody here is known by **\`${args.join(' ')}\`**, now or in the past - and it is not a user id either.\n\n\`=fetchban\` lists this server's bans if you need the id.`,
                interaction ?? message
            );
        }

        const { reason: unbanReason, sync } = client.utils.takeSync(args.slice(resolved.consumed ?? 1).join(' '));

        const user = await client.getUser(userId);

        if (!user) {
            return client.qEmbed('This user does not exist!', interaction ?? message);
        }

        const fetchedBan = (await message.guild.bans.fetch(user).catch(client.swallow('unban: fetch'))) ?? null;

        if (!fetchedBan) {
            return client.qEmbed('No ban record exists for this user!', interaction ?? message);
        }

        try {
            await message.guild.bans.remove(fetchedBan.user);
        } catch {
            return client.qEmbed('Something went wrong while trying to unban!', interaction ?? message);
        }

        client.cacheFor(
            guild.id,
            `unban_${userId}_${[userId, unbanReason]
                .filter(Boolean)
                .join(' ')
                .replaceAll(' ', '+')
                .replace(`unban_${userId}_`, '')
                .slice(0, 256)}`,
            30000
        );
        const synced = sync
            ? await moderateAcrossPool(client, guild, 'unban', {
                  userId,
                  moderator: message.author.id,
                  reason: unbanReason
              })
            : null;

        const banCase = await client.utils.banCase(guild.id, userId);

        return client.send(interaction ? 1 : message.channel, null, [
            client.utils.moderationEmbed({
                verb: 'Unbanned',
                emoji: '🕊️',
                user: fetchedBan.user,
                moderator: message.author.id,
                reason: unbanReason,
                caseNumber: null,
                extra: [
                    {
                        name: 'Recorded',
                        value: banCase
                            ? `As an outcome on the ban's case, **#${banCase.n}**.`
                            : '`No ban case to attach it to - the ban predates Relaxy here.`',
                        inline: true
                    },
                    {
                        name: 'They were banned for',
                        value: client.utils.inlineText(fetchedBan.reason, {
                            limit: 500,
                            fallback: 'No reason recorded.'
                        })
                    }
                ],
                sync: synced ? syncReport(synced, 'Unbanned') : ''
            })
        ]);
    }
};
