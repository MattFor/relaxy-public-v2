'use strict';
const UNKNOWN_MEMBER = 10007;
const UNKNOWN_USER = 10013;

export default class Actions {
    constructor(client) {
        this.client = client;

        this.registry = {
            'ticketsystem.create': {
                command: 'ticketsystem',
                args: {
                    channel: 'optional channel id - attach the system to this channel instead of creating one'
                },
                describe: 'Create a ticket system: a panel message, in a new channel or one you name.',
                run: (context) => this._createTicketSystem(context)
            },

            'member.ban': {
                command: 'ban',
                args: {
                    user: 'the user id to ban (they need not still be in the server)',
                    reason: "optional reason, recorded on the case and DM'd to them",
                    deleteSeconds: 'optional seconds of their messages to delete, 0-604800',
                    noAppeal: 'optional "true" to skip the DM; the case is recorded either way'
                },
                describe: 'Ban a user, recording a case and DMing them the reason and appeal invite.',
                run: ({ guild, guildDoc, actor, actorMember, args }) =>
                    this._moderate('ban', {
                        guild,
                        guildDoc,
                        actor,
                        actorMember,
                        args
                    })
            },

            'member.kick': {
                command: 'kick',
                args: {
                    user: 'the user id to kick (they must still be in the server)',
                    reason: 'optional reason, recorded on the case'
                },
                describe: 'Kick a member, recording a case.',
                run: ({ guild, guildDoc, actor, actorMember, args }) =>
                    this._moderate('kick', {
                        guild,
                        guildDoc,
                        actor,
                        actorMember,
                        args
                    })
            },

            'member.mute': {
                command: 'mute',
                args: {
                    user: 'the user id to mute (they must still be in the server)',
                    reason: 'optional reason, recorded on the mute and the case',
                    durationMs: 'optional duration in milliseconds; omit for an unspecified length',
                    forever: 'optional "true" for a mute with no end'
                },
                describe: 'Mute a member: strip their roles, remember them, and record a case.',
                run: ({ guild, guildDoc, actor, actorMember, args }) =>
                    this._moderate('mute', {
                        guild,
                        guildDoc,
                        actor,
                        actorMember,
                        args
                    })
            },

            'member.unmute': {
                command: 'unmute',
                args: { user: 'the user id to unmute' },
                describe: 'Lift a mute and restore the roles it took away.',
                run: ({ guild, guildDoc, actor, actorMember, args }) =>
                    this._moderate('unmute', {
                        guild,
                        guildDoc,
                        actor,
                        actorMember,
                        args
                    })
            },

            'member.warn': {
                command: 'warning',
                args: {
                    user: 'the user id to warn',
                    reason: 'optional reason, capped at 258 characters',
                    tier: 'optional threat tier, 0-30',
                    count: 'optional number of identical warnings to record'
                },
                describe: 'Warn a member. Does not evaluate autoban - see Moderation#warn.',
                run: ({ guild, guildDoc, actor, actorMember, args }) =>
                    this._moderate('warn', {
                        guild,
                        guildDoc,
                        actor,
                        actorMember,
                        args
                    })
            },

            'modlog.create': {
                command: 'modlog',
                args: {},
                describe: 'Create the modlog channel and point every event at it.',
                run: async ({ guild, guildDoc }) => {
                    const { channel } = await this.client.module.creators.createModlog({
                        guild,
                        guildDoc,
                        reason: 'Modlog created from the dashboard'
                    });

                    return { created: { channel: channel.id } };
                }
            },

            'muterole.create': {
                command: 'mute',
                args: {},
                describe: 'Create the mute role, if this server has not got one.',
                run: async ({ guild, guildDoc }) => {
                    const { role, existed } = await this.client.module.creators.createMuteRole({
                        guild,
                        guildDoc,
                        reason: 'Mute role created from the dashboard'
                    });

                    return {
                        created: {
                            role: role.id,
                            roleIsNew: !existed
                        }
                    };
                }
            },

            'heartboard.create': {
                command: 'heartboard',
                args: {
                    requirement: 'optional whole number of heart reactions a message needs (default 3)'
                },
                describe: 'Create a heartboard channel.',
                run: async ({ guild, guildDoc, args }) => {
                    const { channel, requirement } = await this.client.module.creators.createHeartboard({
                        guild,
                        guildDoc,
                        requirement: args.requirement ?? 3,
                        reason: 'Heartboard created from the dashboard'
                    });

                    return {
                        created: {
                            channel: channel.id,
                            requirement
                        }
                    };
                }
            },

            'reactionrole.create': {
                command: 'reactionrole',
                args: {
                    channel: 'text channel id to post the panel in',
                    text: 'optional message body (used when no embed is given)',
                    title: 'optional embed title - an embed is sent when this is present',
                    pairs: 'array of { emoji, role } in the order they should be reacted'
                },
                describe: 'Post a reaction-role panel and register it.',
                run: async ({ guild, guildDoc, args }) => {
                    const channel = guild.channels.cache.get(String(args.channel ?? ''));

                    if (!channel || !channel.isTextBased?.()) {
                        throw new Error('That is not a text channel in this server.');
                    }
                    if (guildDoc?.ch?.t?.rs?.includes(channel.id)) {
                        throw new Error('That channel is restricted, so Relaxy will not post in it.');
                    }

                    const pairs = (Array.isArray(args.pairs) ? args.pairs : [])
                        .map((p) => ({
                            emoji: String(p?.emoji ?? '').trim(),
                            role: String(p?.role ?? '').trim()
                        }))
                        .filter((p) => p.emoji && p.role);

                    if (!pairs.length) {
                        throw new Error('A panel needs at least one emoji-to-role pair.');
                    }
                    if (pairs.length > 20) {
                        throw new Error('Discord allows at most 20 reactions on one message.');
                    }

                    for (const pair of pairs) {
                        if (!guild.roles.cache.get(pair.role)) {
                            throw new Error(`${pair.role} is not a role in this server.`);
                        }
                    }

                    const body = String(args.text ?? '').trim();
                    const title = String(args.title ?? '').trim();

                    const embed = title
                        ? [
                              {
                                  color: this.client.data.embedColor,
                                  title,
                                  description: body || undefined
                              }
                          ]
                        : null;

                    const message = await this.client.send(
                        channel,
                        embed ? null : body || 'React to take a role.',
                        embed
                    );

                    if (!message?.id) {
                        throw new Error('Relaxy could not post in that channel - check its permissions there.');
                    }
                    try {
                        const entry = {
                            channel: channel.id,
                            id: message.id,
                            emojis: pairs.map((p) => p.emoji),
                            roles: pairs.map((p) => p.role)
                        };

                        const reactionRoles = await this.client.module.database.getReactionRoles(guild.id);
                        const entries = [...(reactionRoles?.e ?? []), entry];

                        await this.client.module.database.setReactionRoles(guild.id, entries);
                        await this.client.core.ReactionRoles(message, guildDoc ?? guild);

                        return {
                            created: {
                                channel: channel.id,
                                message: message.id,
                                pairs: pairs.length
                            }
                        };
                    } catch (error) {
                        await message.delete().catch(() => {});

                        throw error;
                    }
                }
            },

            'forum.create': {
                command: 'forum',
                args: {
                    channel: 'optional forum channel id - set this one up instead of creating one',
                    emoji: 'optional approval emoji (default ✅)'
                },
                describe: 'Create a moderated forum: the channel, its tags, and its moderator role.',
                run: async ({ guild, guildDoc, args }) => {
                    const channel = this._resolveChannel(guild, args.channel);

                    if (channel?.invalid) {
                        return channel.invalid;
                    }

                    const result = await this.client.module.creators.createForum({
                        guild,
                        guildDoc,
                        channel: channel?.channel ?? null,
                        emoji: typeof args.emoji === 'string' && args.emoji.trim() ? args.emoji.trim() : '✅',
                        reason: 'Forum created from the dashboard'
                    });

                    return {
                        created: {
                            channel: result.channel.id,
                            role: result.role.id,
                            channelIsNew: result.createdChannel,
                            roleIsNew: result.createdRole
                        }
                    };
                }
            },

            'counting.create': {
                command: 'counting',
                args: {
                    channel: 'optional text channel id - use this one instead of creating one'
                },
                describe: 'Set up the counting game, in a new channel or one you name.',
                run: async ({ guild, guildDoc, args }) => {
                    const channel = this._resolveChannel(guild, args.channel);

                    if (channel?.invalid) {
                        return channel.invalid;
                    }

                    const result = await this.client.module.creators.createCounting({
                        guild,
                        guildDoc,
                        channel: channel?.channel ?? null,
                        reason: 'Counting set up from the dashboard'
                    });

                    return {
                        created: {
                            channel: result.channel.id,
                            channelIsNew: result.createdChannel
                        }
                    };
                }
            },

            'welcome.create': {
                command: 'welcomechannel',
                args: {
                    type: 'optional welcome type (1-13) deciding whether it greets joins, leaves or both'
                },
                describe: 'Create the welcome channel.',
                run: async ({ guild, guildDoc, args }) => {
                    const type = Number(args.type ?? 1);

                    if (!Number.isInteger(type) || type < 1 || type > 13) {
                        return {
                            ok: false,
                            invalid: true,
                            error: 'welcome type must be a whole number from 1 to 13'
                        };
                    }

                    const { channel } = await this.client.module.creators.createWelcome({
                        guild,
                        guildDoc,
                        type,
                        reason: 'Welcome channel created from the dashboard'
                    });

                    return {
                        created: {
                            channel: channel.id,
                            type
                        }
                    };
                }
            },

            'clearingchannel.create': {
                command: 'clearingchannel',
                args: {
                    interval: 'how often to clear it, in milliseconds (default 180000 - three minutes)'
                },
                describe: 'Create a channel Relaxy empties on a timer.',
                run: async ({ guild, guildDoc, args }) => {
                    const interval = Number(args.interval ?? 180_000);

                    if (!Number.isFinite(interval) || interval <= 0) {
                        return {
                            ok: false,
                            invalid: true,
                            error: 'interval must be a positive number of milliseconds'
                        };
                    }

                    const result = await this.client.module.creators.createClearingChannel({
                        guild,
                        guildDoc,
                        interval,
                        reason: 'Clearing channel created from the dashboard'
                    });

                    return {
                        created: {
                            channel: result.channel.id,
                            interval: result.interval
                        }
                    };
                }
            },

            'jointocreate.create': {
                command: 'jointocreate',
                args: {
                    upwr: 'optional boolean - whether the person who joins gets permissions over their channel'
                },
                describe: 'Create a join-to-create voice channel.',
                run: async ({ guild, guildDoc, args }) => {
                    const { channel } = await this.client.module.creators.createJoinToCreate({
                        guild,
                        guildDoc,
                        upwr: !!args.upwr,
                        reason: 'Join to create made from the dashboard'
                    });

                    return { created: { channel: channel.id } };
                }
            },

            'privatechannel.create': {
                command: 'privatechannel',
                args: {
                    userLimit: 'optional user limit (0 = unlimited)',
                    bitrate: 'optional bitrate in bits per second (default 64000)'
                },
                describe: 'Create a private voice channel.',
                run: async ({ guild, guildDoc, args }) => {
                    const { channel } = await this.client.module.creators.createPrivateChannel({
                        guild,
                        guildDoc,
                        userLimit: args.userLimit ?? 0,
                        bitrate: args.bitrate ?? 64000,
                        reason: 'Private channel created from the dashboard'
                    });

                    return { created: { channel: channel.id } };
                }
            }
        };
    }

