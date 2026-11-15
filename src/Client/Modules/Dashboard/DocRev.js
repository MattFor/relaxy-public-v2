'use strict';
const IGNORED = new Set(['_id', '__v']);

export const stableStringify = (value) => {
    if (value === null || typeof value !== 'object') {
        return value === undefined ? 'null' : JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }

    const keys = Object.keys(value)
        .filter((key) => !IGNORED.has(key))
        .sort();

    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const cyrb53 = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;

    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

export const revOf = (doc) => `r${cyrb53(stableStringify(doc ?? null)).toString(36)}`;

export default class DocRev {
    constructor(client) {
        this.client = client;
    }

    of(doc) {
        return revOf(doc);
    }
}
