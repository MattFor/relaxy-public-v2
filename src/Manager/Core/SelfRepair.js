'use strict';

import path from 'path';
import time from 'pretty-ms';
import chokidar from 'chokidar';
import { readFile, readdir } from 'fs/promises';
import { messageType } from '../../Core/DataTable.js';
import { explainHotReloadLimit } from '../../Core/ModuleLoader.js';
import { IS_WINDOWS } from '../../../detect_os.js';
import { patchPrototype, extractConstructorSource } from '../../Core/HotPatch.js';

export default class SelfRepair {
    constructor(manager) {
        this.manager = manager;

        this.ignoredDirectories = ['.clinic', 'node_modules', 'assets', '.vscode', 'logs', 'storage'];

        const sep = IS_WINDOWS ? '\\' : '/';
        const configDir = `assets${sep}config`;

        this.watcher = chokidar.watch(manager.dirname, {
            usePolling: false,
            persistent: true,
            ignoreInitial: true,
            ignored: (p, stat) => {
                if (p.includes(configDir)) {
                    return stat && stat.isFile() && !p.endsWith('.json');
                }

                if (this.ignoredDirectories.some((dir) => p.includes(dir))) {
                    return true;
                }

                return stat && stat.isFile() && !p.endsWith('.js');
            }
        });

        this._patchTargets = {
            Relaxy: path.join('src', 'Client', 'Relaxy.js'),
            Manager: path.join('src', 'Manager', 'Manager.js'),
            HeartBeatManager: path.join('src', 'Manager', 'Core', 'HeartBeatManager.js')
        };

        this._ctorCache = {};

        this._fileSnapshots = {};

        this.watcher.on('add', (file) => this.fileHandler(file, 'add'));
        this.watcher.on('unlink', (file) => this.fileHandler(file, 'delete'));
        this.watcher.on('change', (file) => this.fileHandler(file, 'update', true));

        this.watcher.on('ready', async () => {
            await Promise.allSettled(
                Object.keys(this._patchTargets).map(async (key) => {
                    try {
                        const src = await readFile(path.join(this.manager.dirname, this._patchTargets[key]), 'utf8');
                        this._ctorCache[key] = extractConstructorSource(src);
                    } catch (e) {
                        this.manager.warn(
                            'HOT RELOAD',
                            `Could not snapshot constructor for "${key}": ${e.message}`,
                            true
                        );
                    }
                })
            );

            await Promise.allSettled(
                [
                    path.join(this.manager.dirname, 'bot', 'commands'),
                    path.join(this.manager.dirname, 'bot', 'events'),
                    path.join(this.manager.dirname, 'src')
                ].map((dir) => this._snapshotTree(dir))
            );

            await this._snapshotTree(path.join(this.manager.dirname, 'assets', 'config'), '.json');

            this.manager.info('HOT RELOAD', `Successfully started! Path: ${manager.dirname}`);
        });

        this.watcher.on('error', (error) => {
            this.manager.error('HOT RELOAD', `Error: ${error}`, true);
        });

        this.manager.SelfRepairHeartBeat.cur = -1;

        this.heartbeatPulse = 0;

        this.internetWatchdogInterval = null;

        this.shardConnectionErrors = {};

        this._networkIssueReports = {};

        this.internetWatchdogState = {
            cooldownActiveForDuration: 0,
            cooldownStartTime: 0,
            lastCooldownNoticeTime: 0
        };

        this.nextWatchdogInternalCooldownDuration = 10 * 60 * 1000;

        this.networkRecoveryState = {
            isProcedureActive: false,
            lastRestartCompletionTime: 0,
            lastSkipNoticeTime: 0
        };
    }

    recordNetworkIssue(clusterId) {
        const NETWORK_ISSUE_REPORT_INTERVAL_MS = 15 * 1000;

        const count = (this.shardConnectionErrors[clusterId] ?? 0) + 1;
        this.shardConnectionErrors[clusterId] = count;

        const now = Date.now();
        const report = (this._networkIssueReports[clusterId] ??= {
            lastPrint: 0,
            lastPrintedCount: 0
        });

        if (now - report.lastPrint < NETWORK_ISSUE_REPORT_INTERVAL_MS) {
            return count;
        }

        const since = count - report.lastPrintedCount - 1;
        report.lastPrint = now;
        report.lastPrintedCount = count;

        this.manager.warn(
            'Cluster Manager',
            `To InternetConn Watchdog, Cluster #${clusterId} network issue count has reached ${count}${
                since > 0 ? ` (+${since} since the last report)` : ''
            }`
        );

        return count;
    }

