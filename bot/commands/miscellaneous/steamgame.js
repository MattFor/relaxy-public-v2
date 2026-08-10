'use strict';
import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const FETCH_TIMEOUT_MS = 20 * 1000;

const APPID_RE = /^\d+$/;

const NOISE_RE = /[$&+,:=?@#|'<>.^*()%/[\]\\-]/g;

const normalise = value => String(value ?? '').toLowerCase().replace(NOISE_RE, '').replace(/\s+/g, ' ').trim();

const getJson = async url =>
{
    try
    {
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

        if (!res.ok)
        {
            return null;
        }

        return await res.json();
    }
    catch
    {
        return null;
    }
};

const stamp = (value, style) =>
{
    const seconds = Number(value);

    return Number.isFinite(seconds) && seconds > 0
        ? `<t:${Math.floor(seconds)}:${style}>`
        : '`Unknown`';
};

const findApp = (client, args) =>
{
    const list = client.caches.steamAppNames ?? [];
    const joined = args.join(' ').trim();
    const wanted = normalise(joined);

    if (APPID_RE.test(args[0] ?? ''))
    {
        const byId = list.find(app => String(app.appid) === args[0]);

        if (byId)
        {
            return byId;
        }
    }

    const exact = list.filter(app => normalise(app.name) === wanted);

    if (exact.length)
    {
        return exact.sort((a, b) => a.appid - b.appid)[0];
    }

    const fused = client.caches.steamAppNamesFused;

    if (!fused)
    {
        return null;
    }

    const hit = fused.search(joined)
                     .filter(result => result.item?.name)
                     .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))[0];

    return hit?.item ?? null;
};

export default {
    name:        'steamgame',
    usage:       '=steamgame <name/gameId>',
    description: 'Get the information of any Steam game by name or app ID.',

    args:     true,
    cooldown: 5,

    permissionsUser: [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    leaveout: true,
    async run(client, message, args, guild, interaction)
    {
        if (!client.data.steamNames || !client.caches?.steamAppNames?.length)
        {
            return client.qEmbed('The Steam game list has not loaded yet. Try again in a moment.', interaction ?? message);
        }

        const app = findApp(client, args);

        if (!app)
        {
            return client.qEmbed(`I could not find a Steam game matching \`${args.join(' ').slice(0, 100)}\`.`, interaction ?? message);
        }

        const waiting = await client.send(message.channel, null, [
            {
                color:       client.data.embedColor,
                title:       'Fetching information…',
                description: `Looking up **${app.name}** (\`${app.appid}\`).`,
                thumbnail:   { url: client.cdn.loading }
            }
        ]);

        const [details, priceInfo, players] = await Promise.all([
            getJson(`https://api.steamcmd.net/v1/info/${app.appid}`),
            getJson(`https://store.steampowered.com/api/appdetails?appids=${app.appid}&cc=us&l=en`),
            getJson(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${app.appid}`)
        ]);

        const common = details?.data?.[app.appid]?.common ?? null;
        const depots = details?.data?.[app.appid]?.depots ?? null;

        const store = priceInfo?.[app.appid]?.success
            ? priceInfo[app.appid].data
            : null;

        if (!common && !store)
        {
            return client.edit(waiting, null, [
                {
                    color:       client.data.embedColor,
                    title:       'Steam did not answer',
                    description: `I found **${app.name}** (\`${app.appid}\`) in the app list, but Steam returned no details for it just now. Try again shortly.`
                }
            ]);
        }

        const playerCount = players?.response?.player_count;

        const platforms = store?.platforms ?? {};
        const supportedOS = [
            platforms.windows && 'Windows',
            platforms.mac && 'MacOS',
            platforms.linux && 'Linux'
        ].filter(Boolean);

        const price = store?.price_overview ?? null;

        const gameCost = store?.is_free
            ? 'Free'
            : price?.final_formatted ?? 'Unknown';

        const gameCurrency = price?.currency
            ? ` (${price.currency})`
            : '';

        const gameDiscount = price?.discount_percent
            ? `${price.discount_percent}% off`
            : 'None';

        const title = common?.name ?? store?.name ?? app.name;
        const blurb = store?.short_description
            ? `\`\`\`\n${store.short_description.slice(0, 600)}\n\`\`\``
            : '';

        const icon = common?.icon
            ? { url: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${app.appid}/${common.icon}.jpg` }
            : null;

        return client.edit(waiting, null, [
            {
                color:       client.data.embedColor,
                thumbnail:   icon,
                description: `## ${title}\n${blurb}`.slice(0, 4096),

                fields: [
                    {
                        name:   '**General Information**',
                        value:  `📈 Players: \`${playerCount ?? 'Unknown'}\`\n📆 Released: ${stamp(common?.steam_release_date, 'D')}\n📁 Achievements: \`${store?.achievements?.total ?? 'None'}\``,
                        inline: true
                    },
                    {
                        name:   '​',
                        value:  '​',
                        inline: true
                    },
                    {
                        name:   '**Game Information**',
                        value:  `📰 Last Update: ${stamp(depots?.branches?.public?.timeupdated, 'R')}\n🛠️ Last Build: ${stamp(depots?.branches?.development?.timeupdated, 'R')}\n📋 Game ID: \`${app.appid}\``,
                        inline: true
                    },
                    {
                        name:   '**Store Information**',
                        value:  `Game Price${gameCurrency}: \`${gameCost}\`\nDiscount: \`${gameDiscount}\`\nRecommendations: \`${store?.recommendations?.total ?? 'None'}\``,
                        inline: true
                    },
                    {
                        name:   '​',
                        value:  '​',
                        inline: true
                    },
                    {
                        name:  '​',
                        value: `Developer(s): \`${store?.developers?.join(', ') || 'Unknown'}\`\nPlatforms: \`${supportedOS.join(', ') || 'Unknown'}\`\nStore Page: [Click Here](https:
                        inline: true
                    }
                ],

                footer:    client.data.footer,
                timestamp: new Date()
            }
        ]);
    }
};
