'use strict';

import Discord from 'discord.js';
import { request } from 'undici';
import Relaxy from '../../../src/Client/Relaxy.js';

const SEARCH_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const MAX_REDIRECTS = 3;

const followedRequest = async (url, options) => {
    let target = url;

    for (let hop = 0; ; hop++) {
        const response = await request(target, options);

        const location = response.headers?.location;
        const redirected = [301, 302, 303, 307, 308].includes(response.statusCode);

        if (!redirected || !location || hop >= MAX_REDIRECTS) {
            return response;
        }

        response.body?.dump?.();

        target = new URL(location, target).toString();

        if (response.statusCode === 303 && options.method && options.method !== 'HEAD') {
            options = {
                ...options,
                method: 'GET'
            };
        }
    }
};
const SEARCH_PAGES = [1, 36];

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

const urlExtension = (url) => {
    try {
        const path = new URL(url).pathname;
        const dot = path.lastIndexOf('.');

        return dot === -1 ? '' : path.slice(dot).toLowerCase();
    } catch (e) {
        return '';
    }
};

const isEmbeddable = (url) => {
    return (
        typeof url === 'string' &&
        /^https?:\/\//i.test(url) &&
        !url.startsWith('data:') &&
        ALLOWED_EXT.includes(urlExtension(url))
    );
};

const isURLValid = async (url) => {
    if (!isEmbeddable(url)) {
        return false;
    }

    const probe = async (method) => {
        const { statusCode, headers, body } = await followedRequest(url, {
            method,
            headersTimeout: 4000,
            bodyTimeout: 4000,

            headers: {
                'user-agent': SEARCH_USER_AGENT,
                accept: 'image/*,*/*;q=0.8',
                ...(method === 'GET' ? { range: 'bytes=0-0' } : {})
            }
        });

        body?.dump?.();

        return {
            statusCode,
            type: headers['content-type'] || ''
        };
    };

    try {
        let { statusCode, type } = await probe('HEAD');

        if (statusCode === 405 || statusCode === 403 || statusCode === 501) {
            ({ statusCode, type } = await probe('GET'));
        }

        return (statusCode === 200 || statusCode === 206) && type.toLowerCase().startsWith('image/');
    } catch (e) {
        return false;
    }
};

