'use strict';
const MAX_DELETE_SECONDS = 604_800;

const UNSPECIFIED = 333333333999;
const FOREVER = 918273646559;
const LADDER_GUARD_MS = 30_000;

export const MAX_MUTE_MS = 315_360_000_100;

export const TIER_ACTIONS = {
    mute:    {
        label:         'Mute',
        emoji:         '🔇',
        needsRole:     false,
        takesDuration: true
    },
    kick:    {
        label:         'Kick',
        emoji:         '👢',
        needsRole:     false,
        takesDuration: false
    },
    ban:     {
        label:         'Ban',
        emoji:         '🔨',
        needsRole:     false,
        takesDuration: false
    },
    'role+': {
        label:         'Add role',
        emoji:         '➕',
        needsRole:     true,
        takesDuration: false
    },
    'role-': {
        label:         'Remove role',
        emoji:         '➖',
        needsRole:     true,
        takesDuration: false
    }
};

export const ANY_TIER = 'any';

export default class Moderation
{
    constructor(client)
    {
        this.client = client;

        this._ladderGuard = new Map();
    }

    _guard({
        guild,
        user,
        member = null,
        moderator,
        moderatorMember = null,
        verb
    })
    {
        const client = this.client;

        if (!user)
        {
            return {
                ok:    false,
                error: 'That user does not exist.'
            };
        }

        if (client.isOwner(user.id))
        {
            return {
                ok:    false,
                error: client.utils.randErr()
            };
        }

        if (user.id === client.user.id)
        {
            return {
                ok:    false,
                error: `Cannot ${verb} Relaxy with Relaxy!`
            };
        }

        if (String(user.id) === String(moderator))
        {
            return {
                ok:    false,
                error: `Cannot ${verb} yourself!`
            };
        }

        if (member && moderatorMember && member.roles.highest.position >= moderatorMember.roles.highest.position)
        {
            return {
                ok:    false,
                error: `You can't ${verb} a member that is equal to or higher than yourself!`
            };
        }

        return { ok: true };
    }

    async _reason(input, guildDoc, message = null)
    {
        return this.client.redact(input ?? '', guildDoc, message ?? null);
    }

    _log(fn)
    {
        try
        {
            fn();
        }
        catch (error)
        {
            this.client.log?.('ERROR', `Moderation: could not queue a modlog entry: ${error?.message ?? error}`);
        }
    }

    _expand(text, moderator, message = null)
    {
        const client = this.client;
        const stamp = client.utils.formatDate(new Date());
        const actor = message?.member ?? `<@${moderator}>`;

        return String(text ?? '')
            .replace(/\bdate\b/i, stamp)
            .replace(/\bLOG\b/i, `${stamp} - ${actor}`);
    }

    async ban({
        guild,
        guildDoc,
        user,
        member = null,
        moderator,
        moderatorMember = null,
        reason = '',
        deleteSeconds = 0,
        noAppeal = false,
        message = null
    })
    {
        const client = this.client;

        const gate = this._guard({
            guild,
            user,
            member,
            moderator,
            moderatorMember,
            verb: 'ban'
        });

        if (!gate.ok)
        {
            return gate;
        }

        const cleaned = await this._reason(this._expand(reason, moderator, message), guildDoc, message);

        const seconds = Math.min(MAX_DELETE_SECONDS, Math.max(0, Math.floor(Number(deleteSeconds) || 0)));

        const caseNumber = await client.module.database.addCase(guild.id, {
            type:     'ban',
            user:     user.id,
            mod:      moderator,
            reason:   cleaned || 'No reason given.',
            extra:    seconds
                          ? `Message deletion window: ${client.imports.time(seconds * 1000)}`
                          : '',
            guildBan: true
        });

        const notice = noAppeal
            ? {
                sent:   false,
                appeal: null
            }
            : await client.utils.sendBanNotice(guildDoc, user, {
                message,
                reason: cleaned,
                num:    caseNumber
            });

        let failed = false;

        await (member
            ? member.ban({
                reason:               cleaned,
                deleteMessageSeconds: seconds
            })
            : guild.bans.create(user.id, {
                reason:               cleaned,
                deleteMessageSeconds: seconds
            })).catch(() =>
        {
            failed = true;
        });

        if (failed)
        {
            return {
                ok:    false,
                error: 'Cannot ban this member.'
            };
        }

        return {
            ok:            true,
            caseNumber,
            reason:        cleaned,
            notice,
            deleteSeconds: seconds
        };
    }

