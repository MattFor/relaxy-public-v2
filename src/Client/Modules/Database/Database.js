'use strict';

import path from 'path';
import time from 'pretty-ms';

import { parentPort, Worker } from 'worker_threads';

import Relaxy from '../../Relaxy.js';
import Server from './Blueprints/Server.js';
import GuildConfig from './Blueprints/GuildConfig.js';
import Member from './Blueprints/Member.js';
import Warning from './Blueprints/Warning.js';
import Mute from './Blueprints/Mute.js';
import Profile from './Blueprints/Profile.js';
import Reminder from './Blueprints/Reminder.js';
import HeartBoard from './Blueprints/HeartBoard.js';
import TicketSystem from './Blueprints/TicketSystem.js';
import ForumChannel from './Blueprints/ForumChannel.js';
import ReactionRole from './Blueprints/ReactionRole.js';
import HeartBoardPost from './Blueprints/HeartBoardPost.js';
import Case from './Blueprints/Case.js';

import Lodash from 'lodash';
import RegistryManager from './RegistryManager.js';
import { modelToSchema, schemas as SCHEMA_SPECS } from './DatabaseDefaults.js';
import { reconcile, stripDefaults, isPureDefault } from './SchemaEngine.js';
import { isNetworkError, NetworkErrorThrottle } from '../../../Utils/NetworkErrors.js';

const schemaToModel = Object.fromEntries(Object.entries(modelToSchema).map(([m, k]) => [k, m]));

export const MIN_MAX_WARNING_TIER = 3;

const MAX_TIER_TTL_MS = 5 * 60 * 1000;

const ROUTE = {
    server: {
        cache: 'servers',
        key: (i) => i.id,
        filter: (i) => ({ id: i.id }),
        identity: (i) => ({ id: i.id }),
        registry: true
    },
    guildConfig: {
        cache: 'guildConfigs',
        key: (i) => i.g,
        filter: (i) => ({ g: i.g }),
        identity: (i) => ({ g: i.g })
    },
    member: {
        cache: 'members',
        key: (i) => `${i.g}:${i.id}`,
        filter: (i) => ({
            g: i.g,
            id: i.id
        }),
        identity: (i) => ({
            g: i.g,
            id: i.id
        })
    },
    profile: {
        cache: 'users',
        key: (i) => i.id,
        filter: (i) => ({ id: i.id }),
        identity: (i) => ({ id: i.id })
    },
    warning: {
        cache: 'warnings',
        key: (i) => `${i.g}:${i.u}`,
        filter: (i) => ({
            g: i.g,
            u: i.u
        }),
        identity: (i) => ({
            g: i.g,
            u: i.u
        })
    },
    mute: {
        cache: 'mutes',
        key: (i) => `${i.g}:${i.u}`,
        filter: (i) => ({
            g: i.g,
            u: i.u
        }),
        identity: (i) => ({
            g: i.g,
            u: i.u
        })
    },
    reactionRole: {
        cache: 'reactionRoles',
        key: (i) => i.g,
        filter: (i) => ({ g: i.g }),
        identity: (i) => ({ g: i.g })
    },

    forumChannel: {
        cache: 'forum',
        key: (i) => `${i.id}-${i.g}`,
        filter: (i) => ({
            id: i.id,
            g: i.g
        }),
        identity: (i) => ({
            id: i.id,
            g: i.g
        })
    },
    heartBoard: {
        cache: 'heartboards',
        key: (i) => `${i.id}-${i.g}`,
        filter: (i) => ({
            id: i.id,
            g: i.g
        }),
        identity: (i) => ({
            id: i.id,
            g: i.g
        })
    },
    heartBoardPost: {
        cache: 'heartboardPosts',
        key: (i) => i.oid,
        filter: (i) => ({ oid: i.oid }),
        identity: (i) => ({ oid: i.oid })
    },
    ticketSystem: {
        clientCollection: true,
        cache: 'ticketSystems',
        key: (i) => `${i.g}${i.c}${i.mid}`,
        filter: (i) => ({
            g: i.g,
            c: i.c,
            mid: i.mid
        }),
        identity: (i) => ({
            g: i.g,
            c: i.c,
            mid: i.mid
        })
    }
};

const HOT_KEYS = new Set(Object.keys(SCHEMA_SPECS.server.defaults));
const COLD_KEYS = new Set(Object.keys(SCHEMA_SPECS.guildConfig.defaults));

const __dirname = path.resolve(path.dirname(''));

const networkErrorThrottle = new NetworkErrorThrottle();

const SHAPE_WARN_INTERVAL = 60 * 60 * 1000;

export default class DatabaseHandler {
    constructor(client) {
        this.client = client;

        this.modelMap = {
            Server,
            GuildConfig,
            Member,
            Profile,
            Warning,
            Mute,
            Reminder,
            HeartBoard,
            ForumChannel,
            ReactionRole,
            TicketSystem,
            HeartBoardPost,
            Case
        };

        this._cache = {
            users: new Map(),
            forum: new Map(),
            members: new Map(),
            servers: new Map(),
            guildConfigs: new Map(),
            warnings: new Map(),
            mutes: new Map(),
            reactionRoles: new Map(),
            heartboards: new Map(),
            ticketSystems: new Map(),
            heartboardPosts: new Map(),
            correctHeartBoard: new Map()
        };
        this._registries = new Map();
        this._dirty = new Map();
        this._flushTimers = {};
        this._guildDirty = new Map();
        this._guildFlushTimers = {};

        this._caseGuard = new Map();

        this._caseChain = new Map();

        this._maxTier = new Map();

        this._cacheTimeouts = {};

        this.serverQueues = {
            0: {},
            1: {},
            2: {},
            3: {},
            4: {},
            5: {},
            6: {},
            7: {}
        };

        this.worker = null;
        this.messageCallbacks = new Map();
        this.nextMessageId = 0;
        this.isWorkerReady = false;
        this.isWorkerReadyToGetMessage = false;
        this.startingWorker = false;

        this._heartBoardPostInflight = new Map();

        this.handlerId = `dbHandler-${process.pid}`;

        this.startWorker().catch((e) => this.client.log('ERROR', e));
    }

