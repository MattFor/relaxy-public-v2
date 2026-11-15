'use strict';
const BURST_THRESHOLD = 8;
const BURST_WINDOW_MS = 30 * 1000;
const BURST_REPORT_COOLDOWN_MS = 5 * 60 * 1000;
const INVALID_REQUEST_ALARM = 2500;
const ATTRIBUTION_ROUTES = 5;

const SUSPECTS = [
    {
        test: /^GET \/users\/(?::id|\d+)$/,
        cause: 'resolving user profiles one id at a time. The DASHBOARD does this to put names on tables - a moderation list of a few hundred people is a few hundred calls unless they are cached or served from a member map'
    },
    {
        test: /^GET \/guilds\/[^/]+\/members\/(?::id|\d+)$/,
        cause: 'resolving guild members one id at a time. Same story as /users - usually the DASHBOARD drawing names, or a loop that should have paged the roster once instead'
    },
    {
        test: /^GET \/guilds\/[^/]+\/members$/,
        cause: 'paging a full guild roster (privileged-member analysis, member-cache warm-up). One page per 1000 members, so a large guild is a hundred requests - check what invalidated the roster cache'
    },
    {
        test: /^GET \/guilds\/[^/]+\/members\/search$/,
        cause: 'member search - a search box firing per keystroke rather than on a debounce'
    },
    {
        test: /messages\/\d+\/reactions/,
        cause: 'adding or removing reactions ONE AT A TIME. Reaction roles and the heartboard do this - use the bulk removal endpoint where the whole set is going'
    },
    {
        test: /^(?:POST|PATCH) \/channels\/[^/]+\/messages/,
        cause: 'sending or editing messages in a loop - a panel refresh, a log spam, or an announcement fan-out that should be batched'
    },
    {
        test: /^(?:PUT|DELETE|PATCH) \/guilds\/[^/]+\/members\/(?::id|\d+)/,
        cause: 'changing member roles or nicknames in bulk. Level rewards, auto-roles and mute/unmute all live here - a sync loop over a whole guild will do this'
    },
    {
        test: /audit-logs/,
        cause: 'audit-log polling. Check the interval, and that a single fetch is shared between the listeners that need it'
    },
    {
        test: /^GET \/guilds\/[^/]+\/bans/,
        cause: 'paging the ban list - a blacklist sync or a moderation view rebuilding it rather than caching it'
    },
    {
        test: /^GET \/guilds\/[^/]+$/,
        cause: 'refetching guild objects. Usually a cache that is expiring faster than it is being read'
    }
];

const suspectFor = (route) => SUSPECTS.find((s) => s.test.test(route))?.cause ?? null;

export default class RateLimitHandler {
    constructor(client) {
        this.client = client;

        this.buckets = new Map();

        this.recent = new Map();

        this.reported = new Map();

        this.totals = {
            hits: 0,
            global: 0,
            invalid: 0
        };
    }

    attach() {
        const { RESTEvents } = this.client.imports.discord;
        const rest = this.client.rest;

        rest.removeAllListeners(RESTEvents.RateLimited);
        rest.removeAllListeners(RESTEvents.InvalidRequestWarning);

        rest.on(RESTEvents.RateLimited, (info) => this.onRateLimited(info));
        rest.on(RESTEvents.InvalidRequestWarning, (warning) => this.onInvalidRequest(warning));

        this.client.log('DEBUG', '[ratelimits] handler attached.');
    }