    resetNetworkIssues() {
        for (const key in this.shardConnectionErrors) {
            this.shardConnectionErrors[key] = 0;
        }

        for (const key in this._networkIssueReports) {
            this._networkIssueReports[key].lastPrintedCount = 0;
        }
    }

    async internetWatchdog() {
        const ERROR_THRESHOLD = 10;
        const FIRST_RESTART_WAIT_MS = 30 * 60 * 1000;
        const SECOND_RESTART_WAIT_MS = 90 * 60 * 1000;
        const QUICK_SUCCESSION_RESTART_WINDOW_MS = 10 * 60 * 1000;

        const WATCHDOG_BASE_COOLDOWN_MS = 10 * 60 * 1000;
        const WATCHDOG_MAX_COOLDOWN_MS = 2 * 60 * 60 * 1000;
        const SPAWN_SETTLE_TIMEOUT_MS = 10 * 60 * 1000;

        if (!this.internetWatchdogState) {
            this.internetWatchdogState = {
                cooldownActiveForDuration: 0,
                cooldownStartTime: 0,
                lastCooldownNoticeTime: 0
            };
        }

        if (typeof this.nextWatchdogInternalCooldownDuration === 'undefined') {
            this.nextWatchdogInternalCooldownDuration = WATCHDOG_BASE_COOLDOWN_MS;
        }

        if (!this.networkRecoveryState) {
            this.networkRecoveryState = {
                isProcedureActive: false,
                lastRestartCompletionTime: 0,
                lastSkipNoticeTime: 0
            };
        }

        const NOTICE_INTERVAL_MS = 5 * 60 * 1000;

        if (this.internetWatchdogInterval) {
            clearInterval(this.internetWatchdogInterval);
            this.internetWatchdogInterval = null;
        }

        this.internetWatchdogInterval = setInterval(async () => {
            this.manager.SelfRepairHeartBeat.cur = ++this.heartbeatPulse;

            const wdState = this.internetWatchdogState;
            const recoveryState = this.networkRecoveryState;
            const now = Date.now();

            if (recoveryState.isProcedureActive) {
                if (now - recoveryState.lastSkipNoticeTime >= NOTICE_INTERVAL_MS) {
                    recoveryState.lastSkipNoticeTime = now;
                    this.manager.debug(
                        'InternetConn Watchdog',
                        'Network recovery procedure is still running. Detection stays paused until it finishes.',
                        true
                    );
                }

                return;
            }

            if (
                wdState.cooldownActiveForDuration > 0 &&
                now - wdState.cooldownStartTime < wdState.cooldownActiveForDuration
            ) {
                if (now - wdState.lastCooldownNoticeTime >= NOTICE_INTERVAL_MS) {
                    wdState.lastCooldownNoticeTime = now;
                    const remainingTime = wdState.cooldownActiveForDuration - (now - wdState.cooldownStartTime);
                    this.manager.debug(
                        'InternetConn Watchdog',
                        `Watchdog internal cooldown active. ${time(remainingTime)} remaining.`,
                        true
                    );
                }

                return;
            }

            if (wdState.cooldownActiveForDuration > 0) {
                wdState.cooldownActiveForDuration = 0;
                wdState.cooldownStartTime = 0;

                this.manager.info(
                    'InternetConn Watchdog',
                    'Watchdog internal cooldown finished - monitoring for widespread errors again.',
                    true
                );
            }

            let widespreadErrorDetected = false;
            for (const key in this.shardConnectionErrors) {
                if (this.shardConnectionErrors[key] && this.shardConnectionErrors[key] > ERROR_THRESHOLD) {
                    widespreadErrorDetected = true;
                    this.manager.warn(
                        'InternetConn Watchdog',
                        `Widespread errors detected (e.g., for key ${key}, count: ${this.shardConnectionErrors[key]}). Initiating response.`,
                        true
                    );
                    break;
                }
            }

            if (widespreadErrorDetected) {
                const cooldownForThisCycle = this.nextWatchdogInternalCooldownDuration;
                this.manager.info(
                    'InternetConn Watchdog',
                    `Watchdog internal cooldown of ${time(cooldownForThisCycle)} will start once the recovery procedure completes.`,
                    this.manager.color.magenta
                );

                this.nextWatchdogInternalCooldownDuration = Math.min(
                    (this.nextWatchdogInternalCooldownDuration || WATCHDOG_BASE_COOLDOWN_MS) * 3,
                    WATCHDOG_MAX_COOLDOWN_MS
                );
                this.manager.debug(
                    'InternetConn Watchdog',
                    `Next watchdog internal cooldown (if triggered again) will be ${time(this.nextWatchdogInternalCooldownDuration)}.`,
                    true
                );

                recoveryState.isProcedureActive = true;
                recoveryState.lastSkipNoticeTime = now;
                this.manager.log(
                    'InternetConn Watchdog',
                    'Starting network recovery procedure due to widespread errors.',
                    this.manager.color.red
                );

                const originalRespawnOpt = this.manager.respawn;

                (async () => {
                    try {
                        this.manager.respawn = false;
                        this.manager.log(
                            'InternetConn Watchdog',
                            `Shard auto-respawn temporarily disabled (was ${originalRespawnOpt}). Killing all shards...`,
                            this.manager.color.yellow
                        );

                        this.manager.clusters.forEach((cluster) => {
                            try {
                                cluster.kill();
                                this.manager.debug('InternetConn Watchdog', `Killed cluster ${cluster.id}.`, true);
                            } catch (e) {
                                this.manager.error(
                                    'InternetConn Watchdog',
                                    `Error killing cluster ${cluster.id}: ${e.message}`,
                                    true
                                );
                            }
                        });

                        await new Promise((resolve) => setTimeout(resolve, 5000));

                        let waitTimeMs;

                        if (
                            recoveryState.lastRestartCompletionTime > 0 &&
                            Date.now() - recoveryState.lastRestartCompletionTime < QUICK_SUCCESSION_RESTART_WINDOW_MS
                        ) {
                            this.manager.warn(
                                'InternetConn Watchdog',
                                'Network error recurred within 10 minutes of last restart attempt. Using longer (1.5 hour) wait time.',
                                this.manager.color.yellow
                            );
                            waitTimeMs = SECOND_RESTART_WAIT_MS;

                            this.nextWatchdogInternalCooldownDuration = WATCHDOG_BASE_COOLDOWN_MS;
                        } else {
                            this.manager.info(
                                'InternetConn Watchdog',
                                'This is the first attempt or previous restart was stable for a while. Using 30-minute wait time.',
                                this.manager.color.yellow
                            );
                            waitTimeMs = FIRST_RESTART_WAIT_MS;
                        }

                        this.manager.log(
                            'InternetConn Watchdog',
                            `Waiting for ${time(waitTimeMs)} before attempting to restart shards.`,
                            this.manager.color.cyan
                        );
                        await new Promise((resolve) => setTimeout(resolve, waitTimeMs));

                        this.manager.log(
                            'InternetConn Watchdog',
                            'Wait period over. Attempting to restart shards...',
                            this.manager.color.green
                        );

                        this.manager.debug(
                            'InternetConn Watchdog',
                            'Clearing shard connection errors immediately before restart.',
                            true
                        );
                        this.resetNetworkIssues();

                        const spawnOptions = {
                            amount: this.manager.totalShards,
                            delay: 7 * 1000,
                            timeout: -1
                        };

                        this.manager.respawn = originalRespawnOpt;
                        this.manager.log(
                            'InternetConn Watchdog',
                            `Shard restart process initiated with options: ${JSON.stringify(spawnOptions)}`,
                            this.manager.color.green
                        );
                        recoveryState.lastRestartCompletionTime = Date.now();

                        const spawnOutcome = this.manager.spawn(spawnOptions).then(
                            () => 'ready',
                            (e) => {
                                this.manager.error(
                                    'InternetConn Watchdog',
                                    `Shard spawn reported an error: ${e?.message ?? e}`,
                                    true
                                );
                                return 'failed';
                            }
                        );

                        let settleTimer;
                        const outcome = await Promise.race([
                            spawnOutcome,
                            new Promise((resolve) => {
                                settleTimer = setTimeout(() => resolve('pending'), SPAWN_SETTLE_TIMEOUT_MS);
                            })
                        ]);

                        clearTimeout(settleTimer);

                        if (outcome === 'failed') {
                            recoveryState.lastRestartCompletionTime = 0;
                        }

                        this.resetNetworkIssues();

                        this.manager.log(
                            'InternetConn Watchdog',
                            outcome === 'ready'
                                ? 'All clusters reported ready - shards are back up.'
                                : outcome === 'pending'
                                  ? `Clusters have not all reported ready within ${time(SPAWN_SETTLE_TIMEOUT_MS)}; leaving the spawn to finish and resuming monitoring.`
                                  : 'Shard spawn did not complete. Monitoring resumes - a further outage will trigger another recovery.',
                            this.manager.color.green
                        );
                    } catch (err) {
                        this.manager.error(
                            'InternetConn Watchdog',
                            `Critical error during network recovery procedure: ${err.message}\n${err.stack}`,
                            true
                        );
                        recoveryState.lastRestartCompletionTime = 0;
                    } finally {
                        this.manager.respawn = originalRespawnOpt;

                        wdState.cooldownActiveForDuration = cooldownForThisCycle;
                        wdState.cooldownStartTime = Date.now();
                        wdState.lastCooldownNoticeTime = Date.now();

                        recoveryState.isProcedureActive = false;
                        this.manager.log(
                            'InternetConn Watchdog',
                            `Network recovery procedure finished. Detection resumes in ${time(cooldownForThisCycle)}.`,
                            true
                        );
                    }
                })();
            } else {
                if (this.nextWatchdogInternalCooldownDuration > WATCHDOG_BASE_COOLDOWN_MS) {
                    this.manager.info(
                        'InternetConn Watchdog',
                        "No widespread errors detected. Resetting watchdog's next internal cooldown to base.",
                        true
                    );
                }

                this.nextWatchdogInternalCooldownDuration = WATCHDOG_BASE_COOLDOWN_MS;

                this.resetNetworkIssues();
            }
        }, 10 * 1000);

        return this.internetWatchdogInterval;
    }

