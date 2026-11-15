'use strict';

import os from 'node:os';
import Mongoose from 'mongoose';
import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';
import { operatingMode } from '../../../src/Core/DataTable.js';
import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';
import { version as playerVersion } from '../../../src/Client/Modules/MusicPlayer/version.js';

import { HOST_TYPE } from '../../../detect_os.js';
import { loadHosts } from '../../../src/Config/Settings.js';

const statusNameByCode = Object.fromEntries(Object.entries(operatingMode).map(([name, code]) => [code, name]));

const STATUS_EMOJI = {
    NORMAL: '🟢',
    SPECIAL: '🔵',
    DEBUG: '🟡',
    MAINTENANCE: '🔴',
    OFFLINE: '⚫'
};

const DB_STATE = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];

const MB = (bytes) => (bytes / 1024 / 1024).toFixed(1);
const GB = (bytes) => (bytes / 1024 / 1024 / 1024).toFixed(2);
const percent = (used, total) => (total > 0 ? ((used / total) * 100).toFixed(1) : '0.0');
const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86_400);
    seconds %= 86_400;
    const hours = Math.floor(seconds / 3_600);
    seconds %= 3_600;
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);

    const parts = [];

    if (days) {
        parts.push(`${days}d`);
    }

    if (hours) {
        parts.push(`${hours}h`);
    }

    if (minutes) {
        parts.push(`${minutes}m`);
    }

    parts.push(`${seconds}s`);
    return parts.join(' ');
};

