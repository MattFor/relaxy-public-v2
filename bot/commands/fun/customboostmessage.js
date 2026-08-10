'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'customboostmessage',
    aliases:     [
        'customnitromessage',
        'nitromessage',
        'boostmessage',
        'cbm'
    ],
    usage:       '=customboostmessage [boost|level_1|level_2|level_3|all|channel|off|delete_original] [args]',
    description: 'When enabled, Relaxy! sends a custom message whenever:\n- someone boosts the server, or\n- a boost moves the server to a new boost level (1, 2 or 3).\n\nTo set a message, type the command followed by `boost`, `level_1`, `level_2` or `level_3`, then either plain text or `embed` to build an embedded message. Use `all` to set the same message for every type, `channel` to set the destination channel, `off` to disable (append `clean` to also wipe settings) and `delete_original` to toggle deletion of Discord\'s own boost system message.\nAppend `view` after a type to preview it.\n\n**Replacers** - these are substituted automatically:\n- `|U|` - the user who boosted\n- `|G|` - the server name\n- `|C|` - the channel the boost appeared in',

    args: true,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: [
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const customMessageCreator = new client.class.customEmbed(client);

        if (guild.cb.on)
        {
            const argument1 = args.shift().toLowerCase();

            const goodChannel = async message =>
            {
                const channel = await client.utils.channel(message, args, 0);

                if (!channel)
                {
                    return false;
                }

                if (channel instanceof Discord.BaseGuildTextChannel)
                {
                    client.qEmbed('Channel selected must be a text channel!', interaction ?? message);
                    return false;
                }

                const exempt = client.utils.isExempt(guild, null, message.member ?? null);
                const restricted = client.utils.isRestricted(guild, channel.id);

                if (!exempt && restricted)
                {
                    client.qEmbed('You do not have the permissions to select that channel (restricted)!', interaction ?? message);
                    return false;
                }

                return channel;
            };

            switch (argument1)
            {
                case 'off':
                    const toAlter = [
                        {
                            alter: 'cb.on',
                            value: false
                        }
                    ];

                    let clean = false;
                    if (args[0].toLowerCase() === 'clean')
                    {
                        clean = true;

                        toAlter.push({
                            alter: 'cb.b',
                            value: {
                                c:  '',
                                dt: ''
                            }
                        }, {
                            alter: 'cb.l1',
                            value: {
                                c:  '',
                                dt: ''
                            }
                        }, {
                            alter: 'cb.l2',
                            value: {
                                c:  '',
                                dt: ''
                            }
                        }, {
                            alter: 'cb.l3',
                            value: {
                                c:  '',
                                dt: ''
                            }
                        });
                    }

                    client.save(guild.id, ...toAlter);

                    return client.qEmbed(`Custom boost message turned off!${clean
                        ? '\nExisting settings wiped!'
                        : ''}`, interaction ?? message);
                case 'all':
                {
                    const parts = await customMessageCreator.fullRoutine(message, args, guild, {
                        noChannel:   true,
                        valuesOnly:  true,
                        ignoreEmbed: true
                    });

                    if (!parts)
                    {
                        return;
                    }

                    const data = `${customMessageCreator.text}Ą-=|||SPLITTER_FLAG|||=-Ą${customMessageCreator.rawEmbedText}`;

                    client.save(guild.id, {
                        alter: 'cb.b.dt',
                        value: data
                    }, {
                        alter: 'cb.l1.dt',
                        value: data
                    }, {
                        alter: 'cb.l2.dt',
                        value: data
                    }, {
                        alter: 'cb.l3.dt',
                        value: data
                    });

                    return client.qEmbed(`Settings successfully changed for all message types!`, interaction ?? message);
                }
                case 'boost':
                case 'level_1':
                case 'level_2':
                case 'level_3':
                {
                    const typeKey = {
                        boost:   'b',
                        level_1: 'l1',
                        level_2: 'l2',
                        level_3: 'l3'
                    }[argument1];
                    const argument2 = args[0].toLowerCase();

                    if (argument2 === 'view')
                    {
                        const fallBackFile = !message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.AttachFiles);

                        if (fallBackFile)
                        {
                            return client.qEmbed('Proceeding requires the `AttachFiles` permission in case you\'re using files within the embed.', interaction ?? message);
                        }

                        const settings = guild.cb[typeKey].dt.split('Ą-=|||SPLITTER_FLAG|||=-Ą');

                        const parts = await customMessageCreator.fullRoutine(message, settings?.[1].split(' ') ?? [], guild, {
                            preset:      true,
                            noChannel:   true,
                            valuesOnly:  true,
                            ignoreEmbed: true
                        });

                        if (!parts)
                        {
                            return;
                        }

                        return client.send(message.channel,
                            parts[0]
                                ? parts[0]
                                    .replaceAll('|U|', message.member)
                                    .replaceAll('|G|', message.guild.name)
                                    .replaceAll('|C|', message.channel)
                                : null,
                            parts[1]?.length !== 0
                                ? await client.parseJSON(await client.stringifyJSON(parts[1])
                                                                     .replaceAll('|U|', message.member)
                                                                     .replaceAll('|G|', message.guild.name)
                                                                     .replaceAll('|C|', message.channel))
                                : null,
                            parts[2]);
                    }

                    const channel = await goodChannel(message, true);

                    const noChannel = argument2 === 'none';
                    if (channel || noChannel)
                    {
                        client.save(guild.id, {
                            alter: `cb.${typeKey}.c`,
                            value: noChannel
                                       ? argument2
                                       : channel.id
                        });
                        return client.qEmbed(`Channel successfully set to ${args[0] === 'none'
                            ? 'channel in which the message appears in'
                            : channel}`, interaction ?? message);
                    }

                    const parts = await customMessageCreator.fullRoutine(message, args, guild, {
                        noChannel:   true,
                        valuesOnly:  true,
                        ignoreEmbed: true
                    });

                    if (!parts)
                    {
                        return;
                    }

                    const data = `${customMessageCreator.text}Ą-=|||SPLITTER_FLAG|||=-Ą${customMessageCreator.rawEmbedText}`;

                    client.save(guild.id, {
                        alter: `cb.${typeKey}.dt`,
                        value: data
                    });

                    return client.qEmbed(`Settings successfully changed for ${argument1}!\nType 'view' after ${argument1} while typing the command to see how it looks like.`, interaction ?? message);
                }
                case 'channel':
                    const channel = await client.utils.channel(message, args, 0);

                    if (!channel)
                    {
                        return client.qEmbed('Cannot find the channel!', interaction ?? message);
                    }

                    if (channel instanceof Discord.BaseGuildTextChannel)
                    {
                        return client.qEmbed('Channel selected must be a text channel!', interaction ?? message);
                    }

                    const exempt = client.utils.isExempt(guild, null, interaction.member ?? null);
                    const restricted = client.utils.isRestricted(guild, channel.id);

                    if (!exempt && restricted)
                    {
                        return client.qEmbed('You do not have the permissions to select that channel (restricted)!', interaction ?? message);
                    }

                    client.save(guild.id, {
                        alter: 'cb.b.c',
                        value: channel.id
                    }, {
                        alter: 'cb.l1.c',
                        value: channel.id
                    }, {
                        alter: 'cb.l2.c',
                        value: channel.id
                    }, {
                        alter: 'cb.l3.c',
                        value: channel.id
                    });

                    return client.qEmbed(`All custom reaction message channels set to ${channel}!`, interaction ?? message);
                case 'delete_original':
                    client.save(guild.id, {
                        alter: 'cb.del',
                        value: !guild.cb.del
                    });
                    return client.qEmbed(`The original message will ${!guild.cb.del
                        ? 'be'
                        : 'not be'} deleted!`, interaction ?? message);
                default:
                    return client.qEmbed('Invalid argument!', interaction ?? message);
            }
        }

        const parts = await customMessageCreator.fullRoutine(message, args, guild, {
            noChannel:   true,
            valuesOnly:  true,
            ignoreEmbed: true
        });

        if (!parts)
        {
            return;
        }

        const data = `${customMessageCreator.text}Ą-=|||SPLITTER_FLAG|||=-Ą${customMessageCreator.rawEmbedText}`;

        if (guild.cb.b.dt !== '' || guild.cb.l1.dt !== '' || guild.cb.l2.dt !== '' || guild.cb.l3.dt !== '')
        {
            client.save(guild.id, {
                alter: 'cb.on',
                value: true
            });
        }
        else
        {
            client.save(guild.id, {
                alter: 'cb.b.dt',
                value: data
            }, {
                alter: 'cb.l1.dt',
                value: data
            }, {
                alter: 'cb.l2.dt',
                value: data
            }, {
                alter: 'cb.l3.dt',
                value: data
            }, {
                alter: 'cb.on',
                value: true
            });
        }

        return client.qEmbed(`**Successfully created boost message!**\nIt will appear where the original message is sent.\n\nTo change it for all message types type:\n\`${guild.px[0]}customboostmessage channel (channel data)\`\n\nFor a specific one type 'boost/level_X' before \`channel\`.\nTo add a custom one for level 1, 2, 3, type:\n\`${guild.px[0]}customboostmessage boost/level_1 .. etc\``, interaction ?? message);
    }
};
