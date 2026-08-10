'use strict';
import fs   from 'fs';
import path from 'path';

import {
    PROJECT_DIR,
    optional,
    optionalPath
} from '../Config/Env.js';

const DOWNLOAD_CONCURRENCY = 4;
const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MS = 30 * 1000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const mapLimit = async (items, limit, task) =>
{
    const results = new Array(items.length);
    let cursor = 0;

    const worker = async () =>
    {
        while (cursor < items.length)
        {
            const index = cursor++;
            results[index] = await task(items[index]);
        }
    };

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

    return results;
};

const fetchWithRetry = async url =>
{
    let lastError;

    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++)
    {
        try
        {
            const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });

            if (response.status >= 400 && response.status < 500)
            {
                throw Object.assign(new Error(`${url} -> HTTP ${response.status}`), { permanent: true });
            }

            if (!response.ok)
            {
                throw new Error(`${url} -> HTTP ${response.status}`);
            }

            return response;
        }
        catch (e)
        {
            if (e.permanent)
            {
                throw e;
            }

            lastError = e;

            if (attempt < DOWNLOAD_ATTEMPTS)
            {
                await sleep(250 * 2 ** (attempt - 1));
            }
        }
    }

    throw lastError;
};
export const CDN_BASE = 'https://cdn.relaxy.xyz';

export const CDN_LOCAL_ROOT = optionalPath('CDN_LOCAL_ROOT', path.join(PROJECT_DIR, 'cdn'));

export const CDN_PREFIX = 'relaxy/bot';
export const CACHE_DIR = path.join(PROJECT_DIR, 'storage', 'cdn-cache');
const FILE_CACHE_DIR = path.join(CACHE_DIR, 'files');

const norm = assetPath => String(assetPath).replace(/^\/+/, '');

const localPathOf = rel => path.join(CDN_LOCAL_ROOT, ...CDN_PREFIX.split('/'), rel);
const filePathOf = rel => path.join(FILE_CACHE_DIR, rel);
const resolvedFiles = new Map();

export const cdnFile = assetPath =>
{
    const rel = norm(assetPath);

    if (resolvedFiles.has(rel))
    {
        return resolvedFiles.get(rel);
    }

    const local = localPathOf(rel);
    const resolved = fs.existsSync(local)
        ? local
        : filePathOf(rel);

    resolvedFiles.set(rel, resolved);

    return resolved;
};
const inflight = new Map();

export const ensureFile = async assetPath =>
{
    const rel = norm(assetPath);

    const local = localPathOf(rel);

    if (fs.existsSync(local))
    {
        resolvedFiles.set(rel, local);

        return local;
    }

    const cached = filePathOf(rel);

    if (fs.existsSync(cached))
    {
        resolvedFiles.set(rel, cached);

        return cached;
    }

    if (inflight.has(rel))
    {
        return inflight.get(rel);
    }

    const download = (async () =>
    {
        const response = await fetchWithRetry(assetUrl(rel));
        const body = Buffer.from(await response.arrayBuffer());

        await fs.promises.mkdir(path.dirname(cached), { recursive: true });
        const partial = `${cached}.part`;

        await fs.promises.writeFile(partial, body);
        await fs.promises.rename(partial, cached);

        resolvedFiles.set(rel, cached);

        return cached;
    })().finally(() => inflight.delete(rel));

    inflight.set(rel, download);

    return download;
};

export const FILE_ASSETS = Object.freeze([
    'fonts/impact.ttf',
    'fonts/geist.ttf',

    'sounds/startrecord.mp3',
    'sounds/stoprecord.mp3',

    'overlays/drip.png',
    'overlays/goos.png',
    'overlays/kill.png',
    'overlays/myman.png',
    'overlays/sakify.png',
    'overlays/sus.png',

    ...[
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        'pinki',
        'relaxy',
        'snips'
    ].map(n => `shop/${n}.png`),

    ...Array.from({ length: 12 }, (_, i) => `reactions/hug/hug${i + 1}.gif`),
    'reactions/pat/pat.gif',
    ...Array.from({ length: 8 }, (_, i) => `reactions/pat/pat${i + 2}.gif`),

    'commands/help/embed.png'
]);

export const cdnDir = assetDir =>
{
    const rel = norm(assetDir);
    const local = localPathOf(rel);

    return fs.existsSync(local)
        ? local
        : filePathOf(rel);
};

export const warmFileCache = async (onError = () =>
{
}, onInfo = () =>
{
}) =>
{
    const missing = FILE_ASSETS.filter(asset => !fs.existsSync(localPathOf(asset)) && !fs.existsSync(filePathOf(asset)));

    if (missing.length)
    {
        onInfo(`${missing.length}/${FILE_ASSETS.length} CDN assets are not under CDN_LOCAL_ROOT (${CDN_LOCAL_ROOT}) ` + `nor cached - downloading them. Set CDN_LOCAL_ROOT to the CDN's directory to skip this.`);
    }

    await mapLimit(FILE_ASSETS, DOWNLOAD_CONCURRENCY, asset => ensureFile(asset).catch(e => onError(asset, e)));
};

