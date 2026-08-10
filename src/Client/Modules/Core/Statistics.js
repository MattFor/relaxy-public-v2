'use strict';

import v8     from 'v8';
import os     from 'os';
import Relaxy from '../../Relaxy.js';
import {
    monitorEventLoopDelay,
    performance
}             from 'perf_hooks';

const STATISTICS_LOG_INTERVAL = 60 * 1000;

export default class Statistics
{
    constructor(client)
    {
        this.client = client;

        client.module?.stats?.dispose?.();

        this._counters = new Map();

        this._baselines = new Map();

        this.startedAt = Date.now();

        this._loop = monitorEventLoopDelay({ resolution: 10 });
        this._loop.enable();

        this._timer = setInterval(() =>
        {
            if (!this.client.flags?.logs?.statistics)
            {
                return;
            }

            this.client.log('DATA', this.summary());
        }, STATISTICS_LOG_INTERVAL);

        this._timer.unref?.();

        this.client.log('DATA', 'Statistics collection started.');
    }

    dispose()
    {

        this._loop?.disable();
        this._loop = null;

        clearInterval(this._timer);
        this._timer = null;
    }

    summary()
    {
        const snapshot = this.snapshot('periodic');
        const mb = value => `${(value / 1024 / 1024).toFixed(1)}MB`;

        const top = Object.entries(snapshot.rates)
                          .filter(([name]) => name.startsWith('event.'))
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 3)
                          .map(([name, rate]) => `${name.replace('event.', '')} ${rate.toFixed(1)}/s`)
                          .join(', ');

        return [
            `[Stats] cluster ${snapshot.cluster}${snapshot.trueRelaxy
                ? ' (true)'
                : ''}`,
            `${snapshot.cache.guilds}g/${snapshot.cache.memberCount.toLocaleString()}m`,
            `rss ${mb(snapshot.memory.rss)}`,
            `heap ${mb(snapshot.memory.heapUsed)}/${mb(snapshot.memory.heapLimit)}`,
            `cpu ${snapshot.cpu.percent.toFixed(1)}%`,
            `loop ${(snapshot.loop.utilization * 100).toFixed(1)}% p99 ${snapshot.loop.delay
                ? `${snapshot.loop.delay.p99.toFixed(1)}ms`
                : '?'}`,
            `ping ${Math.round(snapshot.gateway.ping)}ms`,
            `dbq ${snapshot.database?.queued ?? 0}`,
            `err ${snapshot.health.errors}/warn ${snapshot.health.warns}`,
            top
        ].filter(Boolean).join(' | ');
    }

    count(name, by = 1)
    {
        this._counters.set(name, (this._counters.get(name) ?? 0) + by);
    }

    get(name)
    {
        return this._counters.get(name) ?? 0;
    }

    snapshot(consumer = 'default')
    {
        const now = Date.now();
        const memory = process.memoryUsage();
        const heap = v8.getHeapStatistics();
        const baseline = this._baselines.get(consumer);

        const cpu = process.cpuUsage(baseline?.cpu);
        const elu = performance.eventLoopUtilization(baseline?.elu);

        const windowMs = baseline
            ? now - baseline.at
            : now - this.startedAt;

        const cpuPercent = windowMs > 0
            ? ((cpu.user + cpu.system) / 1000 / windowMs) * 100
            : 0;

        const loop = this._loop
            ? {
                min:  this._loop.min / 1e6,
                mean: this._loop.mean / 1e6,
                max:  this._loop.max / 1e6,
                p50:  this._loop.percentile(50) / 1e6,
                p90:  this._loop.percentile(90) / 1e6,
                p99:  this._loop.percentile(99) / 1e6
            }
            : null;

        const counters = Object.fromEntries(this._counters);

        const rates = {};

        if (baseline && windowMs > 0)
        {
            for (const [name, value] of this._counters)
            {
                const previous = baseline.counters[name] ?? 0;

                rates[name] = ((value - previous) / windowMs) * 1000;
            }
        }

        const snapshot = {
            at:         now,
            cluster:    this.client.cluster?.id ?? 0,
            trueRelaxy: Boolean(this.client._trueRelaxy),
            pid:        process.pid,

            uptime: {

                process: Math.round(process.uptime() * 1000),
                client:  this.client.uptime ?? 0,
                since:   this.startedAt
            },

            gateway: {
                ready: this.client.isReady(),

                ping:   this.client.ws?.ping ?? -1,
                shards: [...(this.client.ws?.shards?.values() ?? [])].map(shard => ({
                    id:     shard.id,
                    status: shard.status,
                    ping:   shard.ping
                }))
            },

            cache: {

                guilds:      this.client.guilds?.cache?.size ?? 0,
                unavailable: [...(this.client.guilds?.cache?.values() ?? [])].filter(guild => guild.available === false).length,
                channels:    this.client.channels?.cache?.size ?? 0,
                users:       this.client.users?.cache?.size ?? 0,
                emojis:      this.client.emojis?.cache?.size ?? 0,
                members:     [...(this.client.guilds?.cache?.values() ?? [])].reduce((total, guild) => total + (guild.members?.cache?.size ?? 0), 0),
                memberCount: [...(this.client.guilds?.cache?.values() ?? [])].reduce((total, guild) => total + (guild.memberCount ?? 0), 0)
            },

            database: this._database(),

            memory: {
                rss:          memory.rss,
                heapUsed:     memory.heapUsed,
                heapTotal:    memory.heapTotal,
                external:     memory.external,
                arrayBuffers: memory.arrayBuffers,

                heapLimit: heap.heap_size_limit
            },

            cpu: {
                percent: cpuPercent,
                user:    cpu.user,
                system:  cpu.system,
                cores:   os.cpus().length
            },

            loop: {
                delay: loop,

                utilization: elu.utilization
            },

            health: {
                errors:      this.client.data?.errors ?? 0,
                warns:       this.client.data?.warns ?? 0,
                swallowed:   this.client.data?.swallowed ?? 0,
                netIssues:   this.client.data?.net_issues ?? 0,
                musicIssues: this.client.data?.music_issues ?? 0
            },

            music: this._music(),

            counters,
            rates,
            consumer,
            window: baseline
                        ? windowMs
                        : null
        };

        this._baselines.set(consumer, {
            at:  now,
            counters,
            cpu: process.cpuUsage(),
            elu: performance.eventLoopUtilization()
        });

        return snapshot;
    }

    _database()
    {
        const database = this.client.module?.database;

        if (!database)
        {
            return null;
        }

        const caches = {};

        for (const [name, cache] of Object.entries(database._cache ?? {}))
        {
            if (cache instanceof Map)
            {
                caches[name] = cache.size;
            }
        }

        return {
            queued:     database._dirty?.size ?? 0,
            registries: database._registries?.size ?? 0,
            caches
        };
    }

    _music()
    {
        const queues = this.client.player?.nodes?.cache;

        if (!queues)
        {
            return null;
        }

        const all = [...queues.values()];

        return {
            queues:    all.length,
            playing:   all.filter(queue => queue.node?.isPlaying?.()).length,
            tracks:    all.reduce((total, queue) => total + (queue.tracks?.size ?? 0), 0),
            listeners: all.reduce((total, queue) => total + (queue.channel?.members?.filter(member => !member.user.bot)?.size ?? 0), 0)
        };
    }
}