    list() {
        return {
            actions: Object.entries(this.registry)
                .map(([name, spec]) => ({
                    name,
                    command: spec.command,
                    describe: spec.describe ?? '',
                    args: spec.args ?? {},
                    permissionsUser: this.client.collections.commands.get(spec.command)?.permissionsUser ?? []
                }))
                .sort((a, b) => a.name.localeCompare(b.name))
        };
    }

    async run(name, { guildId, actor, args = {} } = {}) {
        const spec = this.registry[name];

        if (!spec) {
            return {
                ok: false,
                unknown: true,
                error: `no such action: ${name}`
            };
        }

        const guild = this.client.guilds.cache.get(guildId) ?? null;
        if (!guild) {
            return {
                ok: false,
                missing: true,
                error: 'Relaxy is not in that guild'
            };
        }

        const gate = await this._verifyActor(guild, actor, spec);

        if (!gate.ok) {
            return gate;
        }

        this.client.log('INFO', `Action [${name}] in [${guild.name}] (${guildId}) by actor [${actor}]`);

        let result;

        try {
            result = await spec.run({
                guild,
                guildDoc: gate.guildDoc,
                actor,
                actorMember: gate.member,
                args
            });
        } catch (error) {
            this.client.log(
                'ERROR',
                `Action [${name}] failed in [${guild.name}] (${guildId}): ${error?.stack ?? error?.message ?? error}`
            );

            return {
                ok: false,
                error: `could not run ${name}: ${error?.message ?? error}`
            };
        }

        if (result?.ok === false) {
            return result;
        }

        return {
            ok: true,
            action: name,
            ...result
        };
    }

