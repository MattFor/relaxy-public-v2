'use strict';

import { getGlobalRegistry } from '../MusicPlayer/utils/__internal__/getGlobalRegistry.js';

const LEAD_MS = 20 * 1000;
const MIN_TRACK_MS = 45 * 1000;
const MAX_AGE_MS = 90 * 1000;

export default class MusicPrefetcher
{
    constructor(client)
    {
        this.client = client;

        this.ready = new Map();

        this.timers = new Map();

        this.inFlight = new Set();
    }

    install()
    {
        getGlobalRegistry().set('@[onBeforeCreateStream]', async (track) => this.take(track));

        this.client.log('DEBUG', `[prefetch] installed (lead ${LEAD_MS / 1000}s)`);
    }

    take(track)
    {
        const entry = this.ready.get(track?.id);

        if (!entry)
        {
            return null;
        }

        this.ready.delete(track.id);

        if (Date.now() - entry.at > MAX_AGE_MS || entry.stream.destroyed)
        {
            this.#discard(entry.stream);
            return null;
        }

        this.client.log('DEBUG', `[prefetch] HIT ${track.title?.slice(0, 40)}`);

        return entry.stream;
    }

    onTrackStart(queue, track)
    {
        const guildId = queue?.guild?.id ?? queue?.metadata?.guild?.id;

        if (!guildId)
        {
            return;
        }

        this.#clearTimer(guildId);

        const duration = Number(track?.durationMS);

        if (!Number.isFinite(duration) || duration < MIN_TRACK_MS)
        {
            return;
        }

        const delay = duration - LEAD_MS;

        const timer = setTimeout(() => this.#prefetchNext(queue, guildId), delay);

        timer.unref?.();

        this.timers.set(guildId, timer);
    }

    onQueueEnd(queue)
    {
        const guildId = queue?.guild?.id ?? queue?.metadata?.guild?.id;

        if (guildId)
        {
            this.#clearTimer(guildId);
        }

        this.sweep();
    }

    sweep()
    {
        for (const [id, entry] of this.ready)
        {
            if (Date.now() - entry.at > MAX_AGE_MS)
            {
                this.ready.delete(id);
                this.#discard(entry.stream);
            }
        }
    }

    async #prefetchNext(queue, guildId)
    {
        this.timers.delete(guildId);

        const next = queue?.tracks?.at?.(0) ?? queue?.tracks?.store?.[0];

        if (!next || !next.extractor?.stream || this.ready.has(next.id) || this.inFlight.has(next.id))
        {
            return;
        }

        if (!queue.node?.isPlaying?.())
        {
            return;
        }

        this.inFlight.add(next.id);

        try
        {

            const stream = await next.extractor.stream(next);

            if (!stream || this.ready.has(next.id))
            {
                this.#discard(stream);
                return;
            }

            this.ready.set(next.id, {
                stream,
                at: Date.now()
            });

            this.client.log('DEBUG', `[prefetch] warming ${next.title?.slice(0, 40)}`);
        }
        catch (error)
        {

            this.client.log('DEBUG', `[prefetch] failed for ${next.title?.slice(0, 40)}: ${error?.message ?? error}`);
        }
        finally
        {
            this.inFlight.delete(next.id);
        }
    }

    #clearTimer(guildId)
    {
        const timer = this.timers.get(guildId);

        if (timer)
        {
            clearTimeout(timer);
            this.timers.delete(guildId);
        }
    }

    #discard(stream)
    {
        try
        {
            stream?.destroy?.();
        }
        catch
        {

        }
    }
}
