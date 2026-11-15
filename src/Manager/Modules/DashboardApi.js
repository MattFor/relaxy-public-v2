'use strict';
import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

import RelaxyClusterManager from '../Manager.js';
import { schemas as SCHEMA_SPECS } from '../../Client/Modules/Database/DatabaseDefaults.js';
import { WRITABLE, NOT_GENERIC, protectedRootsFor, assertSchemaRegistry } from './DashboardSchemas.js';

const SNOWFLAKE = /^\d{17,20}$/;

const ACTION_NAME = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;
const MAX_BODY_BYTES = 1024 * 1024;

const SSE_KEEPALIVE_MS = 15_000;

const SSE_MAX_BACKLOG_BYTES = 256 * 1024;

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 500;

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const isKnownPath = (schemaKey, path) => {
    const spec = SCHEMA_SPECS[schemaKey];

    if (!spec) {
        return false;
    }

    const segments = path.split('.');
    let node = spec.defaults;
    let walked = '';

    for (const segment of segments) {
        if (!isPlainObject(node) || !Object.prototype.hasOwnProperty.call(node, segment)) {
            return false;
        }

        walked = walked ? `${walked}.${segment}` : segment;
        node = node[segment];
        if (spec.openMaps.includes(walked)) {
            return true;
        }
    }

    return true;
};

