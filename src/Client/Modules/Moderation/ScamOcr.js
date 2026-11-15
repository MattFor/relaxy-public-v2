'use strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import sharp from 'sharp';
import axios from 'axios';

const TESSERACT = process.env.TESSERACT_PATH || 'tesseract-ocr';
let unavailable = false;

const FETCH_TIMEOUT = 8_000;
const RECOGNIZE_TIMEOUT = 20_000;
const MAX_BYTES = 8 * 1024 * 1024;
const DARK_MEAN = 110;
const OCR_WIDTH = 1280;

const THREAD_LIMIT = '1';
const CORES = (() => {
    try {
        return os.availableParallelism?.() ?? os.cpus().length;
    } catch {
        return 1;
    }
})();

const OCR_CONCURRENCY = (() => {
    const configured = Number(process.env.SCAM_OCR_CONCURRENCY);

    return Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : Math.max(1, Math.min(4, CORES));
})();
let active = 0;
const waiting = [];

const withSlot = async (task) => {
    if (active >= OCR_CONCURRENCY) {
        await new Promise((resolve) => waiting.push(resolve));
    } else {
        active++;
    }

    try {
        return await task();
    } finally {
        const next = waiting.shift();

        if (next) {
            next();
        } else {
            active--;
        }
    }
};

const preprocess = async (input) => {
    const base = sharp(input, { failOn: 'none' }).grayscale();
    const stats = await base.clone().stats();
    const mean = stats.channels[0]?.mean ?? 128;

    const toned = mean < DARK_MEAN ? base.negate() : base;

    return toned
        .normalize()
        .resize({
            width: OCR_WIDTH,
            withoutEnlargement: false
        })
        .png()
        .toBuffer();
};

const recognise = (png, log) =>
    new Promise((resolve) => {
        if (unavailable) {
            return resolve('');
        }

        let child;

        try {
            child = spawn(TESSERACT, ['-', '-', '-l', 'eng', '--psm', '11'], {
                env: {
                    ...process.env,
                    OMP_THREAD_LIMIT: THREAD_LIMIT
                },

                stdio: ['pipe', 'pipe', 'ignore']
            });
        } catch {
            return resolve('');
        }

        let out = '';
        let done = false;

        const finish = (value) => {
            if (done) {
                return;
            }

            done = true;

            clearTimeout(timer);
            resolve(value);
        };

        const timer = setTimeout(() => {
            child.kill('SIGKILL');

            log?.('WARN', 'ScamOcr: read timed out; killed tesseract-ocr.');

            finish('');
        }, RECOGNIZE_TIMEOUT);
        child.stdout.setEncoding('utf8');

        child.stdout.on('data', (chunk) => {
            out += chunk;
        });

        child.on('error', (error) => {
            if (error?.code === 'ENOENT') {
                const first = !unavailable;

                unavailable = true;

                if (first) {
                    log?.(
                        'WARN',
                        'ScamOcr: `tesseract-ocr` not found. Image scam scanning is off; `sudo apt install tesseract-ocr` on the Pi to enable it.'
                    );
                }
            } else {
                log?.('WARN', `ScamOcr: tesseract-ocr failed: ${error?.message ?? error}`);
            }

            finish('');
        });

        child.on('close', () => finish(out));

        child.stdin.on('error', () => {});
        child.stdin.end(png);
    });

const CONTENT_TTL = 30 * 60 * 1000;

const KNOWN_SCAM_TTL = 24 * 60 * 60 * 1000;
const CONTENT_MAX = 1000;
const contentCache = new Map();
const inFlight = new Map();
const urlInFlight = new Map();
const prune = () => {
    const now = Date.now();

    for (const [digest, entry] of contentCache) {
        if (now - entry.at >= (entry.scam ? KNOWN_SCAM_TTL : CONTENT_TTL)) {
            contentCache.delete(digest);
        }
    }

    if (contentCache.size > CONTENT_MAX) {
        for (const [digest, entry] of contentCache) {
            if (contentCache.size <= CONTENT_MAX) {
                break;
            }

            if (!entry.scam) {
                contentCache.delete(digest);
            }
        }
    }
};
const remembered = (digest) => {
    const entry = contentCache.get(digest);

    if (!entry) {
        return null;
    }

    if (Date.now() - entry.at >= (entry.scam ? KNOWN_SCAM_TTL : CONTENT_TTL)) {
        contentCache.delete(digest);

        return null;
    }

    return entry;
};
let onLearned = null;

export const setScamImagePublisher = (publish) => {
    onLearned = typeof publish === 'function' ? publish : null;
};
const announce = (entries) => {
    if (!onLearned || !entries.length) {
        return;
    }

    try {
        onLearned(entries);
    } catch {}
};