    async fileHandler(file, operation, handleAdditions = false) {
        this.manager.data('HOT RELOAD', `File change detected: [${file}]`);
        this.manager.SelfRepairHeartBeat.cur = 1;

        const splitChar = IS_WINDOWS ? '\\' : '/';
        const tmp = file.split(splitChar).filter((i) => i !== '');
        const fileName = tmp[tmp.length - 1].split('.')[0];

        if (fileName === 'Relaxy') {
            return this.relaxyChange(file);
        }

        if (fileName === 'DataTable') {
            return this.dataTableChange();
        }

        if (fileName === 'Manager') {
            return this.managerChange(file);
        }

        if (fileName === 'HeartBeatManager') {
            return this.heartbeatManagerChange(file);
        }

        for (const module of Object.keys(this.manager.moduleCore?.modules)) {
            if (file.includes(module)) {
                return this.manager.moduleCore.loadModule(
                    this.manager.moduleCore.modulePaths[module],
                    this.manager,
                    true
                );
            }
        }

        if (fileName === 'SelfRepair') {
            return this.manager.restartSelfRepair('MODULE UPDATED');
        }

        let maintenance = 0;
        this.manager.clusters.forEach((cluster) => (maintenance += Number(!!cluster.thread)));
        if (this.manager.reclustering || maintenance !== this.manager.totalShards) {
            return;
        }

        this.manager.broadcastEval(
            async (c, a) => {
                let promises = [];

                let mmLoaded = false;
                let crLoaded = false;

                const isMusicModule = a.file.includes('MusicPlayer');

                for (const module of Object.keys(c.moduleCore?.modules)) {
                    if (c.moduleCore.modulePaths[module].includes(a.fileName) || isMusicModule) {
                        for (const mod of Object.keys(c.moduleLookupTable)) {
                            const split = a.file.replace('.js', '').split(a.splitChar);

                            if (
                                (!mmLoaded && mod.endsWith('MusicPlayer') && isMusicModule) ||
                                c.moduleLookupTable[mod].path.replace('.js', '').endsWith(split[split.length - 1])
                            ) {
                                crLoaded = mod === 'RC_Core';

                                if (crLoaded) {
                                    for (const interval of c.core.intervals) {
                                        clearInterval(interval);
                                    }
                                }

                                promises.push(
                                    c.moduleCore.loadModule(
                                        c.moduleLookupTable[mod].path,
                                        c.moduleLookupTable[mod].spawnArgs,
                                        true,
                                        null,
                                        false,
                                        c.moduleLookupTable[mod].altPath,
                                        false,
                                        isMusicModule ? 'Player' : null
                                    )
                                );

                                mmLoaded = !!isMusicModule;
                            }
                        }
                    }
                }

                await Promise.allSettled(promises);

                if (mmLoaded) {
                    await c.loadMusicExtractors();
                }

                if (crLoaded) {
                    c.core.Mutes();
                    c.core.Modlogs();
                    c.core.Reminds();
                    c.core.ClearingChannels();
                    c.core.leaveVoiceChannels();
                    c.core.blackListProcessing();
                    c.core.privateChannelClearing();
                }
            },
            {
                context: {
                    file,
                    splitChar,
                    fileName
                }
            }
        );

        if (file.includes('src')) {
            if (!file.includes(`assets${splitChar}config`) && !tmp.includes('bin')) {
                return this.clientCoreStatusChange(fileName, file);
            } else {
                return;
            }
        }

        if (
            !file.endsWith('js') ||
            (!['commands', 'events'].includes(tmp[tmp.length - 3]) && (!handleAdditions || !file.includes('additions')))
        ) {
            return;
        }

        if (file.includes('commands')) {
            return this.commandStatusChange(fileName, operation, file);
        }

        if (file.includes('events')) {
            return this.eventStatusChange(fileName, operation, file);
        }
    }