    onRateLimited(info) {
        const now = Date.now();
        const route = `${info.method} ${info.route}`;
        const key = `${info.hash}:${info.majorParameter}`;

        this.totals.hits++;

        this.buckets.set(key, {
            route,
            method: info.method,

            resetsAt: now + (info.timeToReset ?? info.retryAfter ?? 0),
            global: Boolean(info.global)
        });

        this.client.collections.ratelimitHits[info.majorParameter] = Object.assign({}, info, { __at: now });

        this.sweep();

        const hits = (this.recent.get(route) ?? []).filter((at) => now - at < BURST_WINDOW_MS);

        hits.push(now);
        this.recent.set(route, hits);

        if (info.global) {
            this.totals.global++;

            const pressure = this.pressure(now);
            const breakdown = pressure.length
                ? pressure.map((p) => `  ${p.route} - ${p.hits}x${p.cause ? ` (probably ${p.cause})` : ''}`).join('\n')
                : '  (no other routes have been limited in this window)';

            this.client.log(
                'ERROR',
                `[ratelimits] GLOBAL rate limit - every request from this bot is queued for ${info.timeToReset}ms.\n` +
                    `[ratelimits] Received on: ${route} (which is usually just whatever fired next, NOT the cause).\n` +
                    `[ratelimits] Busiest routes in the last ${BURST_WINDOW_MS / 1000}s:\n${breakdown}\n` +
                    '[ratelimits] Remember the DASHBOARD authenticates as this same bot and spends the same global budget - if nothing here explains the volume, look at what it is rendering.'
            );

            return this.client.clog(
                `Discord has applied a **global** rate limit.\n` +
                    `Every request from Relaxy! is queued for \`${info.timeToReset}ms\`.\n\n` +
                    `Received on \`${route}\` - which is usually whatever fired next, not the cause.\n\n` +
                    `**Busiest routes (last ${BURST_WINDOW_MS / 1000}s)**\n${
                        pressure.length
                            ? pressure
                                  .map((p) => `\`${p.route}\` - ${p.hits}x${p.cause ? `\n> probably ${p.cause}` : ''}`)
                                  .join('\n')
                            : 'Nothing else has been limited in this window.'
                    }\n\n` +
                    'The dashboard shares this token and this budget - if nothing above explains it, check what it is rendering.',
                '[RATE LIMIT] Global',
                'bad'
            );
        }

        if (hits.length >= BURST_THRESHOLD && now - (this.reported.get(route) ?? 0) > BURST_REPORT_COOLDOWN_MS) {
            this.reported.set(route, now);

            const cause = suspectFor(route);

            return this.client.log(
                'WARN',
                `[ratelimits] ${route} hit its limit ${hits.length}x in ${BURST_WINDOW_MS / 1000}s (bucket allows ${info.limit}/reset).` +
                    ` Something is calling it in a loop - batch it, or use the bulk endpoint.${
                        cause ? `\n[ratelimits] Most likely: ${cause}.` : ''
                    }`
            );
        }

        if (this.client.flags.logs.ratelimits) {
            this.client.log(
                'DEBUG',
                `[ratelimits] ${route} - retry in ${info.retryAfter}ms (scope: ${info.scope}, limit: ${info.limit})`
            );
        }
    }

    pressure(at = Date.now()) {
        return [...this.recent.entries()]
            .map(([route, times]) => ({
                route,
                hits: times.filter((time) => at - time < BURST_WINDOW_MS).length,
                cause: suspectFor(route)
            }))
            .filter((entry) => entry.hits > 0)
            .sort((a, b) => b.hits - a.hits)
            .slice(0, ATTRIBUTION_ROUTES);
    }

    onInvalidRequest(warning) {
        this.totals.invalid = warning.count;

        const level = warning.count >= INVALID_REQUEST_ALARM ? 'ERROR' : 'WARN';

        const pressure = this.pressure();

        const reading = pressure.length
            ? `Busiest limited routes:\n${pressure
                  .map((p) => `  ${p.route} - ${p.hits}x${p.cause ? ` (probably ${p.cause})` : ''}`)
                  .join('\n')}`
            : 'No routes have been RATE limited in this window, so these are almost certainly 401s or 403s - a dead token, or something repeatedly calling an endpoint it has no permission for. Retrying a 403 never succeeds; find the caller and stop it.';

        this.client.log(
            level,
            `[ratelimits] ${warning.count} invalid requests (401/403/429) in the last window - Discord Cloudflare-bans the IP for an hour at ~10,000.` +
                ` ${warning.remainingTime}ms until the counter resets.\n[ratelimits] ${reading}`
        );

        if (warning.count >= INVALID_REQUEST_ALARM) {
            this.client.clog(
                `**${warning.count}** invalid requests (401/403/429) in the current 10-minute window.\n` +
                    `Discord bans the IP for an hour at ~10,000.\n\n${
                        pressure.length
                            ? `**Busiest limited routes**\n${pressure
                                  .map((p) => `\`${p.route}\` - ${p.hits}x${p.cause ? `\n> probably ${p.cause}` : ''}`)
                                  .join('\n')}`
                            : 'Nothing has been rate limited in this window, so these are almost certainly **401s or 403s** - a dead token, or something repeatedly calling an endpoint it has no permission for.'
                    }\n\n` +
                    'The dashboard shares this token - check it too.',
                '[RATE LIMIT] Invalid request warning',
                'bad'
            );
        }
    }

    sweep() {
        const now = Date.now();

        for (const [key, bucket] of this.buckets) {
            if (bucket.resetsAt <= now) {
                this.buckets.delete(key);
            }
        }

        for (const [route, times] of this.recent) {
            const live = times.filter((at) => now - at < BURST_WINDOW_MS);

            if (live.length) {
                this.recent.set(route, live);
            } else {
                this.recent.delete(route);
            }
        }

        for (const [route, at] of this.reported) {
            if (now - at > BURST_REPORT_COOLDOWN_MS) {
                this.reported.delete(route);
            }
        }

        for (const [id, info] of Object.entries(this.client.collections.ratelimitHits)) {
            const resetsAt = (info?.__at ?? now) + (info?.timeToReset ?? 0);

            if (resetsAt <= now) {
                delete this.client.collections.ratelimitHits[id];
            }
        }
    }

    snapshot() {
        this.sweep();

        return {
            limited: this.buckets.size,
            hits: this.totals.hits,
            global: this.totals.global,
            invalid: this.totals.invalid,
            routes: [...new Set([...this.buckets.values()].map((bucket) => bucket.route))],
            busiest: this.pressure()
        };
    }
}
