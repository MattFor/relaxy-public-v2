'use strict';

import { DefaultRestOptions } from '@discordjs/rest';

const TRANSIENT_CODES = new Set([
    'EAI_AGAIN',
    'ENOTFOUND',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT'
]);
const BACKOFF_MS = [
    250,
    1000,
    2500
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const transientCodeOf = error =>
{

    for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++)
    {
        if (typeof current.code === 'string' && TRANSIENT_CODES.has(current.code))
        {
            return current.code;
        }

        for (const nested of current.errors ?? [])
        {
            if (typeof nested?.code === 'string' && TRANSIENT_CODES.has(nested.code))
            {
                return nested.code;
            }
        }
    }

    return null;
};

export const makeRetryingRequest = (log = null) => async (url, options) =>
{
    for (let attempt = 0; ; attempt++)
    {
        try
        {
            return await DefaultRestOptions.makeRequest(url, options);
        }
        catch (error)
        {
            const code = transientCodeOf(error);

            if (options?.signal?.aborted || !code || attempt >= BACKOFF_MS.length)
            {
                throw error;
            }

            log?.('WARN', `Transient network error (${code}) on ${options?.method ?? 'GET'} ${url} - retry ${attempt + 1}/${BACKOFF_MS.length} in ${BACKOFF_MS[attempt]}ms`);

            await sleep(BACKOFF_MS[attempt]);
        }
    }
};

export default makeRetryingRequest;
