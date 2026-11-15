'use strict';

import fs from 'fs';
import _ from 'lodash';
import Mongoose from 'mongoose';
import Relaxy from '../../Relaxy.js';
import { parentPort, workerData } from 'worker_threads';
import Server from '../Database/Blueprints/Server.js';
import GuildConfig from '../Database/Blueprints/GuildConfig.js';
import Member from '../Database/Blueprints/Member.js';
import Warning from '../Database/Blueprints/Warning.js';
import Mute from '../Database/Blueprints/Mute.js';
import Profile from '../Database/Blueprints/Profile.js';
import Reminder from '../Database/Blueprints/Reminder.js';
import HeartBoard from '../Database/Blueprints/HeartBoard.js';
import TicketSystem from '../Database/Blueprints/TicketSystem.js';
import ForumChannel from '../Database/Blueprints/ForumChannel.js';
import ReactionRole from '../Database/Blueprints/ReactionRole.js';
import HeartBoardPost from '../Database/Blueprints/HeartBoardPost.js';
import Case from '../Database/Blueprints/Case.js';
import Stat from '../Database/Blueprints/Stat.js';

import { indexes as INDEX_SPECS } from '../Database/DatabaseDefaults.js';

const modelMap = {
    Server,
    GuildConfig,
    Member,
    Profile,
    Warning,
    Mute,
    Reminder,
    HeartBoard,
    ForumChannel,
    TicketSystem,
    ReactionRole,
    HeartBoardPost,
    Case,
    Stat
};

const dbUri = workerData.dbUri;
const client = workerData.client;
const ownerProcessId = workerData.ownerProcessId;

let isConnected = false;

const logFromWorker = (level, message, ...args) => {
    parentPort.postMessage({
        type: 'workerLog',
        handlerId: ownerProcessId,
        level: level,
        message: message,
        args: args
    });
};

const flatten = (obj, prefix = '') => {
    return Object.entries(obj).reduce((acc, [k, v]) => {
        const key = prefix ? `${prefix}.${k}` : k;

        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            Object.assign(acc, flatten(v, key));
        } else {
            acc[key] = v;
        }

        return acc;
    }, {});
};

const ensureIndexes = async () => {
    const db = Mongoose.connection.db;
    let created = 0;

    for (const [collection, specs] of Object.entries(INDEX_SPECS)) {
        for (const { key, options } of specs) {
            try {
                await db.collection(collection).createIndex(key, options ?? {});
                created++;
            } catch (err) {
                logFromWorker('WARN', `[dbWorker] ensureIndexes: ${collection} ${JSON.stringify(key)} failed`, err);
            }
        }
    }

    logFromWorker('DEBUG', `[dbWorker] ensureIndexes: ${created} index(es) ensured.`);

    return { ensured: created };
};

