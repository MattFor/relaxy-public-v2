'use strict';
import { parentPort }     from 'node:worker_threads';
import { renderCardData } from './Cards.js';

parentPort.on('message', async ({
    id,
    kind,
    data
}) =>
{
    try
    {
        const buffer = await renderCardData(kind, data);

        const owned = buffer.byteOffset === 0 && buffer.buffer.byteLength === buffer.byteLength;

        parentPort.postMessage({
                id,
                buffer
            },
            owned
                ? [buffer.buffer]
                : []);
    }
    catch (error)
    {
        parentPort.postMessage({
            id,
            error: error?.message ?? String(error)
        });
    }
});