const extractImageUrls = (html) => {
    const found = [];

    for (const pattern of [/&quot;murl&quot;:&quot;(.*?)&quot;/g, /"murl":"(.*?)"/g]) {
        for (const match of html.matchAll(pattern)) {
            const url = match[1]
                .replace(/\\\//g, '/')
                .replace(/\\u0026/gi, '&')
                .replace(/&amp;/g, '&');

            found.push(url);
        }
    }

    return found;
};

const searchImages = async (query, { gif = false, safe = true, log = null } = {}) => {
    const seen = new Set();
    const urls = [];

    const diagnose = (level, detail) =>
        log?.(level, `[picture] ${detail} (query "${query}", gif=${gif}, safe=${safe})`);

    const pages = await Promise.all(
        SEARCH_PAGES.map(async (first) => {
            const target =
                'https://www.bing.com/images/async' +
                `?q=${encodeURIComponent(query)}` +
                `&first=${first}` +
                '&count=35' +
                `&adlt=${safe ? 'strict' : 'off'}` +
                `&qft=${gif ? encodeURIComponent('+filterui:photo-animatedgif') : ''}`;

            try {
                const { statusCode, body } = await followedRequest(target, {
                    headersTimeout: 8000,
                    bodyTimeout: 8000,
                    headers: {
                        'user-agent': SEARCH_USER_AGENT,
                        accept: 'text/html,application/xhtml+xml',
                        'accept-language': 'en-US,en;q=0.9',

                        cookie: `SRCHHPGUSR=ADLT=${safe ? 'STRICT' : 'OFF'}`
                    }
                });

                if (statusCode !== 200) {
                    body?.dump?.();

                    diagnose('WARN', `search page ${first} answered HTTP ${statusCode}`);

                    return [];
                }

                const html = await body.text();
                const found = extractImageUrls(html);

                if (!found.length) {
                    diagnose(
                        'WARN',
                        `search page ${first} parsed to 0 images from ${html.length} bytes - Bing served something this cannot read`
                    );
                }

                return found;
            } catch (e) {
                diagnose(
                    'ERROR',
                    `search page ${first} failed: ${e?.constructor?.name ?? 'Error'} - ${e?.message ?? e}`
                );

                return [];
            }
        })
    );

    for (const url of pages.flat()) {
        if (!seen.has(url) && isEmbeddable(url)) {
            seen.add(url);
            urls.push(url);
        }
    }

    return urls;
};
export default {
    name: 'picture',
    aliases: ['pic'],
    usage: '=picture <keywords>',
    description:
        'Search a gif/image with the keywords specified.\nIn an nsfw channel results are unfiltered. Elsewhere they are safe, unless an administrator passes `nsfw`.',
    slashDescription: 'Search a gif/image with the keywords specified.',

    slash: new Discord.SlashCommandBuilder()
        .addStringOption((option) =>
            option.setName('text').setDescription('Search for an image with this description.').setRequired(true)
        )
        .addBooleanOption((option) =>
            option
                .setName('nsfw')
                .setDescription('Allow unfiltered results. Needs an NSFW channel, or Administrator.')
                .setRequired(false)
        ),
    args: true,
    cooldown: 3,

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES'],
    async run(client, message, args, guild, interaction) {
        if (!client.data.serverCache?.[guild.id]) {
            client.data.serverCache[guild.id] = {};
        }

        const now = Date.now();

        const asked =
            args.some((a) => String(a).toLowerCase() === 'nsfw') || interaction?.options?.getBoolean?.('nsfw') === true;

        args = args.filter((a) => typeof a !== 'boolean' && String(a).toLowerCase() !== 'nsfw').map((a) => String(a));

        const query = args.join(' ').slice(0, 239).trim();

        if (!query) {
            return client.send(interaction ? 1 : message.channel, null, [
                {
                    color: client.data.embedColor,
                    title: 'Search for what?',
                    description: `Give me something to look for - \`${this.usage}\`.`
                }
            ]);
        }

        if (await client.censored(args, guild, message)) {
            return client.send(interaction ? 1 : message.channel, null, [
                {
                    color: client.data.embedColor,
                    title: 'That search is censored here.',
                    description:
                        "This server's censor holds one of those words, so the search was not run. An administrator can adjust it with `=censor`."
                }
            ]);
        }

        const channelNSFW = message.channel?.nsfw === true;
        const override = asked && message.member?.permissions?.has(Discord.PermissionFlagsBits.Administrator) === true;

        const safe = !(channelNSFW || override);

        if (asked && !override && !channelNSFW) {
            return client.send(interaction ? 1 : message.channel, null, [
                {
                    color: client.data.embedColor,
                    title: 'Not here.',
                    description: 'Unfiltered results need a channel marked **NSFW** - or Administrator.'
                }
            ]);
        }

        const gif = query.toLowerCase().includes('gif');

        client.module.profiles.Achievement(message, 'image', guild);

        let waiting = null;
        if (!interaction) {
            waiting = await client.send(message.channel, null, [
                {
                    color: client.data.embedColor,
                    title: 'Processing image....',
                    thumbnail: { url: client.cdn.loading }
                }
            ]);
        }

        let err = null;
        const results = await searchImages(query, {
            gif,
            safe,
            log: (level, ...parts) => client.log(level, ...parts)
        }).catch((e) => (err = e));

        const fail = (title) => {
            const payload = client.send(interaction ? 1 : message.channel, null, [
                {
                    color: client.data.embedColor,
                    title
                }
            ]);

            return interaction ? payload : payload.then(() => client.delete(waiting));
        };

        if (err) {
            client.data.errors++;

            return fail(client.utils.firstLetterUp(err.message || String(err)));
        }

        const shown = Object.entries(client.data.serverCache[guild.id])
            .filter(([url, expiry]) => typeof expiry === 'number' && expiry > now && isEmbeddable(url))
            .map(([url]) => url);

        const seen = new Set(shown);

        const candidates = results.filter((url) => !seen.has(url)).concat(shown);

        if (candidates.length === 0) {
            return fail(`Nothing found for ${client.utils.firstLetterUp(query)}`);
        }

        const BATCH = 6;
        let chosenURL = null;

        for (let i = 0; i < candidates.length && !chosenURL; i += BATCH) {
            const batch = candidates.slice(i, i + BATCH);
            const verdicts = await Promise.all(batch.map(isURLValid));

            const hit = verdicts.indexOf(true);

            if (hit !== -1) {
                chosenURL = batch[hit];
            }
        }

        if (!chosenURL) {
            return fail(`Nothing embeddable found for ${client.utils.firstLetterUp(query)}`);
        }

        client.cacheFor(guild.id, chosenURL, 60000);

        const embed = {
            color: client.data.embedColor,
            title: client.utils.firstLetterUp(query),
            url: chosenURL,
            image: { url: chosenURL },
            footer: {
                icon_url: client.config.text.links.relaxyImage,
                text: `Scraped and rendered in ${client.imports.time(Date.now() - now)}`
            }
        };

        if (interaction) {
            return client.send(1, null, [embed]);
        }

        return client.send(message.channel, null, [embed]).then(() => client.delete(waiting));
    }
};
