'use strict';
export const LEVEL_ACTIONS = {
    'role+': {
        label:     'Add role',
        emoji:     '➕',
        needsRole: true,
        state:     true
    },
    'role-': {
        label:     'Remove role',
        emoji:     '➖',
        needsRole: true,
        state:     true
    },
    money:   {
        label:       'Pay money',
        emoji:       '💰',
        needsAmount: true,
        state:       false
    },
    command: {
        label:        'Grant command',
        emoji:        '🔑',
        needsCommand: true,
        state:        true
    }
};

export const MIN_RULE_LEVEL = 2;
export const MAX_RULE_LEVEL = 500;
export const MAX_LEVELS = 40;
export const MAX_RULES_PER_LEVEL = 5;

export const displayed = stored => Math.max(0, Math.floor(Number(stored) || 0)) + 1;

export const levelRules = guildDoc =>
{
    const ladder = guildDoc?.tr?.l ?? {};
    const out = [];

    for (const [key, rules] of Object.entries(ladder))
    {
        const level = Number(key);

        if (!Number.isInteger(level) || level < MIN_RULE_LEVEL || level > MAX_RULE_LEVEL || !Array.isArray(rules))
        {
            continue;
        }

        for (const rule of rules)
        {
            if (LEVEL_ACTIONS[rule?.a])
            {
                out.push({
                    level,
                    rule
                });
            }
        }
    }

    return out.sort((a, b) => a.level - b.level);
};

export default class LevelRewards
{
    constructor(client)
    {
        this.client = client;

        this._syncCursors = new Map();

        this._payments = new Map();
    }

    desiredState(guildDoc, level)
    {
        const roles = new Map();
        const commands = new Set();

        for (const entry of levelRules(guildDoc))
        {
            if (entry.level > level)
            {
                break;
            }

            const rule = entry.rule;

            if (rule.a === 'role+' && rule.r)
            {
                roles.set(rule.r, true);
            }
            else if (rule.a === 'role-' && rule.r)
            {
                roles.set(rule.r, false);
            }
            else if (rule.a === 'command' && rule.c)
            {

                commands.add(rule.c);
            }
        }

        return {
            roles,
            commands
        };
    }

    async apply({
        guild,
        guildDoc,
        member,
        to,
        from = null,
        profile = null
    })
    {
        const client = this.client;

        const result = {
            added:   [],
            removed: [],
            granted: [],
            money:   0,
            errors:  []
        };

        if (!guild || !member || !Object.keys(guildDoc?.tr?.l ?? {}).length)
        {
            return result;
        }

        const now = Math.max(1, Math.floor(Number(to) || 1));
        const before = Math.min(now, Math.max(1, Math.floor(Number(from ?? to) || 1)));

        const desired = this.desiredState(guildDoc, now);

        await this._settleRoles(guild, member, desired.roles, now, result);
        await this._settleCommands(guild, guildDoc, member, desired.commands, result);
        await this._payCrossings(guildDoc, member, before, now, profile, result);

        if (result.errors.length)
        {
            client.log('WARN', `[Level tiers] ${guild.id}: ${member.id} at level ${now} - ${result.errors.join(' | ')}`);
        }

        if (result.added.length || result.removed.length || result.granted.length || result.money)
        {

            client.module?.stats?.count('levelRewards.handed-out');

            client.log('DATA', `[Level tiers] ${guild.id}: ${member.id} at level ${now} - ${[
                result.added.length
                    ? `+${result.added.join(', +')}`
                    : null,
                result.removed.length
                    ? `-${result.removed.join(', -')}`
                    : null,
                result.granted.length
                    ? `granted ${result.granted.join(', ')}`
                    : null,
                result.money
                    ? `${result.money} money`
                    : null
            ].filter(Boolean).join(', ')}.`);
        }

        return result;
    }

    async reconcile({
        guild,
        guildDoc,
        member,
        to
    })
    {
        return this.apply({
            guild,
            guildDoc,
            member,
            to,
            from: to
        });
    }

