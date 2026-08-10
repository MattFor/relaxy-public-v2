'use strict';
import Discord from 'discord.js';

import { normalizeClearEntry } from '../../../../bot/commands/moderation/clearingchannel.js';

export default class Creators
{
    constructor(client)
    {
        this.client = client;
    }

    _assertPair(guild, guildDoc, what)
    {
        if (!guild?.id || guildDoc?.id !== guild.id)
        {
            throw new Error(`${what}: guildDoc does not belong to the given guild`);
        }
    }

    async _undo(created, error, what)
    {
        if (!created)
        {
            return;
        }

        await created.delete(`${what} setup failed - removing what it created`).catch(() =>
        {
            this.client.log('ERROR', `Creators: could not remove orphaned ${what} [${created.id}] after: ${error?.message ?? error}`);
        });
    }

    async createModlog({
        guild,
        guildDoc,
        reason = 'Modlog channel'
    })
    {
        this._assertPair(guild, guildDoc, 'createModlog');

        const client = this.client;

        const channel = await guild.channels.create({
            name: 'mod-log',
            type: Discord.ChannelType.GuildText,

            topic: 'All important server interactions are going to be noted here.',
            reason
        });

        const before = { ...guildDoc.ml };

        try
        {

            const result = structuredClone(client.types.modlogEvents);

            for (const key of Object.keys(result))
            {
                result[key] = {
                    on:      true,
                    channel: channel.id
                };
            }

            await client.save(guild.id, {
                alter: 'ml',
                value: Object.assign(guildDoc.ml, {
                    on: true,
                    ev: result
                })
            });
        }
        catch (error)
        {
            guildDoc.ml = before;

            await this._undo(channel, error, 'modlog');

            throw error;
        }

        return { channel };
    }

    async createMuteRole({
        guild,
        guildDoc,
        reason = 'Mute role'
    })
    {
        this._assertPair(guild, guildDoc, 'createMuteRole');

        if (guildDoc.d.mut.id)
        {
            const existing = await guild.roles.fetch(guildDoc.d.mut.id).catch(() => null);

            if (existing)
            {
                return {
                    role:    existing,
                    existed: true
                };
            }
        }

        const role = await guild.roles.create({
            name:        'Relaxy Muted',
            color:       '#000000',
            mentionable: false,
            hoist:       true,
            permissions: [],
            reason
        });

        try
        {
            await this.client.save(guild.id, {
                alter: 'd.mut.id',
                value: role.id
            });
        }
        catch (error)
        {
            await this._undo(role, error, 'mute role');

            throw error;
        }

        return {
            role,
            existed: false
        };
    }

    async createHeartboard({
        guild,
        guildDoc,
        requirement = 3,
        reason = 'Heartboard'
    })
    {
        this._assertPair(guild, guildDoc, 'createHeartboard');

        const votes = Number(requirement);

        if (!Number.isInteger(votes) || votes < 1)
        {
            throw new Error('a heartboard needs a whole number of reactions, at least 1');
        }

        const channel = await guild.channels.create({
            name:  'heart-board',
            type:  Discord.ChannelType.GuildText,
            topic: `Glorified hall of fame! Any message with ${votes} :heart: reactions will be put on here!`,
            reason
        });

        try
        {
            await this.client.module.database.HeartBoard(channel.id, guild.id, votes);

            const channels = guildDoc.hb.cs;

            channels.push(channel.id);

            await this.client.save(guild.id, {
                alter: 'hb',
                value: {
                    on: true,
                    cs: channels
                }
            });
        }
        catch (error)
        {
            guildDoc.hb.cs = guildDoc.hb.cs.filter(id => id !== channel.id);

            await this._undo(channel, error, 'heartboard');

            throw error;
        }

        return {
            channel,
            requirement: votes
        };
    }

