'use strict';

import time    from 'pretty-ms';
import Manager from '../Manager.js';
import IS_VOID from '../../../detect_os.js';

class RingBuffer
{
    constructor(size)
    {
        this.idx = 0;
        this.buf = new Array(size).fill(null);
    }

    push(item)
    {
        this.buf[this.idx] = item;
        this.idx = (this.idx + 1) % this.buf.length;
    }

    entries()
    {
        return this.buf;
    }
}

export class HeartbeatManager
{
    constructor(options = {})
    {
        this.options = {

            beatInterval: 5000,

            checkInterval:       IS_VOID
                                     ? 5000
                                     : 10000,
            maxMissedHeartbeats: IS_VOID
                                     ? 12
                                     : 32,
            startupGrace:        180000, ...options
        };

        if (options.interval && !options.beatInterval)
        {
            this.options.beatInterval = options.interval;
        }

        this.options.interval = this.options.beatInterval;
        this.clusters = new Map();
        this.manager = null;
        this.name = 'heartbeat';
        this.heartbeatHistory = {};
    }

    build(manager)
    {
        manager[this.name] = this;
        this.manager = manager;
    }

    startClusterHeartbeat(cluster)
    {
        this.clusters.get(cluster.id)?.stop();

        this.heartbeatHistory[cluster.id] = new RingBuffer(10);

        const hb = new Heartbeat(this, cluster, this.options);
        this.clusters.set(cluster.id, hb);

        this.manager.info('HEARTBEAT', `Successfully attached to Cluster #${cluster.id}!`);
    }

    stop(cluster, reason)
    {
        const hb = this.clusters.get(cluster.id);
        if (!hb)
        {
            return;
        }

        hb.stop();
        this.manager.debug('HEARTBEAT', `Cluster #${cluster.id} ${reason}`);

        if (cluster.restarts.current < cluster.restarts.max)
        {
            cluster.respawn(this.manager.spawnOptions, reason);
            this.manager.debug('HEARTBEAT', `Respawning Cluster #${cluster.id}`);
        }
        else
        {
            this.manager.debug('HEARTBEAT', `Not Respawning Cluster #${cluster.id} => Respawn Rejected | Max Restarts Reached`);
        }
    }

    ack(id, date)
    {
        const hb = this.clusters.get(id);
        if (!hb)
        {
            return;
        }

        if (hb.suffocate)
        {
            return;
        }

        hb.ack(date);

        const ackTime = Math.max(1, Math.ceil(Date.now() - date));
        this.heartbeatHistory[id].push({
            init:     date,
            duration: ackTime
        });

        if (this.manager.flags.logs.heartbeats)
        {
            this.manager.debug('HEARTBEAT', `Cluster #${id} ACK+ [${time(ackTime)}]`);
        }
    }
}

export class Heartbeat
{
    constructor(manager, instance, options)
    {
        this.manager = manager;
        this.instance = instance;
        this.options = options;

        this.heartbeats = new Map();
        this.totalHeartbeats = 0;
        this.missed = 0;
        this.imbalance = false;
        this.missedTimeout = options.maxMissedHeartbeats;
        this.suffocate = false;

        this.lastBeat = Date.now();
        this._checkInterval = null;

        this.start();
    }

    ack(date)
    {
        this.totalHeartbeats++;
        this.lastBeat = Date.now();
        this.missed = 0;
        this.imbalance = false;
        this.missedTimeout = this.options.maxMissedHeartbeats;
    }

    start()
    {

        const interval = this.options.beatInterval ?? this.options.interval;
        const maxMissed = this.options.maxMissedHeartbeats;
        const checkEvery = this.options.checkInterval ?? interval;

        this._checkInterval = setInterval(() =>
        {
            const elapsed = Date.now() - this.lastBeat;
            const missedCount = Math.floor(elapsed / interval);

            this.missed = missedCount;
            this.imbalance = missedCount > 0;
            this.missedTimeout = Math.max(0, maxMissed - missedCount);

            if (this.imbalance && this.manager.manager.flags.logs.heartbeats)
            {
                this.manager.manager.warn('HEARTBEAT', `! Cluster #${this.instance.id} silent for ${time(elapsed)} (${missedCount}/${maxMissed} missed) !`);
            }

            const startupGrace = this.options.startupGrace ?? 180000;
            const inStartupGrace = this.totalHeartbeats === 0 && elapsed < startupGrace;

            if (this.suffocate || (missedCount >= maxMissed && !inStartupGrace))
            {
                this.suffocate = true;
                this.manager.stop(this.instance, `Missed ${missedCount} Heartbeats (silent ${time(elapsed)}) | Attempting Respawn`);
            }
        }, checkEvery);
    }

    stop()
    {
        clearInterval(this._checkInterval);
        this._checkInterval = null;
        this.heartbeats.clear();
    }

    resume()
    {
        this.stop();
        this.missed = 0;
        this.imbalance = false;
        this.suffocate = false;
        this.missedTimeout = this.options.maxMissedHeartbeats;
        this.lastBeat = Date.now();
        this.start();
    }
}
