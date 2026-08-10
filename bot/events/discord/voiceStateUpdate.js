'use strict';

import Discord    from 'discord.js';
import Relaxy     from '../../../src/Client/Relaxy.js';
import * as voice from '../../../src/Client/Modules/Progression/VoiceActivity.js';

import { BLACKLIST_ACTION_REASON } from '../../../src/Config/Settings.js';

const readableStates = [
    [
        'Undeafened themselves',
        'Deafened themselves',
        'Joined deafened'
    ],
    [
        'Unmuted themselves',
        'Muted themselves',
        'Joined muted'
    ],
    [
        'Stopped streaming',
        'Started streaming'
    ],
    [
        'Was undeafened by staff',
        'Was deafened by staff',
        'Joined staff deafened'
    ],
    [
        'Was unmuted by staff',
        'Was muted by staff',
        'Joined staff muted'
    ],
    [
        'Stopped self-video',
        'Started self-video'
    ],
    [
        'Left voice channel',
        'Joined voice channel',
        'Switched voice channel'
    ]
];

const stateKeys = [
    'selfDeaf',
    'selfMute',
    'streaming',
    'serverDeaf',
    'serverMute',
    'selfVideo'
];

const getVoiceState = (oldState, newState) =>
{
    const states = stateKeys.filter(key => (oldState[key] !== newState[key] || newState.channelId === oldState.channelId) && (oldState.channelId === null
        ? newState[key]
        : true));

    let joinLeaveSwitchState = null;

    if (oldState.channelId !== newState.channelId && newState.channelId !== null && oldState.channelId !== null)
    {
        joinLeaveSwitchState = [
            6,
            2
        ];
    }
    else if (!oldState.channelId && newState.channelId)
    {
        joinLeaveSwitchState = [
            6,
            1
        ];
    }
    else if (oldState.channelId && !newState.channelId)
    {
        joinLeaveSwitchState = [
            6,
            0
        ];
    }

    if (states.length === 0)
    {
        return [joinLeaveSwitchState];
    }

    const encodedStates = states.map(s => [
        stateKeys.indexOf(s),
        Number(newState[s])
    ]);
    if (joinLeaveSwitchState)
    {
        encodedStates.push(joinLeaveSwitchState);
    }

    return encodedStates;
};