    async kick({
        guild,
        guildDoc,
        member,
        moderator,
        moderatorMember = null,
        reason = '',
        message = null
    })
    {
        const client = this.client;

        if (!member)
        {
            return {
                ok:    false,
                error: 'User doesn\'t exist on this server!'
            };
        }

        const gate = this._guard({
            guild,
            user: member.user,
            member,
            moderator,
            moderatorMember,
            verb: 'kick'
        });

        if (!gate.ok)
        {
            return gate;
        }

        const cleaned = await this._reason(reason, guildDoc, message);

        let failed = false;

        await member.kick({ reason: this._expand(cleaned, moderator, message) }).catch(() =>
        {
            failed = true;
        });

        if (failed)
        {
            return {
                ok:    false,
                error: 'Cannot kick this member.'
            };
        }

        const caseNumber = await client.module.database.addCase(guild.id, {
            type:   'kick',
            user:   member.user.id,
            mod:    moderator,
            reason: cleaned.length > 0
                        ? cleaned
                        : 'No reason given.',

            echo: 'kick'
        });

        return {
            ok:     true,
            caseNumber,
            reason: cleaned
        };
    }

    async mute({
        guild,
        guildDoc,
        member,
        moderator,
        moderatorMember = null,
        reason = '',
        durationMs = 0,
        forever = false,
        channelId = '',
        message = null
    })
    {
        const client = this.client;

        if (!member)
        {
            return {
                ok:    false,
                error: 'User doesn\'t exist on this server!'
            };
        }

        const gate = this._guard({
            guild,
            user: member.user,
            member,
            moderator,
            moderatorMember,
            verb: 'mute'
        });

        if (!gate.ok)
        {
            return gate;
        }

        let muteRole = guildDoc.d?.mut?.id
            ? await guild.roles.fetch(guildDoc.d.mut.id).catch(() => null)
            : null;

        if (!muteRole)
        {
            const made = await client.module.creators.createMuteRole({
                guild,
                guildDoc,
                reason: 'Mute role created for a mute'
            }).catch(() => null);

            muteRole = made?.role ?? null;
        }

        if (!muteRole)
        {
            return {
                ok:    false,
                error: 'Could not find or create the mute role.'
            };
        }

        if (member.roles.cache.has(muteRole.id))
        {
            return {
                ok:    false,
                error: 'That member is already muted.'
            };
        }

        const duration = forever
            ? FOREVER
            : (!durationMs || !Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0)
                ? UNSPECIFIED
                : Math.floor(Number(durationMs));

        if (duration !== UNSPECIFIED && duration !== FOREVER && duration > MAX_MUTE_MS && !client.isOwner(moderator))
        {
            return {
                ok:    false,
                error: 'Maximum mute time is 10 years!'
            };
        }

        const keep = [
            member.roles.cache.find(role => role?.tags?.premiumSubscriberRole) ?? null,
            member.roles.cache.find(role => role?.tags?.botId) ?? null
        ].filter(Boolean);

        const keepIds = new Set([
            muteRole.id,
            guild.roles.everyone.id,
            ...keep.map(role => role.id)
        ]);

        const savedRoles = member.roles.cache
                                 .filter(role => !keepIds.has(role.id))
                                 .map(role => role.id);

        let missingPerms = false;

        await member.roles.set([
            muteRole.id,
            ...keep.map(role => role.id)
        ]).catch(() =>
        {
            missingPerms = true;
        });

        if (missingPerms)
        {
            return {
                ok:    false,
                error: 'Relaxy has missing permissions to mute this user!'
            };
        }

        const cleaned = await this._reason(reason, guildDoc, message);

        await client.module.database.addMute(guild.id, member.id, {
            mod:   moderator,
            exp:   Date.now() + duration,
            roles: savedRoles,

            reason:  cleaned.length > 1
                         ? cleaned
                         : 'X',
            dur:     duration,
            channel: String(channelId ?? '')
        });

        client.module?.stats?.count('moderation.mute');

        client.save(guild.id, {
            alter: 'd.mut.n',
            value: (Number(guildDoc.d?.mut?.n) || 0) + 1
        });

        const caseNumber = await client.module.database.addCase(guild.id, {
            type:   'mute',
            user:   member.id,
            mod:    moderator,
            reason: cleaned.length > 1
                        ? cleaned
                        : 'No reason given.',
            extra:  `Muted for: ${duration === FOREVER
                ? 'until the heat death of the universe'
                : duration === UNSPECIFIED
                    ? 'an unspecified amount of time'
                    : client.imports.time(duration)}`
        });

        this._log(() => guildDoc.ml?.on && client.pushModlog(guild.id, 'memberMuted', new client.class.modlog({
            color:     'bad',
            event:     'User muted',
            thumbnail: member.displayAvatarURL?.({
                dynamic:   true,
                extension: 'png'
            }),
            fields:    [
                {
                    name:   'User:',
                    value:  `${member}`,
                    inline: true
                },
                {
                    name:   'User ID:',
                    value:  `\`${member.user.id}\``,
                    inline: true
                },
                {
                    name:  'Mute time:',
                    value: `\`${duration === FOREVER
                        ? 'until the heat death of the universe (999999999999^100^100y)'
                        : duration === UNSPECIFIED
                            ? 'an unspecified amount of time.'
                            : client.imports.time(duration)}\``
                },
                {
                    name:  'Muted by:',
                    value: `${moderatorMember ?? message?.member ?? `<@${moderator}>`}`
                },
                {
                    name:  'Reason:',
                    value: cleaned.length > 1
                               ? cleaned
                               : 'No reason provided.'
                }
            ]
        }), moderatorMember ?? message?.member ?? null));

        return {
            ok:         true,
            caseNumber,
            reason:     cleaned,
            expires:    Date.now() + duration,
            duration,
            savedRoles: savedRoles.length
        };
    }