const isTransientConnectError = (err) => {
    const s = `${err?.code ?? ''} ${err?.syscall ?? ''} ${err?.message ?? ''}`.toLowerCase();

    return (
        s.includes('eservfail') ||
        s.includes('enotfound') ||
        s.includes('eai_again') ||
        s.includes('etimedout') ||
        s.includes('econnrefused') ||
        s.includes('econnreset') ||
        s.includes('enetunreach') ||
        s.includes('ehostunreach') ||
        s.includes('querysrv') ||
        s.includes('querytxt') ||
        s.includes('mongoserverselectionerror') ||
        s.includes('getaddrinfo')
    );
};
const connectDb = async () => {
    if (isConnected) {
        return;
    }

    const MAX_ATTEMPTS = 8;
    const tag = `[dbWorker-${ownerProcessId.replace('dbHandler-', '')}]`;

    for (let attempt = 1; ; attempt++) {
        try {
            await Mongoose.connect(dbUri, { serverSelectionTimeoutMS: 30000 });
            isConnected = true;
            logFromWorker('DEBUG', `${tag} Connected to MongoDB${attempt > 1 ? ` (attempt ${attempt})` : ''}.`);

            await ensureIndexes().catch((err) =>
                logFromWorker('WARN', '[dbWorker] ensureIndexes on connect failed', err)
            );

            return;
        } catch (err) {
            try {
                await Mongoose.disconnect();
            } catch {}

            if (attempt >= MAX_ATTEMPTS || !isTransientConnectError(err)) {
                logFromWorker('ERROR', `${tag} Failed to connect to MongoDB after ${attempt} attempt(s)`, err);
                throw err;
            }

            const delay = Math.min(15000, 1000 * 2 ** (attempt - 1));
            logFromWorker(
                'WARN',
                `${tag} MongoDB connect attempt ${attempt} failed (${err?.code ?? err?.message}); retrying in ${delay}ms`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
};
parentPort.on('message', async (message) => {
    const { type, data, messageId } = message;

    if (type === 'connect') {
        try {
            await connectDb();
            parentPort.postMessage({
                messageId,
                success: true
            });
        } catch (error) {
            parentPort.postMessage({
                messageId,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        }

        return;
    }

    if (!isConnected) {
        logFromWorker(
            'WARN',
            `Worker: Postponing message type "${type}" by 1s for model ${data?.modelName} with filter ${JSON.stringify(data?.filter)} until the database connection is established.`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    let result = null;
    let error = null;

    try {
        switch (type) {
            case 'aggregateModelData':
                {
                    const { modelName, pipeline } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    const aggregateResult = await Model.aggregate(pipeline);
                    result = aggregateResult;

                    logFromWorker(
                        'DEBUG',
                        `Worker: Aggregated ${modelName} with pipeline ${JSON.stringify(pipeline)}. Result count: ${aggregateResult.length}`
                    );
                }
                break;

            case 'updateModel':
                {
                    const { modelName, filter, updateData, options = {} } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        logFromWorker('ERROR', `Worker: Update requested for unknown model: ${modelName}`);
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    const updateOperationResult = await Model.updateOne(filter, updateData, options);

                    result = updateOperationResult;

                    logFromWorker(
                        'DEBUG',
                        `Worker: Updated ${modelName} with filter ${JSON.stringify(filter)}. Result: ${JSON.stringify(result)}`
                    );
                }
                break;

            case 'getModelData':
                {
                    const { modelName, filter, defaults } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    let doc = await Model.findOne(filter);

                    if (!doc && defaults) {
                        doc = new Model(defaults);
                        await doc.save();
                    }

                    result = doc ? doc.toObject() : null;
                }
                break;

            case 'getMultipleModelData':
                {
                    const { modelName, filter, options = {} } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    const {
                        lean = false,
                        projection,
                        sort = null,
                        useCursor = false,
                        batchSize = 1000,
                        inFull = false
                    } = options;

                    try {
                        let allDocs = [];

                        if (inFull) {
                            logFromWorker(
                                'INFO',
                                `[dbWorker-${ownerProcessId.replace('dbHandler-', '')}] Executing inFull fetch for ${modelName} with filter ${JSON.stringify(filter)} and options ${JSON.stringify(options)}`
                            );

                            allDocs = await Model.find(filter)
                                .lean(
                                    lean
                                        ? {
                                              defaults: true,
                                              virtuals: false,
                                              getters: false
                                          }
                                        : null
                                )
                                .select(projection || {})
                                .sort(sort || {})
                                .exec();
                        } else if (useCursor) {
                            const cursor = Model.find(filter)
                                .lean(
                                    lean
                                        ? {
                                              defaults: true,
                                              virtuals: false,
                                              getters: false
                                          }
                                        : null
                                )
                                .select(projection || {})
                                .sort(sort || {})
                                .cursor();

                            try {
                                for await (const doc of cursor) {
                                    allDocs.push(doc);
                                }
                            } catch (err) {
                                logFromWorker(
                                    'ERROR',
                                    `[dbWorker-${ownerProcessId.replace('dbHandler-', '')}] Failed to getMultipleModelData for ${modelName} with filter ${JSON.stringify(filter)} and options ${JSON.stringify(options)}`,
                                    err
                                );
                            } finally {
                                await cursor.close();
                            }
                        } else {
                            const totalDocuments = await Model.countDocuments(filter);
                            const numBatches = Math.ceil(totalDocuments / batchSize);

                            for (let i = 0; i < numBatches; i++) {
                                const skip = i * batchSize;

                                let q = Model.find(filter);

                                if (lean) {
                                    q = q.lean({
                                        defaults: true,
                                        virtuals: false,
                                        getters: false
                                    });
                                }

                                if (projection) {
                                    q = q.select(projection);
                                }

                                if (sort) {
                                    q = q.sort(sort);
                                }

                                const batch = await q.skip(skip).limit(batchSize).exec();
                                allDocs.push(...batch);

                                if (batch.length === batchSize) {
                                    await new Promise((r) => setImmediate(r));
                                }
                            }
                        }

                        const plainObjects = allDocs.map((doc) =>
                            doc && typeof doc.toObject === 'function' ? doc.toObject() : doc
                        );
                        result = plainObjects;
                    } catch (err) {
                        logFromWorker(
                            'ERROR',
                            `[dbWorker-${ownerProcessId.replace('dbHandler-', '')}] Failed to getMultipleModelData for ${modelName} with filter ${JSON.stringify(filter)} and options ${JSON.stringify(options)}`,
                            err
                        );

                        throw err;
                    }
                }
                break;

            case 'countModelData':
                {
                    const { modelName, filter } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    result = await Model.countDocuments(filter);
                }
                break;

            case 'saveModelData':
                {
                    const { modelName, docData } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    let doc;
                    if (docData._id) {
                        doc = await Model.findById(docData._id);

                        if (!doc) {
                            throw new Error(`Document with ID ${docData._id} not found for saving.`);
                        }

                        Object.assign(doc, docData);
                    } else {
                        doc = new Model(docData);
                    }

                    await doc.save();
                    result = doc.toObject();
                }
                break;

            case 'deleteModelData':
                {
                    const { modelName, filter } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    result = await Model.deleteOne(filter);
                }
                break;

            case 'deleteMultipleModelData':
                {
                    const { modelName, filter } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    result = await Model.deleteMany(filter);
                }
                break;

            case 'updateMultipleModelData':
                {
                    const { modelName, filter, updateData } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    result = await Model.updateMany(filter, updateData);

                    logFromWorker(
                        'DEBUG',
                        `Worker: Bulk-updated ${modelName} with filter ${JSON.stringify(filter)}. Modified: ${result?.modifiedCount ?? 0}`
                    );
                }
                break;

            case 'findLean':
                {
                    const { modelName, filter } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    result = await Model.findOne(filter)
                        .lean({
                            virtuals: false,
                            getters: false
                        })
                        .exec();
                }
                break;

            case 'findManyLean':
                {
                    const { modelName, filter = {}, projection = null, sort = null, limit = 0 } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    let q = Model.find(filter).lean({
                        virtuals: false,
                        getters: false
                    });

                    if (projection) {
                        q = q.select(projection);
                    }

                    if (sort) {
                        q = q.sort(sort);
                    }

                    if (limit) {
                        q = q.limit(limit);
                    }

                    result = await q.exec();
                }
                break;

            case 'replaceUpsert':
                {
                    const { modelName, filter, doc } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    result = await Model.replaceOne(filter, doc, { upsert: true });
                }
                break;

            case 'patchDoc':
                {
                    const { modelName, filter, set = null, unset = null, upsert = true } = data;
                    const Model = modelMap[modelName];

                    if (!Model) {
                        throw new Error(`Unknown model: ${modelName}`);
                    }

                    const update = {};

                    if (set && Object.keys(set).length) {
                        update.$set = set;
                    }

                    if (unset && Object.keys(unset).length) {
                        update.$unset = unset;
                    }

                    result = Object.keys(update).length
                        ? await Model.updateOne(filter, update, { upsert }).exec()
                        : {
                              acknowledged: true,
                              noop: true
                          };
                }
                break;

            case 'ensureIndexes':
                {
                    result = await ensureIndexes();
                }
                break;

            default: {
                throw new Error(`Unknown message type: ${type}`);
            }
        }
    } catch (err) {
        error = {
            message: err.message,
            stack: err.stack
        };
        logFromWorker(
            'ERROR',
            `[dbWorker-${ownerProcessId.replace('dbHandler-', '')}] Error handling message type ${type}`,
            err
        );
    } finally {
        parentPort.postMessage({
            messageId,
            result,
            error
        });
    }
});

process.on('uncaughtException', (err) => {
    logFromWorker('ERROR', `[dbWorker-${ownerProcessId.replace('dbHandler-', '')}] Uncaught Exception`, err);
});

process.on('unhandledRejection', (reason, promise) => {
    logFromWorker(
        'ERROR',
        `[dbWorker-${ownerProcessId.replace('dbHandler-', '')}] Unhandled Rejection`,
        promise,
        'reason:',
        reason
    );
});

parentPort.postMessage({ type: 'ready' });