const CLUSTER_OPERATION = async (client, ctx) => {
    const db = client.module.database;

    try {
        const { op, guildId, userId, payload } = ctx;
        let result = {};

        switch (op) {
            case 'commands.list':
                result = {
                    commands: [...client.collections.commands.values()]

                        .filter((command) => command?.name && !command.owner)
                        .map((command) => ({
                            name: command.name,

                            category: command.dir ?? '',
                            description: command.description ?? '',
                            permissionsUser: Array.isArray(command.permissionsUser) ? command.permissionsUser : []
                        }))
                        .sort((a, b) => a.name.localeCompare(b.name))
                };
                break;

            case 'guild.live': {
                const guild = client.guilds.cache.get(guildId);

                if (!guild) {
                    return {
                        ok: true,
                        result: { live: null }
                    };
                }

                const queue = client.player?.queues?.cache?.get?.(guildId) ?? null;
                const track = queue?.currentTrack ?? null;
                const voiceChannelId = queue?.channel?.id ?? null;

                const voiceStates = [...(guild.voiceStates?.cache?.values?.() ?? [])];

                return {
                    ok: true,
                    result: {
                        live: {
                            cluster: client.cluster?.id ?? null,
                            memberCount: guild.memberCount ?? null,

                            inVoice: voiceStates.filter((v) => v.channelId && !v.member?.user?.bot).length,
                            voiceChannels: [...new Set(voiceStates.filter((v) => v.channelId).map((v) => v.channelId))]
                                .length,
                            music: queue
                                ? {
                                      channel: voiceChannelId,
                                      channelName: voiceChannelId
                                          ? (guild.channels?.cache?.get?.(voiceChannelId)?.name ?? null)
                                          : null,
                                      playing: Boolean(queue.node?.isPlaying?.()),
                                      paused: Boolean(queue.node?.isPaused?.()),
                                      queued: queue.tracks?.size ?? queue.tracks?.data?.length ?? 0,
                                      volume: queue.node?.volume ?? null,
                                      repeatMode: queue.repeatMode ?? null,
                                      listeners: voiceChannelId
                                          ? voiceStates.filter(
                                                (v) => v.channelId === voiceChannelId && !v.member?.user?.bot
                                            ).length
                                          : 0,

                                      filters: queue.filters?.ffmpeg?.getFiltersEnabled?.() ?? [],

                                      biquad: queue.filters?.graph?.biquad ?? null,
                                      equalizerBands: (queue.filters?.graph?.equalizer ?? []).filter(
                                          (b) => Number(b?.gain) !== 0
                                      ).length,
                                      sampleRate: queue.filters?.resampler?.sampleRate ?? null,

                                      queuedDurationMs: queue.estimatedDuration ?? null,
                                      queuedDuration: queue.durationFormatted ?? null,
                                      history: queue.history?.tracks?.size ?? 0,

                                      upcoming: (queue.tracks?.store ?? []).slice(0, 5).map((t) => ({
                                          title: t?.title ?? null,
                                          author: t?.author ?? null,
                                          url: t?.url ?? null,
                                          duration: t?.duration ?? null,
                                          requestedBy: t?.requestedBy?.id ?? null
                                      })),

                                      track: track
                                          ? {
                                                title: track.title ?? null,
                                                author: track.author ?? null,
                                                url: track.url ?? null,
                                                thumbnail: track.thumbnail ?? null,
                                                duration: track.duration ?? null,
                                                requestedBy: track.requestedBy?.id ?? null,

                                                progressMs: queue.node?.streamTime ?? null,
                                                durationMs: track.durationMS ?? null
                                            }
                                          : null
                                  }
                                : null
                        }
                    }
                };
            }

            case 'action.run':
                return client.module.actions.run(payload.name, {
                    guildId,
                    actor: payload.actor,
                    args: payload.args
                });

            case 'action.list':
                result = client.module.actions.list();
                break;

            case 'guild.save':
                await db.saveGuild(guildId, payload.changes);
                result = { changes: payload.changes.length };
                break;

            case 'warnings.add': {
                const guild = client.guilds.cache.get(guildId);
                const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;

                if (!guild || !member) {
                    result = {
                        count: await db.addWarning(guildId, userId, {
                            reason: payload.reason,
                            tier: payload.tier,
                            author: payload.author
                        }),
                        escalated: false,
                        escalations: []
                    };
                    break;
                }

                const warned = await client.module.moderation.warn({
                    guild,
                    guildDoc: await db.Guild(guildId),
                    member,
                    moderator: payload.author,
                    reason: payload.reason,
                    tier: payload.tier
                });

                if (!warned.ok) {
                    return {
                        ok: false,
                        invalid: true,
                        error: warned.error
                    };
                }

                result = {
                    count: (await db.warningsOf(guildId, userId)).length,
                    escalated: true,

                    escalations: warned.escalations ?? []
                };
                break;
            }

            case 'warnings.set':
                await db.setWarnings(guildId, userId, payload.list);
                result = { count: payload.list.length };
                break;

            case 'warnings.clear':
                await db.clearWarnings(guildId, userId);
                break;

            case 'warnings.clearAll':
                await db.clearAllWarnings(guildId);
                break;

            case 'mutes.add':
                await db.addMute(guildId, userId, {
                    mod: payload.mod,
                    exp: payload.exp,
                    roles: payload.roles,
                    reason: payload.reason,
                    dur: payload.dur,
                    channel: payload.channel,
                    ban: payload.ban
                });
                break;

            case 'mutes.remove':
                await db.removeMute(guildId, userId);
                break;

            case 'reactionroles.set':
                await db.setReactionRoles(guildId, payload.entries);
                result = { entries: payload.entries.length };
                break;

            case 'cases.add':
                result = {
                    case: await db.addCase(guildId, {
                        type: payload.type,
                        user: payload.user,
                        mod: payload.mod,
                        reason: payload.reason,
                        extra: payload.extra,
                        guildBan: payload.guildBan
                    })
                };
                break;

            case 'profile.save':
                await db.saveDoc('profile', { id: userId }, payload.changes);
                result = { changes: payload.changes.length };
                break;

            case 'member.save':
                await db.saveDoc(
                    'member',
                    {
                        g: guildId,
                        id: userId
                    },
                    payload.changes
                );
                result = { changes: payload.changes.length };
                break;

            case 'doc.save': {
                if (payload.rev) {
                    const before = await db.load(payload.schema, payload.ids);
                    const currentRev = client.module.docRev.of(before);

                    if (currentRev !== payload.rev) {
                        return {
                            ok: false,
                            conflict: true,
                            error: 'this document changed since it was loaded - reload and reapply your edit',
                            rev: currentRev,
                            current: before
                        };
                    }
                }

                await db.saveDoc(payload.schema, payload.ids, payload.changes);
                result = { changes: payload.changes.length };
                break;
            }

            case 'doc.create': {
                if (await db.docExists(payload.schema, payload.ids)) {
                    return {
                        ok: false,
                        conflict: true,
                        error: 'that document already exists'
                    };
                }

                await db.saveDoc(payload.schema, payload.ids, payload.changes);
                result = {
                    created: true,
                    changes: payload.changes.length
                };
                break;
            }

            case 'doc.delete': {
                if (!(await db.docExists(payload.schema, payload.ids))) {
                    return {
                        ok: false,
                        missing: true,
                        error: 'that document does not exist'
                    };
                }

                const doomed = payload.effect ? await db.load(payload.schema, payload.ids) : null;

                await db.deleteDoc(payload.schema, payload.ids);
                result = { deleted: true };

                if (payload.effect === 'ticketPanel' && doomed) {
                    result.effect = await client.module.panels.repaintTicketPanel({
                        ...doomed,
                        bt: {}
                    });
                }

                return {
                    ok: true,
                    result
                };
            }

            default:
                return {
                    ok: false,
                    error: `unknown operation "${op}"`
                };
        }

        await db.flushAll();

        if (payload?.schema && (op === 'doc.save' || op === 'doc.create')) {
            const after = await db.load(payload.schema, payload.ids);

            result.rev = client.module.docRev.of(after);

            if (payload.effect === 'ticketPanel') {
                result.effect = await client.module.panels.repaintTicketPanel(after);
            }

            if (payload.effect === 'heartBoardPanel') {
                result.effect = await client.module.panels.repaintHeartBoardPanel(after);
            }
        }

        return {
            ok: true,
            result
        };
    } catch (error) {
        client.log('ERROR', `[DashboardApi] ${ctx.op} failed for ${ctx.guildId ?? ctx.userId}:`, error);

        return {
            ok: false,
            error: String(error?.message ?? error)
        };
    }
};

