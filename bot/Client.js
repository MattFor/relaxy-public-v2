'use strict';

import Relaxy                  from '../src/Client/Relaxy.js';
import { getInfo }             from 'discord-hybrid-sharding';
import {
    Options,
    IntentsBitField,
    Partials
}                              from 'discord.js';
import { IS_WINDOWS }          from '../detect_os.js';
import { makeRetryingRequest } from '../src/Utils/RestRetry.js';

const intents = new IntentsBitField();
for (let x of [
    'Guilds',
    'GuildMembers',
    'GuildModeration',
    'GuildBans',
    'GuildEmojisAndStickers',
    'GuildIntegrations',
    'GuildInvites',
    'GuildVoiceStates',
    'GuildScheduledEvents',
    'GuildMessages',
    'GuildMessageReactions',
    'GuildWebhooks',
    'GuildScheduledEvents',
    'AutoModerationConfiguration',
    'AutoModerationExecution',
    'DirectMessages',
    'DirectMessageReactions',
    'MessageContent',
    'AutoModerationConfiguration',
    'AutoModerationExecution'
])
{
    intents.add(x);
}

const clusterInformation = getInfo();

const isRelaxy = entry => entry.id === client?.user?.id;
const client = new Relaxy({
    defaultClient: {
        rest:       {
            timeout: IS_WINDOWS
                         ? 30 * 1000
                         : 300 * 1000,

            makeRequest: makeRetryingRequest((level, text) => client?.log?.(level, text))
        },
        shards:     clusterInformation.SHARD_LIST,
        shardCount: clusterInformation.TOTAL_SHARDS,
        intents:    intents,
        partials:   [
            Partials.Channel,
            Partials.Message,
            Partials.Reaction,
            Partials.User,
            Partials.GuildMember
        ],
        makeCache:  Options.cacheWithLimits({
            ...Options.DefaultMakeCacheSettings,

            GuildMemberManager: {
                maxSize:       1000,
                keepOverLimit: isRelaxy
            },
            UserManager:        {
                maxSize:       1000,
                keepOverLimit: isRelaxy
            }
        }),

        sweepers: {
            ...Options.DefaultSweeperSettings,
            messages: {
                interval: 600,
                lifetime: 3600
            }
        }
    },
    process
});
