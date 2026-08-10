'use strict';

import fs                 from 'fs-extra';
import os                 from 'os';
import path               from 'path';
import readline           from 'readline';
import { Worker }         from 'worker_threads';
import child_process      from 'child_process';
import { ClusterManager } from 'discord-hybrid-sharding';

import ModuleLoader from '../Core/ModuleLoader.js';
import SelfRepair   from './Core/SelfRepair.js';
import { config }   from '../Config/Config.js';
import {
    saveSettings,
    loadSettings,
    reportHost
}                   from '../Config/Settings.js';
import {
    messageType,
    logChannels,
    operatingMode,
    SUPPORT_GUILD_ID
}                   from '../Core/DataTable.js';

import util           from 'util';
import si             from 'systeminformation';
import chalk          from 'chalk';
import time           from 'pretty-ms';
import captureConsole from 'capture-console';
import {
    IS_WINDOWS,
    IS_RASPBERRY_PI
}                     from '../../detect_os.js';
import figlet         from 'figlet';

const RECLUSTER_ACK_TIMEOUT_MS = 30 * 1000;

const SUSPENDED_OUTPUT_LIMIT = 5000;

const buildStartupBanner = (version, shards) =>
{
    const hexToRgb = hex =>
    {
        const h = hex.replace('#', '');
        return [
            parseInt(h.slice(0, 2), 16),
            parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16)
        ];
    };
    const stops = [
        '#ff69b4',
        '#ff4069',
        '#9b4dff',
        '#4a90e2'
    ].map(hexToRgb);
    const TEXT = '#e9eaec';
    const MUTED = '#9aa0a9';
    const BORDER = '#9b4dff';

    const colorAt = t =>
    {
        t = Math.max(0, Math.min(1, t));
        const seg = t * (stops.length - 1);
        const i = Math.min(Math.floor(seg), stops.length - 2);
        const f = seg - i;
        const mix = k => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f);

        return chalk.rgb(mix(0), mix(1), mix(2));
    };

    let art;

    try
    {
        art = figlet.textSync('RELAXY', { font: 'ANSI Shadow' }).replace(/\s+$/g, '').split('\n');
    }
    catch
    {

        art = ['RELAXY'];
    }

    const artWidth = Math.max(...art.map(l => l.length));

    const tagline = 'The best bot in existence! Our Omnissiah!';
    const meta = `v${version ?? '?'}   node ${process.version}   ${shards ?? '?'} shards`;

    const inner = Math.max(artWidth, tagline.length, meta.length) + 6;

    const side = chalk.hex(BORDER)('║');
    const top = chalk.hex(BORDER)(`╔${'═'.repeat(inner)}╗`);
    const bottom = chalk.hex(BORDER)(`╚${'═'.repeat(inner)}╝`);
    const blank = () => `${side}${' '.repeat(inner)}${side}`;

    const centerPads = rawLen =>
    {
        const total = inner - rawLen;
        const left = Math.max(0, Math.floor(total / 2));

        return [
            left,
            Math.max(0, total - left)
        ];
    };

    const lines = [
        top,
        blank()
    ];

    const [artLeft] = centerPads(artWidth);

    for (const line of art)
    {
        let colored = '';

        for (let x = 0; x < line.length; x++)
        {
            const ch = line[x];
            colored += ch === ' '
                ? ' '
                : colorAt(artWidth > 1
                    ? x / (artWidth - 1)
                    : 0)(ch);
        }

        const right = inner - artLeft - line.length;
        lines.push(`${side}${' '.repeat(artLeft)}${colored}${' '.repeat(Math.max(0, right))}${side}`);
    }

    lines.push(blank());

    for (const [raw, hex, bold] of [
        [
            tagline,
            TEXT,
            true
        ],
        [
            meta,
            MUTED,
            false
        ]
    ])
    {
        const [l, r] = centerPads(raw.length);
        const paint = bold
            ? chalk.hex(hex).bold
            : chalk.hex(hex);
        lines.push(`${side}${' '.repeat(l)}${paint(raw)}${' '.repeat(r)}${side}`);
    }

    lines.push(blank(), bottom);

    return lines.join('\n');
};
export default class RelaxyClusterManager extends ClusterManager
{
    constructor(options)
    {
        super(options.clientFilePath, {
            totalShards:      options.totalShards,
            shardsPerCluster: options.shardsPerCluster,
            execArgv:         options.execute_arguments,
            token:            options.token,
            mode:             options.mode,
            respawn:          options.respawn,
            clusterOptions:   { silent: true },
            shardArgs:        options.shardArgs,
            restarts:         {
                max:      1000000000000000,
                interval: 6 * 60 * 10000
            }
        });

        this.ln = 0;

        this.color = chalk;

        this.output = true;

        this.suspendedOutput = [];

        this.suspendedOutputDropped = 0;

        const plugins = [
            'HOT',
            'SERVER',
            'GLOBAL',
            'HEARTBEAT',
            'RECLUSTERER'
        ];

        this.print = (data) =>
        {
            data = typeof data === 'string'
                ? data
                : String(data);

            if (!this.output)
            {

                this.suspendedOutput.push({
                    date: Date.now(),
                    data
                });

                while (this.suspendedOutput.length > SUSPENDED_OUTPUT_LIMIT)
                {
                    this.suspendedOutput.shift();
                    this.suspendedOutputDropped++;
                }

                return this.ln;
            }

            process.stdout.write(data);

            this.ln += (data.match(/\n/g) || []).length;
            return this.ln;
        };

        this.timestamp = date => (date ?? new Date()).toTimeString().slice(0, 8);

        this.log = (source, data, colour, isInternal = false) =>
        {
            if (!this.output)
            {
                return;
            }

            const splitSource = source.split(' ').filter(i => i !== '');
            const message = `[${chalk.grey(this.timestamp())}] [${plugins.includes(splitSource[0])
                ? chalk.bold.yellow(splitSource[0])
                : chalk.bold.magenta(splitSource[0])}${splitSource.length === 1
                ? ''
                : !splitSource[1].includes('Manager')
                    ? chalk.bold.yellow(' ' + splitSource[1])
                    : chalk.bold.magenta(' ' + splitSource[1])}] => ${typeof data === 'object'
                ? util.inspect(data, {
                    depth:  null,
                    colors: true
                })
                : colour(data)}`;

            return this.print(message + (isInternal
                ? '\n'
                : ''));
        };

        this.info = (source, data, isInternal = true) => this.log(source, data, chalk.green, isInternal);

        this.warn = (source, data, isInternal = true) => this.log(source, data, chalk.yellow, isInternal);

        this.error = (source, data, isInternal = true) =>
        {
            if ([-4053].includes(data?.errno))
            {
                return;
            }

            this.log(source, data, chalk.redBright, isInternal);
        };

        this.data = (source, data, isInternal = true) => this.log(source, data, chalk.gray, isInternal);

        this.debug = (source, data, isInternal = true) => this.log(source, data, chalk.blueBright, isInternal);

        this.logMethodMap = {
            'INFO':  this.info,
            'DATA':  this.data,
            'DEBUG': this.debug,
            'WARN':  this.warn,
            'ERROR': this.error
        };
        const logWorker = new Worker(new URL('./Core/LogWorker.js', import.meta.url), {
            workerData: { logDir: path.resolve('./logs/console') }
        });

        logWorker.on('message', async msg =>
        {
            if (msg.type === 'cmd' && msg.cmd)
            {
                await this.ConsoleInputProcessor.process(msg.cmd);
            }
        });

        logWorker.on('error', err => this.error('LogWorker', String(err)));

        captureConsole.startCapture(process.stdout, chunk =>
        {
            logWorker.postMessage({
                type:     'write',
                stripped: chunk.replaceAll(/\x1b\[[0-9;]*m/g, ''),
                color:    chunk
            });
        }, null);
        this.config = config;

        this.print(`\n${buildStartupBanner(this.config?.keys?.version, options.totalShards)}\n\n`);

        this.data('Cluster Manager', `Node.js Version: ${process.version}`);

        fs.emptyDirSync('./storage/cache/users');
        fs.emptyDirSync('./storage/cache/guilds');
        this.data('Cluster Manager', 'Emptied cache directories.');

        this.flags = {
            low_performance: IS_RASPBERRY_PI,

            logs: Object.fromEntries(Object.keys(logChannels).map(channel => [
                channel,
                false
            ]))
        };

        this.dirname = options.dirname;

        this.totalShards = options.totalShards;

        this.usableClusters = {};

        this._trueRelaxyClusterId = -1;

        this.operatingMode = Number.isFinite(Number(this.config.keys.operatingMode))
            ? Number(this.config.keys.operatingMode)
            : operatingMode.NORMAL;

        this.reclustering = false;

        this.moduleCore = new ModuleLoader(this, null, 'Cluster Manager', {
            data:  this.data,
            info:  this.info,
            warn:  this.warn,
            debug: this.debug,
            error: this.error
        });
        this.info('Cluster Manager', 'Module Loader created!');

        process.on('warn', w =>
        {
            this.warn('Cluster Manager', w);
        }).on('error', e =>
        {
            if (e?.code === 'ERR_IPC_CHANNEL_CLOSED')
            {
                return;
            }

            this.error('Cluster Manager', e);
        }).on('message', m =>
        {
            this.info('Cluster Manager', m);
        }).on('uncaughtException', e =>
        {
            this.error('Cluster Manager', e);
        }).on('unhandledRejection', e =>
        {
            this.error('Cluster Manager', e);
        });

        this.SelfRepairHeartBeat = {
            cur:     0,
            prev:    0,
            timeout: 0
        };

        this.SelfRepair = new SelfRepair(this);
        this.debug('Cluster Manager', 'Initiated Self Repair module!');

        this.on('debug', debugInfo => this.debug('Cluster Manager', debugInfo));

        this.updateConfig = async () => saveSettings(this.config.keys.dbtoken, {
            version:       this.config.keys.version,
            wmStatus:      this.config.text.wmStatus,
            clientStatus:  this.config.text.clientStatus,
            ownerIds:      this.config.keys.owners,
            youtubeCookie: this.config.keys.youtubeCookie
        }, e => this.error('Cluster Manager', `Failed to persist settings: ${e?.message ?? e}`));

        this.startHostReporting();
        this.startHostVitals();
        this.startSettingsSync();

        this.initialize(options).then(() =>
        {
        });
    }

    async initialize(options)
    {
        const toLoad = [
            this.moduleCore.loadModule('./Manager/Modules/ConsoleInputProcessor.js', this, false, true, null, null, true),
            this.moduleCore.loadModule('./Manager/Modules/ClusterSpawnProcessor.js', this, false, true, null, null, true)
        ];

        if (this.config.keys.dashboard.enabled)
        {
            toLoad.push(this.moduleCore.loadModule('./Manager/Modules/DashboardApi.js', this, false, true, null, null, true));
        }

        await Promise.allSettled(toLoad);

        if (this.config.keys.dashboard.enabled)
        {
            try
            {
                await this.DashboardApi.start();
            }
            catch (e)
            {
                this.error('DASHBOARD API', `REFUSED TO START: ${e?.message ?? e}`);
            }
        }

        setInterval(() =>
        {
            if (this.SelfRepairHeartBeat.timeout >= 5)
            {
                this.SelfRepairHeartBeat = {
                    cur:     0,
                    prev:    0,
                    timeout: 0
                };

                return this.restartSelfRepair();
            }

            if (this.SelfRepairHeartBeat.prev === this.SelfRepairHeartBeat.cur)
            {
                this.SelfRepairHeartBeat.timeout++;
            }
            else
            {
                this.SelfRepairHeartBeat.prev = this.SelfRepairHeartBeat.cur;
                this.SelfRepairHeartBeat.cur = 0;
                this.SelfRepairHeartBeat.timeout = 0;
            }
        }, 10 * 1000);
        this.data('Cluster Manager', 'Self Repair heartbeats started');

        this.on('clusterCreate', cluster => this.ClusterSpawnProcessor.handleClusterCreation(cluster));

        this.info('Cluster Manager', 'Awaiting Plugins...');

        if (!!this.heartbeat && !!this.recluster && !!this.ConsoleInputProcessor && !!this.ClusterSpawnProcessor)
        {
            await this.spawn({
                amount:  options.totalShards,
                timeout: -1
            });

            this.heartbeat.build(this);
            this.info('HEARTBEAT', 'Starting heartbeat distribution!');
            this.recluster.build(this);
            this.info('RECLUSTERER', 'Starting RECLUSTERER!');

            this.data('Cluster Manager', 'Plugins deployed.');
        }

        await this.SelfRepair.internetWatchdog();
        this.debug('Cluster Manager', 'Initiated InternetConn Watchdog.');

        const consoleCapture = readline.createInterface({ input: process.stdin });
        consoleCapture.on('line', line => this.ConsoleInputProcessor.process(line));
    }

    async restartSelfRepair(reason)
    {
        this.error('Cluster Manager', `Deleting Self Repair. [${reason ?? 'TIMEOUT REACHED'}]`);

        this.SelfRepair.watcher.close();
        this.debug('HOT RELOAD', 'Chokidar watcher closed.', true);
        this.SelfRepair.watcher = null;

        clearInterval(this.SelfRepair.internetWatchdogInterval);
        this.SelfRepair.internetWatchdogInterval = null;
        this.debug('HOT RELOAD', 'InternetConn Watchdog closed.', true);

        delete this.SelfRepair;

        const spec = `./Core/SelfRepair.js?update=${Date.now()}`;
        const newModule = await import(spec);

        this.data('Cluster Manager', `Self Repair file imported. [${spec}]`);
        this.SelfRepair = new newModule.default(this);
        this.debug('Cluster Manager', 'Reviving Self Repair.');

        await this.SelfRepair.internetWatchdog();
        this.debug('Cluster Manager', 'Initiated InternetConn Watchdog.');
    }

    async _recluster(executionDelay, options = {
        timeout:           -1,
        delay:             7 * 1000,
        restartMode:       null,
        totalShards:       this.totalShards,
        totalClusters:     this.totalClusters,
        shardsPerClusters: this.shardsPerClusters
    })
    {
        if (this.recluster.onProgress)
        {
            return;
        }

        this.reclustering = true;

        await this.broadcast({ _type: messageType.MANAGER_RECLUSTER_START });

        this._output = !!this.output;
        this._resumeStdout();

        const executionStart = Date.now();
        this._trueRelaxyClusterId = null;

        if (executionDelay)
        {
            await new Promise(resolve => setTimeout(resolve, executionDelay));
        }

        const reclusteringOperation = await this.recluster.start(options);

        this.debug('RECLUSTERER',
            reclusteringOperation
                ? '\n//////////////////////////////////////\nRECLUSTERING SUCCESSFULLY EXECUTED!\n//////////////////////////////////////'
                : '\n//////////////////////////////////////\nRECLUSTERING EXECUTION HAS FAILED!!!\n//////////////////////////////////////');

        if (!reclusteringOperation)
        {
            return;
        }

        let current = 0;
        const limit = 50;

        const GRACE_TICKS = 5;

        let resolving = false;

        const resolveFromFleet = async () =>
        {
            if (resolving)
            {
                return;
            }

            resolving = true;

            try
            {
                const owners = await this.broadcastEval((client, guildId) => (client.guilds.cache.has(guildId)
                    ? client.cluster.id
                    : null), { context: SUPPORT_GUILD_ID }).catch(() => []);

                const owner = owners.find(id => typeof id === 'number');

                if (typeof owner === 'number')
                {
                    this._trueRelaxyClusterId = owner;
                    this.warn('Cluster Manager', `No cluster claimed True Relaxy; resolved it from the fleet: Cluster #${owner}`);
                }
            }
            catch (e)
            {
                this.debug('Cluster Manager', `True Relaxy fleet lookup failed: ${e?.message ?? e}`);
            }
            finally
            {
                resolving = false;
            }
        };

        const waiting = setInterval(() =>
        {
            if (limit <= current)
            {
                this.error('Cluster Manager', `FAILED to fetch true Relaxy! | Timeout: ${time(current * 1000)}`);
                return clearInterval(waiting);
            }

            if (this._trueRelaxyClusterId === null)
            {
                current++;

                if (current >= GRACE_TICKS)
                {
                    resolveFromFleet();
                }

                return;
            }

            const trueCluster = this.clusters.get(this._trueRelaxyClusterId);

            if (!trueCluster)
            {
                this.warn('Cluster Manager', `True Relaxy cluster #${this._trueRelaxyClusterId} vanished before hand-off; re-resolving.`);
                this._trueRelaxyClusterId = null;
                return current++;
            }

            const id = this._trueRelaxyClusterId;

            clearInterval(waiting);
            this.reclustering = false;

            this.info('Cluster Manager', `\n//////////////////////////////////////\nSuccessfully fetched True Relaxy: Cluster #${id}\n//////////////////////////////////////`);

            Promise.resolve(trueCluster.send({
                       _type: messageType.MANAGER_RECLUSTER_FINISHED,
                       data:  {
                           start:         executionStart,
                           clusterId:     id,
                           totalClusters: this.totalClusters,
                           totalShards:   this.totalShards
                       }
                   }))
                   .then(() => this._awaitReclusterAck(id))
                   .catch(error => this.error('Cluster Manager', `Could not hand the recluster report to Cluster #${id}: ${error?.message ?? error}. #relaxy-log will NOT have a completion message.`));
        }, 1000);
    }

    async _awaitReclusterAck(clusterId)
    {
        const outcome = await new Promise(resolve =>
        {
            const timer = setTimeout(() => resolve(null), RECLUSTER_ACK_TIMEOUT_MS);

            this._reclusterAck = result =>
            {
                clearTimeout(timer);

                resolve(result);
            };
        });

        this._reclusterAck = null;

        if (outcome === null)
        {
            return this.error('Cluster Manager', `Cluster #${clusterId} never acknowledged the recluster report (${time(RECLUSTER_ACK_TIMEOUT_MS)}). #relaxy-log has NO completion message - the recluster itself finished, only the announcement was lost.`);
        }

        if (!outcome.posted)
        {
            return this.error('Cluster Manager', `Cluster #${clusterId} could not post the recluster report to #relaxy-log. The recluster itself finished; check that cluster's access to the support server.`);
        }

        this.info('Cluster Manager', `Recluster report confirmed posted to #relaxy-log by Cluster #${clusterId}.`);
    }

    _shutdown(ms)
    {
        this.warn('Cluster Manager', '\n////////////////////////////////\nInitiating shutdown sequence!\n////////////////////////////////');

        this.DashboardApi?.stop();

        this.broadcastEval(s => s.guilds.cache.forEach(async guild => (await guild.members.fetchMe().catch(() =>
        {
        }) ?? null)?.voice?.disconnect())).then(() => {});

        const halfwayPoint = Math.round(ms * 0.5);
        const final20Percent = Math.round(ms * 0.8);
        const final10Percent = Math.round(ms * 0.9);

        let timePassed = 0;
        let halfwayLogged = false;
        let final20Logged = false;

        const shutdownInterval = setInterval(() =>
        {
            timePassed += 1000;

            if (!halfwayLogged && timePassed >= halfwayPoint)
            {
                halfwayLogged = true;
                this.info('Cluster Manager', `${(ms - timePassed) / 1000} seconds left until Relaxy shuts down!`);
            }
            else if (!final20Logged && timePassed >= final20Percent)
            {
                final20Logged = true;
                this.info('Cluster Manager', `${(ms - timePassed) / 1000} seconds left until Relaxy shuts down!`);
            }
            else if (timePassed >= final10Percent)
            {
                if (timePassed >= ms)
                {
                    this.error('Cluster Manager', 'Closing Relaxy!');
                    clearInterval(shutdownInterval);
                    this.respawn = false;
                    if (IS_WINDOWS)
                    {
                        child_process.exec('taskkill /f /im node.exe');
                        child_process.exec('taskkill /f /im cmd.exe');
                    }
                    else
                    {
                        this.clusters.forEach(c =>
                        {
                            try
                            {
                                c.kill();
                            }
                            catch
                            {
                            }
                        });
                    }
                    return process.exit(0);
                }

                this.warn('Cluster Manager', `${(ms - timePassed) / 1000} seconds left until Relaxy shuts down!`);
            }
        }, 1000);
    }

    startSettingsSync()
    {
        const sync = async () =>
        {
            const settings = await loadSettings(this.config.keys.dbtoken, {
                version:       this.config.keys.version,
                wmStatus:      this.config.text.wmStatus,
                clientStatus:  this.config.text.clientStatus,
                ownerIds:      this.config.keys.owners,
                youtubeCookie: this.config.keys.youtubeCookie
            }, e => this.debug('SETTINGS', `Sync read failed: ${e?.message ?? e}`));

            if (!settings.fromDatabase)
            {
                return;
            }

            const changed = [];

            if (settings.version !== this.config.keys.version)
            {
                changed.push(`version ${this.config.keys.version} -> ${settings.version}`);
                this.config.keys.version = settings.version;
            }

            if (settings.ownerIds.join(',') !== this.config.keys.owners.join(','))
            {
                changed.push(`owners -> ${settings.ownerIds.join(', ')}`);
                this.config.keys.owners = settings.ownerIds;
            }

            if (settings.wmStatus !== this.config.text.wmStatus)
            {
                changed.push('status line');
                this.config.text.wmStatus = settings.wmStatus;
            }

            if (settings.clientStatus !== this.config.text.clientStatus)
            {
                changed.push('presence');
                this.config.text.clientStatus = settings.clientStatus;
            }

            if ((settings.youtubeCookie ?? '') !== (this.config.keys.youtubeCookie ?? ''))
            {
                changed.push('youtube cookie');
                this.config.keys.youtubeCookie = settings.youtubeCookie ?? '';
            }

            if (!changed.length)
            {
                return;
            }
            await this.broadcast({
                _type:   messageType.CLIENT_UPDATE,
                variant: 'settings',
                data:    settings
            });

            this.info('SETTINGS', `Picked up from the database and pushed to every cluster: ${changed.join(' | ')}`);
        };

        sync().then(() => {});

        this._settingsSyncInterval = setInterval(sync, 30 * 1000);
    }

    startHostVitals()
    {

        this.hostVitals = {
            at:          0,
            cpuLoad:     null,
            cpuTemp:     null,
            cpuSpeedGHz: null,
            distro:      null,
            disk:        null
        };

        const readNumber = async paths =>
        {
            for (const file of paths)
            {
                const raw = await fs.readFile(file, 'utf8').catch(() => null);
                const value = Number(raw);

                if (Number.isFinite(value) && value > 0)
                {
                    return value;
                }
            }

            return null;
        };

        const cpuTemperature = async () =>
        {
            if (process.platform === 'linux')
            {
                const milli = await readNumber([
                    '/sys/class/thermal/thermal_zone0/temp',
                    '/sys/class/hwmon/hwmon0/temp1_input'
                ]);

                if (milli !== null)
                {

                    return milli > 1000
                        ? milli / 1000
                        : milli;
                }
            }

            const fallback = await si.cpuTemperature().catch(() => null);

            return Number.isFinite(fallback?.main)
                ? fallback.main
                : null;
        };

        const cpuSpeedGHz = async () =>
        {
            if (process.platform === 'linux')
            {

                const kHz = await readNumber([
                    '/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq',
                    '/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_cur_freq',
                    '/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq'
                ]);

                if (kHz !== null)
                {
                    return kHz / 1_000_000;
                }

                const cpuinfo = await fs.readFile('/proc/cpuinfo', 'utf8').catch(() => '');
                const mhz = cpuinfo.match(/^cpu MHz\s*:\s*([\d.]+)/im);

                if (mhz)
                {
                    return Number(mhz[1]) / 1000;
                }
            }
            const speed = os.cpus()[0]?.speed;

            return Number.isFinite(speed) && speed > 0
                ? speed / 1000
                : null;
        };

        const safe = promise => promise.catch(() => null);

        const sample = async () =>
        {
            try
            {
                const wantsOs = this.hostVitals.distro === null;

                const [load, temp, speedGHz, disks, osData] = await Promise.all([
                    safe(si.currentLoad()),
                    safe(cpuTemperature()),
                    safe(cpuSpeedGHz()),
                    safe(si.fsSize()),
                    wantsOs
                        ? safe(si.osInfo())
                        : null
                ]);

                const rootDisk = Array.isArray(disks)
                    ? disks.find(d => d.mount === '/' || d.mount === 'C:') ?? disks[0]
                    : null;

                if (wantsOs)
                {
                    this.hostVitals.distro = (osData
                        ? [
                            osData.distro,
                            osData.release
                        ]
                        : [
                            os.platform(),
                            os.release()
                        ])
                        .filter(part => part && part !== 'unknown')
                        .join(' ')
                        .trim() || os.platform();
                }

                this.hostVitals.cpuLoad = Number.isFinite(load?.currentLoad)
                    ? load.currentLoad
                    : null;
                this.hostVitals.cpuTemp = temp;
                this.hostVitals.cpuSpeedGHz = speedGHz;
                this.hostVitals.disk = rootDisk
                    ? {
                        used: rootDisk.used,
                        size: rootDisk.size,
                        use:  rootDisk.use
                    }
                    : null;
                this.hostVitals.at = Date.now();
            }
            catch (e)
            {
                this.debug('HOSTS', `Host vitals sample threw: ${e?.message ?? e}`);
            }
        };

        sample();
        this._hostVitalsInterval = setInterval(sample, 30 * 1000);
    }

    startHostReporting()
    {
        const report = async () =>
        {
            try
            {
                const results = await Promise.all(Array.from(this.clusters.values()).map(cluster =>
                {
                    if (!cluster.ready || !cluster.thread)
                    {
                        return null;
                    }

                    return cluster.eval(client => ({
                        guilds:  client.guilds.cache.size,
                        users:   client.guilds.cache.reduce((total, guild) => total + (guild.memberCount ?? 0), 0),
                        players: client.player?.nodes?.cache?.size ?? 0
                    })).catch(error =>
                    {
                        this.warn('HOSTS', `Cluster #${cluster.id} stats eval failed: ${error?.message ?? error}`);
                        return null;
                    });
                }));

                const counts = results.filter(Boolean);

                const sum = key => (counts.length
                    ? counts.reduce((total, entry) => total + (entry?.[key] ?? 0), 0)
                    : null);

                const cpus = os.cpus();
                const memTotal = os.totalmem();

                const known = Object.fromEntries([
                    'guilds',
                    'users',
                    'players'
                ]
                    .map(key => [
                        key,
                        sum(key)
                    ])
                    .filter(([, value]) => value !== null));

                await reportHost(this.config.keys.dbtoken, this.config.keys.machineId, {
                    hostname: os.hostname(),
                    shards:   Array.from(this.clusters.values()).flatMap(cluster => cluster.shardList ?? []),
                    clusters: this.clusters.size,

                    ...known,

                    cpuCount: cpus.length,
                    cpuLoad:  cpus.length
                                  ? os.loadavg()[0] / cpus.length
                                  : 0,
                    memUsed:  memTotal - os.freemem(),
                    memTotal,

                    uptime:  process.uptime() * 1000,
                    version: this.config.keys.version,
                    bridged: Boolean(this.config.keys.bridge?.host)
                }, e => this.debug('HOSTS', `Host report failed: ${e?.message ?? e}`));
            }
            catch (e)
            {
                this.debug('HOSTS', `Host report threw: ${e?.message ?? e}`);
            }
        };

        report().then(() => {});
        this._hostReportInterval = setInterval(report, 30 * 1000);
    }

    _returnOutputState()
    {
        const wanted = this._output !== false;
        this._output = null;

        return wanted
            ? this._resumeStdout()
            : this._pauseStdout();
    }

    _resumeStdout()
    {
        if (this.output)
        {
            return;
        }

        this.output = true;

        this.clusters.forEach(c => c.thread?.process?.stdout?.resume());

        this._flushSuspendedOutput();
    }

    _pauseStdout()
    {
        if (!this.output)
        {
            return;
        }

        this.output = false;
        this.clusters.forEach(c => c.thread?.process?.stdout?.pause());
    }

    _flushSuspendedOutput()
    {
        if (!this.suspendedOutput.length && !this.suspendedOutputDropped)
        {
            return;
        }

        const held = this.suspendedOutput;
        const dropped = this.suspendedOutputDropped;

        this.suspendedOutput = [];
        this.suspendedOutputDropped = 0;

        if (dropped)
        {
            process.stdout.write(`${chalk.yellow(`[${this.timestamp()}] ... ${dropped} suspended line(s) dropped - buffer limit (${SUSPENDED_OUTPUT_LIMIT}) reached.`)}\n`);
        }

        for (const line of held)
        {
            process.stdout.write(line.data);
        }
    }
}