export default class DashboardApi {
    constructor(manager) {
        this._idempotency = new Map();

        this.manager = manager;

        this.server = null;

        this.subscribers = new Set();

        const { host, port, token } = manager.config.keys.dashboard;

        this.host = host;
        this.port = port;

        this.tokenDigest = token ? createHash('sha256').update(token).digest() : null;
    }

    start() {
        assertSchemaRegistry();

        if (!this.tokenDigest) {
            throw new Error(
                'DASHBOARD_API_TOKEN is not set. The dashboard API can rewrite the settings, warnings and mutes of every guild the bot is in - it must not be left open. Generate a secret (`openssl rand -hex 32`), put it in .env here AND in the dashboard, or unset DASHBOARD_API_ENABLED to leave the API off.'
            );
        }

        if (this.server) {
            return Promise.resolve();
        }

        this.server = http.createServer((request, response) =>
            this._handle(request, response).catch((error) => {
                this.manager.error('DASHBOARD API', `Unhandled request failure: ${error?.stack ?? error}`);
                this._respond(response, 500, { error: 'internal error' });
            })
        );

        this.server.on('error', (error) =>
            this.manager.error('DASHBOARD API', `Server error: ${error?.message ?? error}`)
        );

        return new Promise((resolve) => {
            this.server.listen(this.port, this.host, () => {
                this.manager.info(
                    'DASHBOARD API',
                    `Listening on http://${this.host}:${this.port} - authenticated writes only.`
                );
                resolve();
            });
        });
    }

    stop() {
        if (!this.server) {
            return Promise.resolve();
        }

        const server = this.server;
        this.server = null;

        for (const response of [...this.subscribers]) {
            this.subscribers.delete(response);

            try {
                response.end();
            } catch {}
        }

        return new Promise((resolve) =>
            server.close(() => {
                this.manager.warn('DASHBOARD API', 'Stopped.');
                resolve();
            })
        );
    }