    async createCounting({
        guild,
        guildDoc,
        channel = null,
        reason = 'Counting channel'
    })
    {
        this._assertPair(guild, guildDoc, 'createCounting');

        let target = channel;
        let createdChannel = false;

        if (!target)
        {
            target = await guild.channels.create({
                name:  'counting',
                type:  Discord.ChannelType.GuildText,
                topic: 'Count up together! Post the next number - one per person at a time.',
                reason
            });

            createdChannel = true;
        }

        if (target.type !== Discord.ChannelType.GuildText)
        {
            throw new Error('the counting channel has to be a normal text channel');
        }

        const co = guildDoc.co;

        const before = {
            c:    co.c,
            on:   co.on,
            cur:  co.cur,
            last: co.last
        };

        try
        {
            co.c = target.id;
            co.on = true;
            co.cur = 0;
            co.last = '';

            await this.client.save(guild.id, {
                alter: 'co.c',
                value: target.id
            }, {
                alter: 'co.on',
                value: true
            }, {
                alter: 'co.cur',
                value: 0
            }, {
                alter: 'co.last',
                value: ''
            });
        }
        catch (error)
        {
            Object.assign(co, before);
            if (createdChannel)
            {
                await this._undo(target, error, 'counting');
            }

            throw error;
        }

        return {
            channel: target,
            createdChannel
        };
    }

    async createWelcome({
        guild,
        guildDoc,
        type = 1,
        reason = 'Welcome channel'
    })
    {
        this._assertPair(guild, guildDoc, 'createWelcome');

        const channel = await guild.channels.create({
            name:  'entrance',
            type:  Discord.ChannelType.GuildText,
            topic: 'A channel for welcomers!',
            reason
        });

        try
        {
            const changes = [
                {
                    alter: 'wc.on',
                    value: true
                }
            ];

            if ([
                1,
                2,
                3,
                7,
                8,
                9,
                10,
                11,
                12,
                13
            ].includes(type))
            {
                changes.push({
                    alter: 'wc.j.c',
                    value: channel.id
                });
            }

            if ([
                4,
                5,
                6,
                7,
                8,
                9,
                10,
                11,
                12,
                13
            ].includes(type))
            {
                changes.push({
                    alter: 'wc.l.c',
                    value: channel.id
                });
            }

            await this.client.save(guild.id, ...changes);
        }
        catch (error)
        {
            await this._undo(channel, error, 'welcome channel');

            throw error;
        }

        return { channel };
    }

    async createClearingChannel({
        guild,
        guildDoc,
        interval,
        reason = 'Clearing channel'
    })
    {
        this._assertPair(guild, guildDoc, 'createClearingChannel');

        const every = Number(interval);

        if (!Number.isFinite(every) || every <= 0)
        {
            throw new Error('a clearing channel needs an interval');
        }

        const channel = await guild.channels.create({
            name: 'bot-commands',
            type: Discord.ChannelType.GuildText,
            reason
        });

        const before = guildDoc.ch.t.cl;

        try
        {

            const clearing = (before ?? []).map(normalizeClearEntry);

            clearing.push({
                id:       channel.id,
                interval: every
            });

            guildDoc.ch.t.cl = clearing;

            await this.client.save(guild.id, {
                alter: 'ch.t.cl',
                value: clearing
            });
        }
        catch (error)
        {
            guildDoc.ch.t.cl = before;

            await this._undo(channel, error, 'clearing channel');

            throw error;
        }

        return {
            channel,
            interval: every
        };
    }

    async createJoinToCreate({
        guild,
        guildDoc,
        upwr = false,
        reason = 'Join to create'
    })
    {
        this._assertPair(guild, guildDoc, 'createJoinToCreate');

        const channel = await guild.channels.create({
            name:      `Join to Create ${guildDoc.ch.v.pv.filter(entry => entry.creator).length + 1}`,
            type:      Discord.ChannelType.GuildVoice,
            userLimit: 0,
            bitrate:   64000,
            reason
        });

        try
        {
            guildDoc.ch.v.pv.push({
                id:        channel.id,
                creator:   true,
                userLimit: undefined,
                upwr:      !!upwr,
                kbps:      undefined,
                region:    undefined
            });

            await this.client.save(guild.id, {
                alter: 'ch.v.pv',
                value: guildDoc.ch.v.pv
            });
        }
        catch (error)
        {
            guildDoc.ch.v.pv = guildDoc.ch.v.pv.filter(entry => entry.id !== channel.id);

            await this._undo(channel, error, 'join to create channel');

            throw error;
        }

        return { channel };
    }