    async unmute({
        guild,
        guildDoc,
        member,
        moderator,
        reason = '',
        message = null
    })
    {
        const client = this.client;

        if (!member)
        {
            return {
                ok:    false,
                error: 'User doesn\'t exist on this server!'
            };
        }

        if (String(member.user.id) === String(moderator))
        {
            return {
                ok:    false,
                error: 'Cannot unmute yourself!'
            };
        }

        const muteRole = guildDoc.d?.mut?.id
            ? await guild.roles.fetch(guildDoc.d.mut.id).catch(() => null)
            : null;

        if (!muteRole)
        {
            return {
                ok:    false,
                error: 'Mute role created by Relaxy doesn\'t exist!'
            };
        }

        if (!member.roles.cache.get(muteRole.id))
        {
            return {
                ok:    false,
                error: 'This user isn\'t muted!'
            };
        }

        const activeMute = await client.module.database.getMute(guild.id, member.user.id).catch(() => null);

        if (activeMute)
        {
            await client.module.database.removeMute(guild.id, member.user.id);
        }

        const outcomeCases = await client.module.database.addCaseOutcome(guild.id, member.user.id, {
            type:  'unmute',
            mod:   moderator,
            types: ['mute']
        }).catch(() => []);

        const outcomeCase = outcomeCases?.[0] ?? (await client.utils.muteCase(guild.id, member.user.id).catch(() => null))?.n ?? null;

        if (guildDoc.ml?.on)
        {
            const mutedBy = activeMute?.mod
                ? await client.getMember(guild, activeMute.mod).catch(() => null)
                : null;

            this._log(() => client.pushModlog(guild.id, 'memberUnmuted', new client.class.modlog({
                color:     'good',
                event:     'Member unmuted',
                fields:    [
                               {
                                   name:   'User:',
                                   value:  member.toString(),
                                   inline: true
                               },
                               {
                                   name:   'User ID:',
                                   value:  `\`${member.user.id}\``,
                                   inline: true
                               },
                               {

                                   name:  'Mute time:',
                                   value: activeMute
                                              ? `\`${client.imports.time(Date.now() - (Number(activeMute.exp) - Number(activeMute.dur)))}\``
                                              : 'Unavailable.'
                               },
                               {
                                   name:  'Muted by:',
                                   value: `${mutedBy ?? 'Unavailable.'}`
                               },
                               {
                                   name:  'Reason for mute:',
                                   value: (activeMute?.reason?.length > 1)
                                              ? activeMute.reason
                                              : 'No reason provided.'
                               },
                               {
                                   name:  'Unmuted by:',
                                   value: `${message?.member ?? `<@${moderator}>`} [manual unmute]`
                               },
                               reason
                                   ? {
                                       name:  'Reason for unmute:',
                                       value: reason
                                   }
                                   : null
                           ].filter(field => field !== null),
                thumbnail: member.displayAvatarURL?.({
                    dynamic: true,
                    size:    4096
                })
            }), null));
        }

        const keep = [
            member.roles?.premiumSubscriberRole,
            member.roles?.botRole
        ].filter(role => role !== null && role !== undefined);

        const restore = activeMute?.roles?.length
            ? activeMute.roles.concat(keep)
            : [];

        await member.roles.set(restore).catch(client.swallow('unmute: restore'));

        return {
            ok:        true,
            restored:  activeMute?.roles?.length ?? 0,
            hadRecord: Boolean(activeMute),
            mute:      activeMute ?? null,

            caseNumber: outcomeCase
        };
    }