export default {
    name: 'status',
    aliases: ['ping'],
    usage: '=status',
    description:
        "Show detailed information about Relaxy's clusters, shards, host hardware and services.\n\nIf 'Low Performance' mode is on, Relaxy is running on a small server and thus some services are unavailable.",
    slashDescription: "Show detailed information about Relaxy's clusters and host.",

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const clusterId = client.cluster.id;
        const clusterInfo = client.cluster.info;
        const localMem = process.memoryUsage();
        const guildQueue = useQueue(message.guild.id);

        const safe = (promise) => promise.catch(() => null);

        const [perCluster, managerData, fleet] = await Promise.all([
            safe(
                client.cluster.broadcastEval((c) => {
                    const m = process.memoryUsage();

                    let queues = 0;
                    let tracks = 0;
                    try {
                        queues = c.player?.queues?.cache?.size ?? 0;
                        c.player?.queues?.cache?.forEach((q) => (tracks += q.tracks?.size ?? 0));
                    } catch {}

                    return {
                        id: c.cluster?.id ?? 0,
                        mem: (m.rss + m.external) / 1024 / 1024,
                        guilds: c.guilds.cache.size,
                        members: c.guilds.cache.reduce((acc, g) => acc + (g.memberCount ?? 0), 0),
                        maintenance: !!c.cluster?.maintenance,
                        shards: Array.from(c.cluster?.ids?.keys?.() ?? []),
                        queues,
                        tracks
                    };
                })
            ),
            safe(
                client.cluster.evalOnManager(`(() => {
                const mem = process.memoryUsage();
                const beats = this.heartbeat?.clusters?.get?.(${clusterId})?.heartbeats;
                return {
                    uptime: process.uptime() * 1000,
                    mem: (mem.rss + mem.external) / 1024 / 1024,
                    reclustering: !!this.recluster?.onProgress,
                    missedHeartbeats: beats ? Object.keys(beats).length : 0,
                    vitals: this.hostVitals ?? null
                };
            })()`)
            ),

            safe(loadHosts(client.config.keys.dbtoken, undefined, () => {}))
        ]);

        const clusters = Array.isArray(perCluster) ? perCluster : [];
        const totalGuilds = clusters.reduce((a, c) => a + c.guilds, 0);
        const totalMembers = clusters.reduce((a, c) => a + c.members, 0);
        const fleetMem = clusters.reduce((a, c) => a + c.mem, 0);
        const activeQueues = clusters.reduce((a, c) => a + c.queues, 0);
        const queuedTracks = clusters.reduce((a, c) => a + c.tracks, 0);
        const thisCluster = clusters.find((c) => c.id === clusterId);
        const thisClusterMem = thisCluster?.mem ?? (localMem.rss + localMem.external) / 1024 / 1024;

        const managerUptime = managerData?.uptime ?? 0;
        const managerMem = managerData?.mem ?? 0;
        const reclustering = managerData?.reclustering ?? false;
        const missedHeartbeats = managerData?.missedHeartbeats ?? 0;

        const vitals = managerData?.vitals ?? null;

        const hosts = Array.isArray(fleet) ? fleet : [];
        const me = client.config.keys.machineId;

        const fleetField =
            hosts.length > 1
                ? [
                      {
                          name: `Fleet [${hosts.length} hosts]`,
                          value: hosts
                              .map((host) => {
                                  const gb = (bytes) => `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
                                  const load = `${Math.round((host.cpuLoad ?? 0) * 100)}%`;

                                  return [
                                      `${host._id === me ? '**▸**' : '•'} **${host._id}**${
                                          host._id === me ? ' *(this host)*' : ''
                                      }`,
                                      `\`${(host.shards ?? []).length}\` shards · \`${host.guilds ?? 0}\` guilds · \`${host.players ?? 0}\` players`,
                                      `\`${load}\` load (${host.cpuCount ?? 0} cores) · \`${gb(host.memUsed ?? 0)}\`/\`${gb(host.memTotal ?? 0)}\``,
                                      host.version && host.version !== client.config.keys.version
                                          ? `⚠️ version \`${host.version}\` (fleet is on \`${client.config.keys.version}\`)`
                                          : null
                                  ]
                                      .filter(Boolean)
                                      .join('\n  ');
                              })
                              .join('\n'),
                          inline: false
                      }
                  ]
                : [];

        const statusName = statusNameByCode[client.data.status] ?? 'UNKNOWN';
        const statusEmoji = STATUS_EMOJI[statusName] ?? '⚪';

        const generalInfo = [
            `## ${statusEmoji} Global Status: ${statusName}`,
            `Low Performance Mode: ${client.flags.low_performance ? '**!ON!**' : '`OFF`'}`,
            '',
            `Version: \`${client.version ?? '[Not fetched yet]'}\``,
            `Total Servers: \`${totalGuilds}\``,
            `Total Members: \`${totalMembers}\``,
            `Clusters: \`${clusterInfo.CLUSTER_COUNT}\` • Shards: \`${clusterInfo.TOTAL_SHARDS}\``,
            `Manager Uptime: \`${client.imports.time(managerUptime)}\``,
            `Total Memory (all processes): \`${(managerMem + fleetMem).toFixed(1)}mb\``,
            `Cluster Manager Memory: \`${managerMem.toFixed(1)}mb\``
        ].join('\n');

        const handledShards = [...client.cluster.ids.keys()].map((id) => `\`${id}\``).join(', ');

        const clusterField = [
            `True Relaxy: ${client._trueRelaxy ? '`Yes`' : '`No`'}`,
            `Mode: **${client.cluster.mode}**`,
            `↻ Reclustering: ${reclustering ? '**`YES - UNSTABLE!`**' : '`No`'}`,
            `Maintenance: ${client.cluster.maintenance ? '**`YES - UNSTABLE`**' : '`No`'}`,
            `Memory: \`${thisClusterMem.toFixed(1)}mb\``,
            `Process PID: \`${process.pid}\``,
            `Handled Shards: [${handledShards}]`
        ].join('\n');

        const messageLatency = Date.now() - (interaction?.createdTimestamp ?? message.createdTimestamp);

        const shardField = [
            `WS Latency: \`${client.ws.ping === -1 ? '[Connecting]' : `${client.ws.ping}ms`}\``,
            `Message Latency: \`${messageLatency}ms\``,
            `Gateway: ${client.isReady() ? '`Ready`' : '**`Not ready`**'}`,
            `General Errors: \`${client.data.errors}\``,
            `Network Issues: \`${client.data.net_issues}\``,
            `Missed Manager Heartbeats: **\`${missedHeartbeats}\`**`,
            `Client Uptime: \`${client.imports.time(client.uptime ?? 0)}\``,
            `Process Uptime: \`${client.imports.time(process.uptime() * 1000)}\``,
            `Voice Connections: \`${client.voice.adapters.size}\``,
            `Started: **\`${client.readyAt ? client.utils.formatDate(client.readyAt) : 'N/A'}\`**`
        ].join('\n');
        const cachedRoles = client.guilds.cache.reduce((acc, g) => acc + g.roles.cache.size, 0);

        const cacheField = [
            `Servers: \`${client.guilds.cache.size}\``,
            `Users: \`${client.users.cache.size}\``,
            `Channels: \`${client.channels.cache.size}\``,
            `Roles: \`${cachedRoles}\``,
            `Emojis: \`${client.emojis.cache.size}\``,
            `Commands: \`${client.collections.commands.size}\` • Aliases: \`${client.collections.aliases.size}\``,
            `Slash: \`${client.collections.interactionCommands.size}\` • Events: \`${client.collections.events.size}\``,
            `Database: ${
                Mongoose.connection.readyState === 1
                    ? '`Connected`'
                    : `**\`${DB_STATE[Mongoose.connection.readyState] ?? 'Unknown'}\`**`
            }`,
            (() => {
                const rl = client.module.ratelimits?.snapshot?.();

                if (!rl) {
                    return null;
                }
                return `Rate limits: \`${rl.hits}\` hits • \`${rl.limited}\` bucket(s) limited now${
                    rl.global ? ` • **\`${rl.global}\` GLOBAL\`**` : ''
                }${rl.invalid ? ` • **\`${rl.invalid}\` invalid requests**` : ''}`;
            })()
        ]
            .filter(Boolean)
            .join('\n');

        let playerLag = guildQueue?.player?.eventLoopLag?.toFixed(0);
        playerLag = !guildQueue ? 'No queue here' : playerLag === '-1' ? 'Calculating...' : `${playerLag}ms`;

        const here = guildQueue
            ? `${
                  guildQueue.node?.isPlaying?.() ? 'Playing' : 'Paused/Idle'
              }: \`${guildQueue.currentTrack?.title ?? 'Nothing'}\` (\`${guildQueue.tracks?.size ?? 0}\` queued)`
            : '`Not connected here`';

        const musicField = [
            `Player Lag: \`${playerLag}\``,
            `Active Queues (fleet): \`${activeQueues}\``,
            `Queued Tracks (fleet): \`${queuedTracks}\``,
            `This Server: ${here}`
        ].join('\n');

        const cpus = os.cpus();
        const cpuModel = (cpus[0]?.model ?? 'Unknown CPU').replace(/\s+/g, ' ').trim();

        const cpuSpeed = vitals?.cpuSpeedGHz != null ? `${vitals.cpuSpeedGHz.toFixed(1)}GHz` : '?GHz';

        const totalRam = os.totalmem();
        const usedRam = totalRam - os.freemem();

        const rootDisk = vitals?.disk ?? null;

        const loadAvg = os
            .loadavg()
            .map((n) => n.toFixed(2))
            .join(', ');
        const distro = vitals?.distro ?? `${os.platform()} ${os.release()}`.trim();

        const systemField = [
            `CPU: \`${cpuModel}\` (${cpus.length}C @ ${cpuSpeed})`,
            `CPU Usage: \`${vitals?.cpuLoad != null ? vitals.cpuLoad.toFixed(1) + ' %' : 'Unavailable'}\``,
            `CPU Temp: \`${vitals?.cpuTemp != null ? vitals.cpuTemp.toFixed(1) + ' °C' : 'Unavailable'}\``,
            `Load Avg: \`${loadAvg}\``,
            `RAM: \`${MB(usedRam)} / ${MB(totalRam)}mb (${percent(usedRam, totalRam)}%)\``,
            rootDisk
                ? `Disk: \`${GB(rootDisk.used)} / ${GB(rootDisk.size)}gb (${rootDisk.use?.toFixed?.(1) ?? percent(rootDisk.used, rootDisk.size)}%)\``
                : 'Disk: `Unavailable`',
            `OS: \`${distro}\` (${os.arch()}) • Host: \`${HOST_TYPE}\``,
            `Host Uptime: \`${formatUptime(os.uptime())}\``,
            `Node: \`${process.version}\` • V8: \`${process.versions.v8}\``,
            `discord.js: \`${Discord.version}\` • player: \`${playerVersion}\``,
            `REST API: \`${client?.rest?.options?.version ?? client?.rest?.requestManager?.options?.version ?? '?'}\``
        ].join('\n');

        const otherLines = clusters
            .filter((c) => c.id !== clusterId)
            .map(
                (c) =>
                    `**#${c.id}**${
                        c.maintenance ? ' ⚠️' : ''
                    } shards [${c.shards.map((s) => `\`${s}\``).join(', ')}], \`${c.mem.toFixed(0)}mb\`, \`${c.guilds}\` servers`
            );

        let otherClusters = otherLines.join('\n') || 'No other clusters present.';
        if (otherClusters.length > 1000) {
            let shown = '';
            let count = 0;
            for (const line of otherLines) {
                if (shown.length + line.length > 950) {
                    break;
                }

                shown += `${line}\n`;
                count++;
            }

            otherClusters = `${shown}…and **${otherLines.length - count}** more.`;
        }
        const embed = [
            {
                color: client.data.embedColor,
                title: "Relaxy's Information Sheet",
                description: generalInfo,
                fields: [
                    {
                        name: `This Cluster (ID ${clusterId})`,
                        value: clusterField,
                        inline: true
                    },
                    {
                        name: `This Shard (ID ${clusterId})`,
                        value: shardField,
                        inline: true
                    },
                    {
                        name: 'Cache & Internals',
                        value: cacheField,
                        inline: false
                    },
                    {
                        name: 'Music',
                        value: musicField,
                        inline: false
                    },
                    {
                        name: 'Hardware & System',
                        value: systemField,
                        inline: false
                    },
                    {
                        name: 'Other Clusters',
                        value: otherClusters,
                        inline: false
                    },
                    ...fleetField
                ],
                footer: client.data.footer,
                timestamp: new Date()
            }
        ];

        return client.send(interaction ?? message.channel, null, embed);
    }
};
