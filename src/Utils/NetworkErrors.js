'use strict';
export const errorToString = error =>
{
    if (typeof error === 'string')
    {
        return error;
    }

    if (!error)
    {
        return String(error);
    }

    return [
        error.message,
        error.code,
        error.stack,
        String(error)
    ].filter(Boolean).join(' ');
};

export const isNetworkError = str =>
{
    const lowerStr = errorToString(str).toLowerCase();

    return (lowerStr.includes('fetch failed') || lowerStr.includes('downloading file from') ||

        lowerStr.includes('und_err_connect_timeout') || lowerStr.includes('mongoserverselectionerror') || lowerStr.includes('err_ssl_decryption_failed_or_bad_record_mac') ||

        lowerStr.includes('eai_again') ||

        lowerStr.includes('econnreset') || lowerStr.includes('econnrefused') || lowerStr.includes('etimedout') || lowerStr.includes('enotfound') || lowerStr.includes('ehostunreach') || lowerStr.includes('enetunreach') || lowerStr.includes('econnaborted') || lowerStr.includes('epipe') ||

        lowerStr.includes('socket hang up') || lowerStr.includes('connection timed out') || lowerStr.includes('request timed out') || lowerStr.includes('timeout of') || lowerStr.includes('network is down') || lowerStr.includes('network is unreachable') || lowerStr.includes('no route to host') || lowerStr.includes('host is down') || lowerStr.includes('connect ehostunreach') ||

        lowerStr.includes('ssl handshake failure') || lowerStr.includes('tls handshake timeout') || lowerStr.includes('tlsv1 alert internal error') || lowerStr.includes('unable_to_verify_leaf_signature') || lowerStr.includes('self signed certificate') ||

        lowerStr.includes('mongonetworkerror') || lowerStr.includes('mongotimeouterror') ||

        lowerStr.includes('gateway unavailable') || lowerStr.includes('disconnected from websocket') || lowerStr.includes('cannot connect to discord') || lowerStr.includes('http status 500') || lowerStr.includes('http status 502') || lowerStr.includes('http status 503') || lowerStr.includes('http status 504') || lowerStr.includes('bad gateway') || lowerStr.includes('service unavailable') || lowerStr.includes('gateway timeout') ||

        lowerStr.includes('1006') || lowerStr.includes('1001') || lowerStr.includes('1005') ||

        (lowerStr.includes('cloudflare') && (lowerStr.includes('error 1000') || lowerStr.includes('error 1001') || lowerStr.includes('error 1016') || lowerStr.includes('error 1020'))));
};

export const networkErrorSignature = error => errorToString(error)
    .toLowerCase()
    .split('\n')[0]
    .replace(/[0-9]+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

export class NetworkErrorThrottle
{
    constructor({
        windowMs = 60 * 1000,
        maxSignatures = 200
    } = {})
    {
        this.windowMs = windowMs;
        this.maxSignatures = maxSignatures;

        this.seen = new Map();
    }

    consider(error)
    {
        const key = networkErrorSignature(error);
        const now = Date.now();
        const entry = this.seen.get(key);

        if (entry && now - entry.last < this.windowMs)
        {
            entry.suppressed++;
            return {
                print:      false,
                suppressed: entry.suppressed
            };
        }

        const suppressed = entry
            ? entry.suppressed
            : 0;

        this.seen.delete(key);
        this.seen.set(key, {
            last:       now,
            suppressed: 0
        });

        while (this.seen.size > this.maxSignatures)
        {
            this.seen.delete(this.seen.keys().next().value);
        }

        return {
            print: true,
            suppressed
        };
    }

    static note(suppressed)
    {
        return suppressed > 0
            ? ` [+${suppressed} identical suppressed]`
            : '';
    }
}
