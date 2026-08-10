'use strict';
import os from 'node:os';
import {
    Worker,
    isMainThread
}         from 'node:worker_threads';

const WORKER = new URL('./CardWorker.js', import.meta.url);

const POOL_SIZE = Math.max(1, Math.min(2, (os.cpus()?.length ?? 1) - 1));

const RENDER_TIMEOUT = 30_000;
const MAX_SPAWN_FAILURES = 3;

class CardPool
{
    constructor()
    {
        this.workers = [];
        this.queue = [];
        this.seq = 0;
        this.spawnFailures = 0;
        this.disabled = false;
    }

    _spawn()
    {
        let worker;

        try
        {
            worker = new Worker(WORKER);
        }
        catch
        {
            if (++this.spawnFailures >= MAX_SPAWN_FAILURES)
            {
                this.disabled = true;
            }

            return null;
        }

        const entry = {
            worker,
            job: null
        };

        worker.on('message', message => this._settle(entry, message));

        const die = () =>
        {
            const job = entry.job;
            entry.job = null;

            this.workers = this.workers.filter(item => item !== entry);

            if (job)
            {
                clearTimeout(job.timer);
                job.resolve(null);
            }

            this._drain();
        };

        worker.on('error', die);
        worker.on('exit', die);

        worker.unref();

        this.workers.push(entry);

        return entry;
    }

    _settle(entry, message)
    {
        const job = entry.job;

        if (!job || message?.id !== job.id)
        {
            return;
        }

        entry.job = null;
        clearTimeout(job.timer);

        job.resolve(message?.error
            ? null
            : toBuffer(message.buffer));

        this._drain();
    }

    _drain()
    {
        while (this.queue.length)
        {
            const entry = this.workers.find(item => !item.job) ?? (this.workers.length < POOL_SIZE
                ? this._spawn()
                : null);

            if (!entry)
            {
                return;
            }

            const job = this.queue.shift();

            entry.job = job;

            job.timer = setTimeout(() =>
            {
                if (entry.job === job)
                {
                    entry.job = null;

                    entry.worker.terminate().catch(() =>
                    {
                    });
                    job.resolve(null);
                }
            }, RENDER_TIMEOUT);

            entry.worker.postMessage({
                id:   job.id,
                kind: job.kind,
                data: job.data
            });
        }
    }

    render(kind, data)
    {
        if (this.disabled)
        {
            return Promise.resolve(null);
        }

        return new Promise(resolve =>
        {
            this.queue.push({
                id:    ++this.seq,
                kind,
                data,
                resolve,
                timer: null
            });
            this._drain();
        });
    }
}

const toBuffer = value =>
{
    if (!value)
    {
        return null;
    }

    return Buffer.isBuffer(value)
        ? value
        : Buffer.from(value.buffer ?? value, value.byteOffset ?? 0, value.byteLength ?? value.length);
};

const pool = isMainThread
    ? new CardPool()
    : null;

export async function renderOffThread(kind, data)
{
    if (!pool)
    {
        return null;
    }

    return pool.render(kind, data).catch(() => null);
}