export default {
    async run(client, oldState, newState)
    {

        await client.player._handleVoiceState(oldState, newState);

        const member = newState.member ?? oldState.member ?? await (newState.guild ?? oldState.guild).members.fetch(newState.id ?? oldState.id).catch(() => null);

        if (!member)
        {
            return;
        }

        if (newState.channelId && !member.user.bot && !newState.serverMute && client.utils.blacklisted(member.id) > 0)
        {
            newState.setMute(true, BLACKLIST_ACTION_REASON).catch(client.swallow('voiceStateUpdate: blacklist mute'));
        }

        if (!member.user.bot)
        {
            const guildId = (newState.guild ?? oldState.guild).id;
            const userId = newState.id ?? member.id;

            if (!oldState.channelId && newState.channelId)
            {
                voice.begin(guildId, userId);
            }
            else if (oldState.channelId && !newState.channelId)
            {
                voice.end(client, guildId, userId).catch(client.swallow('voiceStateUpdate: voice time'));
            }
        }

        const guild = await client.module.database.Guild((newState.guild ?? oldState.guild).id);

        const privateChannels = guild.ch.v.pv.filter(channel => channel.id === newState?.channelId) ?? [];
        if (privateChannels.length > 0)
        {
            const privateChannel = privateChannels[0];
            const nonBotMembers = (oldState.channel ?? newState.channel)?.members.filter(member => !member.user.bot) ?? new Discord.Collection();

            const creatorChannel = newState.channel;

            if (privateChannel.creator && !!creatorChannel)
            {

                if (!client.collections.cooldowns.has('VOICE_CHANNEL_JTC'))
                {
                    client.collections.cooldowns.set('VOICE_CHANNEL_JTC', new Discord.Collection());
                }

                const timestamps = client.collections.cooldowns.get('VOICE_CHANNEL_JTC');

                if (timestamps.has(member.user.id) && (Date.now() < timestamps.get(member.user?.id) + 10 * 1000))
                {
                    return member.voice.setChannel(null);
                }

                timestamps.set(member.user.id, Date.now());
                setTimeout(async () => timestamps.delete(member.user.id), 10 * 1000);

                const me = newState.guild.members.me;
                const required = [
                    [
                        Discord.PermissionFlagsBits.ManageChannels,
                        'Manage Channels'
                    ],
                    [
                        Discord.PermissionFlagsBits.MoveMembers,
                        'Move Members'
                    ],
                    [
                        Discord.PermissionFlagsBits.ManageRoles,
                        'Manage Roles'
                    ]
                ];

                const here = creatorChannel.permissionsFor(me);
                const missing = required.filter(([flag]) => !here?.has(flag)).map(([, label]) => label);

                if (missing.length)
                {
                    client.log('WARN', `Join to create in [${newState.guild.name}] (${guild.id}): missing ${missing.join(', ')} on ${creatorChannel.name}.`);

                    await member.voice.setChannel(null).catch(client.swallow('voiceStateUpdate: jtc eject'));

                    return client.send(creatorChannel, null, [
                        {
                            color:       client.data.embedColor,
                            title:       'Join to Create is not set up correctly',
                            description: `I am missing **${missing.join('**, **')}** on ${creatorChannel} (or its category), so I cannot make you a private channel.\n\nGrant those and it will work immediately.`
                        }
                    ]).catch(client.swallow('voiceStateUpdate: jtc warn'));
                }

                const limit = Number.isFinite(privateChannel.userLimit)
                    ? privateChannel.userLimit
                    : 0;

                const bitrate = Number.isFinite(privateChannel.kbps) && privateChannel.kbps >= 8000
                    ? privateChannel.kbps
                    : 64000;

                const createdChannel = await newState.guild.channels.create({
                    name:      `Private ${guild.ch.v.pv.filter(c => !c.creator).length + 1}`,
                    type:      client.imports.discord.ChannelType.GuildVoice,
                    userLimit: limit,
                    bitrate,
                    parent:    creatorChannel.parent,
                    reason:    'Private channel requested.'
                }).catch(error =>
                {
                    client.log('WARN', `Join to create in [${newState.guild.name}] (${guild.id}): could not create the channel - ${error?.message ?? error}`);

                    return null;
                });

                if (!createdChannel)
                {
                    await member.voice.setChannel(null).catch(client.swallow('voiceStateUpdate: jtc eject'));

                    return client.send(creatorChannel, null, [
                        {
                            color:       client.data.embedColor,
                            title:       'Could not create your channel',
                            description: 'Discord refused it. The usual cause is a **full category** (50 channels) or the server being at its channel limit.'
                        }
                    ]).catch(client.swallow('voiceStateUpdate: jtc warn'));
                }

                await createdChannel.permissionOverwrites.edit(member.id, {
                    ManageRoles:    false,
                    ManageChannels: privateChannel.upwr ?? false
                }).catch(client.swallow('voiceStateUpdate: jtc overwrites'));

                if (!client.data.serverCache[guild.id])
                {
                    client.data.serverCache[guild.id] = {};
                }

                client.data.serverCache[guild.id][createdChannel.id] = true;

                guild.ch.v.pv.push({
                    id:        createdChannel.id,
                    userLimit: limit,
                    kbps:      bitrate,
                    region:    null,
                    temporary: true
                });

                if (creatorChannel.parent)
                {
                    await createdChannel.setPosition(creatorChannel.parent.children.size).catch(client.swallow('voiceStateUpdate: jtc position'));
                }

                await client.save(guild.id, {
                    alter: 'ch.v.pv',
                    value: guild.ch.v.pv
                });

                const occupants = creatorChannel.members.size
                    ? [...creatorChannel.members.values()]
                    : [member];

                const moved = await Promise.all(occupants
                    .map(m => m.voice.setChannel(createdChannel).then(() => true).catch(() => false)));

                if (!moved.some(Boolean))
                {
                    client.log('WARN', `Join to create in [${newState.guild.name}] (${guild.id}): created the channel but could not move anybody into it.`);

                    await createdChannel.delete('Nobody could be moved into it').catch(client.swallow('voiceStateUpdate: jtc cleanup'));

                    guild.ch.v.pv = guild.ch.v.pv.filter(c => c.id !== createdChannel.id);

                    client.save(guild.id, {
                        alter: 'ch.v.pv',
                        value: guild.ch.v.pv
                    });

                    return;
                }

                let empties = 0;

                const watchout = setInterval(async () =>
                {
                    try
                    {
                        const live = await client.channels.fetch(createdChannel.id).catch(() => null);

                        if (!live)
                        {
                            return clearInterval(watchout);
                        }

                        if (live.members.filter(m => !m.user.bot).size > 0)
                        {
                            empties = 0;

                            return;
                        }

                        if (++empties < 2)
                        {
                            return;
                        }

                        clearInterval(watchout);

                        await live.delete('Temporary private channel became empty').catch(client.swallow('voiceStateUpdate: jtc reap'));

                        guild.ch.v.pv = guild.ch.v.pv.filter(c => c.id !== createdChannel.id);

                        await client.save(guild.id, {
                            alter: 'ch.v.pv',
                            value: guild.ch.v.pv
                        });
                    }
                    catch (error)
                    {
                        clearInterval(watchout);

                        client.log('WARN', `Join to create reaper failed in ${guild.id}: ${error?.message ?? error}`);
                    }
                }, 10 * 1000);

                watchout.unref?.();

                return client.send(createdChannel, `**${member}**`, [client.qEmbed(`To change the channel's parameters use \`${guild.px[0]}privatevc\`.\nTo learn more, type \`${guild.px[0]}help privatevc\``, 1)]).catch(client.swallow('voiceStateUpdate: jtc greeting'));
            }

            const oldPrivateChannels = guild.ch.v.pv.filter(channel => channel.id === oldState?.channelId) ?? [];

            const previousChannel = oldState.channel;

            if (previousChannel && nonBotMembers.size === 0 && oldPrivateChannels[0] && privateChannel.id && (newState.channel === null || !guild.ch.v.pv.filter(c => c.creator).find(c => c.id === previousChannel.id)))
            {
                if (privateChannel.temporary && !privateChannel.creator)
                {
                    for (let i = 0; i < guild.ch.v.pv.length; i++)
                    {
                        if (guild.ch.v.pv[i].id === previousChannel.id)
                        {
                            guild.ch.v.pv = guild.ch.v.pv.filter(c => c.id !== previousChannel.id);

                            await client.save(guild.id, {
                                alter: 'ch.v.pv',
                                value: guild.ch.v.pv
                            });

                            delete client.data.serverCache[guild.id][previousChannel.id];

                            return await previousChannel.delete();
                        }
                    }
                }

                await previousChannel.edit({
                    userLimit: privateChannel.userLimit,
                    bitrate:   privateChannel.kbps
                }).catch(client.swallow('voiceStateUpdate: edit'));

                await previousChannel.setRTCRegion(privateChannel?.region);
            }
        }

        return client.core.LockdownVoice(newState, guild);

        if (guild.ml.ev?.voiceStateUpdate?.on && !guild.ml.ls)
        {
            if (!client.channels.cache.get(guild.ml.ev.voiceStateUpdate.channel))
            {
                return client.save(guild.id, {
                    alter: 'ml.ev.voiceStateUpdate.on',
                    value: false
                });
            }

            const states = getVoiceState(oldState, newState);

            const vcGeneralTime = client.imports.time(client.collections.voiceChatTimes.get(oldState.member?.user?.id)
                ? new Date() - client.collections.voiceChatTimes.get(oldState.member.user.id)
                : 0);

            const vcMuteTime = client.imports.time(client.collections.voiceMuteTimes.get(oldState.member?.user?.id)
                ? new Date() - client.collections.voiceMuteTimes.get(oldState.member.user.id)
                : 0);

            const vcDeafTime = client.imports.time(client.collections.voiceDeafTimes.get(oldState.member?.user?.id)
                ? new Date() - client.collections.voiceDeafTimes.get(oldState.member.user.id)
                : 0);

            const vcStreamTime = client.imports.time(client.collections.voiceStreamTimes.get(oldState.member?.user?.id)
                ? new Date() - client.collections.voiceStreamTimes.get(oldState.member.user.id)
                : 0);

            const vcStaffMuteTime = client.imports.time(client.collections.voiceStaffMuteTimes.get(oldState.member?.user?.id)
                ? new Date() - client.collections.voiceStaffMuteTimes.get(oldState.member.user.id)
                : 0);

            const vcStaffDeafTime = client.imports.time(client.collections.voiceStaffDeafTimes.get(oldState.member?.user?.id)
                ? new Date() - client.collections.voiceStaffDeafTimes.get(oldState.member.user.id)
                : 0);

            const vcVideoTime = client.imports.time(client.collections.voiceVideoTimes.get(oldState.member?.user?.id)
                ? new Date() - client.collections.voiceVideoTimes.get(oldState.member.user.id)
                : 0);

            const a = states.find(s => s[0] === 6);

            const b = states.find(s => s[0] === 3);

            const c = states.find(s => s[0] === 4);

            const d = states.find(s => s[0] === 2);

            const e = states.find(s => s[0] === 1);

            const f = states.find(s => s[0] === 0);

            const g = states.find(s => s[0] === 5);

            const leftChannel = (a && a[1] === 0) ?? false;
            const joinedChannel = (a && a[1] === 1) ?? false;
            const switchedChannel = (a && a[1] === 2) ?? false;

            const embed = new client.class.modlog({
                event: 'Voice State Update',

                thumbnail: oldState.member.displayAvatarURL({
                    dynamic: true,
                    size:    4096
                }),

                fields: [

                    a
                        ? {
                            name:  readableStates[a?.[0]]?.[a?.[1]],
                            value: a?.[1] === 2
                                       ? `Switched from ${oldState.channel} (duration: **\`${vcGeneralTime}\`**)\nTo ${newState.channel}, tracking new voice chatting duration...`
                                       : !!a?.[1]
                                    ? `Joined ${newState.channel}, tracking voice chatting duration...`
                                    : vcGeneralTime === '0ms'
                                        ? '```diff\n- Unavailable -\n```'
                                        : `Left ${oldState.channel}, chatting duration: **\`${vcGeneralTime}\`**`
                        }
                        : null,

                    b
                        ? {
                            name:  readableStates[b?.[0]]?.[b?.[1] + (joinedChannel || switchedChannel)],
                            value: !!b?.[1]
                                       ? 'Started tracking staff deafen duration...'
                                       : vcStaffDeafTime === '0ms'
                                    ? '```diff\n- Unavailable -\n```'
                                    : `Duration: **\`${vcStaffDeafTime}\`**`
                        }
                        : null,

                    c
                        ? {
                            name:  readableStates[c?.[0]]?.[c?.[1] + (joinedChannel || switchedChannel)],
                            value: !!c?.[1]
                                       ? 'Started tracking staff mute duration...'
                                       : vcStaffMuteTime === '0ms'
                                    ? '```diff\n- Unavailable -\n```'
                                    : `Duration: **\`${vcStaffMuteTime}\`**`
                        }
                        : null,

                    d && !(joinedChannel || switchedChannel)
                        ? {
                            name:  readableStates[d?.[0]]?.[d?.[1]],
                            value: !!d?.[1]
                                       ? 'Started tracking streaming duration...'
                                       : vcStreamTime === '0ms'
                                    ? '```diff\n- Unavailable -\n```'
                                    : `Duration: **\`${vcStreamTime}\`**`
                        }
                        : null,

                    g && !(joinedChannel || switchedChannel)
                        ? {
                            name:  readableStates[g?.[0]]?.[g?.[1]],
                            value: !!g?.[1]
                                       ? 'Started tracking self-video duration...'
                                       : vcVideoTime === '0ms'
                                    ? '```diff\n- Unavailable -\n```'
                                    : `Duration: **\`${vcVideoTime}\`**`
                        }
                        : null,

                    e
                        ? {
                            name:  readableStates[e?.[0]]?.[e?.[1] + (joinedChannel || switchedChannel)],
                            value: !!e?.[1]
                                       ? 'Started tracking mute duration...'
                                       : vcMuteTime === '0ms'
                                    ? '```diff\n- Unavailable -\n```'
                                    : `Duration: **\`${vcMuteTime}\`**`
                        }
                        : null,

                    f
                        ? {
                            name:  readableStates[f?.[0]]?.[f?.[1] + (joinedChannel || switchedChannel)],
                            value: !!f?.[1]
                                       ? 'Started tracking deafen duration...'
                                       : vcDeafTime === '0ms'
                                    ? '```diff\n- Unavailable -\n```'
                                    : `Duration: **\`${vcDeafTime}\`**`
                        }
                        : null
                ]
            });

            if (leftChannel || joinedChannel)
            {
                client.collections.voiceChatTimes.delete(newState.member.user.id);
                client.collections.voiceMuteTimes.delete(newState.member.user.id);
                client.collections.voiceDeafTimes.delete(newState.member.user.id);
                client.collections.voiceStreamTimes.delete(newState.member.user.id);
                client.collections.voiceStaffMuteTimes.delete(newState.member.user.id);
                client.collections.voiceStaffDeafTimes.delete(newState.member.user.id);
            }

            if (switchedChannel)
            {
                client.collections.voiceChatTimes.set(newState.member.user.id, new Date());
            }

            if (c && !!c[1])
            {
                client.collections.voiceStaffMuteTimes.set(newState.member.user.id, new Date());
            }

            if (b && !!b[1])
            {
                client.collections.voiceStaffDeafTimes.set(newState.member.user.id, new Date());
            }

            if (d && !!d[1])
            {
                client.collections.voiceStreamTimes.set(newState.member.user.id, new Date());
            }

            if (e && !!e[1])
            {
                client.collections.voiceMuteTimes.set(newState.member.user.id, new Date());
            }

            if (f && !!f[1])
            {
                client.collections.voiceDeafTimes.set(newState.member.user.id, new Date());
            }

            if (g && !!g[1])
            {
                client.collections.voiceVideoTimes.set(newState.member.user.id, new Date());
            }

            if (c && !!c[0])
            {
                client.collections.voiceStaffMuteTimes.delete(newState.member.user.id, new Date());
            }

            if (b && !!b[0])
            {
                client.collections.voiceStaffDeafTimes.delete(newState.member.user.id, new Date());
            }

            if (d && !!d[0])
            {
                client.collections.voiceStreamTimes.delete(newState.member.user.id, new Date());
            }

            if (e && !!e[0])
            {
                client.collections.voiceMuteTimes.delete(newState.member.user.id, new Date());
            }

            if (f && !!f[0])
            {
                client.collections.voiceDeafTimes.delete(newState.member.user.id, new Date());
            }

            if (g && !!g[0])
            {
                client.collections.voiceVideoTimes.delete(newState.member.user.id, new Date());
            }

            client.pushModlog(newState.guild.id, 'voiceStateUpdate', embed, null);
        }

        return client.core.LockdownVoice(newState, guild);
    }
};
