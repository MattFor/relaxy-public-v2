'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import {
    moderateAcrossPool,
    syncReport
} from '../../../src/Client/Modules/Guilds/GuildLink.js';

import {
    SYNC_TOKEN,
    wholeToken
} from '../../../src/Client/Modules/Core/Utilities.js';

const SYNC_ARG = wholeToken(SYNC_TOKEN);

const alreadyMutedText = async (client, guild, member) =>
{
    const existing = await client.module.database.getMute(guild.id, member.id).catch(() => null);

    if (!existing)
    {
        return `${member} is already muted, but Relaxy has no record of it.\nThe mute role was most likely added by hand, so nothing will lift it automatically - remove the role, or \`=unmute\` them and mute again to put it on the books.`;
    }

    const seconds = ms => Math.floor(ms / 1000);

    const lines = [
        `${member} is already muted!`,
        existing.mod
            ? `**By:** <@${existing.mod}> - **\`${existing.mod}\`**`
            : '**By:** unknown - no moderator was recorded.',
        `**Reason:** ${existing.reason || 'No reason given.'}`,
        existing.exp
            ? `**Expires:** <t:${seconds(existing.exp)}:R> (<t:${seconds(existing.exp)}:f>)`
            : '**Expires:** never - this mute is permanent.'
    ];

    if (existing.at)
    {
        lines.push(`**Muted:** <t:${seconds(existing.at)}:R>`);
    }

    if (existing.ban)
    {
        lines.push('This mute also **unbans** them when it expires.');
    }

    lines.push(`\nUse \`${guild.px[0]}unmute ${member.id}\` to lift it first.`);

    return lines.join('\n');
};

