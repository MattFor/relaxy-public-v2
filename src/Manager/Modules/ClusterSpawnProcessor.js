'use strict';

import fs from 'fs-extra';

import RelaxyClusterManager from '../Manager.js';
import { Cluster } from 'discord-hybrid-sharding';
import { operatingMode, messageType } from '../../Core/DataTable.js';
import { saveSettings } from '../../Config/Settings.js';
import util from 'util';

const DOTENVX_NOISE = /injected env \(\d+\) from /;

export default class ClusterSpawnProcessor {
    constructor(manager) {
        this.manager = manager;
    }

    handleClusterCreation(cluster) {
        cluster.maintenance = true;

        this.manager.SelfRepair.shardConnectionErrors[cluster.id] = 0;
        this.manager.info('Cluster Manager', `Cluster #${cluster.id} creation initiated.`);

        cluster._deathContext = {
            lastStdout: '',
            lastStderr: '',
            lastMessage: null,
            lastHeartbeat: null,
            exitCode: null,
            exitSignal: null,
            exitTime: null
        };

        cluster.on('exit', (code, signal) => {
            cluster._deathContext.exitCode = code;
            cluster._deathContext.exitSignal = signal;
            cluster._deathContext.exitTime = new Date().toISOString();

            this.manager.error(
                'Cluster Manager',
                `Cluster #${cluster.id} exited: code=${code}, signal=${signal ?? 'none'}`
            );

            if (cluster._deathContext.lastStderr) {
                this.manager.error(
                    'Cluster Manager',
                    `Cluster #${cluster.id} last stderr:\n${cluster._deathContext.lastStderr}`
                );
            }

            if (cluster._deathContext.lastStdout) {
                this.manager.warn(
                    'Cluster Manager',
                    `Cluster #${cluster.id} last stdout:\n${cluster._deathContext.lastStdout}`
                );
            }
        });

        cluster.on('error', (err) => {
            this.manager.error(
                'Cluster Manager',
                `Cluster #${cluster.id} process error: ${err?.stack ?? err?.message ?? err}`
            );
        });

        cluster.on('death', () => {
            this.manager.usableClusters[cluster.id] = null;
            this.manager.error(
                'Cluster Manager',
                `Cluster #${cluster.id} died after exit code=${cluster._deathContext.exitCode}, signal=${cluster._deathContext.exitSignal ?? 'none'}`
            );
        });

        cluster.on('spawn', (clusterProcess) => {
            if (!clusterProcess) {
                this.manager.error(
                    'Cluster Manager',
                    `Cluster #${cluster.id} 'spawn' event fired without a process handle; cannot initialise.`
                );
                return;
            }

            try {
                this.manager.heartbeat.startClusterHeartbeat(cluster);
                this.manager.usableClusters[cluster.id] = clusterProcess.pid;

                if (clusterProcess.stdout) {
                    clusterProcess.stdout.on('data', (chunk) => {
                        const text = chunk.toString();
                        cluster._deathContext.lastStdout = text.slice(-8000);
                        if (this.manager.output) {
                            this.processShardConsoleOutput(text, cluster);
                        }
                    });
                }

                if (clusterProcess.stderr) {
                    clusterProcess.stderr.on('data', (chunk) => {
                        cluster._deathContext.lastStderr = chunk.toString().slice(-8000);
                        this.manager.error(`Shard ${cluster.id} stderr`, chunk.toString().trim());
                    });
                }

                cluster.send({
                    _type: messageType.CLIENT_PROCESS_SPAWNED,
                    data: {
                        clusterId: cluster.id,
                        shards: this.manager.totalShards,
                        status: this.manager.operatingMode,
                        messageLogFile: this.manager.messageLogPath,
                        reclustering: this.manager.recluster.onProgress,
                        heartbeatInterval: this.manager.heartbeat?.options?.beatInterval ?? 5000,

                        logs: { ...this.manager.flags.logs }
                    }
                });
            } catch (e) {
                this.manager.error(
                    'Cluster Manager',
                    `Failed to initialise Cluster #${cluster.id} on spawn: ${e?.stack ?? e}`
                );
            }
        });

        cluster.on('message', async (message) => {
            if (this.manager.flags.logs.inter_process_messages) {
                this.manager.info(`Shard ${cluster.id}`, message);
            }

            if (message?._raw) {
                message = message._raw;
            }

            if (!message || typeof message !== 'object') {
                return;
            }

            try {
                switch (message._type) {
                    case messageType.CLIENT_CORE_CHANGED: {
                        return true;
                    }

                    case messageType.MANAGER_RECLUSTER_ACK: {
                        if (typeof this.manager._reclusterAck === 'function') {
                            this.manager._reclusterAck(message.data ?? { posted: false });
                        } else {
                            this.manager.warn(
                                'Cluster Manager',
                                `Cluster #${cluster.id} acknowledged the recluster report, but nothing was waiting for it (posted=${message.data?.posted}).`
                            );
                        }

                        return true;
                    }

                    case messageType.CLIENT_RESPONSE: {
                        switch (message.variant) {
                            case 'rrsid': {
                                this.manager.debug(
                                    'Cluster Manager',
                                    `Successfully resolved True Relaxy at Cluster #${cluster.id}`
                                );
                                return (this.manager._trueRelaxyClusterId = message.data);
                            }

                            case 'rr_processed': {
                                const targetCluster = this.manager.clusters.get(message.data.clusterId);
                                if (!targetCluster) {
                                    this.manager.warn(
                                        'Cluster Manager',
                                        `rr_processed: target Cluster #${message.data.clusterId} no longer exists; dropping message.`
                                    );
                                    return;
                                }

                                return targetCluster.send(message);
                            }

                            case 'rr_over': {
                                const clusterZero = this.manager.clusters.get(0);
                                if (!clusterZero) {
                                    this.manager.warn(
                                        'Cluster Manager',
                                        'rr_over: Cluster #0 no longer exists; dropping message.'
                                    );
                                    return;
                                }

                                return clusterZero.send({
                                    _type: messageType.MANAGER_DELIVER,
                                    variant: 'rr_over',
                                    data: message.data
                                });
                            }

                            case 'on_special': {
                                this.manager.operatingMode = operatingMode.NORMAL;

                                return await saveSettings(
                                    this.manager.config.keys.dbtoken,
                                    { operatingMode: operatingMode.NORMAL },
                                    (e) =>
                                        this.manager.error(
                                            'Cluster Manager',
                                            `Could not persist the operating mode: ${e?.message ?? e}`
                                        )
                                );
                            }

                            default: {
                                return;
                            }
                        }
                    }

                    case messageType.CLIENT_REQUEST: {
                        switch (message.variant) {
                            case 'cs_st': {
                                return this.manager.ConsoleInputProcessor.process(message.data);
                            }

                            case 'rr': {
                                this.manager.info(
                                    'Cluster Manager',
                                    `Request #${message.data.index} received from cluster #${cluster.id}!`
                                );

                                const trueRelaxyCluster = this.manager.clusters.get(this.manager._trueRelaxyClusterId);
                                if (!trueRelaxyCluster) {
                                    this.manager.warn(
                                        'Cluster Manager',
                                        `rr: True Relaxy cluster is unavailable (id=${this.manager._trueRelaxyClusterId}), likely mid-recluster; dropping request #${message.data.index}.`
                                    );
                                    return;
                                }

                                return trueRelaxyCluster.send({
                                    _type: messageType.MANAGER_DELIVER,
                                    variant: 'rr',
                                    data: message.data
                                });
                            }

                            case 'ni': {
                                this.manager.SelfRepair.recordNetworkIssue(cluster.id);
                                return;
                            }

                            case 'hrlog': {
                                const level = ['info', 'data', 'warn', 'error'].includes(message.level)
                                    ? message.level
                                    : 'data';

                                return this.manager[level]('HOT RELOAD', message.data);
                            }

                            default: {
                                return;
                            }
                        }
                    }

                    default: {
                        this.manager.error(
                            'Cluster Manager',
                            `ClusterSpawnProcess -> Invalid message received:\n${JSON.stringify(message)}`
                        );
                    }
                }
            } catch (e) {
                this.manager.error(
                    'Cluster Manager',
                    `Error handling message (type=${message._type}) from Cluster #${cluster.id}: ${e?.stack ?? e}`
                );
            }
        });
    }