    async startWorker() {
        this.startingWorker = true;
        const dbUri = this.client.config.keys.dbtoken;
        const workerPath = path.resolve(__dirname, 'src/Client/Modules/Workers/DatabaseWorker.js');

        this.worker = new Worker(workerPath, {
            workerData: {
                dbUri: dbUri,
                ownerProcessId: this.handlerId
            }
        });

        this.worker.on('online', () => {
            this.startingWorker = false;
            this.client.log('DEBUG', `[${this.handlerId}] Database worker is online.`);

            const isReadyInterval = setInterval(async () => {
                if (!this.isWorkerReady) {
                    return;
                }

                clearInterval(isReadyInterval);

                await this.sendMessageToWorker('connect', {})
                    .then(() => {
                        this.isWorkerReadyToGetMessage = true;
                        this.client.log('DEBUG', 'Database worker able to receive messages.');
                    })
                    .catch((err) => {
                        this.client.log('ERROR', 'Database worker failed to connect:', err);
                        this.isWorkerReady = false;
                        this.worker = null;
                        throw err;
                    });
            }, 100);
        });

        this.worker.on('message', (message) => {
            const { messageId, result, error, success, type } = message;

            if (type === 'ready') {
                this.isWorkerReady = true;
                return this.client.log('DEBUG', `Database worker is ready.`);
            }

            if (messageId === 1 && type === 'success') {
                return this.client.log('DEBUG', 'Database worker is connected.');
            }

            if (type === 'workerLog') {
                const isBad = ['ERROR', 'WARN'].includes(message.level);
                if (!this.startingWorker && this.isWorkerReadyToGetMessage && (this.client.flags.logs.debug || isBad)) {
                    const strError = [
                        message.message,
                        ...(message.args ?? []).map((a) =>
                            typeof a === 'string' ? a : (a?.stack ?? a?.message ?? String(a))
                        )
                    ].join(' ');

                    if (isNetworkError(strError)) {
                        const { print, suppressed } = networkErrorThrottle.consider(strError);
                        const count = ++this.client.data.net_issues;

                        if (print) {
                            this.client.log(
                                'ERROR',
                                `Network issue count: ${count}${NetworkErrorThrottle.note(suppressed)}`,
                                message.message ?? 'Undefined unhandled rejection',
                                ...message.args
                            );
                        }

                        this.client.cluster.send({
                            _type: this.client.types.messageType.CLIENT_REQUEST,
                            variant: 'ni'
                        });
                    } else if (isBad) {
                        this.client.log(
                            'ERROR',
                            `Error count: ${++this.client.data.errors}`,
                            message.message ?? 'Undefined unhandled rejection',
                            ...message.args
                        );
                    } else {
                        return this.client.log(message.level, message.message, ...message.args);
                    }
                }
            }

            if (this.messageCallbacks.has(messageId)) {
                const { resolve, reject } = this.messageCallbacks.get(messageId);

                this.messageCallbacks.delete(messageId);

                if (error) {
                    reject(new Error(error.message));
                } else {
                    resolve(result);
                }
            }
        });

        this.worker.on('error', (err) => {
            this.client.log('ERROR', 'Database Worker Error:', err);

            this.isWorkerReady = false;
            this.worker = null;

            this.messageCallbacks.forEach(({ reject }, msgId) => {
                reject(new Error(`Database worker crashed: ${err.message}`));
                this.messageCallbacks.delete(msgId);
            });
        });

        this.worker.on('exit', (code) => {
            this.client.log('ERROR', `Database Worker exited with code ${code}`);
            this.isWorkerReady = false;
            this.worker = null;

            this.messageCallbacks.forEach(({ reject }, msgId) => {
                reject(new Error(`Database worker exited with code ${code}`));
                this.messageCallbacks.delete(msgId);
            });
        });
    }

    async sendMessageToWorker(type, data = {}) {
        this.client.module?.stats?.count('db.worker');
        this.client.module?.stats?.count(`db.worker.${type}`);

        if (!this.worker || !this.isWorkerReady) {
            if (this.worker === null) {
                await this.startWorker();
            }

            await new Promise((resolve, reject) => {
                let timeout = 0;

                const waitingToStart = setInterval(() => {
                    if (timeout >= 50) {
                        clearInterval(waitingToStart);
                        return reject(new Error('Database worker is unavailable and not attempting to start.'));
                    }

                    if (this.startingWorker && (!this.worker || !this.isWorkerReady)) {
                        return timeout++;
                    }

                    clearInterval(waitingToStart);
                    resolve();
                }, 750);
            });
        }

        const messageId = this.nextMessageId++;
        return new Promise((resolve, reject) => {
            this.messageCallbacks.set(messageId, {
                resolve,
                reject
            });
            this.worker.postMessage({
                type,
                data,
                messageId
            });

            setTimeout(
                async () => {
                    if (this.messageCallbacks.has(messageId)) {
                        this.messageCallbacks.delete(messageId);
                        reject(new Error(`Database worker timed out for message type ${type} with id ${messageId}`));
                        this.client.log(
                            'ERROR',
                            `Database worker timed out for message type ${type} with id ${messageId}${
                                data?.modelName ? ` ${data.modelName}` : ''
                            }${data?.filter ? ` ${await this.client.stringifyJSON(data.filter)}` : ''}`
                        );
                    }
                },
                4 * 60 * 1000
            );

            setTimeout(async () => {
                if (this.messageCallbacks.has(messageId)) {
                    if (this.client.flags.logs.debug) {
                        this.client.log(
                            'WARN',
                            `Database worker taking longer than usual for message type ${type} with id ${messageId}${
                                data?.modelName ? ` ${data.modelName}` : ''
                            }${data?.filter ? ` ${await this.client.stringifyJSON(data.filter)}` : ''}`
                        );
                    }
                }
            }, 30 * 1000);

            setTimeout(async () => {
                if (this.messageCallbacks.has(messageId)) {
                    if (this.client.flags.logs.debug) {
                        this.client.log(
                            'WARN',
                            `Database worker taking A LOT longer than usual for message type ${type} with id ${messageId}${
                                data?.modelName ? ` ${data.modelName}` : ''
                            }${data?.filter ? ` ${await this.client.stringifyJSON(data.filter)}` : ''}`
                        );
                    }
                }
            }, 180 * 1000);
        });
    }

    async aggregateModelData(modelName, pipeline) {
        const now = Date.now();

        try {
            const result = await this.sendMessageToWorker('aggregateModelData', {
                modelName,
                pipeline
            });

            if (this.client.flags.logs.debug) {
                this.client.log(
                    `[${this.handlerId}] Aggregating model data for: ${modelName} | Took: ${time(Date.now() - now)}`
                );
            }

            return result;
        } catch (error) {
            this.client.log('ERROR', `[${this.handlerId}] Failed to aggregateModelData for ${modelName}:`, error);
            throw error;
        }
    }

    async saveModelData(modelName, docData) {
        const now = Date.now();

        try {
            const result = await this.sendMessageToWorker('saveModelData', {
                modelName,
                docData
            });

            if (this.client.flags.logs.debug) {
                this.client.log(
                    `[${this.handlerId}] Saving model data for: ${modelName} | Took: ${time(Date.now() - now)}`
                );
            }

            return result;
        } catch (error) {
            this.client.log('ERROR', `[${this.handlerId}] Failed to saveModelData for ${modelName}:`, error);
            throw error;
        }
    }

    async getModelData(modelName, filter, defaults) {
        const now = Date.now();

        try {
            const result = await this.sendMessageToWorker('getModelData', {
                modelName,
                filter,
                defaults
            });

            if (this.client.flags.logs.debug) {
                this.client.log(
                    `[${this.handlerId}] Awaiting single model data for: ${modelName} | Took: ${time(Date.now() - now)}`
                );
            }

            return result;
        } catch (error) {
            this.client.log(
                'ERROR',
                `[${this.handlerId}] Failed to getModelData for ${modelName} with filter ${await this.client.stringifyJSON(filter)}:`,
                error
            );
            throw error;
        }
    }

    async getMultipleModelData(modelName, filter = {}, options = {}) {
        const now = Date.now();

        try {
            const result = await this.sendMessageToWorker('getMultipleModelData', {
                modelName,
                filter,
                options
            });

            if (this.client.flags.logs.debug) {
                this.client.log(
                    `[${this.handlerId}] Awaiting multiple model data for: ${modelName} | Count: ${
                        result ? (Array.isArray(result) ? result.length : 'non-array result') : 'null'
                    } | Took: ${time(Date.now() - now)}`
                );
            }

            return result;
        } catch (error) {
            this.client.log(
                'ERROR',
                `[${this.handlerId}] Failed to getMultipleModelData for ${modelName} with filter ${await this.client.stringifyJSON(filter)} and options ${await this.client.stringifyJSON(options)}:`,
                error
            );
            throw error;
        }
    }