    async warn({
        guild,
        guildDoc,
        member,
        moderator,
        moderatorMember = null,
        reason = '',
        tier = 0,
        count = 1,
        message = null,

        ladder = true
    })
    {
        const client = this.client;

        if (!member)
        {
            return {
                ok:    false,
                error: 'User doesn\'t exist on this server!'
            };
        }

        const gate = this._guard({
            guild,
            user: member.user,
            member,
            moderator,
            moderatorMember,
            verb: 'warn'
        });

        if (!gate.ok)
        {
            return gate;
        }

        const level = Math.max(0, Math.min(30, Math.floor(Number(tier) || 0)));

        const times = Math.max(1, Math.min(100, Math.floor(Number(count) || 1)));

        const cleaned = (await this._reason(reason, guildDoc, message)).slice(0, 258);

        for (let i = 0; i < times; i++)
        {
            await client.module.database.addWarning(guild.id, member.user.id, {
                reason: cleaned.length > 1
                            ? cleaned
                            : 'None.',
                tier:   level,
                author: moderator
            });
        }

        const escalations = ladder
            ? await this.applyWarningTiers({
                guild,
                guildDoc,
                member,
                moderator,
                tier:  level,
                added: times,
                message
            }).catch(error =>
            {
                client.log('WARN', `[Warn tiers] Could not evaluate ${guild.id}'s ladder for ${member.user.id}: ${error?.message ?? error}`);

                return [];
            })
            : [];

        return {
            ok:     true,
            reason: cleaned,
            added:  times,
            escalations
        };
    }