    async _snapshotTree(dir, ext = '.js') {
        try {
            const entries = await readdir(dir, {
                recursive: true,
                withFileTypes: true
            });

            await Promise.allSettled(
                entries.map(async (entry) => {
                    if (!entry.isFile() || !entry.name.endsWith(ext)) {
                        return;
                    }

                    const full = path.join(entry.parentPath ?? entry.path, entry.name);

                    try {
                        this._fileSnapshots[full] = await readFile(full, 'utf8');
                    } catch {}
                })
            );
        } catch (e) {
            this.manager.warn('HOT RELOAD', `Could not snapshot tree "${dir}": ${e.message}`, true);
        }
    }

    _lineDiff(oldContent, newContent) {
        const oldLines = oldContent.length ? oldContent.split('\n') : [];
        const newLines = newContent.length ? newContent.split('\n') : [];

        const freq = new Map();
        for (const line of oldLines) {
            freq.set(line, (freq.get(line) ?? 0) + 1);
        }

        let added = 0;
        for (const line of newLines) {
            const count = freq.get(line) ?? 0;

            if (count > 0) {
                freq.set(line, count - 1);
            } else {
                added++;
            }
        }

        let removed = 0;
        for (const remaining of freq.values()) {
            if (remaining > 0) {
                removed += remaining;
            }
        }

        return {
            added,
            removed
        };
    }