    _resolveChannel(guild, id) {
        if (!id) {
            return null;
        }

        const channel = guild.channels.cache.get(String(id)) ?? null;

        if (!channel) {
            return {
                invalid: {
                    ok: false,
                    invalid: true,
                    error: 'no such channel in this guild'
                }
            };
        }

        return { channel };
    }

    async _verifyActor(guild, actor, spec) {
        const command = this.client.collections.commands.get(spec.command);

        if (!command) {
            throw new Error(`action names command "${spec.command}", which is not loaded`);
        }

        const member = await guild.members.fetch(actor).catch((error) => error);

        if (member instanceof Error) {
            if (member.code === UNKNOWN_MEMBER || member.code === UNKNOWN_USER) {
                return {
                    ok: false,
                    forbidden: true,
                    error: 'that user is not a member of this guild'
                };
            }

            throw member;
        }

        const guildDoc = await this.client.module.database.Guild(guild.id);

        const synthetic = {
            guild,
            member,
            author: member.user,
            channel: null
        };

        const channels = {
            textChannel: null,
            voiceChannel: null
        };

        const exempt =
            this.client.utils.isExempt(guildDoc, synthetic) ||
            this.client.utils.isGranted(guildDoc, synthetic, spec.command);

        const permissionsUser =
            guildDoc.cmd?.cp?.[spec.command]?.length > 0 ? guildDoc.cmd.cp[spec.command] : command.permissionsUser;

        const userOkay = this.client.permissions(synthetic, { permissionsUser }, channels, {
            report: false,
            userOnly: true,
            userExempt: exempt
        });

        if (!userOkay) {
            return {
                ok: false,
                forbidden: true,
                error: `you need ${permissionsUser.join(', ')} in this server to do that`
            };
        }

        const botOkay = this.client.permissions(synthetic, { permissionsBot: command.permissionsBot }, channels, {
            report: false,
            botOnly: true
        });

        if (!botOkay) {
            return {
                ok: false,
                conflict: true,
                error: `Relaxy needs ${(command.permissionsBot ?? []).join(', ')} in this server to do that`
            };
        }

        return {
            ok: true,
            guildDoc,

            member
        };
    }

