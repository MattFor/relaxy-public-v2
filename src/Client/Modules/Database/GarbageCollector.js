'use strict';

import OS from 'node:os';
import V8 from 'node:v8';
import FS from 'node:fs';

import Relaxy                          from '../../Relaxy.js';
import Discord                         from 'discord.js';
import { displayed as levelDisplayed } from '../Progression/LevelRewards.js';

const PURGE_GRACE_PERIOD = 180 * 24 * 60 * 60 * 1000;
const PURGE_SWEEP_INTERVAL = 6 * 60 * 60 * 1000;

const PURGE_MAX_PER_SWEEP = 25;
const PURGE_MAX_FLEET_FRACTION = 0.05;

const ORPHAN_SWEEP_INTERVAL = 6 * 60 * 60 * 1000;
const ORPHAN_MAX_PER_SWEEP = 250;

const ORPHAN_MIN_FLEET_RATIO = 0.10;

const USER_GRACE_PERIOD = 30 * 24 * 60 * 60 * 1000;
const PRESENCE_SWEEP_INTERVAL = 15 * 60 * 1000;

const PRESENCE_GUILDS_PER_SWEEP = 2;
const PRESENCE_REFRESH_INTERVAL = 7 * 24 * 60 * 60 * 1000;

const PRESENCE_STALE_LIMIT = 2 * PRESENCE_REFRESH_INTERVAL;
const DEPARTED_SWEEP_INTERVAL = 60 * 60 * 1000;

const AUDIT_SWEEP_INTERVAL = 30 * 60 * 1000;
const AUDIT_GUILDS_PER_SWEEP = 2;
const AUDIT_REFRESH_INTERVAL = 7 * 24 * 60 * 60 * 1000;

const DEPARTED_MAX_PER_SWEEP = 250;
const DEPARTED_PROFILES_PER_SWEEP = 500;

const DELETED_SWEEP_INTERVAL = 60 * 60 * 1000;

const DELETED_CHECKS_PER_SWEEP = 200;

const DELETED_ACCOUNT_PATTERN = /^deleted_user_[0-9a-f]+$/i;

const LEVEL_SWEEP_INTERVAL = 30 * 60 * 1000;
const LEVEL_DOCUMENTS_PER_SWEEP = 500;

const LEVEL_GUILDS_PER_SWEEP = 3;

const LEVEL_REWARDS_PER_SWEEP = 25;
const CACHE_WATCH_INTERVAL = 60 * 1000;

const CACHE_SOFT_HEAP_RATIO = 0.70;

const CACHE_HARD_HEAP_RATIO = 0.85;

const CACHE_SYSTEM_SHARE = 0.70;

const CACHE_AVAILABLE_FLOOR = 0.12;

const CACHE_LIMITS = Object.freeze({
    members:           {
        limit: 25000,
        floor: 2500
    },
    users:             {
        limit: 15000,
        floor: 1500
    },
    warnings:          {
        limit: 10000,
        floor: 1000
    },
    mutes:             {
        limit: 10000,
        floor: 1000
    },
    heartboardPosts:   {
        limit: 15000,
        floor: 1500
    },
    correctHeartBoard: {
        limit: 5000,
        floor: 500
    },
    heartboards:       {
        limit: 5000,
        floor: 500
    },
    forum:             {
        limit: 5000,
        floor: 500
    },
    reactionRoles:     {
        limit: 5000,
        floor: 500
    },
    servers:           {
        limit: 5000,
        floor: 1000
    },
    guildConfigs:      {
        limit: 5000,
        floor: 1000
    }
});

const COLLECTION_LIMITS = Object.freeze({

    starterMessages:        {
        limit: 5000,
        floor: 500
    },
    interactionsInProgress: {
        limit: 2000,
        floor: 200
    },
    modalInteractionData:   {
        limit: 2000,
        floor: 200
    },
    polls:                  {
        limit: 2000,
        floor: 500
    },
    voiceChatTimes:         {
        limit: 20000,
        floor: 2000
    },
    voiceMuteTimes:         {
        limit: 20000,
        floor: 2000
    },
    voiceDeafTimes:         {
        limit: 20000,
        floor: 2000
    },
    voiceVideoTimes:        {
        limit: 20000,
        floor: 2000
    },
    voiceStreamTimes:       {
        limit: 20000,
        floor: 2000
    },
    voiceStaffMuteTimes:    {
        limit: 20000,
        floor: 2000
    },
    voiceStaffDeafTimes:    {
        limit: 20000,
        floor: 2000
    }
});

export default class GarbageCollector
{
    constructor(client)
    {
        this.client = client;

        client.garbageCollector?.dispose?.();

        this.supportedEvents = [
            'channelDelete',
            'threadDelete',
            'messageDelete',
            'messageDeleteBulk',
            'roleDelete',
            'emojiDelete',
            'guildMemberRemove',
            'guildDelete'
        ];

        this.client.log('DATA', 'Garbage deletion started.');

        this._sweepTimer = setInterval(() => this._once('sweepDeletedGuilds', () => this.sweepDeletedGuilds()).catch(e => this.client.log('ERROR', '[Garbage] Guild sweep failed:', e)), PURGE_SWEEP_INTERVAL);

        this._orphanTimer = setInterval(() => this._once('sweepOrphanedGuilds', () => this.sweepOrphanedGuilds()).catch(e => this.client.log('ERROR', '[Garbage] Orphan sweep failed:', e)), ORPHAN_SWEEP_INTERVAL);

        this._presenceTimer = setInterval(() => this._once('sweepGuildPresence', () => this.sweepGuildPresence()).catch(e => this.client.log('ERROR', '[Garbage] Presence sweep failed:', e)), PRESENCE_SWEEP_INTERVAL);

        this._departedTimer = setInterval(() => this._once('sweepDepartedUsers', () => this.sweepDepartedUsers()).catch(e => this.client.log('ERROR', '[Garbage] Departed-user sweep failed:', e)), DEPARTED_SWEEP_INTERVAL);

        this._auditTimer = setInterval(() => this._once('sweepGuildReferences', () => this.sweepGuildReferences()).catch(e => this.client.log('ERROR', '[Garbage] Reference audit failed:', e)), AUDIT_SWEEP_INTERVAL);

        this._levelTimer = setInterval(() => this._once('sweepLevelBacklog', () => this.sweepLevelBacklog()).catch(e => this.client.log('ERROR', '[Garbage] Level sweep failed:', e)), LEVEL_SWEEP_INTERVAL);

        this._deletedTimer = setInterval(() => this._once('sweepDeletedAccounts', () => this.sweepDeletedAccounts()).catch(e => this.client.log('ERROR', '[Garbage] Deleted-account sweep failed:', e)), DELETED_SWEEP_INTERVAL);

        this._cacheTimer = setInterval(() => this._once('sweepProcessCaches', () => this.sweepProcessCaches()).catch(e => this.client.log('ERROR', '[Garbage] Cache watch failed:', e)), CACHE_WATCH_INTERVAL);

        for (const timer of this._timers())
        {
            timer?.unref?.();
        }
    }

    _timers()
    {
        return [
            this._sweepTimer,
            this._orphanTimer,
            this._presenceTimer,
            this._departedTimer,
            this._auditTimer,
            this._levelTimer,
            this._deletedTimer,
            this._cacheTimer
        ];
    }

    async _once(name, work)
    {
        this._running ??= new Set();

        if (this._running.has(name))
        {
            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('DEBUG', `[Garbage] ${name} is still running from the last cycle; skipping this tick.`);
            }

            return;
        }

        this._running.add(name);