    async _changeStats(file, isDeletion) {
        const before = this._fileSnapshots[file];
        let after = '';

        if (!isDeletion) {
            try {
                after = await readFile(file, 'utf8');
            } catch {
                after = '';
            }
        }

        const { added, removed } = this._lineDiff(before ?? '', after);
        const linesBefore = before ? before.split('\n').length : 0;
        const linesAfter = after ? after.split('\n').length : 0;

        if (isDeletion) {
            delete this._fileSnapshots[file];
        } else {
            this._fileSnapshots[file] = after;
        }

        return {
            added,
            removed,
            net: linesAfter - linesBefore,
            linesBefore,
            linesAfter,
            bytesBefore: before ? Buffer.byteLength(before, 'utf8') : 0,
            bytesAfter: Buffer.byteLength(after, 'utf8'),
            hadBaseline: before !== undefined
        };
    }

    _fleetReady() {
        if (this.manager.reclustering) {
            return false;
        }

        let alive = 0;
        this.manager.clusters.forEach((cluster) => (alive += Number(!!cluster.thread)));
        return alive === this.manager.totalShards;
    }

    async _constructorChanged(key, file) {
        try {
            await new Promise((resolve) => setTimeout(resolve, 250));

            const ctor = extractConstructorSource(await readFile(file, 'utf8'));
            const previous = this._ctorCache[key];
            this._ctorCache[key] = ctor;

            return previous == null ? null : previous !== ctor;
        } catch (e) {
            this.manager.error('HOT RELOAD', `Failed reading "${key}" for constructor diff: ${e.message}`, true);
            return null;
        }
    }

    async relaxyChange(file) {
        const changed = await this._constructorChanged('Relaxy', file);

        if (changed !== false) {
            this.manager.error(
                'Cluster Manager',
                `Relaxy ${changed === null ? 'baseline unknown' : 'constructor changed'} - reclustering now.`
            );
            return this.manager._recluster();
        }

        if (!this._fleetReady()) {
            return;
        }

        const bust = Date.now();
        this.manager.broadcastEval(
            async (c, a) => {
                try {
                    await c.hotPatchSelf(a.bust);
                } catch (e) {
                    c.log('ERROR', 'Relaxy hot-patch failed:', e);
                }
            },
            { context: { bust } }
        );

        return this.manager.info('HOT RELOAD', 'Relaxy core methods hot-patched on all clusters (no recluster).');
    }