    async bumpStats(guildId, day, deltas) {
        const inc = {};

        for (const [field, n] of Object.entries(deltas ?? {})) {
            if (Number.isFinite(n) && n > 0) {
                inc[field] = n;
            }
        }

        if (!Object.keys(inc).length) {
            return null;
        }

        return this.sendMessageToWorker('updateModel', {
            modelName: 'Stat',
            filter: {
                g: guildId,
                d: day
            },
            updateData: {
                $inc: inc,
                $setOnInsert: { v: 1 }
            },
            options: { upsert: true }
        });
    }

    async pruneStats(cutoff) {
        const result = await this.sendMessageToWorker('deleteMultipleModelData', {
            modelName: 'Stat',
            filter: { d: { $lt: cutoff } }
        });

        return result?.deletedCount ?? 0;
    }

    async deleteModelData(modelName, filter) {
        const now = Date.now();

        try {
            const result = await this.sendMessageToWorker('deleteModelData', {
                modelName,
                filter
            });

            if (this.client.flags.logs.debug) {
                this.client.log(
                    `[${this.handlerId}] Deleting single model data for: ${modelName} | Took: ${time(Date.now() - now)}`
                );
            }

            return result;
        } catch (error) {
            this.client.log(
                'ERROR',
                `[${this.handlerId}] Failed to deleteModelData for ${modelName} with filter ${await this.client.stringifyJSON(filter)}:`,
                error
            );
            throw error;
        }
    }

    async User(userID) {
        return this.load('profile', { id: userID });
    }

    async getUsers(item = {}) {
        const rows = await this._findManyLean('Profile', item);
        return (rows ?? []).map((r) => reconcile('profile', r, (m) => this._warn(m)));
    }

    async findAllUsers() {
        const cache = this.client.caches.databaseUsersAll;
        if (cache) {
            return cache;
        }

        return [];
    }

    async Member(userID, guildID) {
        return this.load('member', {
            g: guildID,
            id: userID
        });
    }

    async findMembers(guildID) {
        const rows = await this._findManyLean('Member', { g: guildID });
        return (rows ?? []).map((r) => reconcile('member', r, (m) => this._warn(m)));
    }