export const cdnUrl = assetPath => `${CDN_BASE}/${norm(assetPath)}`;

export const assetUrl = assetPath => cdnUrl(`${CDN_PREFIX}/${norm(assetPath)}`);

const BRAND = assetUrl('common/relaxy.png');

export const CDN = Object.freeze({
    base: CDN_BASE,
    url:  assetUrl,

    localRoot: CDN_LOCAL_ROOT,
    file:      cdnFile,

    fonts: Object.freeze({
        impact: cdnFile('fonts/impact.ttf'),
        geist:  cdnFile('fonts/geist.ttf')
    }),

    sounds: Object.freeze({
        recordStart: cdnFile('sounds/startrecord.mp3'),
        recordStop:  cdnFile('sounds/stoprecord.mp3')
    }),

    overlays: Object.freeze({
        drip:   cdnFile('overlays/drip.png'),
        goos:   cdnFile('overlays/goos.png'),
        kill:   cdnFile('overlays/kill.png'),
        myman:  cdnFile('overlays/myman.png'),
        sakify: cdnFile('overlays/sakify.png'),
        sus:    cdnFile('overlays/sus.png')
    }),

    background: name => cdnFile(`shop/${name}.png`),

    reactionDir: kind => cdnDir(`reactions/${kind}`),
    reaction:    (kind, file) => cdnFile(`reactions/${kind}/${file}`),

    helpImage: command => cdnFile(`commands/help/${command}.png`),

    brand: BRAND,

    loading:       assetUrl('common/loading.gif'),
    serverIcon:    assetUrl('common/server.png'),
    poll:          assetUrl('common/poll.png'),
    defaultAvatar: assetUrl('common/default-avatar.png'),

    musicIcon:        assetUrl('music/notes.gif'),
    musicPlaceholder: assetUrl('music/mp3.gif'),

    profile: Object.freeze({
        achievement:     assetUrl('profile/achievement.png'),
        mail:            assetUrl('profile/mail.png'),
        paymentComplete: assetUrl('profile/payment_complete.png'),
        shop:            assetUrl('profile/shop.png')
    }),

    spinner: BRAND,
    person:  BRAND,
    thanks:  BRAND,
    snake:   BRAND
});

const TEXT_DIR = 'text';
export const CACHED_TEXT = Object.freeze([
    '8b.txt',
    'help_manager.txt',
    'help_special_exceptions.txt',
    'scams.txt'
]);
export const FRESH_TEXT = Object.freeze([
    'credits.txt',
    'devlog.txt',
    'server_join.txt'
]);
const memo = new Map();

const cachePathOf = name => path.join(CACHE_DIR, name);
export const TEXT_REFRESH_INTERVAL = 60 * 60 * 1000;

const fetchText = async name => (await fetchWithRetry(assetUrl(`${TEXT_DIR}/${name}`))).text();

const writeCache = async (name, body) =>
{
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    await fs.promises.writeFile(cachePathOf(name), body, 'utf8');
};

const readCache = async name =>
{
    try
    {
        return await fs.promises.readFile(cachePathOf(name), 'utf8');
    }
    catch
    {
        return null;
    }
};

export const cdnText = async (name, onError = () =>
{
}) =>
{
    const fresh = FRESH_TEXT.includes(name);

    if (!fresh && memo.has(name))
    {
        return memo.get(name);
    }

    try
    {
        const body = await fetchText(name);

        await writeCache(name, body).catch(() =>
        {
        });

        if (!fresh)
        {
            memo.set(name, body);
        }

        return body;
    }
    catch (e)
    {
        onError(e);

        const cached = await readCache(name);

        if (cached === null)
        {
            return '';
        }

        if (!fresh)
        {
            memo.set(name, cached);
        }

        return cached;
    }
};

export const warmTextCache = async (onError = () =>
{
}) =>
{
    await Promise.all(CACHED_TEXT.map(name => cdnText(name, e => onError(name, e))));
};

export const refreshTextCache = async (onError = () =>
{
}) =>
{
    await Promise.all(CACHED_TEXT.map(async name =>
    {
        try
        {
            const body = await fetchText(name);

            await writeCache(name, body).catch(() =>
            {
            });

            memo.set(name, body);
        }
        catch (e)
        {
            onError(name, e);
        }
    }));
};

export const startTextRefresh = (onError = () =>
{
}, interval = TEXT_REFRESH_INTERVAL) =>
{
    const timer = setInterval(() => void refreshTextCache(onError), interval);

    timer.unref?.();

    return timer;
};

export default CDN;