        try
        {
            return await work();
        }
        finally
        {
            this._running.delete(name);
        }
    }

    dispose()
    {
        for (const timer of this._timers())
        {
            clearInterval(timer);
        }

        this._sweepTimer = this._orphanTimer = this._presenceTimer = this._departedTimer = this._auditTimer = this._levelTimer = this._deletedTimer = this._cacheTimer = null;
    }

    async sweepProcessCaches()
    {
        const pressure = this.memoryPressure();

        const {
            hard,
            pressured
        } = pressure;

        const database = this.client.module?.database;
        const dropped = [];

        for (const [name, bounds] of Object.entries(CACHE_LIMITS))
        {
            const count = database?.trimCache?.(name,
                pressured
                    ? bounds.floor
                    : bounds.limit) ?? 0;

            if (count)
            {
                dropped.push(`${name} -${count}`);
            }
        }

        for (const [name, bounds] of Object.entries(COLLECTION_LIMITS))
        {
            const count = this._trimCollection(this.client.collections?.[name],
                pressured
                    ? bounds.floor
                    : bounds.limit);

            if (count)
            {
                dropped.push(`${name} -${count}`);
            }
        }

        if (pressured && this.client.utils?._auditSnapshots?.size)
        {
            dropped.push(`auditSnapshots -${this.client.utils._auditSnapshots.size}`);
            this.client.utils._auditSnapshots.clear();
        }

        if (!dropped.length)
        {
            return;
        }

        const summary = `[Garbage] Cache watch: ${pressure.describe()}${pressured
            ? hard
                ? ' - HARD trim'
                : ' - trimming to floors'
            : ''}. Dropped ${dropped.join(', ')}.`;

        if (hard)
        {
            return this.client.log('WARN', summary);
        }

        if (this.client.flags.logs.garbage_collector || this.client.flags.logs.debug)
        {
            this.client.log('DEBUG', summary);
        }
    }

    memoryPressure()
    {
        const {
            rss,
            heapUsed
        } = process.memoryUsage();
        const heapLimit = V8.getHeapStatistics().heap_size_limit || 0;

        const total = OS.totalmem() || 0;
        const available = this._availableMemory(total);

        const clusters = Math.max(1, Number(this.client.cluster?.count) || 1);
        const budget = Math.max(1, Math.min(heapLimit || Infinity, (total * CACHE_SYSTEM_SHARE) / clusters));

        const heapRatio = heapLimit
            ? heapUsed / heapLimit
            : 0;
        const ratio = Math.max(heapRatio, rss / budget);

        const starved = total > 0 && available > 0 && available / total <= CACHE_AVAILABLE_FLOOR;
        const hard = starved || ratio >= CACHE_HARD_HEAP_RATIO;

        const mb = bytes => Math.round(bytes / 1024 / 1024);

        return {
            rss,
            heapUsed,
            heapLimit,
            total,
            available,
            budget,
            ratio,
            hard,
            pressured: hard || ratio >= CACHE_SOFT_HEAP_RATIO,
            describe:  () => `rss ${mb(rss)}MB of ${mb(budget)}MB budget, heap ${mb(heapUsed)}MB of ${mb(heapLimit)}MB, ${mb(available)}MB of ${mb(total)}MB available on the host (${Math.round(ratio * 100)}%${starved
                ? ', HOST STARVED'
                : ''})`
        };
    }

    _availableMemory(total)
    {
        try
        {
            const kb = /^MemAvailable:\s+(\d+) kB/m.exec(FS.readFileSync('/proc/meminfo', 'utf8'))?.[1];

            if (kb)
            {
                return Number(kb) * 1024;
            }
        }
        catch
        {

        }

        return OS.freemem() || total;
    }

    _trimCollection(collection, limit)
    {
        if (typeof collection?.size !== 'number' || typeof collection.delete !== 'function' || collection.size <= limit)
        {
            return 0;
        }

        let dropped = 0;

        for (const key of [...collection.keys()])
        {
            if (collection.size <= limit)
            {
                break;
            }

            collection.delete(key);
            dropped++;
        }

        return dropped;
    }

    async fleetSnapshot()
    {
        if (!this.client.isReady())
        {
            return null;
        }

        let reports;

        try
        {
            reports = await this.client.cluster.broadcastEval(client => ({
                ready:  client.isReady(),
                shards: client.ws.shards.map(shard => shard.status),
                ids:    [...client.guilds.cache.keys()]
            }));
        }
        catch (error)
        {
            this.client.log('WARN', `[Garbage] Fleet snapshot failed (${error?.message ?? error}). Nothing will be purged this cycle.`);
            return null;
        }

        const expected = this.client.cluster.info?.CLUSTER_COUNT;

        if (!Array.isArray(reports) || reports.length === 0)
        {
            this.client.log('WARN', '[Garbage] Fleet snapshot returned nothing. Nothing will be purged this cycle.');
            return null;
        }

        if (Number.isInteger(expected) && reports.length !== expected)
        {
            this.client.log('WARN', `[Garbage] Only ${reports.length} of ${expected} clusters answered the fleet snapshot. The missing one's guilds would look like orphans, so nothing will be purged this cycle.`);
            return null;
        }

        const ids = new Set();

        for (const report of reports)
        {

            if (!report?.ready || !Array.isArray(report.shards) || report.shards.length === 0 || report.shards.some(status => status !== 0))
            {
                this.client.log('WARN', `[Garbage] A cluster is not fully ready (ready: ${report?.ready}, shards: ${JSON.stringify(report?.shards)}). Its guilds would look like orphans, so nothing will be purged this cycle.`);
                return null;
            }

            for (const id of report.ids ?? [])
            {
                ids.add(id);
            }
        }

        if (ids.size === 0)
        {
            this.client.log('WARN', '[Garbage] The fleet reports zero guilds, which cannot be right. Nothing will be purged this cycle.');
            return null;
        }

        return ids;
    }

    async invalidateMembers(guildId, userIds)
    {
        if (!userIds?.length)
        {
            return;
        }

        await this.client.cluster.broadcastEval((client, {
            guild,
            ids
        }) => client.module.database.dropMembers(guild, ids), {
            context: {
                guild: guildId,
                ids:   userIds
            }
        }).catch(error =>

            this.client.log('WARN', `[Garbage] Marked ${userIds.length} member(s) in guild ${guildId} but could not clear them from every cluster's cache (${error?.message ?? error}). A stale copy could revert the mark; the next sweep will correct it.`));
    }

    async setProfileMark(userId, value)
    {
        await this.client.saveProfile(userId, {
            alter: 'lm',
            value
        });

        await this.client.module.database.flushProfile(userId)
                  .catch(error => this.client.log('WARN', `[Garbage] Could not flush profile ${userId} (${error?.message ?? error}).`));

        await this.client.cluster.broadcastEval((client, { id }) => client.module.database.dropUser(id), { context: { id: userId } }).catch(error => this.client.log('WARN', `[Garbage] Marked profile ${userId} but could not clear it from every cluster's cache (${error?.message ?? error}).`));
    }

    async sweepDeletedAccounts()
    {

        if (!this.client._trueRelaxy || !this.client.isReady())
        {
            return;
        }

        const database = this.client.module.database;

        this._deletedCursor ??= '';

        const page = await database.findUnmarkedProfiles(this._deletedCursor, DELETED_CHECKS_PER_SWEEP);

        if (page.length === 0)
        {
            this._deletedCursor = '';

            return;
        }

        this._deletedCursor = page[page.length - 1].id;

        let purged = 0;
        let documents = 0;

        for (const profile of page)
        {
            const user = await this.client.users.fetch(profile.id, { force: true }).catch(() => null);
            if (!user || !DELETED_ACCOUNT_PATTERN.test(user.username ?? ''))
            {
                continue;
            }

            const deleted = await database.purgeUser(profile.id);
            await this.client.cluster.broadcastEval((client, { id }) => client.module.database.dropUser(id), { context: { id: profile.id } })
                      .catch(error => this.client.log('WARN', `[Garbage] Purged deleted account ${profile.id} but could not clear it from every cluster's cache (${error?.message ?? error}). A stale copy may be re-inserted.`));

            purged++;
            documents += Object.values(deleted).reduce((sum, count) => sum + count, 0);

            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('DEBUG', `[Garbage] ${profile.id} is a deleted Discord account (${user.username}). Purged.`);
            }
        }

        if (purged > 0)
        {
            this.client.log('DATA', `[Garbage] Purged ${purged} deleted Discord account(s) (${documents} document(s)). Checked ${page.length}.`);
        }
    }

    async sweepLevelBacklog()
    {
        if (!this.client.isReady())
        {
            return;
        }

        if (this.client._trueRelaxy)
        {
            await this.repairProfileLevels();
        }

        await this.repairMemberLevels();
    }

    async repairProfileLevels()
    {
        const database = this.client.module.database;
        const floor = this.client.utils.nextLevel(0);

        this._levelProfileCursor ??= '';

        const page = await database.findLevellingCandidateProfiles(floor, this._levelProfileCursor, LEVEL_DOCUMENTS_PER_SWEEP);

        if (page.length === 0)
        {
            this._levelProfileCursor = '';

            return;
        }

        this._levelProfileCursor = page[page.length - 1].id;

        let repaired = 0;
        let levels = 0;

        for (const row of page)
        {
            const settled = this.client.utils.levelUp(row.xp, row.lvl);

            if (settled.gained === 0)
            {
                continue;
            }

            repaired++;
            levels += settled.gained;
            await this.client.saveProfile(row.id, {
                alter: 'xp',
                value: settled.xp
            }, {
                alter: 'lvl',
                value: settled.level
            });

            await database.flushProfile(row.id).catch(error => this.client.log('WARN', `[Garbage] Could not flush repaired profile ${row.id} (${error?.message ?? error}).`));

            await this.client.cluster.broadcastEval((client, { id }) => client.module.database.dropUser(id), { context: { id: row.id } })
                      .catch(error => this.client.log('WARN', `[Garbage] Repaired profile ${row.id} but could not clear it from every cluster's cache (${error?.message ?? error}). The next pass will correct it.`));

            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('DEBUG', `[Garbage] Profile ${row.id}: ${row.xp} xp at level ${row.lvl} settles to level ${settled.level} with ${settled.xp} xp (+${settled.gained}).`);
            }
        }

        if (repaired > 0)
        {
            this.client.log('DATA', `[Garbage] Settled the global level of ${repaired} profile(s) - ${levels} level(s) owed. Examined ${page.length}.`);
        }
    }

    async repairMemberLevels()
    {
        const database = this.client.module.database;
        const floor = this.client.utils.nextLevel(0);

        const owned = [...this.client.guilds.cache.values()].filter(guild => guild.available !== false);

        if (owned.length === 0)
        {
            return;
        }

        this._levelMemberCursors ??= new Map();

        this._levelGuildOffset = (this._levelGuildOffset ?? 0) % owned.length;

        const batch = [];

        for (let i = 0; i < Math.min(LEVEL_GUILDS_PER_SWEEP, owned.length); i++)
        {
            batch.push(owned[(this._levelGuildOffset + i) % owned.length]);
        }

        this._levelGuildOffset = (this._levelGuildOffset + batch.length) % owned.length;

        let repaired = 0;
        let levels = 0;

        for (const guild of batch)
        {
            const cursor = this._levelMemberCursors.get(guild.id) ?? '';
            const page = await database.findLevellingCandidateMembers(guild.id, floor, cursor, LEVEL_DOCUMENTS_PER_SWEEP);

            if (page.length === 0)
            {
                this._levelMemberCursors.set(guild.id, '');

                continue;
            }

            const guildDoc = await database.Guild(guild.id).catch(() => null);
            const ladder = this.client.module?.levelRewards && Object.keys(guildDoc?.tr?.l ?? {}).length > 0;

            let settlements = 0;

            const touched = [];

            let reached = '';

            for (const row of page)
            {
                if (ladder && settlements >= LEVEL_REWARDS_PER_SWEEP)
                {
                    break;
                }

                reached = row.id;

                const settled = this.client.utils.levelUp(row.xp, row.lvl);

                if (settled.gained === 0)
                {
                    continue;
                }

                repaired++;
                levels += settled.gained;
                touched.push(row.id);

                await this.client.saveMember(guild.id, row.id, {
                    alter: 'xp',
                    value: settled.xp
                }, {
                    alter: 'lvl',
                    value: settled.level
                });

                if (!ladder)
                {
                    continue;
                }

                settlements++;

                const member = guild.members.cache.get(row.id);

                if (!member)
                {
                    continue;
                }

                await this.client.module.levelRewards.apply({
                    guild,
                    guildDoc,
                    member,
                    from: levelDisplayed(row.lvl),
                    to:   levelDisplayed(settled.level)
                }).catch(error => this.client.log('WARN', `[Garbage] Repaired ${row.id}'s level in ${guild.id} but could not settle their level rewards (${error?.message ?? error}).`));
            }

            this._levelMemberCursors.set(guild.id, reached || page[page.length - 1].id);

            if (touched.length === 0)
            {
                continue;
            }

            await database.flushMembers(guild.id, touched)
                          .catch(error => this.client.log('WARN', `[Garbage] Could not flush ${touched.length} repaired member(s) in ${guild.id} (${error?.message ?? error}).`));

            await this.invalidateMembers(guild.id, touched);
        }

        if (repaired > 0)
        {
            this.client.log('DATA', `[Garbage] Settled the server level of ${repaired} member document(s) across ${batch.length} guild(s) - ${levels} level(s) owed.`);
        }
    }

    async sweepOrphanedGuilds()
    {

        if (!this.client._trueRelaxy || !this.client.isReady())
        {
            return;
        }

        const live = await this.fleetSnapshot();

        if (!live)
        {
            return;
        }

        const stored = (await this.client.module.database.getGuilds({}, {
            projection: {
                id:  1,
                dm:  1,
                _id: 0
            }
        })) ?? [];

        if (stored.length === 0)
        {
            return;
        }

        if (live.size < stored.length * ORPHAN_MIN_FLEET_RATIO)
        {
            this.client.data.errors++;

            this.client.log('ERROR', `[Garbage] REFUSING TO PURGE ORPHANS. The fleet sees ${live.size} guilds against ${stored.length} in the database - too few for the difference to be attrition. Nothing was deleted.`);

            return this.client.clog(`The fleet reports only ${live.size} guild(s) against ${stored.length} in the database. Too few for the difference to be attrition, so **nothing was deleted** - this looks like a fleet that is not all here.`, 'ORPHAN PURGE REFUSED', 'bad');
        }

        const orphans = stored.filter(guild => guild.id && !live.has(guild.id));

        if (orphans.length === 0)
        {
            return;
        }

        const batch = orphans.slice(0, ORPHAN_MAX_PER_SWEEP);

        this.client.log('DATA', `[Garbage] ${orphans.length} guild(s) in the database are in no cluster's cache. Purging ${batch.length} this cycle (fleet: ${live.size} guilds, database: ${stored.length}).`);

        let purged = 0;
        let documents = 0;

        for (const guild of batch)
        {
            const deleted = await this.client.module.database.purgeGuild(guild.id);
            const total = Object.values(deleted).reduce((sum, count) => sum + count, 0);

            purged++;
            documents += total;

            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('DATA', `[Garbage] Purged orphan guild ${guild.id}. Deleted ${total} document(s): ${Object.entries(deleted).map(([model, count]) => `${count} ${model}`).join(', ') || 'none'}.`);
            }
        }

        this.client.log('DATA', `[Garbage] Orphan sweep done. Purged ${purged} guild(s), ${documents} document(s). ${orphans.length - batch.length} left for the next cycle.`);

        this.client.clog(`Purged ${purged} guild(s) absent from every cluster - ${documents} document(s). ${orphans.length - batch.length} remaining.`, 'ORPHANED GUILD DATA PURGED', 'bad');
    }

    async sweepGuildPresence()
    {
        if (!this.client.isReady())
        {
            return;
        }

        const now = Date.now();
        const database = this.client.module.database;

        const owned = [...this.client.guilds.cache.values()].filter(guild => guild.available !== false);

        if (owned.length === 0)
        {
            return;
        }

        const candidates = [];

        for (const guild of owned)
        {
            const stored = await database.Guild(guild.id);
            const swept = stored?.ps ?? 0;

            if (now - swept >= PRESENCE_REFRESH_INTERVAL)
            {
                candidates.push({
                    guild,
                    swept
                });
            }
        }

        if (candidates.length === 0)
        {
            return;
        }

        candidates.sort((a, b) => a.swept - b.swept);

        for (const { guild } of candidates.slice(0, PRESENCE_GUILDS_PER_SWEEP))
        {
            await this.reconcileGuildRoster(guild).catch(error => this.client.log('WARN', `[Garbage] Could not reconcile the roster of guild ${guild.id} (${error?.message ?? error}). Leaving its marks untouched.`));
        }
    }

    async reconcileGuildRoster(guild)
    {
        const database = this.client.module.database;
        const now = Date.now();

        const roster = await guild.members.fetch();

        if (!roster || roster.size === 0)
        {

            return this.client.log('WARN', `[Garbage] Roster fetch for guild ${guild.id} came back empty, which cannot be right. Leaving its marks untouched.`);
        }

        const expected = guild.memberCount ?? 0;

        if (expected > 0 && roster.size < expected * 0.95)
        {
            this.client.data.warns++;

            return this.client.log('WARN', `[Garbage] Roster fetch for guild ${guild.id} returned ${roster.size} member(s) but Discord reports ${expected}. The fetch was truncated, and trusting it would mark ${expected - roster.size} present member(s) as departed. Leaving its marks untouched.`);
        }

        const present = new Set(roster.keys());
        const stored = await database.listMemberPresence(guild.id);

        const departed = [];
        const returned = [];

        let storedPresent = 0;

        for (const member of stored)
        {
            const here = present.has(member.id);

            if (here)
            {
                storedPresent++;
            }

            if (!here && member.lm === 0)
            {
                departed.push(member.id);
            }
            else if (here && member.lm > 0)
            {

                returned.push(member.id);
            }
        }

        if (returned.length > 0)
        {
            await database.setMemberMarks(guild.id, returned, 0);
            await this.invalidateMembers(guild.id, returned);
        }

        if (departed.length > 0)
        {
            await database.setMemberMarks(guild.id, departed, now);
            await this.invalidateMembers(guild.id, departed);
        }

        await this.client.save(guild.id, {
            alter: 'ps',
            value: now
        });

        if (this.client.flags.logs.garbage_collector || departed.length > 0 || returned.length > 0)
        {
            const undocumented = roster.size - storedPresent;

            this.client.log('DATA', `[Garbage] Reconciled guild ${guild.id}: ${roster.size} on Discord, ${stored.length} stored (${storedPresent} stored still here, ${undocumented} here with no document). Marked ${departed.length} stored-but-absent departed, cleared ${returned.length} returned.`);
        }
    }

    collectChannelIds(guild)
    {
        const found = [];
        const add = (id, where) =>
        {

            if (typeof id === 'string' && id !== '')
            {
                found.push({
                    id,
                    where
                });
            }
        };
        add(guild.cn?.c, 'cn.c');
        add(guild.lv?.c, 'lv.c');
        add(guild.co?.c, 'co.c');

        for (const entry of guild.ch?.t?.cl ?? [])
        {
            add(entry?.id, 'ch.t.cl');
        }

        for (const id of guild.ch?.t?.rs ?? [])
        {
            add(id, 'ch.t.rs');
        }

        for (const entry of guild.ch?.v?.pv ?? [])
        {
            add(typeof entry === 'string'
                ? entry
                : entry?.id, 'ch.v.pv');
        }

        add(guild.ach?.c, 'ach.c');
        add(guild.wc?.j?.c, 'wc.j.c');
        add(guild.wc?.l?.c, 'wc.l.c');

        for (const key of [
            'b',
            'l1',
            'l2',
            'l3'
        ])
        {
            add(guild.cb?.[key]?.c, `cb.${key}.c`);
        }

        for (const id of guild.hb?.cs ?? [])
        {
            add(id, 'hb.cs');
        }

        for (const id of guild.fo?.cs ?? [])
        {
            add(id, 'fo.cs');
        }

        for (const [event, config] of Object.entries(guild.ml?.ev ?? {}))
        {
            add(config?.channel, `ml.ev.${event}`);
        }

        return found;
    }

    async retargetChannel(guildId, guild, oldId, newId)
    {
        const moved = [];

        const save = (alter, value, where) =>
        {
            moved.push(where);

            return this.client.save(guildId, {
                alter,
                value
            });
        };

        const scalar = async (path, current) =>
        {
            if (current === oldId)
            {
                await save(path, newId, path);
            }
        };

        await scalar('cn.c', guild.cn?.c);
        await scalar('lv.c', guild.lv?.c);
        await scalar('co.c', guild.co?.c);
        await scalar('ach.c', guild.ach?.c);
        await scalar('wc.j.c', guild.wc?.j?.c);
        await scalar('wc.l.c', guild.wc?.l?.c);

        for (const key of [
            'b',
            'l1',
            'l2',
            'l3'
        ])
        {
            await scalar(`cb.${key}.c`, guild.cb?.[key]?.c);
        }

        const clearing = guild.ch?.t?.cl ?? [];

        if (clearing.some(entry => (typeof entry === 'string'
            ? entry
            : entry?.id) === oldId))
        {
            await save('ch.t.cl',
                clearing.map(entry => (typeof entry === 'string'
                    ? (entry === oldId
                        ? newId
                        : entry)
                    : entry?.id === oldId
                        ? {
                            ...entry,
                            id: newId
                        }
                        : entry)),
                'ch.t.cl');
        }

        for (const [path, list] of [
            [
                'ch.t.rs',
                guild.ch?.t?.rs
            ],
            [
                'hb.cs',
                guild.hb?.cs
            ],
            [
                'fo.cs',
                guild.fo?.cs
            ]
        ])
        {
            if ((list ?? []).includes(oldId))
            {
                await save(path,
                    list.map(id => (id === oldId
                        ? newId
                        : id)),
                    path);
            }
        }

        const privateVoice = guild.ch?.v?.pv ?? [];

        if (privateVoice.some(entry => entry?.id === oldId))
        {
            await save('ch.v.pv',
                privateVoice.map(entry => (entry?.id === oldId
                    ? {
                        ...entry,
                        id: newId
                    }
                    : entry)),
                'ch.v.pv');
        }

        for (const [event, config] of Object.entries(guild.ml?.ev ?? {}))
        {
            if (config?.channel === oldId)
            {
                await save(`ml.ev.${event}.channel`, newId, `ml.ev.${event}`);
            }
        }

        return moved;
    }

    collectRoleIds(guild)
    {
        const found = [];
        const add = (id, where) =>
        {
            if (typeof id === 'string' && id !== '')
            {
                found.push({
                    id,
                    where
                });
            }
        };

        add(guild.d?.mut?.id, 'd.mut.id');

        for (const id of guild.rl?.a ?? [])
        {
            add(id, 'rl.a');
        }

        for (const id of guild.rl?.x ?? [])
        {
            add(id, 'rl.x');
        }

        for (const id of guild.ap?.tr ?? [])
        {
            add(id, 'ap.tr');
        }

        return found;
    }

    async sweepGuildReferences()
    {
        if (!this.client.isReady())
        {
            return;
        }

        const now = Date.now();
        const database = this.client.module.database;
        const candidates = [];

        for (const guild of this.client.guilds.cache.values())
        {
            if (guild.available === false)
            {
                continue;
            }

            const stored = await database.Guild(guild.id);
            const swept = stored?.as ?? 0;

            if (now - swept >= AUDIT_REFRESH_INTERVAL)
            {
                candidates.push({
                    guild,
                    swept
                });
            }
        }

        candidates.sort((a, b) => a.swept - b.swept);

        for (const { guild } of candidates.slice(0, AUDIT_GUILDS_PER_SWEEP))
        {
            await this.auditGuildReferences(guild).catch(error => this.client.log('WARN', `[Garbage] Could not audit the references of guild ${guild.id} (${error?.message ?? error}). Leaving its config untouched.`));
        }
    }

    async auditGuildReferences(guild)
    {
        const database = this.client.module.database;

        const channels = await guild.channels.fetch();
        const roles = await guild.roles.fetch();

        if (!channels || channels.size === 0 || !roles || roles.size === 0)
        {

            return this.client.log('WARN', `[Garbage] Audit of guild ${guild.id} got an empty channel or role list, which cannot be right. Leaving its config untouched.`);
        }

        const stored = await database.Guild(guild.id);

        const staleChannels = this.collectChannelIds(stored).filter(entry => !channels.has(entry.id));
        const staleRoles = this.collectRoleIds(stored).filter(entry => !roles.has(entry.id));

        for (const id of new Set(staleChannels.map(entry => entry.id)))
        {
            const where = staleChannels.filter(entry => entry.id === id).map(entry => entry.where).join(', ');

            this.client.log('DATA', `[Garbage] Audit: guild ${guild.id} still references deleted channel ${id} (${where}). Cleaning up as if channelDelete had fired.`);

            await this.handle('channelDelete', {
                id,
                guild: { id: guild.id }
            });
        }

        for (const id of new Set(staleRoles.map(entry => entry.id)))
        {
            const where = staleRoles.filter(entry => entry.id === id).map(entry => entry.where).join(', ');

            this.client.log('DATA', `[Garbage] Audit: guild ${guild.id} still references deleted role ${id} (${where}). Cleaning up as if roleDelete had fired.`);

            await this.handle('roleDelete', {
                id,
                guild: { id: guild.id }
            });
        }

        await this.client.save(guild.id, {
            alter: 'as',
            value: Date.now()
        });

        if (this.client.flags.logs.garbage_collector)
        {
            this.client.log('DEBUG', `[Garbage] Audited guild ${guild.id}: ${channels.size} channel(s), ${roles.size} role(s) on Discord. Cleaned ${staleChannels.length} stale channel reference(s), ${staleRoles.length} stale role reference(s).`);
        }
    }

    async sweepDepartedUsers()
    {
        if (!this.client.isReady())
        {
            return;
        }

        const now = Date.now();
        const cutoff = now - USER_GRACE_PERIOD;
        const database = this.client.module.database;

        let members = 0;
        let budget = DEPARTED_MAX_PER_SWEEP;

        for (const guild of this.client.guilds.cache.values())
        {
            if (budget <= 0)
            {
                break;
            }

            if (guild.available === false)
            {
                continue;
            }

            const departed = await database.findDepartedMembers(guild.id, cutoff, budget);

            if (departed.length === 0)
            {
                continue;
            }

            const ids = [];
            const back = [];

            for (const member of departed)
            {
                budget--;

                const present = await guild.members.fetch({
                                               user:  member.id,
                                               force: false
                                           })
                                           .then(() => true)
                                           .catch(error => (error?.code === 10007 || error?.code === 10013)
                                               ? false
                                               : null);

                if (present === false)
                {
                    ids.push(member.id);
                }
                else if (present === true)
                {
                    back.push(member.id);
                }
            }

            if (back.length > 0)
            {
                this.client.log('WARN', `[Garbage] ${back.length} member(s) marked as gone from guild ${guild.id} are in it right now. Clearing their marks instead of deleting them.`);

                await database.setMemberMarks(guild.id, back, 0);
                await this.invalidateMembers(guild.id, back);
            }

            if (ids.length > 0)
            {
                members += await database.deleteMembers(guild.id, ids);

                await this.invalidateMembers(guild.id, ids);
            }
        }

        if (members > 0)
        {
            this.client.log('DATA', `[Garbage] Deleted ${members} member document(s) for users gone longer than ${this.client.imports.time(USER_GRACE_PERIOD)}.`);
        }

        await this.sweepDepartedProfiles(now, cutoff).catch(e => this.client.log('ERROR', '[Garbage] Profile sweep failed:', e));
    }

    async sweepDepartedProfiles(now, cutoff)
    {
        if (!this.client._trueRelaxy)
        {
            return;
        }

        const database = this.client.module.database;
        const live = await this.fleetSnapshot();

        if (!live)
        {
            return;
        }

        const liveIds = [...live];

        const stale = [];

        for (const id of liveIds)
        {
            const guild = await database.Guild(id);

            if (now - (guild?.ps ?? 0) >= PRESENCE_STALE_LIMIT)
            {
                stale.push(id);
            }
        }

        if (stale.length > 0)
        {
            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('DEBUG', `[Garbage] ${stale.length} of ${liveIds.length} live guild(s) have rosters older than ${this.client.imports.time(PRESENCE_STALE_LIMIT)} (or have never been reconciled). Profiles cannot be judged out of scope yet; waiting for the presence sweep to catch up.`);
            }

            return;
        }

        const departed = await database.findDepartedProfiles(cutoff, DEPARTED_PROFILES_PER_SWEEP);

        let purged = 0;
        let documents = 0;

        for (const profile of departed)
        {

            const evidence = await database.membershipEvidence(profile.id, liveIds);

            if (evidence.live > 0 || evidence.departed === 0)
            {
                await this.setProfileMark(profile.id, 0);
                continue;
            }

            const deleted = await database.purgeUser(profile.id);

            await this.client.cluster.broadcastEval((client, { id }) => client.module.database.dropUser(id), { context: { id: profile.id } }).catch(error => this.client.log('WARN', `[Garbage] Purged profile ${profile.id} but could not clear it from every cluster's cache (${error?.message ?? error}). A stale copy may be re-inserted.`));

            purged++;
            documents += Object.values(deleted).reduce((sum, count) => sum + count, 0);
        }

        if (purged > 0)
        {
            this.client.log('DATA', `[Garbage] Purged ${purged} profile(s) (${documents} document(s)) for users absent from every guild for over ${this.client.imports.time(USER_GRACE_PERIOD)}.`);
        }

        const unmarked = await database.findUnmarkedProfiles(this._profileCursor ?? '', DEPARTED_PROFILES_PER_SWEEP);
        this._profileCursor = unmarked.length > 0
            ? unmarked[unmarked.length - 1].id
            : '';

        let marked = 0;

        for (const profile of unmarked)
        {
            const evidence = await database.membershipEvidence(profile.id, liveIds);
            if (evidence.live > 0 || evidence.departed === 0)
            {
                continue;
            }

            await this.setProfileMark(profile.id, now);

            marked++;
        }

        if (marked > 0)
        {
            this.client.log('DATA', `[Garbage] Marked ${marked} profile(s) as out of scope. They are purged in ${this.client.imports.time(USER_GRACE_PERIOD)} unless the user is seen again.`);
        }
    }

    async sweepDeletedGuilds()
    {

        if (!this.client._trueRelaxy || !this.client.isReady())
        {
            return;
        }

        const now = Date.now();

        const marked = (await this.client.module.database.getGuilds({
            dm: {
                $gt: 0,
                $lt: now - PURGE_GRACE_PERIOD
            }
        })) ?? [];

        if (!marked.length)
        {
            return;
        }

        const fleetSize = (await this.client.cluster.fetchClientValues('guilds.cache.size').catch(() => []))
            .reduce((total, size) => total + (size ?? 0), 0);

        const fleetLimit = Math.max(PURGE_MAX_PER_SWEEP, Math.floor(fleetSize * PURGE_MAX_FLEET_FRACTION));

        if (marked.length > PURGE_MAX_PER_SWEEP && marked.length > fleetLimit)
        {
            this.client.data.errors++;

            this.client.log('ERROR', `[Garbage] REFUSING TO PURGE. ${marked.length} guilds are eligible at once (fleet: ${fleetSize}), which looks like an incident rather than ${marked.length} genuine removals. Nothing was deleted. Investigate, then re-run manually if this really is correct.`);

            return this.client.clog(`${marked.length} guild(s) became eligible for purging at once against a fleet of ${fleetSize}. That is an incident, not attrition - **nothing was deleted**. Investigate before the next sweep.`, 'PURGE REFUSED - CIRCUIT BREAKER', 'bad');
        }

        for (const guild of marked)
        {
            const guildId = guild.id;

            if (!guildId)
            {
                continue;
            }

            let presence;

            try
            {
                presence = await this.client.cluster.broadcastEval((client, { id }) => client.guilds.cache.has(id), { context: { id: guildId } });
            }
            catch (error)
            {
                this.client.log('WARN', `[Garbage] Could not confirm Relaxy is absent from guild ${guildId} (${error?.message ?? error}). Skipping it - a guild is never purged on an unconfirmed check.`);
                continue;
            }

            if (!Array.isArray(presence) || presence.length === 0 || presence.some(Boolean))
            {
                this.client.log('WARN', `[Garbage] Guild ${guildId} is still visible to the fleet (or the check returned nothing) - Relaxy is evidently still in it. Clearing its deletion mark instead of purging.`);

                await this.client.save(guildId, {
                    alter: 'dm',
                    value: -1
                });

                continue;
            }

            const deleted = await this.client.module.database.purgeGuild(guildId);
            const total = Object.values(deleted).reduce((sum, count) => sum + count, 0);

            this.client.log('DATA', `[Garbage] Purged guild ${guildId} - removed Relaxy ${this.client.imports.time(now - guild.dm)} ago, absent from every cluster. Deleted ${total} document(s): ${Object.entries(deleted).map(([model, count]) => `${count} ${model}`).join(', ') || 'none'}.`);

            this.client.clog(`\`${guildId}\` - removed Relaxy over ${this.client.imports.time(PURGE_GRACE_PERIOD)} ago. Purged ${total} document(s).`, 'GUILD DATA PURGED', 'bad');
        }
    }

    async handle(eventName, ...data)
    {
        if (!this.supportedEvents.includes(eventName))
        {
            return;
        }

        const guildId = data[0]?.guild?.id ?? data[0]?.guildId ?? data[0]?.guild ?? data[0]?.id ?? data[1]?.guild?.id ?? data[1]?.guildId;

        if (this.client.flags.logs.garbage_collector)
        {
            this.client.log('WARN', `[Garbage] Determined guildId for ${eventName} (ID: ${guildId})`);
        }

        if (this.client.utils.blacklisted(guildId) > 1)
        {
            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('DATA', `[Garbage] Guild ${guildId} is blacklisted - standing down (${eventName}); the blacklist sweep owns its teardown and purge.`);
            }

            return;
        }

        const guild = await this.client.module.database.Guild(guildId);

        if (!guild)
        {
            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('WARN', `[Garbage] Could not fetch guild data for event ${eventName} (ID: ${guildId}). Skipping.`);
            }

            return;
        }

        if (this.client.flags.logs.garbage_collector)
        {
            this.client.log('DATA', `[Garbage] Handling op "${eventName}" for Guild ${guild.id} | Data:\n\n${this.client.imports.beautify(data, null, 4, 80)} `);
        }

        const deletedDbItems = {};
        const savedConfigs = [];

        const trackDeletion = (type, id) =>
        {
            if (!deletedDbItems[type])
            {
                deletedDbItems[type] = [];
            }

            deletedDbItems[type].push(id);
        };

        const trackSave = (alter) =>
        {
            if (!savedConfigs.includes(alter))
            {
                savedConfigs.push(alter);
            }
        };

        const logAndSave = (guildIdToSave, ...alters) =>
        {
            if (this.client.flags.logs.garbage_collector)
            {
                const alterPaths = alters.map(a => typeof a === 'string'
                    ? a
                    : a.alter).join(', ');
                this.client.log('DEBUG', `[Garbage] Saving config for Guild ${guildIdToSave}: ${alterPaths}`);
                alters.forEach(a => trackSave(typeof a === 'string'
                    ? a
                    : a.alter));
            }

            return this.client.save(guildIdToSave, ...alters);
        };

        switch (eventName)
        {

            case 'channelDelete':
            case 'threadDelete':
            {
                await this.cleanupChannelReferences(data[0], guild, trackDeletion, logAndSave);
            }
                break;

            case 'messageDelete':
            {
                const message = data[0];
                const messageId = message.id;

                await this.cleanupHeartBoardPost(message, trackDeletion);

                const forum = await this.client.module.database.findForumChannel(message?.channel?.parent?.id, guild.id);

                if (forum && forum.ck && forum.ck.og && message.channel?.parent?.id === forum.id && message.channel.type === Discord.ChannelType.PublicThread)
                {
                    if (this.client.flags.logs.garbage_collector)
                    {
                        this.client.log('DEBUG', `[Garbage] Message ${messageId} was likely the original post in forum thread ${message.channel.id} (Forum channel ${forum.id}, Guild ${guild.id}). Checking for thread deletion.`);
                    }

                    try
                    {
                        await this.client.getMessage(message.channel, null, true);
                    }
                    catch
                    {
                        if (this.client.flags.logs.garbage_collector)
                        {
                            this.client.log('DEBUG', `[Garbage] Original message for forum thread ${message.channel.id} not found. Deleting thread channel.`);
                        }

                        await this.client.delete(message.channel, 'RelaxyGarbageCollection');
                    }
                }

                if (this.client.flags.logs.garbage_collector)
                {
                    this.client.log('DEBUG', `[Garbage] Checking if message ${messageId} had Reaction Roles.`);
                }

                const reactionRoleDoc = await this.client.module.database.getReactionRoles(guild.id);
                const remainingReactionRoles = reactionRoleDoc.e.filter(rr => rr.id !== messageId);

                if (reactionRoleDoc.e.length !== remainingReactionRoles.length)
                {
                    await this.client.module.database.setReactionRoles(guild.id, remainingReactionRoles);
                }

                const channelId = message?.channel?.id;
                const panels = guild.tk?.sy?.[channelId];

                if (Array.isArray(panels) && panels.includes(messageId))
                {
                    if (this.client.flags.logs.garbage_collector)
                    {
                        this.client.log('DEBUG', `[Garbage] Message ${messageId} was a ticket system panel in ${channelId}. Removing the system.`);
                    }

                    await this.client.module.database.deleteTicketSystem({
                        g:   guild.id,
                        c:   channelId,
                        mid: messageId
                    });

                    trackDeletion('TicketSystem', messageId);

                    const systems = { ...guild.tk.sy };
                    const remaining = panels.filter(panel => panel !== messageId);

                    if (remaining.length > 0)
                    {
                        systems[channelId] = remaining;
                    }
                    else
                    {
                        delete systems[channelId];
                    }

                    const alters = [
                        {
                            alter: 'tk.sy',
                            value: systems
                        }
                    ];

                    if (Object.keys(systems).length === 0 && guild.tk.on)
                    {
                        alters.push({
                            alter: 'tk.on',
                            value: false
                        });
                    }

                    await logAndSave(guild.id, ...alters);
                }
            }
                break;

            case 'messageDeleteBulk':
            {

                const messages = data[0];
                const deletedIds = new Set();

                for (const message of messages.values())
                {
                    deletedIds.add(message.id);
                    await this.cleanupHeartBoardPost(message, trackDeletion);
                }

                const reactionRoleDoc = await this.client.module.database.getReactionRoles(guild.id);
                if (reactionRoleDoc.e.length)
                {
                    const remaining = reactionRoleDoc.e.filter(rr => !deletedIds.has(rr.id));

                    if (remaining.length !== reactionRoleDoc.e.length)
                    {
                        if (this.client.flags.logs.garbage_collector)
                        {
                            this.client.log('DEBUG', `[Garbage] Bulk delete removed ${reactionRoleDoc.e.length - remaining.length} Reaction Role message(s) in Guild ${guild.id}.`);
                        }

                        await this.client.module.database.setReactionRoles(guild.id, remaining);
                    }
                }
            }
                break;

            case 'roleDelete':
            {
                const role = data[0];
                const roleId = role.id;

                if (guild.d.mut.id !== '' && roleId === guild.d.mut.id)
                {
                    await logAndSave(guild.id, {
                        alter: 'd.mut.id',
                        value: ''
                    });
                }

                const forumChannels = await this.client.module.database.findForumChannels(guild.id);

                if (this.client.flags.logs.garbage_collector && forumChannels.length > 0)
                {
                    this.client.log('DEBUG', `[Garbage] Checking ${forumChannels.length} ForumChannels in guild ${guild.id} for role ${roleId} references.`);
                }

                for await (const channel of forumChannels)
                {
                    if (channel.rl && channel.rl.includes(roleId))
                    {
                        if (this.client.flags.logs.garbage_collector)
                        {
                            this.client.log('DEBUG', `[Garbage] Removing role ${roleId} from ForumChannel ${channel.id}.`);
                        }

                        channel.rl = channel.rl.filter(r => r !== roleId);

                        await this.client.saveForum(channel.id, guild.id, {
                            alter: 'rl',
                            value: channel.rl
                        });

                        if (this.client.flags.logs.garbage_collector)
                        {
                            this.client.log('DEBUG', `[Garbage] Saved updated ForumChannel ${channel.id} after removing role ${roleId}.`);
                        }
                    }
                }

                if (guild.rl.a && guild.rl.a.includes(roleId))
                {
                    if (this.client.flags.logs.garbage_collector)
                    {
                        this.client.log('DEBUG', `[Garbage] Removing role ${roleId} from Auto Roles config.`);
                    }

                    const remainingAutoRoles = guild.rl.a.filter(r => r !== roleId);
                    await logAndSave(guild.id, {
                        alter: 'rl.a',
                        value: remainingAutoRoles
                    });
                }

                if (guild.ap?.tr?.includes(roleId))
                {
                    const remainingThreadRoles = guild.ap.tr.filter(r => r !== roleId);

                    if (this.client.flags.logs.garbage_collector)
                    {
                        this.client.log('DEBUG',
                            `[Garbage] Removing role ${roleId} from the ban-appeal thread roles of guild ${guild.id}.${remainingThreadRoles.length
                                ? ''
                                : ' It was the last one, so appeals go back to one shared channel.'}`);
                    }

                    await logAndSave(guild.id, {
                        alter: 'ap.tr',
                        value: remainingThreadRoles
                    });
                }

                await this.cleanupReactionRolesByRole(guild, roleId, logAndSave);

                await this.cleanupIdReferences(guild, roleId, logAndSave);

                if (guild.rt)
                {
                    let restrictorChanged = false;

                    for (const tierKey of [
                        '1',
                        '2',
                        '3',
                        '4'
                    ])
                    {
                        const tier = guild.rt[tierKey];

                        if (!tier || typeof tier !== 'object')
                        {
                            continue;
                        }

                        if (Object.prototype.hasOwnProperty.call(tier, roleId))
                        {
                            delete tier[roleId];
                            restrictorChanged = true;
                        }

                        for (const key of Object.keys(tier))
                        {
                            if (Array.isArray(tier[key]) && tier[key].includes(roleId))
                            {
                                tier[key] = tier[key].filter(r => r !== roleId);
                                restrictorChanged = true;
                            }
                        }
                    }

                    if (restrictorChanged)
                    {
                        if (this.client.flags.logs.garbage_collector)
                        {
                            this.client.log('DEBUG', `[Garbage] Removed role ${roleId} from Restrictor config in Guild ${guild.id}.`);
                        }

                        await logAndSave(guild.id, {
                            alter: 'rt',
                            value: guild.rt
                        });
                    }
                }
            }
                break;

            case 'emojiDelete':
            {
                const emoji = data[0];
                const emojiId = emoji.id;

                const emojiMatches = (stored) => typeof stored === 'string' && !!emojiId && stored.includes(emojiId);

                const reactionRoleDoc = await this.client.module.database.getReactionRoles(guild.id);
                if (reactionRoleDoc.e.length)
                {
                    let changed = false;
                    const updated = [];

                    for (const rr of reactionRoleDoc.e)
                    {
                        if (Array.isArray(rr.emojis) && rr.emojis.some(emojiMatches))
                        {
                            changed = true;

                            const keptEmojis = [];
                            const keptRoles = [];

                            rr.emojis.forEach((e, i) =>
                            {
                                if (!emojiMatches(e))
                                {
                                    keptEmojis.push(e);

                                    if (Array.isArray(rr.roles))
                                    {
                                        keptRoles.push(rr.roles[i]);
                                    }
                                }
                            });

                            rr.emojis = keptEmojis;

                            if (Array.isArray(rr.roles))
                            {
                                rr.roles = keptRoles;
                            }
                        }

                        if (Array.isArray(rr.emojis) && rr.emojis.length === 0)
                        {
                            changed = true;
                            continue;
                        }

                        updated.push(rr);
                    }

                    if (changed)
                    {
                        if (this.client.flags.logs.garbage_collector)
                        {
                            this.client.log('DEBUG', `[Garbage] Removed deleted emoji ${emojiId} from Reaction Roles in Guild ${guild.id}.`);
                        }

                        await this.client.module.database.setReactionRoles(guild.id, updated);
                    }
                }

                const forumChannels = await this.client.module.database.findForumChannels(guild.id);

                for (const channel of forumChannels)
                {
                    if (channel.em && emojiMatches(channel.em))
                    {
                        if (this.client.flags.logs.garbage_collector)
                        {
                            this.client.log('DEBUG', `[Garbage] Clearing deleted emoji ${emojiId} from ForumChannel ${channel.id}.`);
                        }

                        await this.client.saveForum(channel.id, guild.id, {
                            alter: 'em',
                            value: ''
                        });
                    }
                }
                const heartBoards = await this.client.module.database.getHeartBoardChannels({ g: guild.id });

                for (const board of heartBoards)
                {
                    if (Array.isArray(board.em) && board.em.some(emojiMatches))
                    {
                        if (this.client.flags.logs.garbage_collector)
                        {
                            this.client.log('DEBUG', `[Garbage] Removing deleted emoji ${emojiId} from HeartBoard ${board.id}.`);
                        }

                        await this.client.saveHeartBoard(board.id, guild.id, {
                            alter: 'em',
                            value: board.em.filter(e => !emojiMatches(e))
                        });
                    }
                }
            }
                break;

            case 'guildMemberRemove':
            {
                const member = data[0];
                const memberId = member.id;
                const guildId = member.guild.id;

                this.client.cacheFor(guildId, `${memberId}_leave`, 60 * 1000);

                await this.cleanupIdReferences(guild, memberId, logAndSave);

                if (guild.co?.last === memberId)
                {
                    await logAndSave(guildId, {
                        alter: 'co.last',
                        value: ''
                    });
                }

                await this.client.module.database.setMemberMarks(guildId, [memberId], Date.now());
                await this.invalidateMembers(guildId, [memberId]);

                if (this.client.flags.logs.garbage_collector)
                {
                    this.client.log('DEBUG', `[Garbage] Member ${memberId} left Guild ${guildId}. Cleared cache and any permission references.`);
                }
            }
                break;

            case 'guildDelete':
            {
                const guildToDelete = data[0];
                const guildIdToDelete = guildToDelete?.id ?? guildToDelete;

                if (guildToDelete?.available === false)
                {
                    return this.client.log('WARN', `[Garbage] Guild ${guildIdToDelete} went UNAVAILABLE (Discord-side outage) - not marking it for deletion. It should come back on its own.`);
                }

                if (this.client.flags.logs.garbage_collector)
                {
                    this.client.log('DEBUG', `[Garbage] Guild ${guildIdToDelete} removed Relaxy. Marking for deletion; its data is purged only after the grace period, and only after re-confirming Relaxy is genuinely not in it.`);
                }

                await logAndSave(guildIdToDelete, {
                    alter: 'dm',
                    value: Date.now()
                });
            }
                break;
        }

        if (this.client.flags.logs.garbage_collector && (Object.keys(deletedDbItems).length > 0 || savedConfigs.length > 0))
        {
            let summary = `[Garbage - ${eventName} Cleanup] Guild ${guild.id}:`;

            if (Object.keys(deletedDbItems).length > 0)
            {
                summary += ` Deleted DB items: ${Object.entries(deletedDbItems).map(([type, ids]) => `${ids.length} ${type}(s) (IDs: ${ids.join(', ')})`).join('; ')}.`;
            }

            if (savedConfigs.length > 0)
            {
                if (eventName === 'guildDelete' && savedConfigs.includes('deletionMark'))
                {
                    summary += ` Marked Guild ${guild.id} for deletion.`;
                }
                else if (savedConfigs.length > 0)
                {
                    summary += ` Saved Guild config updates: ${savedConfigs.join(', ')}.`;
                }
            }

            if (Object.keys(deletedDbItems).length === 0 && savedConfigs.length === 0 && eventName !== 'guildMemberRemove')
            {
                summary += ` No database cleanup actions performed.`;
            }

            if (eventName === 'guildMemberRemove')
            {
                summary = `[Garbage - ${eventName} Cleanup] Guild ${guild.id}: Member ${data[0]?.id} left. Cache updated. No database deletions.`;
            }

            this.client.log('DATA', summary);
        }
        else if (this.client.flags.logs.garbage_collector)
        {
            this.client.log('DATA', `[Garbage - ${eventName} Cleanup] Guild ${guild.id}: No relevant configuration found for cleanup.`);
        }
    }

    async cleanupIdReferences(guild, id, logAndSave)
    {
        const alters = [];

        for (const [path, list] of [
            [
                'mbr.ex',
                guild.mbr?.ex
            ],
            [
                'mbr.el',
                guild.mbr?.el
            ]
        ])
        {
            if (Array.isArray(list) && list.includes(id))
            {
                alters.push({
                    alter: path,
                    value: list.filter(entry => entry !== id)
                });
            }
        }

        const grants = guild.cmd?.gr;

        if (grants && typeof grants === 'object')
        {
            let changed = false;
            const next = {};

            for (const [command, list] of Object.entries(grants))
            {
                if (!Array.isArray(list))
                {
                    next[command] = list;
                    continue;
                }

                const remaining = list.filter(entry => entry !== id);

                if (remaining.length !== list.length)
                {
                    changed = true;
                }

                if (remaining.length > 0)
                {
                    next[command] = remaining;
                }
                else if (list.length > 0)
                {

                    changed = true;
                }
            }

            if (changed)
            {
                alters.push({
                    alter: 'cmd.gr',
                    value: next
                });
            }
        }

        if (!alters.length)
        {
            return;
        }

        if (this.client.flags.logs.garbage_collector)
        {
            this.client.log('DEBUG', `[Garbage] Removing ${id} from ${alters.map(a => a.alter).join(', ')} in Guild ${guild.id}.`);
        }

        await logAndSave(guild.id, ...alters);
    }

    async cleanupChannelReferences(channel, guild, trackDeletion, logAndSave)
    {
        const channelId = channel.id;

        if (guild.hb.cs.includes(channelId))
        {
            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('DEBUG', `[Garbage] Channel ${channelId} was a HeartBoard channel. Deleting associated HeartBoard data.`);
            }

            await this.client.module.database.deleteHeartBoard(channelId, guild.id);
            trackDeletion('HeartBoard', channelId);

            const remainingChannelIds = guild.hb.cs.filter(id => id !== channelId);

            if (remainingChannelIds.length === 0)
            {
                await logAndSave(guild.id, {
                    alter: 'hb.on',
                    value: false
                });
            }

            await logAndSave(guild.id, {
                alter: 'hb.cs',
                value: remainingChannelIds
            });
        }

        const currentModlogChannels = this.client.utils.modlogChannels(guild);
        if (currentModlogChannels.includes(channelId))
        {
            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('DEBUG', `[Garbage] Channel ${channelId} was a Modlog channel. Cleaning up modlog event configs.`);
            }

            const entries = Object.entries(guild.ml.ev);
            for (const [key, value] of entries)
            {
                if (value && value.channel === channelId)
                {
                    await logAndSave(guild.id, {
                        alter: `ml.ev.${key}`,
                        value: {
                            on:      false,
                            channel: ''
                        }
                    });
                }
            }

            await this.client.utils.sleep(1500);

            const updatedGuildForModlogCheck = await this.client.module.database.Guild(guild.id);
            const modlogChannelsAfterCleanup = this.client.utils.modlogChannels(updatedGuildForModlogCheck);

            if (modlogChannelsAfterCleanup.length === 0)
            {
                await logAndSave(guild.id, {
                    alter: 'ml.on',
                    value: false
                });
            }
        }

        if (guild.ch.v.pv.find(c => c.id === channelId))
        {
            await logAndSave(guild.id, {
                alter: 'ch.v.pv',
                value: guild.ch.v.pv.filter(c => c.id !== channelId)
            });
        }

        if (guild.ch.t.rs.includes(channelId))
        {
            await logAndSave(guild.id, {
                alter: 'ch.t.rs',
                value: guild.ch.t.rs.filter(id => id !== channelId)
            });
        }

        if (guild.ch.t.cl.some(c => (typeof c === 'string'
            ? c
            : c.id) === channelId))
        {
            await logAndSave(guild.id, {
                alter: 'ch.t.cl',
                value: guild.ch.t.cl.filter(c => (typeof c === 'string'
                    ? c
                    : c.id) !== channelId)
            });
        }

        if (guild.ach.c === channelId)
        {
            await logAndSave(guild.id, {
                alter: 'ach.c',
                value: ''
            });
        }

        if (guild.wc.j.c === channelId)
        {
            await logAndSave(guild.id, {
                alter: 'wc.j.c',
                value: ''
            });
        }

        if (guild.wc.l.c === channelId)
        {
            await logAndSave(guild.id, {
                alter: 'wc.l.c',
                value: ''
            });
        }

        if (guild.lv.on && guild.lv.c === channelId)
        {
            await logAndSave(guild.id, {
                alter: 'lv.on',
                value: false
            }, {
                alter: 'lv.c',
                value: ''
            });
        }

        if (guild.co?.c === channelId)
        {
            await logAndSave(guild.id, {
                alter: 'co.on',
                value: false
            }, {
                alter: 'co.c',
                value: ''
            }, {
                alter: 'co.last',
                value: ''
            });
        }
        if (guild.cn && guild.cn.c === channelId)
        {
            await logAndSave(guild.id, {
                alter: 'cn.c',
                value: ''
            });
        }
        const customBoost = guild.cb;
        if (customBoost)
        {
            for (const tierKey of [
                'b',
                'l1',
                'l2',
                'l3'
            ])
            {
                if (customBoost[tierKey] && customBoost[tierKey].c === channelId)
                {
                    await logAndSave(guild.id, {
                        alter: `cb.${tierKey}.c`,
                        value: ''
                    });
                }
            }
        }
        const reactionRoleDoc = await this.client.module.database.getReactionRoles(guild.id);
        if (reactionRoleDoc.e.length)
        {
            const remaining = reactionRoleDoc.e.filter(rr => rr.channel !== channelId);

            if (remaining.length !== reactionRoleDoc.e.length)
            {
                await this.client.module.database.setReactionRoles(guild.id, remaining);
            }
        }

        try
        {
            let forumChannels = guild.fo.cs;

            if (forumChannels.includes(channelId))
            {
                if (this.client.flags.logs.garbage_collector)
                {
                    this.client.log('DEBUG', `[Garbage] Channel ${channelId} was a Forum channel. Deleting associated ForumChannel data.`);
                }

                await this.client.module.database.deleteForumChannel(channelId, guild.id);
                trackDeletion('ForumChannel', channelId);

                forumChannels = forumChannels.filter(id => id !== channelId);

                await logAndSave(guild.id, {
                    alter: 'fo.cs',
                    value: forumChannels
                });

                if (forumChannels.length === 0)
                {
                    await logAndSave(guild.id, {
                        alter: 'fo.on',
                        value: false
                    });
                }
            }
        }
        catch (e)
        {
            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('ERROR', `[Garbage] Error cleaning up Forum data for channel ${channelId} in guild ${guild.id}:`, e);
                this.client.log('DEBUG', `[Garbage] Resetting Forum config for guild ${guild.id} due to error.`);
            }

            await logAndSave(guild.id, {
                alter: 'fo',
                value: {
                    on: false,
                    cs: []
                }
            });
        }

        try
        {
            let ticketingSystemsConfig = guild.tk.sy;

            if (ticketingSystemsConfig && ticketingSystemsConfig[channelId])
            {
                if (this.client.flags.logs.garbage_collector)
                {
                    this.client.log('DEBUG', `[Garbage] Channel ${channelId} had a ticketing system. Deleting associated TicketSystem data.`);
                }

                await this.client.module.database.deleteTicketSystem({
                    c: channelId,
                    g: guild.id
                });
                trackDeletion('TicketSystem', channelId);

                delete ticketingSystemsConfig[channelId];

                const deletedSystemsFromDiscordCheck = [];
                for (const systemChannelId of Object.keys(ticketingSystemsConfig))
                {
                    try
                    {
                        const discordChannel = await guild.channels.fetch(systemChannelId);

                        if (!discordChannel)
                        {
                            if (this.client.flags.logs.garbage_collector)
                            {
                                this.client.log('DEBUG', `[Garbage] Ticketing system channel ${systemChannelId} in Discord not found. Removing from config.`);
                            }

                            delete ticketingSystemsConfig[systemChannelId];
                            deletedSystemsFromDiscordCheck.push(systemChannelId);
                        }
                    }
                    catch (fetchError)
                    {
                        if (this.client.flags.logs.garbage_collector)
                        {
                            this.client.log('DEBUG', `[Garbage] Error fetching ticketing system channel ${systemChannelId} in Discord: ${fetchError.message}. Removing from config.`);
                        }

                        delete ticketingSystemsConfig[systemChannelId];
                        deletedSystemsFromDiscordCheck.push(systemChannelId);
                    }
                }

                if (deletedSystemsFromDiscordCheck.length > 0)
                {
                    if (this.client.flags.logs.garbage_collector)
                    {
                        this.client.log('DEBUG', `[Garbage] Deleting ${deletedSystemsFromDiscordCheck.length} TicketSystems from DB whose Discord channels are gone.`);
                    }

                    await this.client.module.database.deleteTicketSystem({
                        c: { $in: deletedSystemsFromDiscordCheck },
                        g: guild.id
                    });
                    deletedSystemsFromDiscordCheck.forEach(id => trackDeletion('TicketSystem (Discord Gone)', id));
                }

                await logAndSave(guild.id, {
                    alter: 'tk.sy',
                    value: ticketingSystemsConfig
                });

                if (Object.keys(ticketingSystemsConfig).length === 0)
                {
                    await logAndSave(guild.id, {
                        alter: 'tk.on',
                        value: false
                    });
                }
            }
        }
        catch (e)
        {
            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('ERROR', `[Garbage] Error cleaning up Ticketing data for channel ${channelId} in guild ${guild.id}:`, e);
                this.client.log('DEBUG', `[Garbage] Resetting Ticketing config for guild ${guild.id} due to error.`);
            }

            await logAndSave(guild.id, {
                alter: 'tk',
                value: {
                    on: false,
                    sy: {}
                }
            });
        }
    }

    async cleanupHeartBoardPost(message, trackDeletion)
    {
        const messageId = message?.id;

        const isEmbed = message?.author?.id === this.client.user.id && message?.embeds?.[0]?.footer?.text?.includes('ID:');
        const originalId = isEmbed
            ? message.embeds[0].footer.text.split(' ')[1]
            : messageId;

        const heartBoardPost = await this.client.module.database.findHeardBoardPost(originalId);

        if (heartBoardPost)
        {
            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('DEBUG', `[Garbage] Message ${messageId} was a Heartboard post. Deleting associated HeartBoardPost data (Original ID: ${originalId}).`);
            }

            await this.client.module.database.deleteHeartBoardPost(originalId);
            trackDeletion('HeartBoardPost', originalId);
        }
    }

    async cleanupReactionRolesByRole(guild, roleId, logAndSave)
    {
        const reactionRoleDoc = await this.client.module.database.getReactionRoles(guild.id);
        if (!reactionRoleDoc.e.length)
        {
            return;
        }

        let changed = false;
        const updated = [];

        for (const rr of reactionRoleDoc.e)
        {
            if (Array.isArray(rr.roles) && rr.roles.includes(roleId))
            {
                changed = true;

                const keptRoles = [];
                const keptEmojis = [];

                rr.roles.forEach((r, i) =>
                {
                    if (r !== roleId)
                    {
                        keptRoles.push(r);

                        if (Array.isArray(rr.emojis))
                        {
                            keptEmojis.push(rr.emojis[i]);
                        }
                    }
                });

                rr.roles = keptRoles;

                if (Array.isArray(rr.emojis))
                {
                    rr.emojis = keptEmojis;
                }
            }

            if (Array.isArray(rr.roles) && rr.roles.length === 0)
            {
                changed = true;
                continue;
            }

            updated.push(rr);
        }

        if (changed)
        {
            if (this.client.flags.logs.garbage_collector)
            {
                this.client.log('DEBUG', `[Garbage] Removed role ${roleId} from Reaction Roles in Guild ${guild.id}.`);
            }

            await this.client.module.database.setReactionRoles(guild.id, updated);
        }
    }
}