export default {
    name:             'mute',
    aliases:          ['m'],
    usage:            '=mute <user> [time|heat death] [reason] [sync]',
    description:      'Mute a member for an unspecified or specified amount of time (time can include the keywords: minute, hour, day, week, month, year to multiply time)\n\nWrite **heat death** in place of a time to mute them permanently - it is stored as "until the heat death of the universe" and never expires on its own, so only `=unmute` lifts it. The words are stripped from the reason.\n\nAdd **sync** to mute them in **every server this one is linked to** as well (`=syncservers`), for the same length of time and each with its own case. Only servers that have run `=syncservers moderation on` are reached, and the reply names any that were not.\n\n### If the only argument is \'muterole\' the bot will update all channels and the role itself to use the most up to date settings.\n\n## If no time is specified, user will be muted indefinitely.',
    slashDescription: 'Mute a member. Type only the user to show a form. / version doesn\'t create the mute role.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('user').setDescription('User that will be muted.').setRequired(true)),

    args: true,

    permissionsUser:         [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES',
        'MODERATE_MEMBERS'
    ],
    permissionsBot:          [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'MANAGE_CHANNELS',
        'MANAGE_ROLES'
    ],
    suggestedPermissionsBot: ['ATTACH_FILES'],

    async run(client, message, args, guild, interaction)
    {
        if (interaction)
        {

            const interactionId = interaction?.customId?.split('_')?.[1];
            if (interactionId?.startsWith('modal'))
            {
                await interaction.deferReply();

                let time = 0;
                let reason = '';
                let bypass = false;
                const fields = interaction.fields.fields.filter(f => f.value !== '');
                const member = client.collections.modalInteractionData.get(interaction.user.id);

                for (const [key, value] of Array.from(fields.entries()))
                {
                    const _value = value.value;

                    switch (key)
                    {
                        case 'mute_modal-time':
                        {
                            bypass = _value.toLowerCase().includes('heat death');

                            const _args = _value.split(/ /g);

                            time = client.utils.getTime(_args);

                            if (time === undefined && !bypass)
                            {
                                return client.utils.interactionReplySpecial('No singular time option chosen yet no number given!', interaction, false, { color: 16711680 }, true);
                            }

                            if ([
                                null,
                                0
                            ].includes(time))
                            {
                                time = 333333333999;
                            }

                            if (time > 315_360_000_100 && time !== 333333333999 && !client.isOwner(message.author.id) && !bypass)
                            {
                                return client.utils.interactionReplySpecial('Maximum mute time is 10 years!', interaction, false, { color: 16711680 }, true, true);
                            }

                            time = bypass
                                ? 918273646559
                                : time;
                        }
                            break;
                        case 'mute_modal-reason':
                        {
                            const _args = _value.split(/ /g);

                            reason = bypass
                                ? _value.replace('heat death', '')
                                : client.utils.removeIndices(_args, client.utils.getTime(_args, true)).join(' ').replace(/\bdate\b/i, client.utils.formatDate(new Date())).slice(0, 128);
                        }
                            break;
                    }
                }

                if (time === 0)
                {
                    time = 333333333999;
                }
                const {
                    reason: modalReason,
                    sync:   modalSync
                } = client.utils.takeSync(reason);

                reason = modalReason;

                const result = await client.module.moderation.mute({
                    guild:      message.guild,
                    guildDoc:   guild,
                    member,
                    moderator:  interaction.user.id,
                    reason,
                    durationMs: (time === 333333333999 || time === 918273646559)
                                    ? 0
                                    : time,
                    forever:    bypass || time === 918273646559,
                    channelId:  message.channel.id,
                    message
                });

                if (!result.ok)
                {
                    return client.utils.interactionReplySpecial(result.error, interaction, false, { color: 16711680 }, true, true);
                }

                const muteTime = (result.duration === 918273646559 || result.duration === 333333333999)
                    ? null
                    : client.imports.time(result.duration);

                const modalSynced = modalSync
                    ? await moderateAcrossPool(client, guild, 'mute', {
                        userId:     member.user.id,
                        moderator:  interaction.user.id,
                        reason:     result.reason,
                        durationMs: (time === 333333333999 || time === 918273646559)
                                        ? 0
                                        : time,
                        forever:    bypass || time === 918273646559
                    })
                    : null;

                return client.send(1, null, [
                    {
                        color:       client.data.embedColor,
                        description: `Successfully muted ${member} ${result.duration === 918273646559
                            ? '\n**until the heat death of the universe (999999999999^100^100y)**'
                            : `for ${result.duration === 333333333999
                                ? 'an unspecified amount of time'
                                : muteTime}`}. **[Case: #${result.caseNumber}]**${modalSynced
                            ? syncReport(modalSynced, 'Muted')
                            : ''}`
                    }
                ]);
            }

            const member = await client.utils.member(message, args, 0, { cut: true });

            if (member.user.id === message.author.id)
            {
                return client.utils.interactionReplySpecial('Cannot mute yourself!', interaction, false, { color: 16711680 }, true);
            }

            if (member.user.id === client.user.id)
            {
                return client.utils.interactionReplySpecial('Relaxy cannot mute himself!', interaction, false, { color: 16711680 }, true);
            }

            if (member.user.bot)
            {
                return client.utils.interactionReplySpecial('Cannot mute a bot!', interaction, false, { color: 16711680 }, true);
            }

            if (member.user.id === message.guild.ownerId)
            {
                return client.utils.interactionReplySpecial('Cannot mute the server owner, obviously...', interaction, false, { color: 16711680 }, true);
            }

            if (member.roles.highest.position >= message.member.roles.highest.position)
            {
                return client.utils.interactionReplySpecial('You can not mute a member that is equal to or higher than yourself!', interaction, false, { color: 16711680 }, true);
            }

            if (member.roles.highest.position >= message.guild.members.me.roles.highest.position)
            {
                return client.utils.interactionReplySpecial('Cannot mute, Relaxy!\'s highest role position is lower than the person to be muted!', interaction, false, { color: 16711680 }, true);
            }

            const muteRole = await message.guild.roles.fetch(guild.d.mut.id);

            if (!muteRole)
            {
                return client.utils.interactionReplySpecial(`The mute role is not yet created, please initiate this command with ${guild.px[0]} to create it!`, interaction, false, { color: 16711680 }, true);
            }

            if (muteRole && muteRole.rawPosition >= message.guild.members.me.roles.highest.position)
            {
                return client.utils.interactionReplySpecial('The position of the mute role is lower than Relaxy!\'s highest role position!', interaction, false, { color: 16711680 }, true);
            }

            if (member.permissions.has(Discord.PermissionFlagsBits['Administrator']))
            {
                return client.utils.interactionReplySpecial('Cannot mute someone with administrator privileges!', interaction, false, { color: 16711680 }, true);
            }

            if (member.roles.cache.find(r => r.id === guild.d.mut.id))
            {
                return client.utils.interactionReplySpecial(await alreadyMutedText(client, guild, member), interaction, false, { color: 16711680 }, true);
            }

            const muteModal_Time = new Discord.TextInputBuilder()
                .setCustomId('mute_modal-time')
                .setLabel('Mute duration')
                .setStyle(Discord.TextInputStyle.Short)
                .setPlaceholder('Unspecified amount of time.')
                .setMaxLength(50)
                .setRequired(false);

            const muteModal_Reason = new Discord.TextInputBuilder()
                .setCustomId('mute_modal-reason')
                .setLabel('Mute Reason')
                .setStyle(Discord.TextInputStyle.Paragraph)
                .setPlaceholder('They have disrespected Relaxy!\nRemember the word \'date\' will be replaced with the current time.')
                .setMaxLength(128)
                .setRequired(false);

            client.collections.modalInteractionData.set(interaction.user.id, member);

            return await interaction.showModal(client.assembleModal('Mute form.', 'mute_modal', muteModal_Time, muteModal_Reason));
        }

        if (args[0].toLowerCase() === 'muterole')
        {
            let muteRole = null;

            if (guild.d.mut.id === '')
            {
                try
                {
                    ({ role: muteRole } = await client.module.creators.createMuteRole({
                        guild:    message.guild,
                        guildDoc: guild,
                        reason:   `=mute muterole by ${client.utils.tag(message.author)}`
                    }));
                }
                catch
                {
                    return client.qEmbed('Something went wrong while creating the muted role!', interaction ?? message);
                }

                return client.qEmbed('Created the Relaxy muted role!', interaction ?? message);
            }

            try
            {
                muteRole = await message.guild.roles.fetch(guild.d.mut.id);
                return client.qEmbed('Successfully verified mute role\'s properties!', interaction ?? message);
            }
            catch
            {
                return client.qEmbed('This error should not happen, contact @mattfor', interaction ?? message);
            }
        }

        const sync = args.some(word => SYNC_ARG.test(word));

        if (sync)
        {
            args = args.filter(word => !SYNC_ARG.test(word));
        }

        const joinedArgs = args.join(' ');
        const bypass = joinedArgs.toLowerCase().includes('heat death');

        let member = await client.utils.member(message, args, 0, { cut: true }) ?? null;

        if (!member)
        {
            return client.qEmbed('Member doesn\'t exist!', interaction ?? message);
        }

        if (client.isOwner(member.user.id))
        {
            return client.qEmbed(client.utils.randErr(), interaction ?? message);
        }

        if (member.user.id === message.author.id)
        {
            return client.qEmbed('Cannot mute yourself!', interaction ?? message);
        }

        if (member.user.id === client.user.id)
        {
            return client.qEmbed('Relaxy cannot mute himself!', interaction ?? message);
        }

        if (member.user.bot)
        {
            return client.qEmbed('Cannot mute a bot!', interaction ?? message);
        }

        if (member.user.id === message.guild.ownerId)
        {
            return client.qEmbed('Cannot mute the server owner, obviously...', interaction ?? message);
        }

        if (member.roles.highest.position >= message.member.roles.highest.position)
        {
            return client.qEmbed('You can not mute a member that is equal to or higher than yourself!', interaction ?? message);
        }

        if (member.roles.highest.position >= message.guild.members.me.roles.highest.position)
        {
            return client.qEmbed('Cannot mute, Relaxy!\'s highest role position is lower than the person to be muted!', interaction ?? message);
        }

        let muteRole = await message.guild.roles.fetch(guild.d.mut.id);

        if (muteRole && muteRole.rawPosition >= message.guild.members.me.roles.highest.position)
        {
            return client.qEmbed('The position of the mute role is lower than Relaxy!\'s highest role position!', interaction ?? message);
        }

        if (member.permissions.has(Discord.PermissionFlagsBits['Administrator']))
        {
            return client.qEmbed('Cannot mute someone with administrator privileges!', interaction ?? message);
        }

        if (member.roles.cache.find(r => r.id === guild.d.mut.id))
        {
            return client.qEmbed(await alreadyMutedText(client, guild, member), interaction ?? message);
        }

        if (!muteRole || muteRole?.size > 1)
        {
            let error = false;

            muteRole = await message.guild.roles.create({
                name:        'Relaxy Muted',
                color:       '#000000',
                mentionable: false,
                hoist:       true,
                permissions: []
            }).catch(() => error = true);

            if (error)
            {
                return client.qEmbed('Something went wrong while creating the muted role!', interaction ?? message);
            }

            client.save(guild.id, {
                alter: 'd.mut.id',
                value: muteRole.id
            });

            client.qEmbed('Created the Relaxy muted role!', interaction ?? message);
        }

        let time = client.utils.getTime(args);

        if (time === undefined && !bypass)
        {
            return client.qEmbed('No singular time option chosen yet no number given!', interaction ?? message);
        }

        const result = await client.module.moderation.mute({
            guild:           message.guild,
            guildDoc:        guild,
            member,
            moderator:       message.author.id,
            moderatorMember: message.member,
            reason:          bypass
                                 ? joinedArgs.replace('heat death', '')
                                 : client.utils.removeIndices(args, client.utils.getTime(args, true)).join(' ').replace(/\bdate\b/i, client.utils.formatDate(new Date())).slice(0, 128),
            durationMs:      (time === 333333333999 || time === 918273646559)
                                 ? 0
                                 : time,
            forever:         bypass || time === 918273646559,
            channelId:       message.channel.id,
            message
        });

        if (!result.ok)
        {
            return client.qEmbed(result.error, interaction ?? message);
        }
        time = result.duration;

        const muteTime = (time === 918273646559 || time === 333333333999)
            ? null
            : client.imports.time(time);
        const caseNumber = result.caseNumber;
        const synced = sync
            ? await moderateAcrossPool(client, guild, 'mute', {
                userId:     member.user.id,
                moderator:  message.author.id,
                reason:     result.reason,
                durationMs: (time === 333333333999 || time === 918273646559)
                                ? 0
                                : time,
                forever:    time === 918273646559
            })
            : null;

        return client.send(interaction
            ? 1
            : message.channel, null, [
            client.utils.moderationEmbed({
                verb:      'Muted',
                emoji:     '🔇',
                user:      member.user,
                member,
                moderator: message.author.id,
                reason:    result.reason,
                caseNumber,
                extra:     [
                    {
                        name:   'Lifts',
                        value:  time === 918273646559
                                    ? '**Never** - the heat death of the universe'
                                    : time === 333333333999
                                ? 'An **unspecified** amount of time - lift it by hand'
                                : `In **${muteTime}** (<t:${Math.floor((Date.now() + time) / 1000)}:R>)`,
                        inline: true
                    }
                ],
                sync:      synced
                               ? syncReport(synced, 'Muted')
                               : ''
            })
        ]);
    }
};
