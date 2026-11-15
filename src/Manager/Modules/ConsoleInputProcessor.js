'use strict';

import fs from 'fs-extra';
import time from 'pretty-ms';
import { execSync } from 'child_process';
import { PROJECT_DIR } from '../../Config/Env.js';
import { cdnText } from '../../Assets/CDN.js';
import { parseNetscapeCookies, countCookies } from '../../Utils/CookieUtils.js';
import { saveSettings } from '../../Config/Settings.js';
import RelaxyClusterManager from '../Manager.js';
import FileWatchHandler from '../Core/SelfRepair.js';
import {
    operatingMode,
    statusOperatingMode,
    statusText,
    messageType,
    logChannels,
    LOG_MASTER_CHANNEL
} from '../../Core/DataTable.js';

export default class ConsoleInputProcessor {
    constructor(manager) {
        this.manager = manager;
    }

    async showStats(args) {
        const section = args.shift()?.toLowerCase() ?? '';
        const expected = this.manager.clusters?.size ?? 0;

        let snapshots;

        try {
            snapshots = await this.manager.broadcastEval((client) => client.module?.stats?.snapshot('console') ?? null);
        } catch (error) {
            return this.manager.error('Cluster Manager', `Could not collect statistics: ${error?.message ?? error}`);
        }

        const live = (snapshots ?? []).filter(Boolean);

        if (live.length === 0) {
            return this.manager.error(
                'Cluster Manager',
                'No cluster returned statistics. Either none are up, or the Statistics module failed to load.'
            );
        }

        const missing = expected - live.length;
        const bytes = (value) => `${(value / 1024 / 1024).toFixed(1)}MB`;
        const sum = (pick) => live.reduce((total, snapshot) => total + (pick(snapshot) ?? 0), 0);

        const counters = {};
        const rates = {};

        for (const snapshot of live) {
            for (const [name, value] of Object.entries(snapshot.counters ?? {})) {
                counters[name] = (counters[name] ?? 0) + value;
            }

            for (const [name, value] of Object.entries(snapshot.rates ?? {})) {
                rates[name] = (rates[name] ?? 0) + value;
            }
        }

        const table = (title, entries) => {
            const rows = Object.entries(entries)
                .sort((a, b) => b[1] - a[1])
                .map(
                    ([name, value]) =>
                        `  ${name.padEnd(38)} ${String(Math.round(value)).padStart(12)}${
                            rates[name] > 0.001 ? `   ${rates[name].toFixed(2)}/s` : ''
                        }`
                )
                .join('\n');

            return `\n${title}\n${rows || '  (nothing recorded yet)'}`;
        };

        const subset = (prefix) =>
            Object.fromEntries(Object.entries(counters).filter(([name]) => name.startsWith(prefix)));

        switch (section) {
            case 'events':
                return this.manager.info('Cluster Manager', table('Events dispatched (fleet-wide)', subset('event.')));

            case 'commands':
                return this.manager.info('Cluster Manager', table('Commands (fleet-wide)', subset('command.')));

            case 'db':
                return this.manager.info('Cluster Manager', table('Database (fleet-wide)', subset('db.')));

            case 'counters':
                return this.manager.info('Cluster Manager', table('All counters (fleet-wide)', counters));
        }

        if (section !== '' && !Number.isNaN(Number(section))) {
            const one = live.find((snapshot) => snapshot.cluster === Number(section));

            if (!one) {
                return this.manager.error(
                    'Cluster Manager',
                    `Cluster #${section} did not report. Up: ${live.map((s) => s.cluster).join(', ') || 'none'}.`
                );
            }

            return this.manager.info('Cluster Manager', `\n${JSON.stringify(one, null, 2)}`);
        }

        const perCluster = live
            .sort((a, b) => a.cluster - b.cluster)
            .map((snapshot) => {
                const shards = snapshot.gateway.shards
                    .map(
                        (shard) =>
                            `${shard.id}:${
                                shard.status === 0 ? `${Math.round(shard.ping)}ms` : `STATUS ${shard.status}`
                            }`
                    )
                    .join(' ');

                return [
                    `  #${String(snapshot.cluster).padEnd(3)}${snapshot.trueRelaxy ? '*' : ' '}`,
                    `${String(snapshot.cache.guilds).padStart(5)}g`,
                    `${bytes(snapshot.memory.rss).padStart(8)}`,
                    `${`${snapshot.cpu.percent.toFixed(1)}%`.padStart(7)} cpu`,
                    `${`${(snapshot.loop.utilization * 100).toFixed(1)}%`.padStart(6)} loop`,
                    `p99 ${`${snapshot.loop.delay ? snapshot.loop.delay.p99.toFixed(1) : '?'}ms`.padStart(8)}`,
                    `q${String(snapshot.database?.queued ?? 0).padStart(4)}`,
                    `${time(snapshot.uptime.process)}`,
                    `[${shards}]`
                ].join('  ');
            })
            .join('\n');
        const guilds = sum((s) => s.cache.guilds);
        const memberCount = sum((s) => s.cache.memberCount);
        const unavailable = sum((s) => s.cache.unavailable);
        const rss = sum((s) => s.memory.rss);
        const queued = sum((s) => s.database?.queued ?? 0);
        const errors = sum((s) => s.health.errors);
        const warns = sum((s) => s.health.warns);
        const swallowed = sum((s) => s.health.swallowed);

        const worstPing = Math.max(
            ...live.flatMap((s) => s.gateway.shards.map((shard) => shard.ping)).filter((ping) => ping >= 0),
            -1
        );
        const worstLoop = Math.max(...live.map((s) => s.loop.delay?.p99 ?? 0));
        const window = live[0].window;

        const report = [
            '',
            `Runtime statistics - ${live.length}/${expected} cluster(s) reporting${
                missing > 0 ? `  !! ${missing} SILENT !!` : ''
            }`,
            `Rates cover the window since the last "show stats"${
                window ? ` (${time(window)})` : ' (first call - no rates yet)'
            }.`,
            '',
            '  Cluster  Guilds        RSS       CPU        Loop        p99      Queue  Uptime      Shards',
            perCluster,
            '',
            `  Guilds ${guilds}${
                unavailable > 0 ? ` (${unavailable} UNAVAILABLE)` : ''
            } | Members ${memberCount.toLocaleString()} (Discord's count, exact)`,
            `  Memory ${bytes(rss)} RSS fleet-wide | Worst shard ping ${
                worstPing < 0 ? 'unknown' : `${Math.round(worstPing)}ms`
            } | Worst loop p99 ${worstLoop.toFixed(1)}ms`,
            `  DB queue ${queued} pending | Errors ${errors} | Warns ${warns} | Swallowed ${swallowed}`,
            '',
            '  Cached users/channels are deliberately NOT totalled: the same user is cached on every',
            '  cluster sharing a server with them, so a sum would be inflated by an unknown factor.',
            '',
            `  Top events: ${
                Object.entries(subset('event.'))
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([name, value]) => `${name.replace('event.', '')} ${value}`)
                    .join(', ') || 'none yet'
            }`,
            `  Commands: ${counters['command.run'] ?? 0} run, ${counters['command.error'] ?? 0} threw${
                counters['command.run']
                    ? `, avg ${((counters['command.ms'] ?? 0) / counters['command.run']).toFixed(1)}ms`
                    : ''
            }`,
            '',
            '  "show stats events|commands|db|counters" for detail, "show stats <clusterId>" for one cluster in full.',
            `  "toggle statistics" prints a snapshot periodically on every cluster.`,
            ''
        ].join('\n');

        return this.manager.info('Cluster Manager', report);
    }

