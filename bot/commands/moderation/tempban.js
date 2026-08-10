'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:             'tempban',
    aliases:          ['tban'],
    usage:            '=tempban <user> <time> [reason] [noappeal]',
    description:      'Temporarily ban a member from the server, deleting their last week of messages. **time** is how long the ban lasts (e.g. "1d"); the optional **reason** can be placed before or after the duration. The member is automatically unbanned when the time elapses.\nAdd **noappeal** anywhere in the reason to ban without DMing them the reason or the appeal invite. The case is still recorded either way.',
    slashDescription: 'Temporarily ban a member from the server.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('user').setDescription('The member to temporarily ban.').setRequired(true))
               .addStringOption(option => option.setName('time').setDescription('How long the ban should last (e.g. "1d").').setRequired(true))
               .addStringOption(option => option.setName('reason').setDescription('Reason for the ban.').setRequired(false)),

    args: true,

    permissionsUser: [
        'SEND_MESSAGES',
        'BAN_MEMBERS',
        'MODERATE_MEMBERS'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES',
        'BAN_MEMBERS'
    ],

    async run(client, message, args, guild, interaction)
    {
        const role = client.utils.role(message, args, 0);
        const member = await client.utils.member(message, args, 0, { cut: true });

        if (role?.id === message.guild.roles.everyone.id)
        {
            if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator))
            {
                return client.qEmbed('Only members with the ADMINISTRATOR permission can do that!', interaction ?? message);
            }

            message.guild.members.cache.forEach(async m =>
            {
                if (m.id !== client.user.id)
                {
                    await m.ban().catch(client.swallow('tempban: ban'));
                }
            });

            return client.qEmbed('Banning all members...', interaction ?? message);
        }

        if (!member)
        {
            return client.qEmbed('User doesn\'t exist on this server!', interaction ?? message);
        }

        if (client.isOwner(member.user.id))
        {
            return client.qEmbed(client.utils.randErr(), interaction ?? message);
        }

        if (client.user.id.includes(member.user.id))
        {
            return client.qEmbed('Cannot ban Relaxy with Relaxy!', interaction ?? message);
        }

        if (!await client.getUser(member.user.id))
        {
            return client.qEmbed('User doesn\'t exist!', interaction ?? message);
        }

        if (member.user.id.includes(message.author.id))
        {
            return client.qEmbed('Cannot ban yourself!', interaction ?? message);
        }

        if (member.roles.highest.position >= message.member.roles.highest.position)
        {
            return client.qEmbed('You can\'t ban a member that is equal to or higher than yourself!', interaction ?? message);
        }

        let reason = '';
        let flag = false;
        let time = client.utils.getTime(args);
        let timeArgs = client.utils.getTime(args, true);

        if (!time)
        {
            return client.qEmbed('No duration specified for the temporary ban!', interaction ?? message);
        }

        args = args.filter((_, i) => !timeArgs.includes(i));
        reason = args.join(' ');

        reason = reason
            .replace(/\bdate\b/i, client.utils.formatDate(new Date()))
            .replace(/\bLOG\b/i, `${client.utils.formatDate(new Date())} - ${message.member}`);
        const {
            reason: withoutFlag,
            silent: noAppeal
        } = client.utils.takeNoAppeal(reason);
        reason = withoutFlag;
        reason = await client.redact(reason, guild, message);
        const caseNumber = await client.module.database.addCase(guild.id, {
            type:     'tempban',
            user:     member.user.id,
            mod:      message.author.id,
            reason:   reason || 'No reason given.',
            extra:    `Unban in: ${client.imports.time(time)}`,
            guildBan: true
        });

        const notice = noAppeal
            ? {
                sent:   false,
                appeal: null
            }
            : await client.utils.sendBanNotice(guild, member.user, {
                message,
                reason: `${reason || 'No reason given.'} (temporary - ${client.imports.time(time)})`,
                num:    caseNumber
            });

        await member.ban({
            reason:               reason,
            deleteMessageSeconds: 604800
        }).catch(() =>
        {
            return flag = true;
        });

        if (flag)
        {
            return client.qEmbed('Cannot ban this member.', interaction ?? message);
        }

        await client.module.database.addMute(guild.id, member.id, {
            mod:     message.author.id,
            exp:     Date.now() + time,
            roles:   [],
            reason:  '',
            dur:     time,
            channel: message.channel.id,
            ban:     true
        });

        return client.send(interaction
            ? 1
            : message.channel, null, [
            {
                color:       client.data.embedColor,
                description: `**${client.utils.tag(member.user)}** has been banned! **[Case: #${caseNumber}]**\n**Reason:**\n${reason || '**`No reason given.`**'}\n**Unban in:**\n${client.imports.time(time)}${noAppeal
                    ? '\n**Appeal:**\n**`Not sent - noappeal was used.`**'
                    : notice.appeal
                        ? `\n**Appeal:**\n${notice.sent
                            ? 'They were sent the appeal invite.'
                            : '**`Could not DM them the appeal invite (DMs closed).`**'}`
                        : ''}`,
                thumbnail:   {
                    url: member.displayAvatarURL({
                        dynamic: true,
                        size:    4096
                    })
                }
            }
        ]);
    }
};