export const rememberImages = (entries) => {
    let applied = 0;

    for (const entry of entries ?? []) {
        const digest = entry?.digest;

        if (typeof digest !== 'string' || !digest) {
            continue;
        }

        const at = Number.isFinite(entry.at) ? entry.at : Date.now();

        if (Date.now() - at >= (entry.scam ? KNOWN_SCAM_TTL : CONTENT_TTL)) {
            continue;
        }

        const held = contentCache.get(digest);

        if (!held) {
            contentCache.set(digest, {
                text: String(entry.text ?? ''),
                at,
                scam: entry.scam === true
            });

            applied++;

            continue;
        }
        if (entry.scam === true && !held.scam) {
            held.scam = true;
            held.at = at;
            applied++;

            continue;
        }

        if (at > held.at) {
            held.text = String(entry.text ?? held.text);
            held.at = at;
            applied++;
        }
    }

    if (applied) {
        prune();
    }

    return applied;
};

export const exportScamImages = (max = CONTENT_MAX) => {
    const now = Date.now();
    const live = [];

    for (const [digest, entry] of contentCache) {
        if (now - entry.at >= (entry.scam ? KNOWN_SCAM_TTL : CONTENT_TTL)) {
            continue;
        }

        live.push({
            digest,
            text: entry.text,
            scam: entry.scam === true,
            at: entry.at
        });
    }

    return live.sort((a, b) => Number(b.scam) - Number(a.scam) || b.at - a.at).slice(0, Math.max(0, max));
};

export const markScamImages = (digests) => {
    let marked = 0;
    const learned = [];

    for (const digest of digests ?? []) {
        const entry = contentCache.get(digest);

        if (entry && !entry.scam) {
            entry.scam = true;
            entry.at = Date.now();
            marked++;

            learned.push({
                digest,
                text: entry.text,
                scam: true,
                at: entry.at
            });
        }
    }

    announce(learned);

    return marked;
};
export const isKnownScamImage = (digest) => remembered(digest)?.scam === true;
export const ocrCacheStats = () => ({
    remembered: contentCache.size,
    scams: [...contentCache.values()].filter((entry) => entry.scam).length,
    inFlight: inFlight.size
});

const readOne = async (url, log) => {
    const existing = urlInFlight.get(url);

    if (existing) {
        return existing;
    }

    const job = (async () => {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: FETCH_TIMEOUT,
                maxContentLength: MAX_BYTES,
                maxBodyLength: MAX_BYTES
            });

            const data = Buffer.from(response.data);
            const digest = createHash('sha256').update(data).digest('hex');

            const known = remembered(digest);

            if (known) {
                return {
                    text: known.text,
                    digest,
                    cached: true,
                    scam: known.scam === true
                };
            }

            const running = inFlight.get(digest);

            if (running) {
                return {
                    text: await running,
                    digest,
                    cached: true,
                    scam: false
                };
            }

            const work = withSlot(async () => recognise(await preprocess(data), log));

            inFlight.set(digest, work);

            let text = '';

            try {
                text = await work;
            } finally {
                inFlight.delete(digest);
            }

            const at = Date.now();

            contentCache.set(digest, {
                text,
                at,
                scam: false
            });

            prune();

            announce([
                {
                    digest,
                    text,
                    scam: false,
                    at
                }
            ]);

            return {
                text,
                digest,
                cached: false,
                scam: false
            };
        } catch (error) {
            log?.('WARN', `ScamOcr: could not read ${url}: ${error?.message ?? error}`);

            return {
                text: '',
                digest: null,
                cached: false,
                scam: false
            };
        } finally {
            urlInFlight.delete(url);
        }
    })();

    urlInFlight.set(url, job);

    return job;
};

export const readImages = async (imageUrls, { log, max = 4, concurrency = OCR_CONCURRENCY } = {}) => {
    if (!imageUrls?.length || unavailable) {
        return [];
    }

    const targets = imageUrls.slice(0, Math.max(0, max));

    if (!targets.length) {
        return [];
    }

    const reads = new Array(targets.length).fill(null);
    const lanes = Math.max(1, Math.min(Math.floor(concurrency) || 1, targets.length));

    let cursor = 0;
    const lane = async () => {
        for (;;) {
            const index = cursor++;

            if (index >= targets.length) {
                return;
            }

            reads[index] = await readOne(targets[index], log);
        }
    };

    await Promise.all(Array.from({ length: lanes }, lane));

    return targets.map((url, index) => ({
        url,
        text: (reads[index]?.text ?? '').trim(),
        digest: reads[index]?.digest ?? null,
        cached: reads[index]?.cached === true,
        scam: reads[index]?.scam === true
    }));
};

export const ocrImages = async (imageUrls, opts = {}) => {
    const reads = await readImages(imageUrls, opts);

    return reads
        .map((read) => read.text)
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
};