    async dataTableChange() {
        if (!this._fleetReady()) {
            return;
        }

        const bust = Date.now();
        this.manager.broadcastEval(
            async (c, a) => {
                try {
                    await c.hotReloadTypes(a.bust);
                } catch (e) {
                    c.log('ERROR', 'DataTable reload failed:', e);
                }
            },
            { context: { bust } }
        );

        return this.manager.info('HOT RELOAD', 'DataTable types reloaded on all clusters.');
    }

    async managerChange(file) {
        const changed = await this._constructorChanged('Manager', file);

        if (changed !== false) {
            return this.manager.warn(
                'HOT RELOAD',
                `Manager.js ${
                    changed === null ? 'baseline unknown' : 'constructor changed'
                } - a manual process restart is required to apply it (cannot hot-reload the root process). Methods left unpatched to avoid an inconsistent manager.`
            );
        }

        try {
            const Fresh = (await import(`../Manager.js?v=${Date.now()}`)).default;
            patchPrototype(this.manager, Fresh);
            return this.manager.info('HOT RELOAD', 'Manager core methods hot-patched live (no restart).');
        } catch (e) {
            const limitation = explainHotReloadLimit(e);

            return limitation
                ? this.manager.warn('HOT RELOAD', `Manager.js\n${limitation}`, true)
                : this.manager.error('HOT RELOAD', `Manager hot-patch failed: ${e.message}`, true);
        }
    }

    async heartbeatManagerChange(file) {
        const changed = await this._constructorChanged('HeartBeatManager', file);

        if (changed !== false) {
            return this.manager.warn(
                'HOT RELOAD',
                `HeartBeatManager ${
                    changed === null ? 'baseline unknown' : 'constructor changed'
                } - a manual process restart is required to apply it.`
            );
        }

        try {
            const Fresh = (await import(`./HeartBeatManager.js?v=${Date.now()}`)).HeartbeatManager;

            if (this.manager.heartbeat) {
                patchPrototype(this.manager.heartbeat, Fresh);
            }

            return this.manager.info('HOT RELOAD', 'HeartBeatManager methods hot-patched live (no restart).');
        } catch (e) {
            const limitation = explainHotReloadLimit(e);

            return limitation
                ? this.manager.warn('HOT RELOAD', `HeartBeatManager.js\n${limitation}`, true)
                : this.manager.error('HOT RELOAD', `HeartBeatManager hot-patch failed: ${e.message}`, true);
        }
    }

    async clientCoreStatusChange(name, path) {
        const trueCluster = this.manager.clusters.get(this.manager._trueRelaxyClusterId);
        if (!trueCluster) {
            return this.manager.warn(
                'HOT RELOAD',
                `clientCoreStatusChange: True Relaxy cluster (#${this.manager._trueRelaxyClusterId}) unavailable; skipping change for '${name}'.`
            );
        }
        trueCluster.send({
            _type: messageType.CLIENT_CORE_CHANGED,
            data: {
                name,
                path,
                stats: await this._changeStats(path, false)
            }
        });
    }

    async eventStatusChange(event, operation, path) {
        this.manager
            .broadcast({
                _type: messageType.CLIENT_EVENT_CHANGE,
                variant: operation,
                data: {
                    name: event,
                    path,
                    stats: await this._changeStats(path, operation === 'delete')
                }
            })
            .then(() => this.manager.info('HOT RELOAD', `Changed status of ${event} successfully!`))
            .catch(() => this.manager.info('HOT RELOAD', `Error changing status of ${event}! [error logged]`));
    }

    async commandStatusChange(command, operation, path) {
        this.manager
            .broadcast({
                _type: messageType.CLIENT_COMMAND_CHANGE,
                variant: operation,
                data: {
                    name: command,
                    path,
                    stats: await this._changeStats(path, operation === 'delete')
                }
            })
            .then(() => this.manager.info('HOT RELOAD', `Changed status of ${command} successfully!`))
            .catch(() => this.manager.info('HOT RELOAD', `Error changing status of ${command}! [error logged]`));
    }
}
