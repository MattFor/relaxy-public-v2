'use strict';
import fs from 'fs';
import { hostname } from 'os';

import { CDN } from '../Assets/CDN.js';
import { PROJECT_DIR, required, optional, list, flag } from './Env.js';

export { PROJECT_DIR };
export const DEFAULT_PREFIX = '=';
export const DEFAULT_WM_STATUS = 'Bot status **ONLINE**, version **XXX**';
export const DEFAULT_CLIENT_STATUS =
    '=help | {|U|} Users //WATCHING//{|G|} - guilds {|U|} - users {|G|} Guilds, {|U|} Users.Bot status **ONLINE**, version **XXX**';

const shardsPerCluster = () => {
    const raw = optional('SHARDS_PER_CLUSTER', 'auto');

    if (raw === 'auto') {
        return raw;
    }

    const parsed = Number.parseInt(raw, 10);

    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`SHARDS_PER_CLUSTER must be "auto" or a positive integer, got "${raw}".`);
    }

    return parsed;
};

const shardCount = () => {
    const raw = optional('SHARD_COUNT', '2');
    const parsed = Number.parseInt(raw, 10);

    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`SHARD_COUNT must be a positive integer, got "${raw}".`);
    }

    return parsed;
};

const positiveInt = (name, fallback) => {
    const raw = optional(name, fallback);
    const parsed = Number.parseInt(raw, 10);

    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${name} must be a positive integer, got "${raw}".`);
    }

    return parsed;
};

const CLUSTER_EXEC_ARGS = list('NODE_CLUSTER_EXEC_ARGS', [
    '-stack_size=25000',
    '--trace-uncaught',

    '--experimental-json-modules',
    '--experimental-modules',
    '--max-old-space-size=32768'
]);

const CLUSTER_SHARD_ARGS = list('NODE_CLUSTER_SHARD_ARGS', [
    '--ansi',
    '--color',
    '--trace-uncaught',
    '--max-old-space-size=32768'
]);

const projectDir =
    process.env.PROJECT_DIR && fs.existsSync(process.env.PROJECT_DIR) ? process.env.PROJECT_DIR : PROJECT_DIR;

const clientFile = optional('CLIENT_FILE', './bot/Client.js');

const seedOwners = () => {
    const many = list('OWNER_IDS', []);

    if (many.length) {
        return many;
    }

    const one = optional('OWNER_ID', '');

    return one ? [one] : [];
};

export const config = {
    paths: {
        clientFile,
        projectDir,
        cdnRoot: CDN.localRoot
    },

    keys: {
        token: required('DISCORD_TOKEN'),
        dbtoken: required('MONGODB_URI'),
        version: optional('BOT_VERSION', 'GA3.0'),

        youtubeCookie: '',
        owners: seedOwners(),

        get owner() {
            return this.owners[0] ?? '';
        },

        client: {
            path: clientFile,
            execArgs: CLUSTER_EXEC_ARGS,
            execArgs2: CLUSTER_SHARD_ARGS
        },

        manager: {
            shardCount: shardCount(),
            shardsPerCluster: shardsPerCluster()
        },

        bridge: {
            port: positiveInt('BRIDGE_PORT', '4444'),
            host: optional('BRIDGE_HOST', ''),
            authToken: optional('BRIDGE_AUTH_TOKEN', ''),
            totalMachines: positiveInt('BRIDGE_TOTAL_MACHINES', '1'),
            get token() {
                return required('DISCORD_TOKEN');
            }
        },

        dashboard: {
            enabled: flag('DASHBOARD_API_ENABLED', false),
            host: optional('DASHBOARD_API_HOST', '127.0.0.1'),
            port: positiveInt('DASHBOARD_API_PORT', '8788'),
            token: optional('DASHBOARD_API_TOKEN', '')
        },

        machineId: optional('MACHINE_ID', hostname())
    },

    text: {
        defaultPrefix: DEFAULT_PREFIX,
        clientStatus: DEFAULT_CLIENT_STATUS,
        wmStatus: DEFAULT_WM_STATUS,

        links: {
            relaxyImage: CDN.brand,
            musicImage: CDN.musicIcon
        }
    }
};

export const isOwner = (id) => !!id && config.keys.owners.includes(String(id));

export default config;
