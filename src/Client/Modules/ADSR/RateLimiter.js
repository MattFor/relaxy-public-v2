'use strict';

import _                 from 'lodash';
import Relaxy            from '../../Relaxy.js';
import { operatingMode } from '../../../Core/DataTable.js';

const MIN_RESULT_WAIT = 1_500;

(function ()
{
    'use strict';

    let seen;
    const DEFAULT_MAX_DEPTH = 6;
    const DEFAULT_ARRAY_MAX_LENGTH = 50;

    Date.prototype.toPrunedJSON = Date.prototype.toJSON;
    String.prototype.toPrunedJSON = String.prototype.toJSON;

    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const meta = {
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"':  '\\"',
        '\\': '\\\\'
    };

    const quote = string =>
    {
        escapable.lastIndex = 0;
        return escapable.test(string)
            ? '"' + string.replace(escapable, a =>
        {
            let c = meta[a];
            return typeof c === 'string'
                ? c
                : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"'
            : '"' + string + '"';
    };

    const str = (key, holder, depthDecr, arrayMaxLength) =>
    {
        let i;
        let k;
        let v;
        let length;
        let partial;
        let value = holder[key];

        if (value && typeof value === 'object' && typeof value.toPrunedJSON === 'function')
        {
            value = value.toPrunedJSON(key);
        }

        switch (typeof value)
        {
            case 'string':
                return quote(value);

            case 'number':
                return isFinite(value)
                    ? String(value)
                    : 'null';

            case 'boolean':
            case 'null':
                return String(value);

            case 'object':
                if (!value)
                {
                    return 'null';
                }

                if (depthDecr <= 0 || seen.indexOf(value) !== -1)
                {
                    return '"-pruned-"';
                }

                partial = [];
                seen.push(value);

                if (Object.prototype.toString.apply(value) === '[object Array]')
                {
                    length = Math.min(value.length, arrayMaxLength);
                    for (i = 0; i < length; i += 1)
                    {
                        partial[i] = str(i, value, depthDecr - 1, arrayMaxLength) || 'null';
                    }

                    v = partial.length === 0
                        ? '[]'
                        : '[' + partial.join(',') + ']';

                    return v;
                }

                for (k in value)
                {
                    if (Object.prototype.hasOwnProperty.call(value, k))
                    {
                        try
                        {
                            v = str(k, value, depthDecr - 1, arrayMaxLength);
                            if (v)
                            {
                                partial.push(quote(k) + ':' + v);
                            }
                        }
                        catch
                        {
                        }
                    }
                }

                v = partial.length === 0
                    ? '{}'
                    : '{' + partial.join(',') + '}';

                return v;
        }
    };

    JSON.pruned = (value, depthDecr, arrayMaxLength) =>
    {
        seen = [];
        depthDecr = depthDecr || DEFAULT_MAX_DEPTH;
        arrayMaxLength = arrayMaxLength || DEFAULT_ARRAY_MAX_LENGTH;
        return str('', { '': value }, depthDecr, arrayMaxLength);
    };
}());

export default class RateLimiter
{
    constructor(client, errorThreshold = 3)
    {
        this.client = client;

        this.cache = {};

        this.errorThreshold = errorThreshold;
    }

    handleEvent(route, promiseFunc, intervalTime, {
        bulkExecution = false,
        emptyCountThreshold = 1,
        bulkExecutionLimit = Infinity,
        guildSize = 0
    } = {})
    {
        const [labels, parts] = this._getRoute(route);
        const routePath = [...parts];

        if (emptyCountThreshold < 1)
        {
            throw new Error('emptyCountThreshold must be at least 1.');
        }

        const logMessage = [];

        const existing = _.get(this.cache, routePath);

        if (existing && !Array.isArray(existing.queue))
        {
            this._log(`[${route}] => stale entry with no queue - rebuilding the limiter.`, 'WARN');
            _.unset(this.cache, routePath);
        }

        if (!Array.isArray(_.get(this.cache, [
            ...routePath,
            'queue'
        ])))
        {

            logMessage.push(`Created new limiter at ${routePath.join('/')}`);

            intervalTime = guildSize > 1
                ? Math.round(intervalTime * ((guildSize / 40_000) * 0.25 + 1)) - 0.5
                : intervalTime;

            const intervalFunction = async () =>
            {
                let data = null;
                try
                {
                    const cache = _.get(this.cache, routePath);
                    cache.processing = true;

                    if (cache.queue.length > 0)
                    {

                        const startTime = Date.now();
                        if (bulkExecution)
                        {
                            const executionBatch = cache.queue.splice(0, bulkExecutionLimit);

                            let startTime = 0;
                            const results = await Promise.allSettled(executionBatch.map(qi =>
                            {
                                if (startTime === 0)
                                {
                                    startTime = qi.date;
                                }
                                if (typeof qi.func === 'function')
                                {
                                    return qi.func();
                                }
                                else if (qi.func instanceof Promise)
                                {
                                    return qi.func;
                                }
                            }));

                            let ids = [];
                            results.forEach(result =>
                            {
                                ids.push(++cache.completed);
                                cache.results[cache.completed] = result ?? Infinity;
                                intervalTime += Math.ceil((typeof result === 'object'
                                    ? JSON.pruned(result)
                                    : result?.toString()).length / 700);
                            });

                            this._log(`\n[${route}] => #(${ids.join('.')}) -> SUCCESS | Took: ${this.client.imports.time(Date.now() - startTime)}`);
                        }
                        else
                        {
                            if (!Array.isArray(cache.queue))
                            {
                                throw new Error(`cache.queue is not an array, it's a ${typeof cache.queue}`);
                            }

                            data = cache.queue.shift();

                            const item = data.func;
                            const valid1 = item instanceof Promise;
                            const valid2 = typeof item === 'function';

                            if (!(valid1 || valid2))
                            {
                                throw new Error(`Expected a function or a Promise in the queue, got ${typeof item}`);
                            }

                            const result = valid1
                                ? await item
                                : await item();
                            cache.results[cache.completed] = result;

                            intervalTime += Math.ceil(((typeof result === 'object'
                                ? JSON.pruned(result)
                                : result?.toString())?.length ?? 1000) / 700);
                            this._log(`\n[${route}] => #${cache.completed} -> SUCCESS | Took: ${this.client.imports.time(Date.now() - data.date)}`);
                        }

                        cache.completed++;
                        cache.emptyCount = 0;
                        const executionTime = Date.now() - startTime;

                        cache.eta = cache.queue.length > 0
                            ? intervalTime * cache.queue.length + executionTime
                            : 0;
                    }
                    else
                    {
                        cache.emptyCount++;
                    }

                    cache.processing = false;

                    if (cache.emptyCount >= emptyCountThreshold)
                    {
                        this.clearCache(route);
                    }
                }
                catch (error)
                {
                    const cache = _.get(this.cache, routePath);

                    if (!cache)
                    {
                        return;
                    }

                    cache.errors.push(cache.completed);
                    cache.results[cache.completed] = Infinity;
                    cache.completed++;

                    cache.processing = false;

                    if (cache.errors.length >= this.errorThreshold)
                    {
                        this.clearCache(route);
                    }

                    this._log(`\n[${route}] => #${cache.completed} -> !FAILURE! | Took: ${this.client.imports.time(Date.now() - data.date)}`, 'ERROR');
                    this._log(error, 'ERROR', true);
                }
            };

            _.set(this.cache, routePath, {
                queue:      [
                    {
                        func: promiseFunc,
                        date: Date.now()
                    }
                ],
                index:      0,
                errors:     [],
                delays:     [],
                results:    {},
                maxDelay:   1,
                completed:  0,
                intervalTime,
                emptyCount: 0,
                bulkExecution,
                processing: false,
                eta:        intervalTime,
                bulkExecutionLimit,
                emptyCountThreshold,
                interval:   setInterval(intervalFunction, intervalTime)
            });

            intervalFunction();
            logMessage.push(`{NEW ROUTE QUEUE} ==> [${route}] | Interval: ${this.client.imports.time(intervalTime + 0.00001)}`);
        }
        else
        {

            const queue = _.get(this.cache, [
                ...routePath,
                'queue'
            ]);
            _.set(this.cache, [
                ...routePath,
                'emptyCount'
            ], 0);

            if (queue.length === 0)
            {
                _.set(this.cache, [
                    ...routePath,
                    'maxDelay'
                ], 0);
                _.set(this.cache, [
                    ...routePath,
                    'eta'
                ], intervalTime);
            }

            queue.push({
                func: promiseFunc,
                date: Date.now()
            });

            let index = _.get(this.cache, [
                ...routePath,
                'index'
            ]);
            _.set(this.cache, [
                ...routePath,
                'index'
            ], ++index);
            _.set(this.cache, [
                ...routePath,
                'maxDelay'
            ], (_.get(this.cache, [
                ...routePath,
                'maxDelay'
            ]) + 1));

            logMessage.push(`[${route}] => #${index} -> ADDED [${typeof promiseFunc === 'function'
                ? 'Function'
                : 'Promise'}]`);
        }

        if (logMessage.length > 0)
        {
            this._log(`\n${logMessage.join('\n')}`);
        }

        return _.get(this.cache, [
            ...routePath,
            'index'
        ]);
    }

    async getResult(route, id, expected = 1)
    {
        const [labels, parts] = this._getRoute(route);

        if (labels.length !== parts.length)
        {
            throw new Error(`Mismatched labels and parts in the route: ${route}.`);
        }

        const now = Date.now();
        const etaPath = [
            ...parts,
            'eta'
        ];
        const path = [
            ...parts,
            'results',
            id
        ];

        return new Promise(resolve =>
        {

            const timeoutFunction = () =>
            {
                const executionFailed = _.get(this.cache, path) === Infinity;

                let delays = _.get(this.cache, [
                    ...parts,
                    'delays'
                ]);

                const postpone = () =>
                {
                    const postponeTime = Math.ceil((((_.get(this.cache, etaPath) || MIN_RESULT_WAIT) + Number(_.get(this.cache, [
                        ...parts,
                        'processing'
                    ]))) / (((_.get(this.cache, [
                        ...parts,
                        'queue'
                    ])?.length ?? 0) + 1) * 0.5)) * expected);

                    clearTimeout(requestTimeout);
                    requestTimeout = setTimeout(timeoutFunction, postponeTime);

                    this._log(`\n[${route}] => #${id} -> POSTPONED (${this.client.imports.time(postponeTime)}) - delay #${delays.filter(i => i === id).length + 1} / ${_.get(this.cache, [
                        ...parts,
                        'maxDelay'
                    ])}.`);

                    delays.push(id);
                    return _.set(this.cache, [
                        ...parts,
                        'delays'
                    ], delays);
                };

                if (executionFailed)
                {
                    return;
                }
                else if (((!_.get(this.cache, path) && _.get(this.cache, [
                    ...parts,
                    'queue'
                ])?.length > 0) || _.get(this.cache, [
                    ...parts,
                    'processing'
                ])) && delays?.filter(i => i === id)?.length < _.get(this.cache, [
                    ...parts,
                    'maxDelay'
                ]))
                {
                    return postpone();
                }
                else if (_.get(this.cache, path))
                {
                    return;
                }

                const alive = Boolean(_.get(this.cache, parts));

                this._log(`\n[${route}] => #${id} -> TIMEOUT | Waited: ${this.client.imports.time(Date.now() - now)} | Max: ${alive
                    ? _.get(this.cache, [
                        ...parts,
                        'maxDelay'
                    ])
                    : 'route cleared'} | Postponed ${delays?.filter(i => i === id).length ?? 0} times.`, 'ERROR');

                if (alive)
                {
                    let errors = _.get(this.cache, [
                        ...parts,
                        'errors'
                    ]);
                    delays = _.get(this.cache, [
                        ...parts,
                        'delays'
                    ]);

                    delays = delays?.filter(i => i !== id);
                    errors = errors?.filter(i => i !== id);

                    _.set(this.cache, path, Infinity);
                    _.set(this.cache, [
                        ...parts,
                        'delays'
                    ], delays);
                    _.set(this.cache, [
                        ...parts,
                        'errors'
                    ], errors);
                }

                clearInterval(checkInterval);
                resolve(null);
            };

            let requestTimeout = setTimeout(timeoutFunction, Math.ceil(((_.get(this.cache, etaPath) || MIN_RESULT_WAIT) / (((_.get(this.cache, [
                ...parts,
                'queue'
            ])?.length ?? 0) + 1) * 0.5)) * expected));

            const checkInterval = setInterval(() =>
            {
                const result = _.get(this.cache, path);
                const executionFailed = result === Infinity;

                if (result || executionFailed)
                {
                    clearInterval(checkInterval);
                    clearTimeout(requestTimeout);
                    _.set(this.cache, path, 0b01);
                    resolve(executionFailed
                        ? null
                        : result);
                }
            }, 100);
        });
    }

    updateEventOptions(route, options)
    {
        if (!options || Object.keys(options).length === 0)
        {
            throw new Error('No options provided or options object is empty.');
        }

        const [labels, parts] = this._getRoute(route);

        if (labels.length !== parts.length)
        {
            throw new Error(`Mismatched labels and parts in the route: ${route}.`);
        }

        if (!_.get(this.cache, parts))
        {
            throw new Error(`Route "${route}" not found in the cache.`);
        }

        const optionNames = [
            'bulkExecution',
            'emptyCountThreshold',
            'bulkExecutionLimit'
        ];
        for (let optionName of optionNames)
        {
            if (options.hasOwnProperty(optionName))
            {
                _.set(this.cache, [
                    ...parts,
                    optionName
                ], options[optionName]);
            }
        }

        return true;
    }

    clearCache(route, force = false)
    {
        const [labels, parts] = this._getRoute(route);

        let completedMessage = '';
        for (let i = labels.length - 1; i >= 0; i--)
        {
            const path = parts.slice(0, i + 1);
            const cache = _.get(this.cache, path);

            if (cache?.interval)
            {
                clearInterval(cache.interval);
                completedMessage = ` | Completed: ${cache.completed}`;
            }
            if (!cache || Object.keys(cache).length === 0 || cache?.queue?.length === 0 || force)
            {
                try
                {
                    _.unset(this.cache, path);
                }
                catch
                {
                    this._log(`Route ${this._getRoute(labels, path)} does not exist! Cannot delete! Ceasing operation.`);
                    break;
                }

                this._log(`Deleted route ${this._getRoute(labels, path)}${completedMessage}`);
            }
            else
            {
                break;
            }
        }

        return true;
    }

    displayCacheAtRoute(route)
    {
        const [labels, parts] = this._getRoute(route);
        this.client.log(_.get(this.cache, [...parts]));
    }

    _getRoute(...route)
    {
        if (arguments.length !== 1)
        {
            let finalRoute = '';

            for (let i = 0; i < arguments[0].length; i++)
            {
                if (!arguments[0][i] || !arguments[1][i])
                {
                    throw new Error(`Mismatched labels and parts.\nLabels: ${arguments[0].join('/')}\nParts: ${arguments[1].join('/')}`);
                }

                finalRoute = `${finalRoute}/${arguments[0][i] === arguments[1][i]
                    ? arguments[1][i]
                    : `${arguments[0][i]}:${arguments[1][i]}`}`;
            }

            return finalRoute;
        }

        const parts = [];
        const labels = [];
        const elements = arguments[0].replace(arguments[0].startsWith('/')
            ? '/'
            : null, '').split('/');

        for (const element of elements)
        {
            if (element.includes(':'))
            {
                const [label, part] = element.split(':');

                if (label.length === 0 || part.length === 0)
                {
                    throw new Error(`Mismatched labels and parts.\nLabels: ${labels.join('/')}\nParts: ${parts.join('/')}`);
                }

                parts.push(part);
                labels.push(label);
            }
            else
            {
                parts.push(element);
                labels.push(element);
            }
        }

        return [
            labels,
            parts
        ];
    }

    _log(message, type, obj)
    {
        if (([
            operatingMode.DEBUG,
            operatingMode.MAINTENANCE
        ].includes(this.client.data.status) && this.client.flags.logs.rate_limiter) || this.client.flags.logs.rate_limiter || typeof type === 'string')
        {
            this.client.log(type ?? 'DATA',
                obj
                    ? message
                    : `[RATE LIMITER] ${message}`);
        }
    }
}
