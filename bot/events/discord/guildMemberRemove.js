'use strict';

import Discord  from 'discord.js';
import { bump } from '../../../src/Client/Modules/Progression/DailyStats.js';
import Relaxy   from '../../../src/Client/Relaxy.js';

export default {
    async run(client, member)
    {
        client.log('ERROR', `${client.utils.tag(member.user)} has left [${member.guild.name}]`);

        if (!member.user.bot)
        {
            bump(member.guild.id, 'l');
        }

        const guild = await client.module.database.Guild(member.guild.id);
        const kick = await recordKick(client, guild, member);

        if (guild.ml.ev?.guildMemberRemove?.on)
        {
            if (!client.channels.cache.get(guild.ml.ev.guildMemberRemove.channel))
            {
                return client.save(guild.id, {
                    alter: 'ml.ev.guildMemberRemove.on',
                    value: false
                });
            }

            let permissions = [];
            for (const key of Object.entries(Discord.PermissionFlagsBits))
            {
                if (member.permissions.has(Discord.PermissionFlagsBits[key[0]]))
                {
                    permissions.push(client.utils.firstLetterUp(key[0].toLowerCase()));
                }
            }

            if (permissions.length === Object.keys(Discord.PermissionFlagsBits).length)
            {
                permissions = ['Has every permission [Administrator]'];
            }

            if (permissions.length === 0)
            {
                permissions.push('No Key Permissions Found');
            }

            client.pushModlog(member.guild.id, 'guildMemberRemove', new client.class.modlog({
                color:     'bad',
                event:     kick
                               ? 'User kicked!'
                               : 'User left!',
                title:     kick
                               ? `**Event |** \`Kick\` - Case #${kick.case}`
                               : undefined,
                thumbnail: member.displayAvatarURL({
                    dynamic: true,
                    size:    4096
                }),
                fields:    [
                    {
                        name:  'User:',
                        value: `${member}\nTag: (${client.utils.tag(member.user)})\nNickname: ${member.nickname
                            ? member.nickname
                            : 'Same as normal username. / Unavailable.'}`
                    },
                    kick
                        ? {
                            name:  'Kick reason:',
                            value: kick.reason
                        }
                        : null,
                    kick?.actor
                        ? {
                            name:  'Kicked by:',
                            value: `${kick.actor} - ${client.utils.tag(kick.actor)} **\`${kick.actor.id}\`**`
                        }
                        : null,
                    {
                        name:  'User ID:',
                        value: `\`${member.user.id}\``
                    },
                    member.joinedAt
                        ? {
                            name:  'Joined server:',
                            value: `\`${client.utils.formatDate(member.joinedAt)}\``
                        }
                        : null,
                    {
                        name:  'Permissions:',
                        value: `\`${permissions.length !== 0
                            ? permissions.join(`\`, \``)
                            : 'None.'}\``
                    },
                    {
                        name:   `Roles [${member.roles.cache.filter(r => r.id !== member.guild.id).map(roles => `\`${roles.name}\``).length}]`,
                        value:  `${member.roles.cache.filter(r => r.id !== member.guild.id).map(roles => `<@&${roles.id}>`).join(' **|** ') || 'No Roles'}`,
                        inline: true
                    }
                ]
            }), kick?.actor ?? null);
        }

        if (guild.dg.on)
        {
            let user = await client.module.database.User(member.user.id);

            let z = guild.dg.l.split('[SPLIT_FLAG]');
            if (z[0] === 'NULL(0)')
            {
                z[0] = null;
            }
            z[0] = z[0]?.replace('NULL(0)', '');
            if (z[1] === 'NULL(0)')
            {
                z[1] = null;
            }

            if (z[1])
            {
                z[1] = await client.parseJSON(z[1]);
                try
                {
                    z[1] = await client.fixerParseJSON((await client.stringifyJSON(z[1])).replaceAll('botver', client.config.keys.version));
                }
                catch (error)
                {
                    client.log('DEBUG', `guildMemberRemove: leave DM embed for ${member.guild.id} would not parse (${error?.message ?? error}).`);
                }
            }

            if (!user.dm && (z[0] || z[1]))
            {
                client.send(member.user, z[0], [z[1]]);
            }
        }

        if (guild.wc.on)
        {
            if (!client.channels.cache.get(guild.wc.l.c))
            {
                client.save(guild.id, {
                    alter: 'wc.l.c',
                    value: ''
                });
            }

            let welcomeCard = null;
            let welcomeAttachment = null;

            let welcomeEncoded = guild.wc.l.m.split('[SPLIT_FLAG]');

            if (welcomeEncoded[0] === 'NULL(0)')
            {
                welcomeEncoded[0] = '';
            }

            if (welcomeEncoded[1])
            {
                try
                {
                    welcomeEncoded[1] = welcomeEncoded[1].replaceAll('botver', client.config.keys.version);
                }
                catch (error)
                {
                    client.log('DEBUG', `guildMemberRemove: leave message 'botver' substitution failed in ${member.guild.id} (${error?.message ?? error}).`);
                }

                try
                {
                    welcomeEncoded[1] = welcomeEncoded[1].replaceAll('|U|', member).replaceAll('\'U\'', member);
                }
                catch (error)
                {
                    client.log('DEBUG', `guildMemberRemove: leave message user substitution failed in ${member.guild.id} (${error?.message ?? error}).`);
                }

                try
                {
                    welcomeEncoded[1] = welcomeEncoded[1].replaceAll('|G|', member.guild.name).replaceAll('\'G\'', member.guild.name);
                }
                catch (error)
                {
                    client.log('DEBUG', `guildMemberRemove: leave message guild substitution failed in ${member.guild.id} (${error?.message ?? error}).`);
                }

                try
                {
                    welcomeEncoded[1] = await client.fixerParseJSON(welcomeEncoded[1]);
                }
                catch (error)
                {

                    client.log('DEBUG', `guildMemberRemove: leave message embed would not parse in ${member.guild.id} (${error?.message ?? error}).`);
                }

                if ((await client.stringifyJSON(welcomeEncoded[1])).includes('timestamp'))
                {
                    welcomeEncoded[1].timestamp = new Date();
                }
            }

            if ([
                4,
                6,
                7,
                8,
                9,
                11,
                13
            ].includes(Number(guild.wc.t)))
            {
                welcomeCard = new client.cards.Leaver()
                    .setColor('#FF69B4')
                    .setGuildName(member.guild.name)
                    .setMemberCount(member.guild.memberCount + 1)
                    .setUsername(client.utils.norm(member.user.username))
                    .setAvatar(member.displayAvatarURL({
                        extension: 'png',
                        size:      4096
                    }));

                welcomeCard.colorTitle = '#FF69B4';
                welcomeCard.textTitle = guild.wc.l.t;
                welcomeCard.textMessage = guild.wc.l.b;

                await welcomeCard.build().then(data =>
                {
                    if (welcomeEncoded[1])
                    {
                        welcomeAttachment = data;
                    }
                    else
                    {
                        welcomeAttachment = new Discord.AttachmentBuilder(data, { name: 'leave.png' });
                    }
                });

                if (welcomeEncoded[1])
                {
                    welcomeEncoded[1].files = [
                        {
                            attachment: welcomeAttachment,
                            name:       'leave.png'
                        }
                    ];

                    welcomeEncoded[1].image = { url: 'attachment://leave.png' };
                }
            }

            if ([
                4,
                5,
                7,
                8,
                9,
                10,
                12
            ].includes(Number(guild.wc.t)))
            {
                if (welcomeEncoded[0])
                {
                    welcomeEncoded[0] = welcomeEncoded[0].replace('|U|', member).replace('|G|', member.guild.name);
                }
            }
            else
            {
                welcomeEncoded[0] = null;
            }

            if (!client.isOwner(member.user.id))
            {
                return client.data.joinMessages?.[guild.id]?.push([
                    'leave',
                    [
                        welcomeEncoded[0],
                        welcomeEncoded[1]
                            ? [welcomeEncoded[1]]
                            : null,
                        welcomeAttachment
                            ? [welcomeAttachment]
                            : null
                    ]
                ]);
            }
        }
    }
};

const recordKick = async (client, guild, member) =>
{
    const audit = await client.utils.auditActor(member.guild, 'MemberKick', member.id).catch(() => null);

    if (!audit)
    {
        return null;
    }

    const reason = audit.entry?.reason || 'No reason given.';
    const existing = client.module.database.takeCase('kick', guild.id, member.id);

    if (existing !== null)
    {
        return {
            case:  existing,
            reason,
            actor: audit.executor ?? null
        };
    }

    const number = await client.module.database.addCase(guild.id, {
        type: 'kick',
        user: member.id,
        mod:  audit.executor?.id ?? '',
        reason
    });

    return {
        case:  number,
        reason,
        actor: audit.executor ?? null
    };
};