    _respond(response, status, body) {
        if (response.writableEnded) {
            return;
        }

        const payload = JSON.stringify({
            ok: status >= 200 && status < 300,
            ...body
        });

        response.writeHead(status, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        });
        response.end(payload);
    }

    _idempotencyKeyFor(request, segments) {
        const key = request.headers['idempotency-key'];

        if (!key || typeof key !== 'string' || segments[0] !== 'guild' || segments[2] !== 'action') {
            return null;
        }

        return `${segments.join('/')}:${key.slice(0, 200)}`;
    }

    _replayOf(key) {
        const hit = this._idempotency.get(key);

        if (!hit) {
            return null;
        }

        if (Date.now() - hit.at > IDEMPOTENCY_TTL_MS) {
            this._idempotency.delete(key);

            return null;
        }

        return hit;
    }

    _remember(key, route) {
        const now = Date.now();

        for (const [entry, value] of this._idempotency) {
            if (now - value.at > IDEMPOTENCY_TTL_MS) {
                this._idempotency.delete(entry);
            }
        }

        while (this._idempotency.size >= IDEMPOTENCY_MAX_ENTRIES) {
            this._idempotency.delete(this._idempotency.keys().next().value);
        }

        this._idempotency.set(key, {
            at: now,
            status: route.status,
            body: route.body
        });
    }

    _authorized(request) {
        const header = request.headers.authorization ?? '';
        const presented = header.startsWith('Bearer ') ? header.slice(7) : '';

        if (!presented) {
            return false;
        }

        return timingSafeEqual(createHash('sha256').update(presented).digest(), this.tokenDigest);
    }

    _body(request) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let size = 0;

            request.on('data', (chunk) => {
                size += chunk.length;

                if (size > MAX_BODY_BYTES) {
                    reject(new Error('body too large'));
                    request.destroy();
                    return;
                }

                chunks.push(chunk);
            });

            request.on('error', (error) => reject(error));

            request.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8').trim();

                if (!raw) {
                    return resolve({});
                }

                let parsed;

                try {
                    parsed = JSON.parse(raw);
                } catch {
                    return reject(new Error('body is not valid JSON'));
                }

                if (!isPlainObject(parsed)) {
                    return reject(new Error('body must be a JSON object'));
                }

                resolve(parsed);
            });
        });
    }

    _clusterForGuild(guildId) {
        const shard = Number(BigInt(guildId) >> 22n) % this.manager.totalShards;

        for (const cluster of this.manager.clusters.values()) {
            if (cluster.ready && cluster.thread && (cluster.shardList ?? []).includes(shard)) {
                return cluster.id;
            }
        }

        return null;
    }

    _anyCluster() {
        for (const cluster of this.manager.clusters.values()) {
            if (cluster.ready && cluster.thread) {
                return cluster.id;
            }
        }

        return null;
    }

    async _dispatch(clusterId, context) {
        let answer;

        try {
            [answer] = await this.manager.broadcastEval(CLUSTER_OPERATION, {
                cluster: clusterId,
                context
            });
        } catch (error) {
            this.manager.error(
                'DASHBOARD API',
                `${context.op} could not reach cluster #${clusterId}: ${error?.message ?? error}`
            );

            return {
                status: 502,
                body: { error: 'the cluster owning this data did not answer' }
            };
        }

        if (!answer?.ok) {
            if (answer?.conflict) {
                return {
                    status: 409,
                    body: {
                        error: answer.error,
                        ...(answer.rev ? { rev: answer.rev } : {}),
                        ...(answer.current ? { current: answer.current } : {})
                    }
                };
            }

            if (answer?.missing) {
                return {
                    status: 404,
                    body: { error: answer.error }
                };
            }

            if (answer?.forbidden) {
                return {
                    status: 403,
                    body: { error: answer.error }
                };
            }

            if (answer?.invalid) {
                return {
                    status: 400,
                    body: { error: answer.error }
                };
            }

            if (answer?.unknown) {
                return {
                    status: 404,
                    body: { error: answer.error }
                };
            }

            this.manager.error(
                'DASHBOARD API',
                `${context.op} failed on cluster #${clusterId}: ${answer?.error ?? 'no answer'}`
            );

            return {
                status: 500,
                body: { error: answer?.error ?? 'the operation failed on the cluster' }
            };
        }

        return {
            status: 200,
            body: answer.result ?? {}
        };
    }

    _changes(body, schemaKeys) {
        const raw = Array.isArray(body.changes) ? body.changes : [body];

        const protectedRoots = new Set(schemaKeys.flatMap((key) => [...protectedRootsFor(key)]));

        const changes = [];

        for (const change of raw) {
            if (!isPlainObject(change) || !('value' in change)) {
                return { error: 'each change needs an "alter" path and a "value"' };
            }

            const alter = String(change.alter ?? change.path ?? '');

            if (!alter) {
                return { error: 'each change needs an "alter" path' };
            }

            if (protectedRoots.has(alter.split('.')[0])) {
                return { error: `"${alter}" is identity or registry state and cannot be written` };
            }

            if (!schemaKeys.some((key) => isKnownPath(key, alter))) {
                return { error: `unknown setting path "${alter}"` };
            }

            changes.push({
                alter,
                value: change.value
            });
        }

        if (!changes.length) {
            return { error: 'no changes given' };
        }

        return { changes };
    }

    _subscribe(request, response) {
        response.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',

            'X-Accel-Buffering': 'no'
        });

        response.write(': connected\n\n');

        const keepalive = setInterval(() => {
            if (!response.writableEnded) {
                response.write(': keepalive\n\n');
            }
        }, SSE_KEEPALIVE_MS);

        if (typeof keepalive.unref === 'function') {
            keepalive.unref();
        }

        const drop = () => {
            clearInterval(keepalive);
            this.subscribers.delete(response);
        };

        request.on('close', drop);
        request.on('error', drop);
        response.on('error', drop);

        this.subscribers.add(response);
        this.manager.debug?.('DASHBOARD API', `Change-stream subscriber attached (${this.subscribers.size} total).`);
    }

    _emit(event) {
        if (this.subscribers.size === 0) {
            return;
        }

        const line = `event: change\ndata: ${JSON.stringify({
            ...event,
            at: Date.now(),
            source: 'dashboard'
        })}\n\n`;

        for (const response of [...this.subscribers]) {
            if (response.writableEnded || response.destroyed) {
                this.subscribers.delete(response);
                continue;
            }

            try {
                response.write(line);

                if (response.writableLength > SSE_MAX_BACKLOG_BYTES) {
                    this.manager.warn('DASHBOARD API', 'Dropping a change-stream subscriber that stopped reading.');
                    this.subscribers.delete(response);
                    response.destroy();
                }
            } catch {
                this.subscribers.delete(response);
            }
        }
    }

    _ids(schemaKey, ids) {
        if (!isPlainObject(ids)) {
            return { error: '"ids" must be an object' };
        }

        const wanted = WRITABLE[schemaKey].ids;
        const given = Object.keys(ids);

        const missing = wanted.filter((key) => !given.includes(key));
        const unknown = given.filter((key) => !wanted.includes(key));

        if (missing.length) {
            return {
                error: `"ids" is missing ${missing.map((k) => `"${k}"`).join(', ')} (${schemaKey} is identified by ${wanted.join()})`
            };
        }

        if (unknown.length) {
            return {
                error: `"ids" has unknown ${unknown.map((k) => `"${k}"`).join(', ')} (${schemaKey} is identified by ${wanted.join()})`
            };
        }

        const clean = {};

        for (const key of wanted) {
            const value = String(ids[key] ?? '');
            if (!SNOWFLAKE.test(value)) {
                return { error: `"ids.${key}" is not a snowflake` };
            }

            clean[key] = value;
        }

        return { ids: clean };
    }

    async _docRoute(schemaKey, action, body) {
        if (NOT_GENERIC[schemaKey]) {
            return {
                status: 400,
                body: { error: `"${schemaKey}" cannot be written generically - ${NOT_GENERIC[schemaKey]}` }
            };
        }

        if (!WRITABLE[schemaKey]) {
            return {
                status: 404,
                body: { error: `unknown or non-writable schema "${schemaKey}"` }
            };
        }

        const spec = WRITABLE[schemaKey];
        const identity = this._ids(schemaKey, body.ids);

        if (identity.error) {
            return {
                status: 400,
                body: { error: identity.error }
            };
        }

        const clusterId =
            spec.scope === 'guild' ? this._clusterForGuild(identity.ids[spec.guildFrom]) : this._anyCluster();

        if (action === 'delete') {
            const route = await this._run(clusterId, {
                op: 'doc.delete',
                guildId: identity.ids[spec.guildFrom] ?? null,
                payload: {
                    schema: schemaKey,
                    ids: identity.ids,
                    effect: spec.effect
                }
            });

            route.change = {
                schema: schemaKey,
                ids: identity.ids,
                op: 'delete'
            };

            return route;
        }

        if (action !== 'save' && action !== 'create') {
            return null;
        }

        const supplied = Array.isArray(body.changes) ? body.changes.length > 0 : isPlainObject(body) && 'value' in body;

        let changes = [];

        if (supplied) {
            const parsed = this._changes(body, [schemaKey]);

            if (parsed.error) {
                return {
                    status: 400,
                    body: { error: parsed.error }
                };
            }

            changes = parsed.changes;
        } else if (action === 'save') {
            return {
                status: 400,
                body: { error: 'no changes given' }
            };
        }

        const rev = action === 'save' && body.rev ? String(body.rev) : null;

        const route = await this._run(clusterId, {
            op: action === 'create' ? 'doc.create' : 'doc.save',
            guildId: identity.ids[spec.guildFrom] ?? null,
            payload: {
                schema: schemaKey,
                ids: identity.ids,
                changes,
                rev,
                effect: spec.effect
            }
        });

        route.change = {
            schema: schemaKey,
            ids: identity.ids,
            op: action,
            rev: route.body?.rev ?? null,
            paths: changes.map((c) => c.alter)
        };

        return route;
    }

    async _handle(request, response) {
        if (!this._authorized(request)) {
            return this._respond(response, 401, { error: 'unauthorized' });
        }

        const url = new URL(request.url, `http://${this.host}`);
        const segments = url.pathname.split('/').filter(Boolean);

        if (request.method === 'GET' && segments[0] === 'health' && segments.length === 1) {
            return this._respond(response, 200, {
                clusters: this.manager.clusters.size,
                shards: this.manager.totalShards,
                ready: [...this.manager.clusters.values()].filter((cluster) => cluster.ready).length
            });
        }

        if (request.method === 'GET' && segments[0] === 'events' && segments.length === 1) {
            return this._subscribe(request, response);
        }

        if (request.method === 'GET' && segments[0] === 'commands' && segments.length === 1) {
            const route = await this._run(this._anyCluster(), { op: 'commands.list' });

            return this._respond(response, route.status, route.body);
        }

        if (request.method === 'GET' && segments[0] === 'actions' && segments.length === 1) {
            const route = await this._run(this._anyCluster(), { op: 'action.list' });

            return this._respond(response, route.status, route.body);
        }

        if (request.method === 'GET' && segments[0] === 'guild' && segments[2] === 'live' && segments.length === 3) {
            const guildId = segments[1];

            if (!/^\d{17,20}$/.test(guildId)) {
                return this._respond(response, 400, { error: 'not a guild id' });
            }

            const route = await this._run(this._clusterForGuild(guildId), {
                op: 'guild.live',
                guildId
            });

            if (route.status !== 200) {
                return this._respond(response, route.status, route.body);
            }

            const live = route.body?.live ?? null;

            return live
                ? this._respond(response, 200, live)
                : this._respond(response, 404, { error: 'that guild is not on a live cluster' });
        }

        if (request.method !== 'POST') {
            return this._respond(response, 405, { error: 'method not allowed' });
        }

        let body;

        try {
            body = await this._body(request);
        } catch (error) {
            return this._respond(response, 400, { error: String(error?.message ?? error) });
        }

        const idempotencyKey = this._idempotencyKeyFor(request, segments);

        if (idempotencyKey) {
            const replay = this._replayOf(idempotencyKey);

            if (replay) {
                return this._respond(response, replay.status, replay.body);
            }
        }

        const route = await this._route(segments, body);

        if (!route) {
            return this._respond(response, 404, { error: 'unknown endpoint' });
        }

        if (route.status >= 200 && route.status < 300 && route.change) {
            this._emit(route.change);
        }

        if (idempotencyKey && route.status !== 502 && route.status !== 503) {
            this._remember(idempotencyKey, route);
        }

        return this._respond(response, route.status, route.body);
    }

    async _route(segments, body) {
        const [scope, first, second, third] = segments;

        if (scope === 'doc' && first && second && !third) {
            return this._docRoute(first, second, body);
        }

        if (scope === 'guild') {
            if (!SNOWFLAKE.test(first ?? '')) {
                return {
                    status: 400,
                    body: { error: 'guild id is not a snowflake' }
                };
            }

            return this._guildRoute(first, second, third, body);
        }

        if (scope === 'profile' && second === 'save' && !third) {
            if (!SNOWFLAKE.test(first ?? '')) {
                return {
                    status: 400,
                    body: { error: 'user id is not a snowflake' }
                };
            }

            const changes = this._changes(body, ['profile']);

            if (changes.error) {
                return {
                    status: 400,
                    body: { error: changes.error }
                };
            }

            return this._run(this._anyCluster(), {
                op: 'profile.save',
                userId: first,
                payload: { changes: changes.changes }
            });
        }

        if (scope === 'member' && third === 'save') {
            if (!SNOWFLAKE.test(first ?? '') || !SNOWFLAKE.test(second ?? '')) {
                return {
                    status: 400,
                    body: { error: 'guild id and user id must both be snowflakes' }
                };
            }

            const changes = this._changes(body, ['member']);

            if (changes.error) {
                return {
                    status: 400,
                    body: { error: changes.error }
                };
            }

            return this._run(this._clusterForGuild(first), {
                op: 'member.save',
                guildId: first,
                userId: second,
                payload: { changes: changes.changes }
            });
        }

        if (scope === 'blacklist' && first === 'refresh' && !second) {
            let results;

            try {
                results = await this.manager.broadcastEval((client) => client.core.refreshBlacklist());
            } catch (error) {
                this.manager.error(
                    'DASHBOARD API',
                    `blacklist.refresh could not reach the clusters: ${error?.message ?? error}`
                );

                return {
                    status: 502,
                    body: { error: 'the clusters did not answer' }
                };
            }

            const list = results ?? [];

            return {
                status: 200,
                body: {
                    clusters: list.length,
                    refreshed: list.filter(Boolean).length
                }
            };
        }

        if (scope === 'console' && first === 'exec' && !second) {
            const cmd = String(body?.cmd ?? '')
                .trim()
                .slice(0, 1000);

            if (!cmd) {
                return {
                    status: 400,
                    body: { error: 'no command given' }
                };
            }

            try {
                await this.manager.ConsoleInputProcessor.process(cmd);
            } catch (error) {
                this.manager.error('DASHBOARD API', `console.exec "${cmd}" threw: ${error?.message ?? error}`);

                return {
                    status: 500,
                    body: { error: String(error?.message ?? error) }
                };
            }

            return {
                status: 200,
                body: {
                    ok: true,
                    cmd
                }
            };
        }

        return null;
    }

    async _guildRoute(guildId, group, action, body) {
        const clusterId = this._clusterForGuild(guildId);

        const user = String(body.user ?? '');
        const userRequired = () =>
            SNOWFLAKE.test(user)
                ? null
                : {
                      status: 400,
                      body: { error: '"user" must be a snowflake' }
                  };

        if (group === 'save' && !action) {
            const changes = this._changes(body, ['server', 'guildConfig']);

            if (changes.error) {
                return {
                    status: 400,
                    body: { error: changes.error }
                };
            }

            return this._run(clusterId, {
                op: 'guild.save',
                guildId,
                payload: { changes: changes.changes }
            });
        }

        if (group === 'action') {
            if (!action || !ACTION_NAME.test(action)) {
                return {
                    status: 400,
                    body: { error: 'action name must look like "ticketsystem.create"' }
                };
            }

            if (!SNOWFLAKE.test(String(body.actor ?? ''))) {
                return {
                    status: 400,
                    body: { error: '"actor" must be a snowflake - the user this action is on behalf of' }
                };
            }

            return this._run(clusterId, {
                op: 'action.run',
                guildId,
                userId: '',
                payload: {
                    name: action,
                    actor: String(body.actor),
                    args: isPlainObject(body.args) ? body.args : {}
                }
            });
        }

        if (group === 'warnings') {
            const announced = (route, op, ids) => {
                if (route) {
                    route.change = {
                        schema: 'warning',
                        ids,
                        op,
                        rev: null,
                        paths: ['w']
                    };
                }

                return route;
            };

            if (action === 'add') {
                const bad = userRequired();

                if (bad) {
                    return bad;
                }

                if (body.author !== undefined && !SNOWFLAKE.test(String(body.author))) {
                    return {
                        status: 400,
                        body: { error: '"author" must be a snowflake' }
                    };
                }

                return announced(
                    await this._run(clusterId, {
                        op: 'warnings.add',
                        guildId,
                        userId: user,
                        payload: {
                            reason: String(body.reason ?? 'None.'),
                            tier: Number(body.tier ?? 0),
                            author: String(body.author ?? '')
                        }
                    }),
                    'save',
                    {
                        g: guildId,
                        u: user
                    }
                );
            }

            if (action === 'set') {
                const bad = userRequired();

                if (bad) {
                    return bad;
                }

                if (!Array.isArray(body.list)) {
                    return {
                        status: 400,
                        body: { error: '"list" must be an array of warnings' }
                    };
                }

                const list = body.list.map((entry) => ({
                    reason: String(entry?.reason ?? 'None.'),
                    tier: Number(entry?.tier ?? 0),
                    author: String(entry?.author ?? ''),
                    date: Number(entry?.date ?? Date.now()),
                    edits: Array.isArray(entry?.edits) ? entry.edits : []
                }));

                return announced(
                    await this._run(clusterId, {
                        op: 'warnings.set',
                        guildId,
                        userId: user,
                        payload: { list }
                    }),
                    'save',
                    {
                        g: guildId,
                        u: user
                    }
                );
            }

            if (action === 'clear') {
                const bad = userRequired();

                if (bad) {
                    return bad;
                }

                return announced(
                    await this._run(clusterId, {
                        op: 'warnings.clear',
                        guildId,
                        userId: user,
                        payload: {}
                    }),
                    'save',
                    {
                        g: guildId,
                        u: user
                    }
                );
            }

            if (action === 'clearAll') {
                return announced(
                    await this._run(clusterId, {
                        op: 'warnings.clearAll',
                        guildId,
                        payload: {}
                    }),
                    'delete',
                    { g: guildId }
                );
            }

            return null;
        }

        if (group === 'mutes') {
            if (action === 'add') {
                const bad = userRequired();

                if (bad) {
                    return bad;
                }

                const roles = Array.isArray(body.roles) ? body.roles.map(String) : [];

                if (roles.some((role) => !SNOWFLAKE.test(role))) {
                    return {
                        status: 400,
                        body: { error: '"roles" must be snowflakes' }
                    };
                }

                return this._run(clusterId, {
                    op: 'mutes.add',
                    guildId,
                    userId: user,
                    payload: {
                        mod: String(body.mod ?? ''),
                        exp: Number(body.exp ?? 0),
                        roles,
                        reason: String(body.reason ?? ''),
                        dur: Number(body.dur ?? 0),
                        channel: String(body.channel ?? ''),
                        ban: !!body.ban
                    }
                });
            }

            if (action === 'remove') {
                const bad = userRequired();

                if (bad) {
                    return bad;
                }

                return this._run(clusterId, {
                    op: 'mutes.remove',
                    guildId,
                    userId: user,
                    payload: {}
                });
            }

            return null;
        }

        if (group === 'reactionroles' && !action) {
            if (!Array.isArray(body.entries)) {
                return {
                    status: 400,
                    body: { error: '"entries" must be an array' }
                };
            }

            return this._run(clusterId, {
                op: 'reactionroles.set',
                guildId,
                payload: { entries: body.entries }
            });
        }

        if (group === 'cases' && action === 'add') {
            if (body.user !== undefined && !SNOWFLAKE.test(user)) {
                return {
                    status: 400,
                    body: { error: '"user" must be a snowflake' }
                };
            }

            return this._run(clusterId, {
                op: 'cases.add',
                guildId,
                payload: {
                    type: String(body.type ?? ''),
                    user,
                    mod: String(body.mod ?? ''),
                    reason: String(body.reason ?? ''),
                    extra: String(body.extra ?? ''),
                    guildBan: !!body.guildBan
                }
            });
        }

        return null;
    }

    _run(clusterId, context) {
        if (clusterId === null || clusterId === undefined) {
            this.manager.warn(
                'DASHBOARD API',
                `${context.op}: no live cluster owns ${context.guildId ?? context.userId}; refused rather than guessed.`
            );

            return Promise.resolve({
                status: 503,
                body: { error: 'no live cluster owns this data right now' }
            });
        }

        return this._dispatch(clusterId, context);
    }
}
