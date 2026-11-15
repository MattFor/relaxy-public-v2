'use strict';
const pending = new Map();

const FLUSH_MS = 5 * 60 * 1000;

const RETENTION_DAYS = 400;
const PRUNE_MS = 24 * 60 * 60 * 1000;

let flushTimer = null;
let pruneTimer = null;

export const dayOf = (at = Date.now()) => {
    const d = new Date(at);

    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};

export const bump = (guildId, field, n = 1) => {
    if (!guildId || !(n > 0)) {
        return;
    }

    const key = `${guildId}:${dayOf()}`;
    const row = pending.get(key);

    if (row) {
        row[field] = (row[field] ?? 0) + n;
        return;
    }

    pending.set(key, { [field]: n });
};

export const flushStats = async (client) => {
    if (!pending.size) {
        return;
    }

    const draining = [...pending];
    pending.clear();

    for (const [key, row] of draining) {
        const [guildId, day] = key.split(':');
        const d = Number(day);

        try {
            await client.module.database.bumpStats(guildId, d, row);
        } catch (error) {
            const back = pending.get(key);

            if (back) {
                for (const [field, n] of Object.entries(row)) {
                    back[field] = (back[field] ?? 0) + n;
                }
            } else {
                pending.set(key, row);
            }

            client.log('ERROR', `DailyStats flush for ${key}: ${error?.message ?? error}`);
        }
    }
};

export const pruneStats = async (client) => {
    const cutoff = dayOf(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    try {
        const n = await client.module.database.pruneStats(cutoff);

        if (n) {
            client.log('DATA', `DailyStats: pruned ${n} stats rows older than ${cutoff}.`);
        }
    } catch (error) {
        client.log('ERROR', `DailyStats prune: ${error?.message ?? error}`);
    }
};

export const startDailyStats = (client) => {
    if (flushTimer) {
        return;
    }

    flushTimer = setInterval(() => flushStats(client).catch(() => {}), FLUSH_MS);
    pruneTimer = setInterval(() => pruneStats(client).catch(() => {}), PRUNE_MS);

    flushTimer.unref?.();
    pruneTimer.unref?.();

    pruneStats(client).catch(() => {});
};
export const stopDailyStats = async (client) => {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }

    if (pruneTimer) {
        clearInterval(pruneTimer);
        pruneTimer = null;
    }

    await flushStats(client);
};