    processShardConsoleOutput(chunk, cluster) {
        if (!this.manager.output) {
            return;
        }

        chunk = chunk.toString();

        let parsed = chunk;
        try {
            parsed = JSON.parse(chunk);
        } catch {}

        if (typeof parsed === 'object') {
            return this.manager.print(
                util.inspect(parsed, {
                    depth: null,
                    colors: true
                }) + '\n'
            );
        }

        if (this.manager.operatingMode !== operatingMode.NORMAL) {
            return this.manager.print(chunk);
        }

        const categories = ['DATA', 'DEBUG', 'ERROR', 'WARN', 'INFO'];

        const buffered = (cluster._stdoutLineBuffer ?? '') + chunk;
        const lines = buffered.split('\n');

        cluster._stdoutLineBuffer = lines.pop();

        let record = null;

        const flush = () => {
            if (record === null) {
                return;
            }

            const parts = record.split(' ');
            const source = `${parts[1]} ${parts[2]}`;
            const message = parts.slice(3).join(' ');

            switch (parts[0]) {
                case 'INFO': {
                    this.manager.info(source, message, true);
                    break;
                }

                case 'DATA': {
                    this.manager.data(source, message, true);
                    break;
                }

                case 'DEBUG': {
                    this.manager.debug(source, message, true);
                    break;
                }

                case 'WARN': {
                    this.manager.warn(source, message, true);
                    break;
                }

                case 'ERROR': {
                    this.manager.error(source, message, true);
                    break;
                }
            }

            record = null;
        };

        for (const line of lines) {
            if (DOTENVX_NOISE.test(line)) {
                continue;
            }

            if (categories.includes(line.split(' ', 1)[0])) {
                flush();
                record = line;
            } else if (record !== null) {
                record += '\n' + line;
            }
        }

        flush();
    }
}
