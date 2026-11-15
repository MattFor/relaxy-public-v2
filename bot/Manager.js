'use strict';

import Manager from '../src/Manager/Manager.js';
import { config } from '../src/Config/Config.js';
import { ensureStorage } from '../src/Assets/Storage.js';
import { loadSettings, saveSettings } from '../src/Config/Settings.js';
import { operatingMode } from '../src/Core/DataTable.js';
import { warmTextCache, warmFileCache, startTextRefresh } from '../src/Assets/CDN.js';
import { ReClusterManager } from 'discord-hybrid-sharding';
import { HeartbeatManager } from '../src/Manager/Core/HeartBeatManager.js';

await ensureStorage();

const settings = await loadSettings(
    config.keys.dbtoken,
    {
        version: config.keys.version,
        wmStatus: config.text.wmStatus,
        clientStatus: config.text.clientStatus,
        ownerIds: config.keys.owners,

        operatingMode: operatingMode.NORMAL
    },
    (e) =>
        console.error(
            `[Cluster Manager] Could not read settings from the database, falling back to .env: ${e?.message ?? e}`
        )
);

config.keys.version = settings.version;
config.keys.owners = settings.ownerIds;
config.text.wmStatus = settings.wmStatus;
config.text.clientStatus = settings.clientStatus;
config.keys.operatingMode = settings.operatingMode;

await Promise.all([
    warmTextCache((name, e) =>
        console.warn(`[Cluster Manager] CDN text "${name}" unavailable, using cache: ${e?.message ?? e}`)
    ),
    warmFileCache(
        (name, e) => console.warn(`[Cluster Manager] CDN file "${name}" unavailable: ${e?.message ?? e}`),
        (note) => console.warn(`[Cluster Manager] ${note}`)
    )
]);
startTextRefresh((name, e) =>
    console.warn(`[Cluster Manager] CDN text refresh failed for "${name}": ${e?.message ?? e}`)
);

const RelaxyManager = new Manager({
    respawn: false,
    mode: 'process',
    process: process,
    token: config.keys.token,
    dirname: config.paths.projectDir,
    clientFilePath: config.paths.clientFile,
    shardArgs: config.keys.client.execArgs2,
    totalShards: config.keys.manager.shardCount,
    execute_arguments: config.keys.client.execArgs,
    shardsPerCluster: config.keys.manager.shardsPerCluster
});

RelaxyManager.extend(
    new HeartbeatManager({
        beatInterval: 5 * 1000,
        checkInterval: 5 * 1000,
        maxMissedHeartbeats: 12
    }),
    new ReClusterManager()
);
RelaxyManager.data('Cluster Manager', 'Extended Cluster Manager with plugins...');

let startupFinalized = false;

const finalizeStartup = () => {
    if (startupFinalized) {
        return;
    }

    const readyCount = Array.from(RelaxyManager.clusters.values()).filter((c) => c.ready).length;

    if (readyCount !== RelaxyManager.totalClusters) {
        return;
    }

    startupFinalized = true;
    clearInterval(startupWatchdog);

    if (RelaxyManager.operatingMode === operatingMode.SPECIAL) {
        RelaxyManager.operatingMode = operatingMode.NORMAL;

        saveSettings(config.keys.dbtoken, { operatingMode: operatingMode.NORMAL }, (e) =>
            console.error(`[Cluster Manager] Could not persist the operating mode: ${e?.message ?? e}`)
        ).then(() => {});
    }

    RelaxyManager._returnOutputState();

    RelaxyManager.info(
        'Cluster Manager',
        '\n -----------------------------------\n| All clusters and shards deployed! |\n -----------------------------------'
    );
};

const watchCluster = (cluster) => cluster.on('ready', finalizeStartup);

RelaxyManager.on('clusterCreate', watchCluster);
RelaxyManager.clusters.forEach(watchCluster);

const spawnDelayMs = 7 * 1000;
const startupBudgetMs = Math.max(5 * 60 * 1000, RelaxyManager.totalClusters * spawnDelayMs + 60 * 1000);
const startupStart = Date.now();
const startupDeadline = startupStart + startupBudgetMs;

const startupWatchdog = setInterval(() => {
    if (startupFinalized || Date.now() < startupDeadline) {
        return;
    }

    const notReady = Array.from(RelaxyManager.clusters.values())
        .filter((c) => !c.ready)
        .map((c) => c.id);
    const readyCount = RelaxyManager.totalClusters - notReady.length;
    const elapsedSeconds = Math.round((Date.now() - startupStart) / 1000);

    RelaxyManager.warn(
        'Cluster Manager',
        `Startup watchdog: only ${readyCount}/${RelaxyManager.totalClusters} clusters ready after ${elapsedSeconds}s. Still waiting on: [${notReady.join(', ')}]`
    );
}, 60 * 1000);
finalizeStartup();
