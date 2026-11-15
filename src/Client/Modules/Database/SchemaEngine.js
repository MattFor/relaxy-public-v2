'use strict';
import _ from 'lodash';

import { version as CURRENT_VERSION, schemas } from './DatabaseDefaults.js';

const isPlainObject = (v) => _.isPlainObject(v);

const spec = (key) => {
    const s = schemas[key];

    if (!s) {
        throw new Error(`SchemaEngine: unknown schema key "${key}"`);
    }

    return s;
};
const isOpenMap = (path, openMaps) => openMaps.includes(path);

const isMetaField = (key, path) => path === '' && (key === '_id' || key === '__v' || key === 'v');
const mergeArraysReplace = (dst, src) => (Array.isArray(src) ? _.cloneDeep(src) : undefined);

const diff = (doc, defaults, path, openMaps) => {
    const out = {};

    for (const key of Object.keys(doc ?? {})) {
        if (isMetaField(key, path)) {
            continue;
        }

        const childPath = path ? `${path}.${key}` : key;
        const dv = doc[key];
        const def = defaults ? defaults[key] : undefined;

        if (def === undefined || isOpenMap(path, openMaps)) {
            if (!_.isEqual(dv, def)) {
                out[key] = _.cloneDeep(dv);
            }

            continue;
        }

        if (isPlainObject(dv) && isPlainObject(def) && !isOpenMap(childPath, openMaps)) {
            const sub = diff(dv, def, childPath, openMaps);

            if (Object.keys(sub).length > 0) {
                out[key] = sub;
            }

            continue;
        }

        if (!_.isEqual(dv, def)) {
            out[key] = _.cloneDeep(dv);
        }
    }

    return out;
};

export const stripDefaults = (key, doc) => {
    const s = spec(key);
    const out = diff(doc, s.defaults, '', s.openMaps);

    for (const id of s.identifiers) {
        out[id] = doc?.[id] ?? s.defaults[id];
    }

    out.v = CURRENT_VERSION;

    return out;
};
export const isPureDefault = (key, doc) => {
    const s = spec(key);
    const stripped = diff(doc, s.defaults, '', s.openMaps);

    for (const id of s.identifiers) {
        delete stripped[id];
    }

    return Object.keys(stripped).length === 0;
};
export const applyDefaults = (key, stored) => {
    const s = spec(key);
    const full = _.mergeWith(_.cloneDeep(s.defaults), _.cloneDeep(stored ?? {}), mergeArraysReplace);
    if (stored?._id !== undefined) {
        full._id = stored._id;
    }

    return full;
};

export const validate = (key, doc, warn, path = '', defaults = undefined, openMaps = undefined) => {
    const s = spec(key);
    defaults ??= s.defaults;
    openMaps ??= s.openMaps;

    if (!isPlainObject(doc) || !isPlainObject(defaults)) {
        return;
    }

    for (const field of Object.keys(doc)) {
        if (isMetaField(field, path)) {
            continue;
        }

        const childPath = path ? `${path}.${field}` : field;
        if (isOpenMap(path, openMaps)) {
            continue;
        }

        const dv = doc[field];
        const def = defaults[field];

        if (def === undefined) {
            warn?.(`[${s.collection}] unknown field "${childPath}" = ${short(dv)} (not in defaults)`);
            continue;
        }

        const dvType = typeOf(dv);
        const defType = typeOf(def);
        if (dv !== null && dvType !== defType) {
            warn?.(`[${s.collection}] field "${childPath}" is ${dvType}, expected ${defType} (value ${short(dv)})`);
            continue;
        }

        if (isPlainObject(dv) && isPlainObject(def) && !isOpenMap(childPath, openMaps)) {
            validate(key, dv, warn, childPath, def, openMaps);
        }
    }
};

export const reconcile = (key, stored, warn, identity = {}) => {
    const s = spec(key);

    if (!stored) {
        return {
            ...applyDefaults(key, {}),
            ...identity,
            v: CURRENT_VERSION
        };
    }

    let doc = stored;
    const from = typeof stored.v === 'number' ? stored.v : 0;

    if (from < CURRENT_VERSION && s.upgrades.length > 0) {
        for (const step of s.upgrades) {
            if (from <= step.from) {
                try {
                    doc = step.apply(doc) ?? doc;
                } catch (e) {
                    warn?.(`[${s.collection}] upgrade step from ${step.from} failed: ${e.message}`);
                }
            }
        }
    }

    validate(key, doc, warn);

    const full = applyDefaults(key, doc);
    full.v = CURRENT_VERSION;

    return full;
};

const typeOf = (v) => {
    if (Array.isArray(v)) {
        return 'array';
    }

    if (v === null) {
        return 'null';
    }

    return typeof v;
};

const short = (v) => {
    let str;

    try {
        str = typeof v === 'string' ? v : JSON.stringify(v);
    } catch {
        str = String(v);
    }

    return str && str.length > 60 ? `${str.slice(0, 57)}...` : str;
};

export default {
    stripDefaults,
    applyDefaults,
    isPureDefault,
    validate,
    reconcile,
    version: CURRENT_VERSION
};