    async applyWarningTiers({
        guild,
        guildDoc,
        member,
        moderator,
        tier = 0,
        added = 1,
        message = null
    })
    {
        const client = this.client;
        const ladder = guildDoc?.tr?.w ?? {};

        if (!member || !Object.keys(ladder).length)
        {
            return [];
        }

        const warnings = await client.module.database.warningsOf(guild.id, member.user.id).catch(() => []);

        const tripped = [];

        for (const [key, rules] of Object.entries(ladder))
        {
            if (!Array.isArray(rules) || !rules.length)
            {
                continue;
            }

            const isAny = key === ANY_TIER;

            if (!isAny && Number(key) !== Number(tier))
            {
                continue;
            }

            const relevant = isAny
                ? warnings
                : warnings.filter(warning => Number(warning.tier) === Number(key));

            const now = relevant.length;
            const before = now - added;

            for (const rule of rules)
            {
                const threshold = Number(rule?.n);

                if (!Number.isFinite(threshold) || threshold < 1 || !TIER_ACTIONS[rule?.a])
                {
                    continue;
                }

                if (now >= threshold && before < threshold)
                {
                    tripped.push({
                        key,
                        rule,
                        threshold
                    });
                }
            }
        }

        if (!tripped.length)
        {
            return [];
        }

        const SEVERITY = [
            'ban',
            'kick',
            'mute',
            'role+',
            'role-'
        ];

        tripped.sort((a, b) => SEVERITY.indexOf(a.rule.a) - SEVERITY.indexOf(b.rule.a) || b.threshold - a.threshold);

        const {
            key,
            rule,
            threshold
        } = tripped[0];

        const guardKey = `${guild.id}:${member.user.id}:${key}@${threshold}`;
        const now = Date.now();

        for (const [seen, at] of this._ladderGuard)
        {
            if (now - at >= LADDER_GUARD_MS)
            {
                this._ladderGuard.delete(seen);
            }
        }

        if (now - (this._ladderGuard.get(guardKey) ?? -Infinity) < LADDER_GUARD_MS)
        {
            client.log('DEBUG', `[Warn tiers] ${guild.id}: rule "${key} @ ${threshold}" was already carried out for ${member.user.id} - not repeating it.`);

            return [];
        }

        this._ladderGuard.set(guardKey, now);

        const spec = TIER_ACTIONS[rule.a];

        const reason = (rule.rs || `Reached ${threshold} ${key === ANY_TIER
            ? 'warning'
            : `tier ${key} warning`}${threshold === 1
            ? ''
            : 's'} in this server.`).slice(0, 258);

        const outcome = {
            action: rule.a,
            label:  spec.label,
            tier:   key,
            n:      threshold,
            ok:     false
        };

        try
        {
            switch (rule.a)
            {
                case 'ban':
                {
                    const result = await this.ban({
                        guild,
                        guildDoc,
                        user: member.user,
                        member,
                        moderator,
                        reason,
                        message
                    });

                    Object.assign(outcome, {
                        ok:         result.ok,
                        error:      result.error,
                        caseNumber: result.caseNumber
                    });

                    break;
                }

                case 'kick':
                {
                    const result = await this.kick({
                        guild,
                        guildDoc,
                        member,
                        moderator,
                        reason,
                        message
                    });

                    Object.assign(outcome, {
                        ok:         result.ok,
                        error:      result.error,
                        caseNumber: result.caseNumber
                    });

                    break;
                }

                case 'mute':
                {
                    const duration = Number(rule.d) || 0;

                    const result = await this.mute({
                        guild,
                        guildDoc,
                        member,
                        moderator,
                        reason,
                        durationMs: duration,
                        forever:    duration <= 0,
                        message
                    });

                    Object.assign(outcome, {
                        ok:         result.ok,
                        error:      result.error,
                        caseNumber: result.caseNumber,
                        durationMs: duration
                    });

                    break;
                }

                case 'role+':
                case 'role-':
                {
                    const role = rule.r
                        ? await guild.roles.fetch(rule.r).catch(() => null)
                        : null;

                    if (!role)
                    {
                        outcome.error = 'That role no longer exists.';

                        break;
                    }

                    if (role.position >= guild.members.me.roles.highest.position)
                    {
                        outcome.error = `**${role.name}** is above Relaxy's own role.`;

                        break;
                    }

                    if (role.managed)
                    {
                        outcome.error = `**${role.name}** is managed by an integration.`;

                        break;
                    }

                    if (rule.a === 'role+')
                    {
                        await member.roles.add(role, reason);
                    }
                    else
                    {
                        await member.roles.remove(role, reason);
                    }

                    Object.assign(outcome, {
                        ok:   true,
                        role: role.name
                    });

                    this._log(() => guildDoc?.ml?.on && client.pushModlog(guild.id, 'warning', new client.class.modlog({
                        color:     'bad',
                        event:     `Warning ladder - role ${rule.a === 'role+'
                            ? 'added'
                            : 'removed'}`,
                        thumbnail: member.displayAvatarURL?.({
                            dynamic:   true,
                            extension: 'png'
                        }),
                        fields:    [
                            {
                                name:   'User:',
                                value:  `${member}`,
                                inline: true
                            },
                            {
                                name:   'User ID:',
                                value:  `\`${member.user.id}\``,
                                inline: true
                            },
                            {
                                name:  'Role:',
                                value: `${role}`
                            },
                            {
                                name:  'Rule:',
                                value: `Reaching **${threshold}** ${key === ANY_TIER
                                    ? 'warning'
                                    : `tier ${key} warning`}${threshold === 1
                                    ? ''
                                    : 's'}.`
                            },
                            {
                                name:  'Reason:',
                                value: client.utils.inlineText(reason, { limit: 1000 })
                            }
                        ]
                    }), message?.member ?? guild.members.cache.get(moderator) ?? null));

                    break;
                }

                default:
                    outcome.error = `Unknown action "${rule.a}".`;
            }
        }
        catch (error)
        {
            outcome.error = String(error?.message ?? error);
        }

        if (!outcome.ok)
        {
            client.log('WARN', `[Warn tiers] ${guild.id}: rule "${key} @ ${threshold} -> ${rule.a}" did not apply to ${member.user.id}: ${outcome.error}`);
        }
        else
        {
            client.log('DATA',
                `[Warn tiers] ${guild.id}: ${member.user.id} reached ${threshold} ${key === ANY_TIER
                    ? ''
                    : `tier ${key} `}warning(s) - ${spec.label.toLowerCase()} applied.`);
        }

        return [outcome];
    }
}