    async _moderate(kind, { guild, guildDoc, actor, actorMember, args }) {
        const id = String(args.user ?? '').trim();

        if (!/^\d{17,20}$/.test(id)) {
            return {
                ok: false,
                invalid: true,
                error: 'user must be a Discord id (17-20 digits)'
            };
        }
        const member = await guild.members.fetch(id).catch(() => null);
        if (kind !== 'ban') {
            if (!member) {
                return {
                    ok: false,
                    missing: true,
                    error: 'that member is not in this server'
                };
            }

            const shared = {
                guild,
                guildDoc,
                member,
                moderator: actor,
                moderatorMember: actorMember,
                reason: String(args.reason ?? '')
            };

            let done;

            if (kind === 'kick') {
                done = await this.client.module.moderation.kick(shared);
            } else if (kind === 'mute') {
                done = await this.client.module.moderation.mute({
                    ...shared,
                    durationMs: Number(args.durationMs ?? 0) || 0,
                    forever: args.forever === true || String(args.forever ?? '') === 'true'
                });
            } else if (kind === 'unmute') {
                done = await this.client.module.moderation.unmute(shared);
            } else {
                done = await this.client.module.moderation.warn({
                    ...shared,
                    tier: Number(args.tier ?? 0) || 0,
                    count: Number(args.count ?? 1) || 1
                });
            }

            if (!done.ok) {
                return {
                    ok: false,
                    invalid: true,
                    error: done.error
                };
            }

            const { ok: _ignored, ...detail } = done;

            return {
                created: null,
                ...detail
            };
        }

        const user = member?.user ?? (await this.client.getUser(id).catch(() => null));

        if (!user) {
            return {
                ok: false,
                missing: true,
                error: 'no such user'
            };
        }

        const banned = await this.client.module.moderation.ban({
            guild,
            guildDoc,
            user,
            member,
            moderator: actor,
            moderatorMember: actorMember,
            reason: String(args.reason ?? ''),
            deleteSeconds: Number(args.deleteSeconds ?? 0) || 0,
            noAppeal: args.noAppeal === true || String(args.noAppeal ?? '') === 'true'
        });

        return banned.ok
            ? {
                  created: null,
                  caseNumber: banned.caseNumber,
                  reason: banned.reason,
                  deleteSeconds: banned.deleteSeconds,

                  appealSent: Boolean(banned.notice?.sent)
              }
            : {
                  ok: false,
                  invalid: true,
                  error: banned.error
              };
    }

    async _createTicketSystem({ guild, guildDoc, args }) {
        const resolved = this._resolveChannel(guild, args.channel);

        if (resolved?.invalid) {
            return resolved.invalid;
        }

        const channel = resolved?.channel ?? null;

        if (channel && (!channel.isTextBased?.() || channel.isThread?.())) {
            return {
                ok: false,
                invalid: true,
                error: 'that channel cannot hold a ticket panel'
            };
        }

        const created = await this.client.module.tickets.createTicketSystem({
            guild,
            guildDoc,
            channel,
            reason: 'Ticket system created from the dashboard'
        });

        const ids = {
            g: guild.id,
            c: created.channel.id,
            mid: created.message.id
        };

        return {
            created: {
                channel: created.channel.id,
                message: created.message.id,
                channelIsNew: created.createdChannel
            },
            doc: {
                schema: 'ticketSystem',
                ids,
                rev: this.client.module.docRev.of(created.doc)
            }
        };
    }
}