    async findMembersByName(guildID, names) {
        const wanted = [...new Set((names ?? []).map((name) => String(name ?? '').trim()).filter(Boolean))];

        if (!guildID || !wanted.length) {
            return [];
        }

        const rows = await this._findManyLean(
            'Member',
            {
                g: guildID,
                'nh.n': {
                    $in: wanted.map((name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'))
                }
            },
            {
                projection: {
                    id: 1,
                    nh: 1
                }
            }
        );

        return (rows ?? [])
            .filter((row) => row?.id)
            .map((row) => ({
                id: String(row.id),
                nh: Array.isArray(row.nh) ? row.nh : []
            }));
    }

    async Guild(guildId) {
        return this.getGuild(guildId);
    }

    async deleteGuild(guildId) {
        this._cache.servers.delete(guildId);
        this._cache.guildConfigs.delete(guildId);
        this._registries.delete(guildId);
        await this._deleteOne('Server', { id: guildId });
        return this._deleteOne('GuildConfig', { g: guildId });
    }

    static GUILD_SCOPED = Object.freeze([
        ['Server', 'id'],
        ['GuildConfig', 'g'],
        ['Member', 'g'],
        ['Warning', 'g'],
        ['Mute', 'g'],
        ['HeartBoard', 'g'],
        ['HeartBoardPost', 'g'],
        ['ForumChannel', 'g'],
        ['TicketSystem', 'g'],
        ['ReactionRole', 'g'],
        ['Case', 'g']
    ]);

    async purgeGuild(guildId) {
        if (!guildId || typeof guildId !== 'string') {
            throw new Error(`purgeGuild requires a guild id, got "${guildId}".`);
        }

        const deleted = {};

        for (const [model, key] of DatabaseHandler.GUILD_SCOPED) {
            const result = await this.sendMessageToWorker('deleteMultipleModelData', {
                modelName: model,
                filter: { [key]: guildId }
            });

            const count = result?.deletedCount ?? 0;

            if (count > 0) {
                deleted[model] = count;
            }
        }

        this._cache.servers.delete(guildId);
        this._cache.guildConfigs.delete(guildId);
        this._cache.reactionRoles.delete(guildId);
        this._registries.delete(guildId);

        for (const [name, cache] of [
            ['members', this._cache.members],
            ['warnings', this._cache.warnings],
            ['mutes', this._cache.mutes],
            ['heartboards', this._cache.heartboards],
            ['ticketSystems', this._cache.ticketSystems],
            ['heartboardPosts', this._cache.heartboardPosts],
            ['forum', this._cache.forum],
            ['correctHeartBoard', this._cache.correctHeartBoard]
        ]) {
            void name;

            for (const [cacheKey, value] of cache) {
                if (value?.g === guildId || String(cacheKey).includes(guildId)) {
                    cache.delete(cacheKey);
                }
            }
        }

        return deleted;
    }

    static USER_SCOPED = Object.freeze([
        ['Profile', 'id'],
        ['Reminder', 'u']
    ]);

    async purgeUser(userId) {
        if (!userId || typeof userId !== 'string') {
            throw new Error(`purgeUser requires a user id, got "${userId}".`);
        }

        const key = `profile:${userId}`;

        clearTimeout(this._flushTimers[key]);
        delete this._flushTimers[key];
        this._dirty.delete(key);

        const deleted = {};

        for (const [model, field] of DatabaseHandler.USER_SCOPED) {
            const result = await this.sendMessageToWorker('deleteMultipleModelData', {
                modelName: model,
                filter: { [field]: userId }
            });

            const count = result?.deletedCount ?? 0;

            if (count > 0) {
                deleted[model] = count;
            }
        }

        this._cache.users.delete(userId);

        return deleted;
    }

    dropUser(userId) {
        const key = `profile:${userId}`;

        clearTimeout(this._flushTimers[key]);
        delete this._flushTimers[key];
        this._dirty.delete(key);

        return this._cache.users.delete(userId);
    }

    dropMembers(guildId, userIds) {
        if (!guildId || !Array.isArray(userIds)) {
            return 0;
        }

        let dropped = 0;

        for (const userId of userIds) {
            const key = `member:${guildId}:${userId}`;

            clearTimeout(this._flushTimers[key]);
            delete this._flushTimers[key];
            this._dirty.delete(key);

            if (this._cache.members.delete(`${guildId}:${userId}`)) {
                dropped++;
            }
        }

        return dropped;
    }

    async listMemberPresence(guildId) {
        const rows = await this._findManyLean(
            'Member',
            { g: guildId },
            {
                projection: {
                    id: 1,
                    lm: 1,
                    _id: 0
                }
            }
        );

        return (rows ?? []).map((row) => ({
            id: row.id,
            lm: row.lm ?? 0
        }));
    }

    async setMemberMarks(guildId, userIds, at) {
        if (!guildId || !Array.isArray(userIds) || userIds.length === 0) {
            return 0;
        }

        const update = at > 0 ? { $set: { lm: at } } : { $unset: { lm: '' } };

        let modified = 0;
        for (let i = 0; i < userIds.length; i += 1000) {
            const chunk = userIds.slice(i, i + 1000);

            const result = await this._updateMany(
                'Member',
                {
                    g: guildId,
                    id: { $in: chunk }
                },
                update
            );

            modified += result?.modifiedCount ?? 0;
        }

        for (const userId of userIds) {
            const cached = this._cache.members.get(`${guildId}:${userId}`);

            if (cached) {
                cached.lm = at;
            }
        }

        return modified;
    }

    async findDepartedMembers(guildId, cutoff, limit = 500) {
        const rows = await this._findManyLean(
            'Member',
            {
                g: guildId,
                lm: {
                    $gt: 0,
                    $lt: cutoff
                }
            },
            {
                projection: {
                    id: 1,
                    lm: 1,
                    _id: 0
                },
                sort: { lm: 1 },
                limit
            }
        );

        return (rows ?? []).map((row) => ({
            id: row.id,
            lm: row.lm ?? 0
        }));
    }

    async deleteMembers(guildId, userIds) {
        if (!guildId || !Array.isArray(userIds) || userIds.length === 0) {
            return 0;
        }

        let deleted = 0;

        for (let i = 0; i < userIds.length; i += 1000) {
            const chunk = userIds.slice(i, i + 1000);

            for (const userId of chunk) {
                const key = `member:${guildId}:${userId}`;

                clearTimeout(this._flushTimers[key]);
                delete this._flushTimers[key];
                this._dirty.delete(key);
                this._cache.members.delete(`${guildId}:${userId}`);
            }

            const result = await this.sendMessageToWorker('deleteMultipleModelData', {
                modelName: 'Member',
                filter: {
                    g: guildId,
                    id: { $in: chunk }
                }
            });

            deleted += result?.deletedCount ?? 0;
        }

        return deleted;
    }

    async membershipEvidence(userId, liveGuildIds) {
        const rows = await this._findManyLean(
            'Member',
            {
                id: userId,
                g: { $in: liveGuildIds }
            },
            {
                projection: {
                    lm: 1,
                    _id: 0
                }
            }
        );

        let live = 0;
        let departed = 0;

        for (const row of rows ?? []) {
            if ((row.lm ?? 0) > 0) {
                departed++;
            } else {
                live++;
            }
        }

        return {
            live,
            departed
        };
    }

    async findDepartedProfiles(cutoff, limit = 500) {
        const rows = await this._findManyLean(
            'Profile',
            {
                lm: {
                    $gt: 0,
                    $lt: cutoff
                }
            },
            {
                projection: {
                    id: 1,
                    lm: 1,
                    _id: 0
                },
                sort: { lm: 1 },
                limit
            }
        );

        return (rows ?? []).map((row) => ({
            id: row.id,
            lm: row.lm ?? 0
        }));
    }

    async findUnmarkedProfiles(afterId = '', limit = 500) {
        const rows = await this._findManyLean(
            'Profile',
            {
                id: { $gt: afterId ?? '' },
                lm: {
                    $in: [null, 0]
                }
            },
            {
                projection: {
                    id: 1,
                    _id: 0
                },
                sort: { id: 1 },
                limit
            }
        );

        return (rows ?? []).filter((row) => row.id).map((row) => ({ id: row.id }));
    }

    async findLevellingCandidateProfiles(floorXp, afterId = '', limit = 500) {
        const rows = await this._findManyLean(
            'Profile',
            {
                id: { $gt: afterId ?? '' },
                xp: { $gte: floorXp }
            },
            {
                projection: {
                    id: 1,
                    xp: 1,
                    lvl: 1,
                    _id: 0
                },
                sort: { id: 1 },
                limit
            }
        );

        return (rows ?? [])
            .filter((row) => row.id)
            .map((row) => ({
                id: row.id,
                xp: row.xp ?? 0,
                lvl: row.lvl ?? 0
            }));
    }

    async findLevellingCandidateMembers(guildId, floorXp, afterId = '', limit = 500) {
        const rows = await this._findManyLean(
            'Member',
            {
                g: guildId,
                id: { $gt: afterId ?? '' },
                xp: { $gte: floorXp }
            },
            {
                projection: {
                    id: 1,
                    xp: 1,
                    lvl: 1,
                    _id: 0
                },
                sort: { id: 1 },
                limit
            }
        );

        return (rows ?? [])
            .filter((row) => row.id)
            .map((row) => ({
                id: row.id,
                xp: row.xp ?? 0,
                lvl: row.lvl ?? 0
            }));
    }

    async getGuilds(item = {}, options = {}) {
        const rows = await this._findManyLean('Server', item, options);
        return (rows ?? []).map((r) => reconcile('server', r, (m) => this._warn(m)));
    }

    async HeartBoard(channelId, guildId, requirement) {
        return this._getOrCreate(
            'heartBoard',
            {
                id: channelId,
                g: guildId
            },
            { rq: requirement ?? 3 }
        );
    }

    async getHeartBoardChannels(item = {}) {
        const rows = await this._findManyLean('HeartBoard', item);
        return (rows ?? []).map((r) => reconcile('heartBoard', r, (m) => this._warn(m)));
    }

    async findHeartBoard(channelId, guildId) {
        const key = `${channelId}-${guildId}`;
        if (this._cache.heartboards.has(key)) {
            return this._cache.heartboards.get(key);
        }

        const hb = await this._findOrNull('heartBoard', {
            id: channelId,
            g: guildId
        });
        if (!hb) {
            return null;
        }

        this._cache.heartboards.set(key, hb);
        return hb;
    }

    async deleteHeartBoard(channelId, guildId) {
        this._cache.heartboards.delete(`${channelId}-${guildId}`);

        for (const [key, id] of this._cache.correctHeartBoard) {
            if (id === channelId && key.startsWith(`${guildId}-`)) {
                this._cache.correctHeartBoard.delete(key);
            }
        }

        return this._deleteOne('HeartBoard', {
            id: channelId,
            g: guildId
        });
    }

    async findHeardBoardPost(originalId) {
        if (this._cache.heartboardPosts.has(originalId)) {
            return this._cache.heartboardPosts.get(originalId);
        }

        const post = await this._findOrNull('heartBoardPost', { oid: originalId });
        if (!post) {
            return null;
        }

        this._cache.heartboardPosts.set(originalId, post);
        return post;
    }

    async deleteHeartBoardPost(originalId) {
        if (!originalId) {
            throw new Error(`deleteHeartBoardPost: refusing to delete with oid=${originalId}`);
        }

        this._cache.heartboardPosts.delete(originalId);

        this._cache.heartboardPosts.delete(`true-${originalId}`);
        this._cache.heartboardPosts.delete(`false-${originalId}`);

        return this._deleteOne('HeartBoardPost', { oid: originalId });
    }

    async findCorrectHeartBoardChannel(guildId, emojiName, emojiId) {
        const key = `${guildId}-${emojiName}-${emojiId}`;

        if (this._cache.correctHeartBoard.has(key)) {
            return this.findHeartBoard(this._cache.correctHeartBoard.get(key), guildId);
        }

        const rows = await this._findManyLean('HeartBoard', { g: guildId });
        const boards = (rows ?? []).map((r) => reconcile('heartBoard', r, (m) => this._warn(m)));
        const correct =
            boards.filter(
                (ch) => ch.em?.[0]?.includes(emojiName) && (emojiId ? ch.em?.[0]?.includes(emojiId) : true)
            )?.[0] ?? null;

        if (!correct?.id) {
            return null;
        }

        this._cache.correctHeartBoard.set(key, correct.id);

        return this.findHeartBoard(correct.id, guildId);
    }

    async HeartBoardPost(isEmbed, messageId) {
        if (this._cache.heartboardPosts.has(messageId)) {
            return this._cache.heartboardPosts.get(messageId);
        }

        if (this._heartBoardPostInflight.has(messageId)) {
            return this._heartBoardPostInflight.get(messageId);
        }

        const pending = (async () => {
            const existing = await this._findOrNull('heartBoardPost', { oid: messageId });

            if (existing) {
                this._cache.heartboardPosts.set(messageId, existing);
                return existing;
            }

            if (isEmbed) {
                return null;
            }

            const post = reconcile('heartBoardPost', null, (m) => this._warn(m), { oid: messageId });
            await this._replace('HeartBoardPost', { oid: messageId }, stripDefaults('heartBoardPost', post));
            this._cache.heartboardPosts.set(messageId, post);

            return post;
        })().finally(() => this._heartBoardPostInflight.delete(messageId));

        this._heartBoardPostInflight.set(messageId, pending);

        return pending;
    }

    async getTicketSystems(item = {}) {
        const rows = await this._findManyLean('TicketSystem', item);
        return (rows ?? []).map((r) => reconcile('ticketSystem', r, (m) => this._warn(m)));
    }

    async findTicketSystem(channelId, guildId, messageId) {
        const key = `${guildId}${channelId}${messageId}`;
        if (this.client.collections.ticketSystems.has(key)) {
            return this.client.collections.ticketSystems.get(key);
        }

        const system = await this._findOrNull('ticketSystem', {
            g: guildId,
            c: channelId,
            mid: messageId
        });
        if (system) {
            this.client.collections.ticketSystems.set(key, system);
        }

        return system ?? null;
    }

    async deleteTicketSystem(item) {
        return this._deleteOne('TicketSystem', item);
    }

    async TicketingSystem(guildId, channelId, messageId, title) {
        const key = `${guildId}${channelId}${messageId}`;
        if (this.client.collections.ticketSystems.has(key)) {
            return this.client.collections.ticketSystems.get(key);
        }

        const existing = await this._findOrNull('ticketSystem', {
            g: guildId,
            c: channelId,
            mid: messageId
        });
        if (existing) {
            this.client.collections.ticketSystems.set(key, existing);
            return existing;
        }

        const doc = reconcile('ticketSystem', null, (m) => this._warn(m), {
            g: guildId,
            c: channelId,
            mid: messageId
        });
        doc.ds = `[ĄSPLITTERĄ]color: "#FF69B4", title: "${title}"`;
        doc.fm = {
            placeholder: {
                1: {
                    title: 'Form question 1',
                    style: 'short',
                    ph: 'Input type - short',
                    max: 15,
                    min: 0
                },
                req2: {
                    title: 'Form question 2',
                    style: 'long',
                    ph: 'Input type - long\nRequired: Yes\nRemember, you can edit all of this later.\nWrite here to proceed.',
                    max: 1000,
                    min: 0
                }
            }
        };
        doc.bt = {
            placeholder: {
                x: 0,
                y: 0,
                color: 'blue',
                title: 'Create Ticket',
                modalTitle: 'Placeholder Modal',
                emoji: '📥',
                control: true,
                in: {
                    users: [],
                    roles: []
                },
                out: {
                    users: [],
                    channels: [channelId]
                }
            }
        };

        await this._replace(
            'TicketSystem',
            {
                g: guildId,
                c: channelId,
                mid: messageId
            },
            stripDefaults('ticketSystem', doc)
        );
        this.client.collections.ticketSystems.set(key, doc);
        return doc;
    }

    async deleteForumChannel(channel, guild) {
        this._cache.forum.delete(`${channel}-${guild}`);
        return this._deleteOne('ForumChannel', {
            id: channel,
            g: guild
        });
    }

    async findForumChannel(channel, guild) {
        const key = `${channel}-${guild}`;
        if (this._cache.forum.has(key)) {
            return this._cache.forum.get(key);
        }

        const forum = await this._findOrNull('forumChannel', {
            id: channel,
            g: guild
        });
        if (!forum) {
            return null;
        }

        this._cache.forum.set(key, forum);
        return forum;
    }

    async findForumChannels(guild) {
        const key = `all-${guild}`;
        if (this._cache.forum.has(key)) {
            return this._cache.forum.get(key);
        }

        const rows = await this._findManyLean('ForumChannel', { g: guild });
        const forums = (rows ?? []).map((r) => reconcile('forumChannel', r, (m) => this._warn(m)));
        this._cache.forum.set(key, forums);
        return forums;
    }

    async ForumChannel(channel, guild, emoji, roles, pending, approved) {
        return this._getOrCreate(
            'forumChannel',
            {
                id: channel,
                g: guild
            },
            {
                em: emoji,
                rl: roles ?? [],
                tg: {
                    p: pending ?? '',
                    a: approved ?? ''
                }
            }
        );
    }

    _warn(msg) {
        this._warnedShapes ??= new Map();

        const text = String(msg ?? '');
        const key = text.split(' = ')[0];
        const now = Date.now();
        const last = this._warnedShapes.get(key) ?? 0;

        if (now - last < SHAPE_WARN_INTERVAL) {
            return;
        }
        for (const [seen, at] of this._warnedShapes) {
            if (now - at >= SHAPE_WARN_INTERVAL) {
                this._warnedShapes.delete(seen);
            }
        }

        this._warnedShapes.set(key, now);
        this.client.log('WARN', `[db] ${text}`);
    }

    _findLean(modelName, filter) {
        return this.sendMessageToWorker('findLean', {
            modelName,
            filter
        });
    }

    _findManyLean(modelName, filter = {}, options = {}) {
        return this.sendMessageToWorker('findManyLean', {
            modelName,
            filter,
            ...options
        });
    }

    _updateMany(modelName, filter, updateData) {
        return this.sendMessageToWorker('updateMultipleModelData', {
            modelName,
            filter,
            updateData
        });
    }

    _replace(modelName, filter, doc) {
        return this.sendMessageToWorker('replaceUpsert', {
            modelName,
            filter,
            doc
        });
    }

    _patch(modelName, filter, set, unset) {
        return this.sendMessageToWorker('patchDoc', {
            modelName,
            filter,
            set,
            unset
        });
    }

    _deleteOne(modelName, filter) {
        const usable = Object.entries(filter ?? {}).filter(
            ([, value]) => value !== undefined && value !== null && value !== ''
        );

        if (usable.length === 0) {
            throw new Error(
                `_deleteOne(${modelName}): empty filter after dropping blank values (${JSON.stringify(filter)}) - refusing to delete.`
            );
        }

        return this.sendMessageToWorker('deleteModelData', {
            modelName,
            filter: Object.fromEntries(usable)
        });
    }

    async _findOrNull(schemaKey, filter) {
        const raw = await this._findLean(schemaToModel[schemaKey], filter);
        return raw ? reconcile(schemaKey, raw, (m) => this._warn(m)) : null;
    }

    async _getOrCreate(schemaKey, filter, overrides = {}) {
        const existing = await this._findOrNull(schemaKey, filter);
        if (existing) {
            return existing;
        }

        const doc = reconcile(schemaKey, null, (m) => this._warn(m), filter);
        Object.assign(doc, overrides);

        await this._replace(schemaToModel[schemaKey], filter, stripDefaults(schemaKey, doc));
        return doc;
    }

    _cacheFor(r) {
        return r.clientCollection ? this.client.collections[r.cache] : this._cache[r.cache];
    }

    async load(schemaKey, ids) {
        const r = ROUTE[schemaKey];

        if (!r) {
            throw new Error(`db.load: no route for schema "${schemaKey}"`);
        }

        const cache = this._cacheFor(r);
        const key = r.key(ids);

        if (cache.has(key)) {
            return cache.get(key);
        }

        const raw = await this._findLean(schemaToModel[schemaKey], r.filter(ids));
        const full = reconcile(schemaKey, raw, (m) => this._warn(m), r.identity(ids));

        if (r.registry) {
            this._ensureRegistry(full.id, full);
        }

        cache.set(key, full);

        return full;
    }

    queue(schemaKey, ids, changes) {
        const r = ROUTE[schemaKey];
        const cache = this._cacheFor(r);
        const key = r.key(ids);
        const obj = cache.get(key);

        if (!obj) {
            this._warn(`queue before load: ${schemaKey} ${key}`);
            return;
        }

        for (const c of Array.isArray(changes) ? changes : [changes]) {
            Lodash.set(obj, c.path ?? c.alter, c.value);
        }

        this._markDirty(schemaKey, r.filter(ids), key, obj);
    }

    _markDirty(schemaKey, filter, key, obj) {
        const k = `${schemaKey}:${key}`;
        this._dirty.set(k, {
            schemaKey,
            filter,
            obj
        });

        clearTimeout(this._flushTimers[k]);
        this._flushTimers[k] = setTimeout(() => this._flush(k).catch((e) => this.client.log('ERROR', e)), 200);
    }

    async _flush(k) {
        const entry = this._dirty.get(k);

        if (!entry) {
            return;
        }

        this._dirty.delete(k);

        this.client.module?.stats?.count('db.flush');
        this.client.module?.stats?.count(`db.flush.${entry.schemaKey}`);

        const stripped = stripDefaults(entry.schemaKey, entry.obj);

        this._flushing ??= new Set();
        this._flushing.add(k);

        try {
            await this._replace(schemaToModel[entry.schemaKey], entry.filter, stripped);
        } finally {
            this._flushing.delete(k);
        }

        if (this.client.flags.logs.debug) {
            this.client.log(
                'DEBUG',
                `[db] flushed ${entry.schemaKey} ${JSON.stringify(entry.filter)}${
                    isPureDefault(entry.schemaKey, entry.obj) ? ' (pure default)' : ''
                }`
            );
        }
    }

    async saveDoc(schemaKey, ids, changes) {
        await this.load(schemaKey, ids);
        this.queue(schemaKey, ids, changes);
    }

    async docExists(schemaKey, ids) {
        const r = ROUTE[schemaKey];

        if (!r) {
            throw new Error(`db.docExists: no route for schema "${schemaKey}"`);
        }

        return (await this._findLean(schemaToModel[schemaKey], r.filter(ids))) !== null;
    }

    async deleteDoc(schemaKey, ids) {
        const r = ROUTE[schemaKey];

        if (!r) {
            throw new Error(`db.deleteDoc: no route for schema "${schemaKey}"`);
        }

        const key = r.key(ids);
        const dirtyKey = `${schemaKey}:${key}`;

        clearTimeout(this._flushTimers[dirtyKey]);
        delete this._flushTimers[dirtyKey];
        this._dirty.delete(dirtyKey);

        await this._deleteOne(schemaToModel[schemaKey], r.filter(ids));
        this._cacheFor(r).delete(key);
    }

    async flushAll() {
        for (const k of [...this._dirty.keys()]) {
            clearTimeout(this._flushTimers[k]);
            await this._flush(k).catch((e) => this.client.log('ERROR', e));
        }

        for (const guildId of [...this._guildDirty.keys()]) {
            clearTimeout(this._guildFlushTimers[guildId]);
            await this._flushGuild(guildId).catch((e) => this.client.log('ERROR', e));
        }
    }

    _schemaForCache(name) {
        this._cacheSchemas ??= new Map(Object.entries(ROUTE).map(([schemaKey, route]) => [route.cache, schemaKey]));

        return this._cacheSchemas.get(name) ?? null;
    }

    cacheReport() {
        return Object.entries(this._cache).map(([name, cache]) => ({
            name,
            size: cache.size,
            pending: this._pendingFor(name)
        }));
    }

    _pendingFor(name) {
        const schemaKey = this._schemaForCache(name);

        if (!schemaKey) {
            return 0;
        }

        if (name === 'servers' || name === 'guildConfigs') {
            return this._guildDirty.size;
        }

        let pending = 0;

        for (const key of this._dirty.keys()) {
            if (key.startsWith(`${schemaKey}:`)) {
                pending++;
            }
        }

        return pending;
    }

    trimCache(name, limit) {
        const cache = this._cache[name];

        if (!cache || cache.size <= limit) {
            return 0;
        }

        const schemaKey = this._schemaForCache(name);
        const guildScoped = name === 'servers' || name === 'guildConfigs';

        let dropped = 0;

        for (const key of [...cache.keys()]) {
            if (cache.size <= limit) {
                break;
            }

            if (
                guildScoped
                    ? this._guildDirty.has(key) || this._flushingGuilds?.has(key)
                    : schemaKey &&
                      (this._dirty.has(`${schemaKey}:${key}`) || this._flushing?.has(`${schemaKey}:${key}`))
            ) {
                continue;
            }

            cache.delete(key);

            if (name === 'servers') {
                this._registries.delete(key);
            }

            dropped++;
        }

        return dropped;
    }

    _ensureRegistry(guildId, guildObj) {
        let rm = this._registries.get(guildId);

        if (!rm || rm.array !== guildObj.reg) {
            rm = new RegistryManager(guildObj.reg, () => this._markGuildDirty(guildId, { hot: true }));
            this._registries.set(guildId, rm);
        }

        return rm;
    }

    async registryFor(guildId) {
        const guild = await this.getGuild(guildId);
        return this._ensureRegistry(guildId, guild);
    }

    async getGuild(id) {
        const cache = this._cache.servers;

        if (cache.has(id)) {
            return cache.get(id);
        }

        const [hotRaw, coldRaw] = await Promise.all([
            this._findLean('Server', { id }),
            this._findLean('GuildConfig', { g: id })
        ]);

        const hot = reconcile('server', hotRaw, (m) => this._warn(m), { id });
        const cold = reconcile('guildConfig', coldRaw, (m) => this._warn(m), { g: id });

        const merged = {
            ...cold,
            ...hot,
            id,
            v: hot.v
        };
        delete merged.g;

        cache.set(id, merged);
        this._ensureRegistry(id, merged);

        return merged;
    }

    getGuildConfig(id) {
        return this.getGuild(id);
    }

    async flushGuild(guildId) {
        clearTimeout(this._guildFlushTimers[guildId]);

        return this._flushGuild(guildId);
    }

    async reloadGuild(guildId) {
        await this.flushGuild(guildId).catch((e) =>
            this._warn(`reloadGuild(${guildId}): flush failed - ${e?.message ?? e}`)
        );

        this._cache.servers.delete(guildId);
        this._cache.guildConfigs.delete(guildId);

        return this.getGuild(guildId);
    }

    async flushProfile(userId) {
        const k = `profile:${userId}`;

        clearTimeout(this._flushTimers[k]);

        return this._flush(k);
    }

    async flushMembers(guildId, userIds) {
        if (!guildId || !Array.isArray(userIds) || userIds.length === 0) {
            return;
        }

        for (const userId of userIds) {
            const key = `member:${guildId}:${userId}`;

            clearTimeout(this._flushTimers[key]);

            await this._flush(key);
        }
    }

    async reloadUser(userId) {
        await this.flushProfile(userId).catch((e) =>
            this._warn(`reloadUser(${userId}): flush failed - ${e?.message ?? e}`)
        );

        this._cache.users.delete(userId);

        return this.User(userId);
    }

    async saveGuild(guildId, changes) {
        const merged = await this.getGuild(guildId);
        const list = Array.isArray(changes) ? changes : [changes];
        let hot = false;
        let cold = false;

        for (const c of list) {
            const path = String(c.path ?? c.alter);
            const seg = path.split('.')[0];

            if (HOT_KEYS.has(seg)) {
                hot = true;
            } else if (COLD_KEYS.has(seg)) {
                cold = true;
            } else {
                this._warn(`saveGuild(${guildId}): unroutable path "${path}"`);
                continue;
            }

            Lodash.set(merged, path, c.value);
        }

        this._markGuildDirty(guildId, {
            hot,
            cold
        });
    }

    _markGuildDirty(guildId, { hot = false, cold = false } = {}) {
        const cur = this._guildDirty.get(guildId) ?? {
            hot: false,
            cold: false
        };
        cur.hot = cur.hot || hot;
        cur.cold = cur.cold || cold;
        this._guildDirty.set(guildId, cur);

        clearTimeout(this._guildFlushTimers[guildId]);
        this._guildFlushTimers[guildId] = setTimeout(
            () => this._flushGuild(guildId).catch((e) => this.client.log('ERROR', e)),
            200
        );
    }

    async _flushGuild(guildId) {
        const flags = this._guildDirty.get(guildId);
        const merged = this._cache.servers.get(guildId);

        if (!flags || !merged) {
            return;
        }

        this._guildDirty.delete(guildId);

        const writes = [];

        if (flags.hot) {
            const hotObj = { id: guildId };
            for (const k of HOT_KEYS) {
                if (k in merged) {
                    hotObj[k] = merged[k];
                }
            }

            writes.push(this._replace('Server', { id: guildId }, stripDefaults('server', hotObj)));
        }

        if (flags.cold) {
            const coldObj = { g: guildId };
            for (const k of COLD_KEYS) {
                if (k in merged) {
                    coldObj[k] = merged[k];
                }
            }

            writes.push(this._replace('GuildConfig', { g: guildId }, stripDefaults('guildConfig', coldObj)));
        }

        this._flushingGuilds ??= new Set();
        this._flushingGuilds.add(guildId);

        try {
            await Promise.all(writes);
        } finally {
            this._flushingGuilds.delete(guildId);
        }
    }

    warningDoc(g, u) {
        return this.load('warning', {
            g,
            u
        });
    }

    async warningsOf(g, u) {
        const reg = await this.registryFor(g);
        const doc = await this.warningDoc(g, u);

        return doc.w.map((e) => ({
            reason: reg.deref(e.r) ?? '',
            tier: e.t ?? 0,
            author: reg.deref(e.a) ?? '',
            date: e.d ?? 0,
            edits: e.e ?? []
        }));
    }

    async allWarnings(g) {
        const reg = await this.registryFor(g);
        const rows = await this._findManyLean('Warning', { g });

        return (rows ?? []).map((doc) => ({
            u: doc.u,
            w: (doc.w ?? []).map((e) => ({
                reason: reg.deref(e.r) ?? '',
                tier: e.t ?? 0,
                author: reg.deref(e.a) ?? '',
                date: e.d ?? 0,
                edits: e.e ?? []
            }))
        }));
    }

    async guildMaxWarningTier(g) {
        const hit = this._maxTier.get(g);

        if (hit && Date.now() - hit.at < MAX_TIER_TTL_MS) {
            return hit.tier;
        }

        const floor = hit?.floor ?? MIN_MAX_WARNING_TIER;

        let tier = floor;

        try {
            for (const entry of await this.allWarnings(g)) {
                for (const warn of entry.w) {
                    if (typeof warn.tier === 'number' && !isNaN(warn.tier) && warn.tier > tier) {
                        tier = warn.tier;
                    }
                }
            }
        } catch (error) {
            this.client.log('WARN', `Could not derive the highest warning tier for ${g}: ${error?.message ?? error}`);

            return hit?.tier ?? floor;
        }

        this._maxTier.set(g, {
            tier,
            floor,
            at: Date.now()
        });

        return tier;
    }

    async addWarning(g, u, { reason = 'None.', tier = 0, author = '' } = {}) {
        const reg = await this.registryFor(g);
        const doc = await this.warningDoc(g, u);

        doc.w.push({
            r: reg.ref(reason),
            t: tier,
            a: reg.ref(author),
            d: Date.now(),
            e: []
        });
        this._markDirty(
            'warning',
            {
                g,
                u
            },
            `${g}:${u}`,
            doc
        );

        if (typeof tier === 'number' && !isNaN(tier)) {
            const cached = this._maxTier.get(g) ?? {
                tier: MIN_MAX_WARNING_TIER,
                floor: MIN_MAX_WARNING_TIER,
                at: 0
            };

            if (tier > cached.floor) {
                cached.floor = tier;
            }

            if (tier > cached.tier) {
                cached.tier = tier;
            }

            this._maxTier.set(g, cached);
        }

        return doc.w.length;
    }

    async _settleWarnings(g, u) {
        const key = `warning:${g}:${u}`;

        clearTimeout(this._flushTimers[key]);
        delete this._flushTimers[key];

        await this._flush(key).catch((e) =>
            this._warn(`_settleWarnings(${g}:${u}): flush failed - ${e?.message ?? e}`)
        );

        this._maxTier.delete(g);
    }

    async setWarnings(g, u, list) {
        const reg = await this.registryFor(g);
        const doc = await this.warningDoc(g, u);

        doc.w = (list ?? []).map((w) => ({
            r: reg.ref(w.reason),
            t: w.tier ?? 0,
            a: reg.ref(w.author),
            d: w.date ?? Date.now(),
            e: w.edits ?? []
        }));
        this._markDirty(
            'warning',
            {
                g,
                u
            },
            `${g}:${u}`,
            doc
        );

        await this._settleWarnings(g, u);
    }

    async clearWarnings(g, u) {
        const doc = await this.warningDoc(g, u);
        doc.w = [];
        this._markDirty(
            'warning',
            {
                g,
                u
            },
            `${g}:${u}`,
            doc
        );

        await this._settleWarnings(g, u);
    }

    async clearAllWarnings(g) {
        for (const key of this._cache.warnings.keys()) {
            if (key.startsWith(`${g}:`)) {
                this._cache.warnings.delete(key);
            }
        }

        for (const key of [...this._dirty.keys()]) {
            if (key.startsWith(`warning:${g}:`)) {
                clearTimeout(this._flushTimers[key]);
                delete this._flushTimers[key];
                this._dirty.delete(key);
            }
        }

        this._maxTier.delete(g);

        return this.sendMessageToWorker('deleteMultipleModelData', {
            modelName: 'Warning',
            filter: { g }
        });
    }

    async isMuted(g, u) {
        if (this._cache.mutes.has(`${g}:${u}`)) {
            return true;
        }

        return !!(await this._findLean('Mute', {
            g,
            u
        }));
    }

    async getMutes(g) {
        const reg = await this.registryFor(g);
        const rows = await this._findManyLean('Mute', { g });

        return (rows ?? []).map((m) => ({
            user: m.u,
            mod: reg.deref(m.md) ?? '',
            exp: m.ex ?? 0,
            roles: reg.derefAll(m.rl ?? []),
            reason: reg.deref(m.rs) ?? '',
            dur: m.du ?? 0,
            channel: reg.deref(m.c) ?? '',
            at: m.at ?? 0
        }));
    }

    async getMute(g, u) {
        const reg = await this.registryFor(g);
        const m = await this._findLean('Mute', {
            g,
            u
        });

        if (!m) {
            return null;
        }

        return {
            user: m.u,
            mod: reg.deref(m.md) ?? '',
            exp: m.ex ?? 0,
            roles: reg.derefAll(m.rl ?? []),
            reason: reg.deref(m.rs) ?? '',
            dur: m.du ?? 0,
            channel: reg.deref(m.c) ?? '',
            at: m.at ?? 0,
            ban: m.bn ?? false
        };
    }

    async dueMutes() {
        const rows = await this._findManyLean('Mute', {
            ex: {
                $gt: 0,
                $lte: Date.now()
            }
        });
        const byGuild = new Map();

        for (const m of rows ?? []) {
            if (!byGuild.has(m.g)) {
                byGuild.set(m.g, []);
            }

            byGuild.get(m.g).push(m);
        }

        const out = [];

        for (const [g, list] of byGuild) {
            const reg = await this.registryFor(g);

            for (const m of list) {
                out.push({
                    g,
                    user: m.u,
                    mod: reg.deref(m.md) ?? '',
                    exp: m.ex ?? 0,
                    roles: reg.derefAll(m.rl ?? []),
                    reason: reg.deref(m.rs) ?? '',
                    dur: m.du ?? 0,
                    channel: reg.deref(m.c) ?? '',
                    at: m.at ?? 0,
                    ban: m.bn ?? false
                });
            }
        }

        return out;
    }

    async addMute(g, u, { mod = '', exp = 0, roles = [], reason = '', dur = 0, channel = '', ban = false } = {}) {
        const reg = await this.registryFor(g);
        const doc = await this.load('mute', {
            g,
            u
        });

        Object.assign(doc, {
            md: reg.ref(mod),
            ex: exp,
            rl: reg.refAll(roles),
            rs: reg.ref(reason),
            du: dur,
            c: reg.ref(channel),
            at: Date.now(),
            bn: ban
        });
        this._markDirty(
            'mute',
            {
                g,
                u
            },
            `${g}:${u}`,
            doc
        );

        return doc;
    }

    async removeMute(g, u) {
        this._cache.mutes.delete(`${g}:${u}`);
        return this._deleteOne('Mute', {
            g,
            u
        });
    }

    getReactionRoles(g) {
        return this.load('reactionRole', { g });
    }

    async setReactionRoles(g, entries) {
        const doc = await this.load('reactionRole', { g });
        doc.e = entries ?? [];
        this._markDirty('reactionRole', { g }, g, doc);
    }

    addCase(g, data = {}) {
        const prev = this._caseChain.get(g) ?? Promise.resolve();
        const run = prev.then(
            () => this._addCaseInner(g, data),
            () => this._addCaseInner(g, data)
        );
        this._caseChain.set(
            g,
            run.then(
                () => {},
                () => {}
            )
        );
        return run;
    }

    async _addCaseInner(
        g,
        { type = '', user = '', mod = '', reason = '', extra = '', guildBan = false, echo = '' } = {}
    ) {
        const guild = await this.getGuild(g);
        const n = (Number(guild.d?.ca) || 0) + 1;
        await this.saveGuild(g, {
            alter: 'd.ca',
            value: n
        });

        const doc = reconcile('case', null, (m) => this._warn(m), {
            g,
            n
        });
        Object.assign(doc, {
            ty: String(type ?? ''),
            u: String(user ?? ''),
            md: String(mod ?? ''),
            rs: String(reason ?? ''),
            ex: String(extra ?? ''),
            at: Date.now()
        });

        await this._replace(
            'Case',
            {
                g,
                n
            },
            stripDefaults('case', doc)
        );

        const kind = echo || (guildBan ? 'ban' : '');

        if (kind && user) {
            this._caseGuard.set(`${kind}:${g}:${user}`, {
                n,
                at: Date.now()
            });
        }

        return n;
    }

    takeCase(kind, g, u) {
        const key = `${kind}:${g}:${u}`;
        const hit = this._caseGuard.get(key);
        const now = Date.now();

        if (hit && now - hit.at < 30_000) {
            this._caseGuard.delete(key);
            return hit.n;
        }

        for (const [k, v] of this._caseGuard) {
            if (now - v.at >= 30_000) {
                this._caseGuard.delete(k);
            }
        }

        return null;
    }

    takeBanCase(g, u) {
        return this.takeCase('ban', g, u);
    }

    async getCases(g) {
        const rows = await this._findManyLean('Case', { g }, { sort: { n: -1 } });
        return (rows ?? []).map((r) => reconcile('case', r, (m) => this._warn(m)));
    }

    async casesOf(g, u) {
        const rows = await this._findManyLean(
            'Case',
            {
                g,
                u
            },
            { sort: { n: -1 } }
        );
        return (rows ?? []).map((r) => reconcile('case', r, (m) => this._warn(m)));
    }

    async casesInvolving(g, u) {
        const rows = await this._findManyLean(
            'Case',
            {
                g,
                $or: [{ u }, { md: u }]
            },
            { sort: { n: -1 } }
        );
        return (rows ?? []).map((r) => reconcile('case', r, (m) => this._warn(m)));
    }

    async getCase(g, n) {
        return this._findOrNull('case', {
            g,
            n: Number(n)
        });
    }

    async addCaseOutcome(g, u, { type = '', mod = '', types = null, limit = 5 } = {}) {
        if (!g || !u || !type) {
            return [];
        }

        const rows = await this._findManyLean(
            'Case',
            {
                g,
                u
            },
            {
                sort: { n: -1 },
                limit
            }
        );
        const updated = [];

        for (const row of rows ?? []) {
            const doc = reconcile('case', row, (m) => this._warn(m));

            if (types && !types.includes(doc.ty)) {
                continue;
            }

            doc.ou = Array.isArray(doc.ou) ? doc.ou : [];

            if (!doc.ou.some((entry) => entry?.t === type)) {
                doc.ou.push({
                    t: String(type),
                    at: Date.now(),
                    md: String(mod ?? '')
                });

                await this._replace(
                    'Case',
                    {
                        g,
                        n: doc.n
                    },
                    stripDefaults('case', doc)
                );
                updated.push(doc.n);
            }

            break;
        }

        return updated;
    }
}