    async syncGuild({
        guild,
        guildDoc,
        roster = null,
        restart = false,
        limit = 2000
    })
    {
        const client = this.client;

        const summary = {
            scanned:   0,
            changed:   0,
            added:     0,
            removed:   0,
            granted:   0,
            failed:    0,
            capped:    false,
            remaining: 0,
            resumed:   false
        };

        const rules = levelRules(guildDoc);

        if (!rules.length)
        {
            return summary;
        }

        const floor = rules[0].level;

        const documents = (await client.module.database.findMembers(guild.id).catch(() => []))
            .filter(row => displayed(row?.lvl) >= floor)
            .sort((a, b) => (String(a.id) < String(b.id)
                ? -1
                : String(a.id) > String(b.id)
                    ? 1
                    : 0));

        const cursor = restart
            ? ''
            : this._syncCursors.get(guild.id) ?? '';
        let start = cursor
            ? documents.findIndex(row => String(row.id) > cursor)
            : 0;

        if (start < 0)
        {
            start = 0;
        }

        summary.resumed = start > 0;

        const page = documents.slice(start, start + limit);

        summary.remaining = Math.max(0, documents.length - start - page.length);
        summary.capped = summary.remaining > 0;
        this._syncCursors.set(guild.id,
            summary.capped
                ? String(page[page.length - 1].id)
                : '');

        for (const row of page)
        {
            summary.scanned++;

            const member = roster?.get(row.id) ?? guild.members.cache.get(row.id) ?? await guild.members.fetch(row.id).catch(() => null);

            if (!member)
            {
                continue;
            }

            const outcome = await this.reconcile({
                guild,
                guildDoc,
                member,
                to: displayed(row.lvl)
            }).catch(error =>
            {
                client.log('WARN', `[Level tiers] sync failed for ${row.id} in ${guild.id}: ${error?.message ?? error}`);

                return null;
            });

            if (!outcome)
            {
                summary.failed++;

                continue;
            }

            summary.added += outcome.added.length;
            summary.removed += outcome.removed.length;
            summary.granted += outcome.granted.length;
            summary.failed += outcome.errors.length
                ? 1
                : 0;

            if (outcome.added.length || outcome.removed.length || outcome.granted.length)
            {
                summary.changed++;
            }
        }

        return summary;
    }

    async _settleRoles(guild, member, desired, level, result)
    {
        if (!desired.size)
        {
            return;
        }

        const me = guild.members.me;

        if (!me?.roles?.highest)
        {
            result.errors.push('Relaxy\'s own member record is not loaded here, so role hierarchy could not be checked');

            return;
        }

        const ceiling = me.roles.highest.position;

        const add = [];
        const remove = [];

        for (const [roleId, wanted] of desired)
        {
            const has = member.roles.cache.has(roleId);

            if (has === wanted)
            {
                continue;
            }

            const role = guild.roles.cache.get(roleId);

            if (!role)
            {
                result.errors.push(`role ${roleId} no longer exists`);

                continue;
            }

            if (role.position >= ceiling)
            {
                result.errors.push(`${role.name} is above Relaxy's own role`);

                continue;
            }

            if (role.managed)
            {
                result.errors.push(`${role.name} is managed by an integration`);

                continue;
            }

            (wanted
                ? add
                : remove).push(role);
        }

        const reason = `Level ${level} reward`;

        if (add.length)
        {
            await member.roles.add(add, reason)
                        .then(() => result.added.push(...add.map(role => role.name)))
                        .catch(error => result.errors.push(`could not add ${add.map(role => role.name).join(', ')}: ${error?.message ?? error}`));
        }

        if (remove.length)
        {
            await member.roles.remove(remove, reason)
                        .then(() => result.removed.push(...remove.map(role => role.name)))
                        .catch(error => result.errors.push(`could not remove ${remove.map(role => role.name).join(', ')}: ${error?.message ?? error}`));
        }
    }

    async _settleCommands(guild, guildDoc, member, desired, result)
    {
        if (!desired.size)
        {
            return;
        }

        for (const name of desired)
        {
            const current = Array.isArray(guildDoc.cmd?.gr?.[name])
                ? guildDoc.cmd.gr[name]
                : [];

            if (current.includes(member.id))
            {
                continue;
            }

            const next = [
                ...current,
                member.id
            ];

            await this.client.save(guild.id, {
                alter: `cmd.gr.${name}`,
                value: next
            });

            result.granted.push(name);
        }
    }

    async _payCrossings(guildDoc, member, before, now, profile, result)
    {
        if (now <= before)
        {
            return;
        }

        let owed = 0;

        for (const entry of levelRules(guildDoc))
        {
            if (entry.level <= before)
            {
                continue;
            }

            if (entry.level > now)
            {
                break;
            }

            if (entry.rule.a === 'money')
            {
                owed += Math.max(0, Math.floor(Number(entry.rule.m) || 0));
            }
        }

        if (owed <= 0)
        {
            return;
        }

        const run = (this._payments.get(member.id) ?? Promise.resolve())
            .catch(() => {})
            .then(async () =>
            {
                const document = profile ?? await this.client.module.database.User(member.id).catch(() => null);

                if (!document)
                {
                    result.errors.push(`could not read ${member.id}'s profile to pay ${owed} money`);

                    return;
                }

                this.client.saveProfile(member.id, {
                    alter: 'm',
                    value: (document.m ?? 0) + owed
                });

                result.money = owed;
            });

        this._payments.set(member.id, run);

        run.catch(() => {}).then(() =>
        {
            if (this._payments.get(member.id) === run)
            {
                this._payments.delete(member.id);
            }
        });

        return run;
    }
}
