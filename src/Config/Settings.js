'use strict';
import Mongoose from 'mongoose';

import SettingsSchema from '../Client/Modules/Database/Blueprints/Settings.js';
import HostSchema     from '../Client/Modules/Database/Blueprints/Host.js';

const DOCUMENT_ID = 'global';
export const SETTING_KEYS = Object.freeze([
    'version',
    'wmStatus',
    'clientStatus',
    'ownerIds',
    'youtubeCookie',
    'operatingMode'
]);

export const nextRequestNumber = async (uri, onError = () =>
{
}) =>
{
    try
    {
        const Settings = await getModel(uri);

        const document = await Settings.findOneAndUpdate({ _id: DOCUMENT_ID }, { $inc: { requestNumber: 1 } }, {
            upsert:         true,
            returnDocument: 'after',
            lean:           true
        });

        return Number(document?.requestNumber) || 1;
    }
    catch (e)
    {
        onError(e);

        return null;
    }
};
const MAX_REASON = 256;

export const BLACKLIST_ACTION_REASON = 'You shouldn\'t have done that...';

export const normalizeBlacklist = value =>
{
    if (!Array.isArray(value))
    {
        return [];
    }

    const seen = new Set();
    const out = [];

    for (const raw of value)
    {
        const id = String(raw?.id ?? '').trim();
        if (!/^\d{17,20}$/.test(id) || seen.has(id))
        {
            continue;
        }

        seen.add(id);

        out.push({
            id,
            k:  raw?.k === 'g'
                    ? 'g'
                    : 'u',
            at: Number(raw?.at) || 0,
            by: String(raw?.by ?? ''),
            rs: String(raw?.rs ?? '').slice(0, MAX_REASON),
            ex: Number(raw?.ex) || 0
        });
    }

    return out;
};

export const loadBlacklist = async (uri, onError = () =>
{
}) =>
{
    try
    {
        const Settings = await getModel(uri);

        const document = await Settings.findOne({ _id: DOCUMENT_ID }, { blacklist: 1 }, { lean: true });

        return {
            entries:      normalizeBlacklist(document?.blacklist),
            fromDatabase: true
        };
    }
    catch (e)
    {
        onError(e);

        return {
            entries:      [],
            fromDatabase: false
        };
    }
};

export const saveBlacklist = async (uri, entries, onError = () =>
{
}) =>
{
    try
    {
        const Settings = await getModel(uri);

        await Settings.updateOne({ _id: DOCUMENT_ID }, { $set: { blacklist: normalizeBlacklist(entries) } }, { upsert: true });

        return true;
    }
    catch (e)
    {
        onError(e);

        return false;
    }
};

export const HOST_STALE_AFTER = 90 * 1000;

let connection = null;

let model = null;

let hostModel = null;

const getModel = async uri =>
{
    if (model)
    {
        return model;
    }

    try
    {
        connection = await Mongoose.createConnection(uri, {
            maxPoolSize:              2,
            serverSelectionTimeoutMS: 30 * 1000
        }).asPromise();
    }
    catch (e)
    {

        connection = null;
        model = null;

        throw e;
    }

    model = connection.model('Settings', SettingsSchema);

    return model;
};

const getHostModel = async uri =>
{
    if (hostModel)
    {
        return hostModel;
    }

    await getModel(uri);

    hostModel = connection.model('Host', HostSchema);

    return hostModel;
};

export const reportHost = async (uri, machineId, info, onError = () =>
{
}) =>
{
    if (!machineId)
    {
        return false;
    }

    try
    {
        const Host = await getHostModel(uri);

        await Host.updateOne({ _id: String(machineId) }, {
            $set: {
                ...info,
                lastSeen: Date.now()
            }
        }, { upsert: true });

        return true;
    }
    catch (e)
    {
        onError(e);

        return false;
    }
};

export const loadHosts = async (uri, staleAfter = HOST_STALE_AFTER, onError = () =>
{
}) =>
{
    try
    {
        const Host = await getHostModel(uri);

        const hosts = await Host.find({ lastSeen: { $gte: Date.now() - staleAfter } }, null, { lean: true });

        return (hosts ?? []).sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
    }
    catch (e)
    {
        onError(e);

        return [];
    }
};

const normalizeOwners = value =>
{
    if (!Array.isArray(value))
    {
        return [];
    }

    return [...new Set(value.map(id => String(id).trim()).filter(Boolean))];
};

export const loadSettings = async (uri, defaults, onError = () =>
{
}) =>
{
    const seed = {
        ...defaults,
        ownerIds: normalizeOwners(defaults.ownerIds)
    };

    try
    {
        const Settings = await getModel(uri);

        const document = await Settings.findOneAndUpdate({ _id: DOCUMENT_ID }, { $setOnInsert: seed }, {
            upsert:         true,
            returnDocument: 'after',
            lean:           true
        });

        const owners = normalizeOwners(document?.ownerIds);

        return {
            version:       document?.version ?? seed.version,
            wmStatus:      document?.wmStatus ?? seed.wmStatus,
            clientStatus:  document?.clientStatus ?? seed.clientStatus,
            ownerIds:      owners.length
                               ? owners
                               : seed.ownerIds,
            youtubeCookie: document?.youtubeCookie ?? seed.youtubeCookie,

            operatingMode: Number.isFinite(Number(document?.operatingMode))
                               ? Number(document.operatingMode)
                               : seed.operatingMode,

            requestNumber: Number(document?.requestNumber) || 0,

            fromDatabase: true
        };
    }
    catch (e)
    {
        onError(e);

        return {
            ...seed,
            fromDatabase: false
        };
    }
};

export const saveSettings = async (uri, patch, onError = () =>
{
}) =>
{

    const update = Object.fromEntries(Object.entries(patch)
                                            .filter(([key, value]) => SETTING_KEYS.includes(key) && value !== undefined)
                                            .map(([key, value]) => [
                                                key,
                                                key === 'ownerIds'
                                                    ? normalizeOwners(value)
                                                    : value
                                            ]));

    if (Object.keys(update).length === 0)
    {
        return true;
    }

    try
    {
        const Settings = await getModel(uri);

        await Settings.updateOne({ _id: DOCUMENT_ID }, { $set: update }, { upsert: true });

        return true;
    }
    catch (e)
    {
        onError(e);

        return false;
    }
};
export const closeSettings = async () =>
{
    if (!connection)
    {
        return;
    }

    await connection.close().catch(() =>
    {
    });

    connection = null;
    model = null;
    hostModel = null;
};