    async createPrivateChannel({
        guild,
        guildDoc,
        userLimit = 0,
        bitrate = 64000,
        region = null,
        reason = 'Private channel'
    })
    {
        this._assertPair(guild, guildDoc, 'createPrivateChannel');

        const channel = await guild.channels.create({
            name:      `Private ${guildDoc.ch.v.pv.filter(entry => !entry.creator).length + 1}`,
            type:      Discord.ChannelType.GuildVoice,
            userLimit: Number(userLimit) || 0,
            bitrate:   Number(bitrate) || 64000,
            reason
        });

        try
        {
            guildDoc.ch.v.pv.push({
                id:        channel.id,
                userLimit: Number(userLimit) || 0,
                kbps:      Number(bitrate) || 64000,
                region:    region === 'Automatic'
                               ? null
                               : region
            });

            await channel.permissionOverwrites.create(guild.roles.everyone, { ManageChannels: false });

            await this.client.save(guild.id, {
                alter: 'ch.v.pv',
                value: guildDoc.ch.v.pv
            });
        }
        catch (error)
        {
            guildDoc.ch.v.pv = guildDoc.ch.v.pv.filter(entry => entry.id !== channel.id);

            await this._undo(channel, error, 'private channel');

            throw error;
        }

        return { channel };
    }

    async createForum({
        guild,
        guildDoc,
        channel = null,
        emoji = '✅',
        reason = 'Forum'
    })
    {
        this._assertPair(guild, guildDoc, 'createForum');

        const client = this.client;
        const roles = [];

        let role = guild.roles.cache.find(entry => entry.name === 'Relaxy forum moderator' || entry.name === 'Forum moderator') ?? null;
        let createdRole = false;

        if (!role)
        {
            role = await guild.roles.create({
                name:        'Relaxy forum moderator',
                color:       '#da00ff',
                mentionable: false,
                hoist:       false,
                reason
            });

            createdRole = true;
        }

        roles.push(role.id);

        let target = channel;
        let createdChannel = false;

        try
        {
            if (!target)
            {
                target = await guild.channels.create({
                    name:  'forum',
                    type:  Discord.ChannelType.GuildForum,
                    topic: 'Only members with a special role can approve a post on this channel.',
                    reason
                });

                createdChannel = true;
            }

            await target.setAvailableTags([
                {
                    name:      'Pending approval',
                    moderated: true,
                    emoji:     '🗃️'
                },
                {
                    name:      'Approved',
                    moderated: true,
                    emoji:     '✅'
                }
            ]);

            const pending = target.availableTags.find(tag => tag.name === 'Pending approval');
            const approved = target.availableTags.find(tag => tag.name === 'Approved');

            if (!pending || !approved)
            {
                throw new Error('Discord did not keep the forum tags - the approval flow would not work');
            }

            await client.module.database.ForumChannel(target.id, guild.id, emoji, roles, pending.id, approved.id);

            if (createdChannel)
            {
                const channels = guildDoc.fo.cs;

                channels.push(target.id);

                await client.save(guild.id, {
                    alter: 'fo',
                    value: {
                        on: true,
                        cs: channels
                    }
                });
            }
        }
        catch (error)
        {
            if (createdChannel)
            {
                guildDoc.fo.cs = guildDoc.fo.cs.filter(id => id !== target?.id);

                await this._undo(target, error, 'forum channel');
            }

            if (createdRole)
            {
                await this._undo(role, error, 'forum moderator role');
            }

            throw error;
        }

        return {
            channel: target,
            role,
            createdChannel,
            createdRole
        };
    }
}
