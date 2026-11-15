'use strict';

import { bump as bumpDailyStat } from './DailyStats.js';

const sessions = new Map();

const FLUSH_MS = 60_000;
let timer = null;

const keyOf = (guildId, userId) => `${guildId}:${userId}`;

const credit = async (client, guildId, userId, ms) => {
    if (!(ms > 0)) {
        return;
    }

    const member = await client.module.database.Member(userId, guildId).catch(() => null);

    if (!member) {
        return;
    }

    client.saveMember(guildId, userId, {
        alter: 'vc',
        value: (member.vc ?? 0) + ms
    });

    bumpDailyStat(guildId, 'vc', ms);
};

export const begin = (guildId, userId, at = Date.now()) => {
    const key = keyOf(guildId, userId);

    if (!sessions.has(key)) {
        sessions.set(key, at);
    }
};

export const end = async (client, guildId, userId) => {
    const key = keyOf(guildId, userId);
    const since = sessions.get(key);

    if (since === undefined) {
        return;
    }

    sessions.delete(key);

    await credit(client, guildId, userId, Date.now() - since);
};

export const flushAll = async (client) => {
    const now = Date.now();

    for (const [key, since] of [...sessions]) {
        const [guildId, userId] = key.split(':');

        sessions.set(key, now);

        await credit(client, guildId, userId, now - since).catch(() => {});
    }
};

export const startVoiceActivity = (client) => {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
        for (const state of guild.voiceStates.cache.values()) {
            if (state.channelId && !state.member?.user?.bot) {
                begin(guild.id, state.id, now);
            }
        }
    }

    if (timer) {
        return;
    }

    timer = setInterval(
        () => flushAll(client).catch((error) => client.log('ERROR', `VoiceActivity flush: ${error?.message ?? error}`)),
        FLUSH_MS
    );

    timer.unref?.();
};
export const stopVoiceActivity = async (client) => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }

    await flushAll(client);
};