    async process(input) {
        const start = Date.now();

        const args = input.split(' ');
        const mainOperation = args.shift().toLowerCase();

        switch (mainOperation) {
            case 'halt':
                {
                    if (args.shift()?.toLowerCase() === 'on') {
                        this.manager.respawn = false;

                        this.manager.clusters.forEach((cluster) => {
                            try {
                                cluster.kill({
                                    reason: 'Halting operation.'
                                });

                                this.manager.debug('Cluster Manager', `Killed cluster ${cluster.id}.`, true);
                            } catch (e) {
                                this.manager.error(
                                    'Cluster Manager',
                                    `Error killing cluster ${cluster.id}: ${e.message}`,
                                    true
                                );
                            }
                        });
                    } else {
                        const spawnOptions = {
                            amount: this.manager.totalShards,
                            delay: 7 * 1000,
                            timeout: -1
                        };

                        this.manager.respawn = true;
                        this.manager.spawn(spawnOptions);
                    }
                }
                break;

            case 'sync': {
                const git = (command) => {
                    try {
                        return execSync(command, {
                            encoding: 'utf8',
                            cwd: PROJECT_DIR,
                            timeout: 120 * 1000,
                            env: {
                                ...process.env,
                                GIT_TERMINAL_PROMPT: '0',
                                GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=10'
                            }
                        });
                    } catch (error) {
                        return (
                            [error.stderr?.toString(), error.stdout?.toString(), error.message].find((part) =>
                                part?.trim()
                            ) ?? 'git failed with no output.'
                        );
                    }
                };

                if (args?.shift()) {
                    this.manager.info('Cluster Manager', git('git reset --hard'));
                }

                return this.manager.info('Cluster Manager', git('git pull'));
            }

            case 'ping': {
                return this.manager.info('Cluster Manager', `Response: ${time(Date.now() - start)}`);
            }

            case 'eval': {
                try {
                    this.manager.info('Cluster Manager', await eval(args.join(' ')));
                } catch (e) {
                    return this.manager.error('Cluster Manager', e);
                }
                return this.manager.info('Cluster Manager', 'Evaluation successful.');
            }

            case 'perviate': {
                return this.manager.info('Cluster Manager', 'Function under construction...');
            }

            case 'recluster': {
                const _time = args[0] ? parseInt(args[0]) : 0;
                this.manager.error('Cluster Manager', `ReClustering in: ${_time === 0 ? 'now' : time(_time)}`);
                return this.manager._recluster(_time);
            }

            case 'restart': {
                switch (args.shift()?.toLowerCase() ?? '') {
                    case 'shard': {
                        const shardID = parseInt(args?.shift());

                        if (isNaN(shardID) || !this.manager.clusters.has(shardID)) {
                            return this.manager.error(
                                'Cluster Manager',
                                `Invalid clusterID provided. Valid: 0–${this.manager.totalClusters - 1}`
                            );
                        }

                        this.manager.debug('Cluster Manager', `Restarting cluster [${shardID}]`);
                        return this.manager.clusters.get(shardID).respawn();
                    }

                    case 'module': {
                        switch (args.shift()?.toLowerCase() ?? '') {
                            case 'manager': {
                                const moduleName = args?.shift();

                                if (moduleName === 'all') {
                                    return this.manager.moduleCore.reloadAll(this.manager);
                                }

                                if (!this.manager.moduleCore.modules[moduleName]) {
                                    return this.manager.error(
                                        'Cluster Manager',
                                        `Module ${moduleName} doesn't exist! If you want to add it use the command "create"!`
                                    );
                                }

                                return this.manager.moduleCore.loadModule(
                                    this.manager.moduleCore.modulePaths[moduleName],
                                    this.manager,
                                    true
                                );
                            }

                            case 'self_repair': {
                                return this.manager.restartSelfRepair('MANUAL RESTART');
                            }

                            case 'cluster': {
                                const clusterModName = args?.shift();
                                if (!clusterModName) {
                                    return this.manager.error(
                                        'Cluster Manager',
                                        'Provide a module name to reload on clusters.'
                                    );
                                }
                                return this.manager.broadcastEval(
                                    async (c, { mod }) => {
                                        const key = Object.keys(c.moduleLookupTable).find((k) =>
                                            c.moduleLookupTable[k].path.includes(mod)
                                        );
                                        if (!key) {
                                            return;
                                        }
                                        await c.moduleCore.loadModule(
                                            c.moduleLookupTable[key].path,
                                            c.moduleLookupTable[key].spawnArgs,
                                            true,
                                            null,
                                            false,
                                            c.moduleLookupTable[key].altPath
                                        );
                                    },
                                    { context: { mod: clusterModName } }
                                );
                            }

                            default: {
                                return this.manager.error('Cluster Manager', 'Invalid subcommand provided.');
                            }
                        }
                    }

                    default: {
                        return this.manager.error('Cluster Manager', 'Invalid subcommand provided.');
                    }
                }
            }

            case 'show': {
                switch (args.shift()?.toLowerCase() ?? '') {
                    case 'cpusage': {
                        let arg = args?.shift()?.toLowerCase();

                        if (!arg) {
                            return this.manager.info('Cluster Manager', "Need to provide argument: 'all' or shardId!");
                        }

                        switch (arg) {
                            case 'all': {
                                return this.manager.broadcast({
                                    _type: messageType.CLIENT_SHOW,
                                    variant: 'cpusage'
                                });
                            }

                            default: {
                                const cpuCluster = this.manager.clusters.get(Number(arg));
                                if (!cpuCluster) {
                                    return this.manager.error('Cluster Manager', `Cluster #${arg} not found.`);
                                }
                                return cpuCluster.send({
                                    _type: messageType.CLIENT_SHOW,
                                    variant: 'cpusage'
                                });
                            }
                        }
                    }

                    case 'shard': {
                        return this.manager.info('Cluster Manager', this.manager.clusters.values());
                    }

                    case 'shards': {
                        return this.manager.info('Cluster Manager', this.manager.clusters);
                    }

                    case 'modules': {
                        this.manager.info('Cluster Manager', this.manager.moduleCore.modules);
                        return this.manager.info('Cluster Manager', this.manager.moduleCore.modulePaths);
                    }

                    case 'logs': {
                        const rows = Object.entries(logChannels)
                            .map(
                                ([channel, meta]) =>
                                    `  ${
                                        this.manager.flags.logs[channel] ? 'ON ' : 'OFF'
                                    }  ${channel.padEnd(24)} ${`[${meta.side}]`.padEnd(10)} ${meta.description}`
                            )
                            .join('\n');

                        const on = Object.keys(logChannels).filter(
                            (channel) => this.manager.flags.logs[channel]
                        ).length;

                        return this.manager.info(
                            'Cluster Manager',
                            `\nLog channels - ${on}/${Object.keys(logChannels).length} on\n${rows}\n\n  "toggle <name>" flips one, "toggle ${LOG_MASTER_CHANNEL}" flips all of them.\n  The operating mode (status) is separate - change it with "update status".`
                        );
                    }

                    case 'stats': {
                        return this.showStats(args);
                    }

                    case 'help': {
                        const help = await cdnText('help_manager.txt', (e) =>
                            this.manager.warn('Cluster Manager', `CDN help text unavailable: ${e?.message ?? e}`)
                        );

                        return this.manager.info(
                            'Cluster Manager',
                            `\n${help || 'Help text unavailable (CDN unreachable and nothing cached).'}`
                        );
                    }

                    case 'pids': {
                        return this.manager.info(
                            'Cluster Manager',
                            `${Object.values(this.manager.usableClusters)
                                .map((pid, clusterId) => `\nCluster ${clusterId}: PID: ${pid}.`)
                                .join('')}\n\nManager PID: ${process.pid}`
                        );
                    }

                    case 'version': {
                        return this.manager.info('Cluster Manager', this.manager.config.keys.version);
                    }

                    case 'trueshard': {
                        return this.manager.debug('Cluster Manager', this.manager._trueRelaxyClusterId);
                    }

                    case 'opmode': {
                        return this.manager.info('Cluster Manager', this.manager.operatingMode);
                    }

                    case 'queues': {
                        return this.manager.broadcastEval((c) =>
                            c.player.queues.size !== 0 || c.voice.size !== 0
                                ? c.log(
                                      `\nConnections: ${
                                          c.voice.size !== 0 ? c.voice.adapters.size : '0'
                                      }\nQueues: ${c.player.queues.size}`
                                  )
                                : null
                        );
                    }

                    case 'dependencies': {
                        return this.manager.clusters.get(0).send({
                            _type: messageType.CLIENT_SHOW,
                            variant: 'music_dependencies'
                        });
                    }

                    case 'owners': {
                        return this.manager.clusters.forEach((cluster) =>
                            cluster.send({
                                _type: messageType.CLIENT_SHOW,
                                variant: 'owners'
                            })
                        );
                    }

                    case 'servers': {
                        setTimeout(
                            async () =>
                                this.manager.info(
                                    'Cluster Manager',
                                    `The total number of servers is ${(await this.manager.fetchClientValues('guilds.cache.size')).reduce((acc, guildCount) => acc + guildCount, 0)}`
                                ),
                            1500
                        );

                        return this.manager.clusters.forEach((cluster) =>
                            cluster.send({
                                _type: messageType.CLIENT_SHOW,
                                variant: 'servers'
                            })
                        );
                    }

                    case 'heartbeat': {
                        const hbArg = args?.shift();
                        const ids =
                            !hbArg || hbArg === 'all'
                                ? Array.from(this.manager.heartbeat.clusters.keys())
                                : [parseInt(hbArg)];

                        for (const id of ids) {
                            const hb = this.manager.heartbeat.clusters.get(id);
                            if (!hb) {
                                this.manager.error('Cluster Manager', `No heartbeat tracked for Cluster #${id}`);
                                continue;
                            }
                            const validEntries = this.manager.heartbeat.heartbeatHistory[id]
                                .entries()
                                .filter((e) => e !== null && e.duration !== -1);
                            const avg =
                                validEntries.length > 0
                                    ? validEntries.reduce((s, e) => s + e.duration, 0) / validEntries.length
                                    : 0;
                            this.manager.info(
                                'Cluster Manager',
                                `Cluster #${id}: total=${hb.totalHeartbeats} missed=${hb.missed} timeout=${hb.missedTimeout} avg=${
                                    avg > 0 ? time(Math.round(avg)) : 'N/A'
                                } suffocate=${hb.suffocate}`
                            );
                        }
                        return;
                    }

                    case 'uptime': {
                        return this.manager.info(
                            'Cluster Manager',
                            `Manager uptime: ${time(Math.round(process.uptime() * 1000))}`
                        );
                    }

                    case 'watchdog': {
                        const wd = this.manager.SelfRepair;
                        const wdState = wd.internetWatchdogState;
                        const now = Date.now();
                        const remaining =
                            wdState.cooldownActiveForDuration > 0
                                ? Math.max(0, wdState.cooldownActiveForDuration - (now - wdState.cooldownStartTime))
                                : 0;
                        const lastRestart = wd.networkRecoveryState.lastRestartCompletionTime;

                        return this.manager.info(
                            'Cluster Manager',
                            `Internet Watchdog:\n  Recovery active: ${wd.networkRecoveryState.isProcedureActive}\n  Last restart: ${
                                lastRestart > 0 ? time(now - lastRestart) + ' ago' : 'never'
                            }\n  Cooldown remaining: ${
                                remaining > 0 ? time(remaining) : 'none'
                            }\n  Next cooldown: ${time(wd.nextWatchdogInternalCooldownDuration)}\n  Error counts: ${JSON.stringify(wd.shardConnectionErrors)}`
                        );
                    }

                    default: {
                        return this.manager.error('Cluster Manager', 'Invalid subcommand provided.');
                    }
                }
            }

            case 'delete': {
                switch (args.shift()?.toLowerCase() ?? '') {
                    case 'module': {
                        switch (args.shift()?.toLowerCase() ?? '') {
                            case 'manager': {
                                const moduleName = args?.shift();

                                if (!this.manager.moduleCore.modules[moduleName]) {
                                    return this.manager.error('Cluster Manager', `Module ${moduleName} doesn't exist!`);
                                }

                                return this.manager.moduleCore.unloadModule(moduleName);
                            }

                            case 'cluster': {
                                const moduleName = args?.shift();

                                if (!this.manager.moduleCore.modules[moduleName]) {
                                    return this.manager.error('Cluster Manager', `Module ${moduleName} doesn't exist!`);
                                }

                                return this.manager.moduleCore.unloadModule(moduleName);
                            }

                            default: {
                                return this.manager.error('Cluster Manager', 'Invalid subcommand provided.');
                            }
                        }
                    }

                    case 'logs': {
                        return;
                    }

                    case 'slash': {
                        return this.manager.broadcast({
                            _type: messageType.CLIENT_DELETE,
                            variant: 'slash'
                        });
                    }

                    default: {
                        return this.manager.error('Cluster Manager', 'Invalid subcommand provided.');
                    }
                }
            }

            case 'create': {
                switch (args.shift()?.toLowerCase() ?? '') {
                    case 'slash': {
                        return this.manager.broadcast({
                            _type: messageType.CLIENT_CREATE,
                            variant: 'slash'
                        });
                    }

                    default: {
                        return this.manager.error('Cluster Manager', 'Invalid subcommand provided.');
                    }
                }
            }

            case 'toggle': {
                const requested = args.shift()?.toLowerCase() ?? '';
                switch (requested) {
                    case 'low_performance': {
                        this.manager.flags.low_performance = !this.manager.flags.low_performance;

                        this.manager.info(
                            'Cluster Manager',
                            `Low performance mode ${this.manager.flags.low_performance ? 'ON' : 'OFF'}.`
                        );

                        return this.manager.broadcast({
                            _type: messageType.CLIENT_TOGGLE,
                            variant: 'low_performance',
                            data: this.manager.flags.low_performance
                        });
                    }

                    case 'output': {
                        if (this.manager.output) {
                            this.manager.error(
                                'Cluster Manager',
                                '\n//////////////////////////////////////\nTURNING LOGGING OFF!\n//////////////////////////////////////'
                            );
                            return this.manager._pauseStdout();
                        }

                        this.manager._resumeStdout();
                        return this.manager.info(
                            'Cluster Manager',
                            '\n//////////////////////////////////////\nTURNING LOGGING ON!\n//////////////////////////////////////'
                        );
                    }
                }

                if (requested === LOG_MASTER_CHANNEL) {
                    const channels = Object.keys(logChannels);

                    const value = !channels.every((channel) => this.manager.flags.logs[channel]);

                    for (const channel of channels) {
                        this.manager.flags.logs[channel] = value;
                    }

                    this.manager.broadcast({
                        _type: messageType.CLIENT_TOGGLE,
                        variant: 'all',
                        data: value
                    });

                    return this.manager.info(
                        'Cluster Manager',
                        `All ${channels.length} log channels turned ${
                            value ? 'ON' : 'OFF'
                        }. (Operating mode unchanged - use "update status" for that.)`
                    );
                }

                if (Object.prototype.hasOwnProperty.call(logChannels, requested)) {
                    const value = !this.manager.flags.logs[requested];

                    this.manager.flags.logs[requested] = value;

                    this.manager.broadcast({
                        _type: messageType.CLIENT_TOGGLE,
                        variant: requested,
                        data: value
                    });

                    return this.manager.info(
                        'Cluster Manager',
                        `Log channel "${requested}" turned ${value ? 'ON' : 'OFF'}.`
                    );
                }

                const known = Object.entries(logChannels)
                    .map(
                        ([channel, meta]) =>
                            `  ${channel.padEnd(24)} ${
                                this.manager.flags.logs[channel] ? 'ON ' : 'OFF'
                            }  ${meta.description}`
                    )
                    .join('\n');

                return this.manager.error(
                    'Cluster Manager',
                    `Unknown toggle "${requested}".\n\nLog channels (toggle one by name, or "toggle ${LOG_MASTER_CHANNEL}" for all of them):\n${known}\n\nOther toggles:\n  low_performance          Low-performance mode\n  output                   Manager stdout`
                );
            }

            case 'update': {
                switch (args.shift()?.toLowerCase() ?? '') {
                    case 'version': {
                        this.manager.config.keys.version = args.join(' ');
                        await this.manager.updateConfig();
                        this.manager.broadcast({
                            _type: messageType.CLIENT_UPDATE,
                            variant: 'version',
                            data: this.manager.config.keys.version
                        });

                        return this.manager.info('Cluster Manager', `New version: ${this.manager.config.keys.version}`);
                    }

                    case 'owners': {
                        if (!args.length) {
                            return this.manager.info(
                                'Cluster Manager',
                                `Owners: ${this.manager.config.keys.owners.join(', ') || '(none)'}`
                            );
                        }

                        const owners = [
                            ...new Set(
                                args
                                    .flatMap((a) => a.split(','))
                                    .map((a) => a.trim())
                                    .filter(Boolean)
                            )
                        ];

                        if (owners.some((id) => !/^\d{15,25}$/.test(id))) {
                            return this.manager.error(
                                'Cluster Manager',
                                `Owner IDs must be Discord snowflakes. Got: ${owners.join(', ')}`
                            );
                        }

                        this.manager.config.keys.owners = owners;
                        await this.manager.updateConfig();

                        this.manager.broadcast({
                            _type: messageType.CLIENT_UPDATE,
                            variant: 'owners',
                            data: owners
                        });

                        return this.manager.info(
                            'Cluster Manager',
                            `Owners set to: ${owners.join(', ')} (primary: ${owners[0]})`
                        );
                    }

                    case 'status': {
                        const futureOperatingMode = args?.shift()?.toLowerCase();

                        if (!futureOperatingMode) {
                            return this.manager.broadcast({
                                _type: messageType.CLIENT_UPDATE,
                                variant: 'status',
                                data: null
                            });
                        }

                        const splitStatus = this.manager.config.text.wmStatus.split('**');

                        if (!['exit', 'debug', 'normal', 'silent', 'maintain'].includes(futureOperatingMode)) {
                            return this.manager.error(
                                'Cluster Manager',
                                `Invalid operating mode provided! "${futureOperatingMode}"`
                            );
                        }

                        this.manager.config.text.wmStatus = `${splitStatus[0]}**${statusText[futureOperatingMode]}**${splitStatus[2]}**${splitStatus[3]}**`;
                        this.manager.operatingMode = statusOperatingMode[futureOperatingMode];

                        await this.manager.updateConfig();

                        const closeRelaxy = futureOperatingMode === 'exit';

                        await saveSettings(
                            this.manager.config.keys.dbtoken,
                            {
                                operatingMode: closeRelaxy ? -1 : this.manager.operatingMode
                            },
                            (e) =>
                                this.manager.error(
                                    'Cluster Manager',
                                    `Could not persist the operating mode: ${e?.message ?? e}`
                                )
                        );

                        this.manager.broadcast({
                            _type: messageType.CLIENT_UPDATE,
                            variant: 'status',
                            data: this.manager.operatingMode
                        });

                        if (closeRelaxy) {
                            return this.manager._shutdown(60 * 1000);
                        }

                        return;
                    }

                    case 'cookie': {
                        const sub = args[0]?.toLowerCase();

                        if (!sub) {
                            const count = countCookies(this.manager.config.keys.youtubeCookie);
                            return this.manager.info(
                                'Cluster Manager',
                                count
                                    ? `Shared YouTube cookie is set (${count} cookie(s)). "update cookie <cookies.txt>" to replace, "update cookie clear" to remove.`
                                    : 'No shared YouTube cookie set. Use "update cookie <path-to-cookies.txt>".'
                            );
                        }

                        if (sub === 'clear') {
                            this.manager.config.keys.youtubeCookie = '';
                            await this.manager.updateConfig();
                            this.manager.broadcast({
                                _type: messageType.CLIENT_UPDATE,
                                variant: 'cookie',
                                data: ''
                            });
                            return this.manager.info(
                                'Cluster Manager',
                                'Shared YouTube cookie cleared across the fleet.'
                            );
                        }

                        const cookiePath = args.join(' ').trim();
                        let header;
                        try {
                            header = parseNetscapeCookies(await fs.promises.readFile(cookiePath, 'utf8'));
                        } catch (e) {
                            return this.manager.error(
                                'Cluster Manager',
                                `Could not read cookies file "${cookiePath}": ${e?.message ?? e}`
                            );
                        }

                        if (!header) {
                            return this.manager.error(
                                'Cluster Manager',
                                `No YouTube/Google cookies found in "${cookiePath}". Export cookies.txt while logged into YouTube.`
                            );
                        }

                        this.manager.config.keys.youtubeCookie = header;
                        await this.manager.updateConfig();
                        this.manager.broadcast({
                            _type: messageType.CLIENT_UPDATE,
                            variant: 'cookie',
                            data: header
                        });

                        return this.manager.info(
                            'Cluster Manager',
                            `Shared YouTube cookie updated (${countCookies(header)} cookie(s)) and broadcast to all clusters.`
                        );
                    }

                    default: {
                        return this.manager.error('Cluster Manager', 'Invalid subcommand provided.');
                    }
                }
            }

            default: {
                return this.manager.error('Cluster Manager', 'Input not understood.');
            }
        }
    }
}
