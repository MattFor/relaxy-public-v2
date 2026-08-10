'use strict';

import Relaxy           from '../../Relaxy.js';
import nodeChildProcess from 'child_process';
import { messageType }  from '../../../Core/DataTable.js';
import {
    errorToString,
    isNetworkError,
    NetworkErrorThrottle
}                       from '../../../Utils/NetworkErrors.js';

import * as fs      from 'node:fs';
import * as path    from 'node:path';
import * as process from 'node:process';
import { Session }  from 'node:inspector';

const MONITOR_INTERVAL_MS = 5000;
const PROFILE_DURATION_MS = 5000;
const PROFILE_COOLDOWN_MS = 60000;
const networkErrorThrottle = new NetworkErrorThrottle();

const isExtractionError = str =>
{
    const lowerStr = errorToString(str).toLowerCase();

    return (lowerStr.includes('yt-dlp') || lowerStr.includes('ytdl') || lowerStr.includes('sign in to confirm') || lowerStr.includes('confirm you\'re not a bot') || lowerStr.includes('age-restricted') || lowerStr.includes('age restricted') || lowerStr.includes('video unavailable') || lowerStr.includes('private video') || lowerStr.includes('members-only') || lowerStr.includes('is not available in your country') || lowerStr.includes('unable to extract') || lowerStr.includes('no video formats found') || lowerStr.includes('requested format is not available') || lowerStr.includes('unable to download webpage') || lowerStr.includes('could not extract') || lowerStr.includes('extractorexecutionerror') || lowerStr.includes('no results found') || lowerStr.includes('err_no_result'));
};

export default class ActiveDiagnosis
{
    constructor(client, clientProcess)
    {
        this.isProfiling = false;
        this.inspectorSession = null;
        this.lastCpuUsage = clientProcess.cpuUsage();
        this.lastProfileEndTime = 0;
        this.cpuSpikeTimestamps = [];
        this.averageTimeBetweenSpikes = 0;
        this.maxSpikeTimestamps = 10;
        this.client = client;
        this.process = clientProcess;

        setTimeout(() =>
        {
            client.log('DEBUG', 'Starting RestAPI logging.');

            client.cluster.maintenance = false;

            client.rest.on(client.imports.discord.RESTEvents.Response, () => client.module?.stats?.count('rest.response'));

            client.module.ratelimits?.attach();
        }, 5000);

        const profileDir = path.join(process.cwd(), 'logs', 'cpu_profiles');

        clientProcess.on('exit', code =>
        {
            if (this.inspectorSession)
            {
                this.inspectorSession.disconnect();
                client.log('ERROR', 'V8 profiler disconnected on process exit.');
            }

            client.log('ERROR', `EXIT CODE ${code}`);
        });

        clientProcess.on('warning', warning =>
        {
            if (!warning.message.includes('experiment'))
            {
                client.log('WARN', warning);
            }
        });

        clientProcess.on('uncaughtException', async error =>
        {
            if (isExtractionError(error))
            {
                client.log('WARN', `Music issue count: ${++client.data.music_issues}`, error);
            }
            else if (isNetworkError(error))
            {
                const {
                    print,
                    suppressed
                } = networkErrorThrottle.consider(error);
                const count = ++client.data.net_issues;

                if (print)
                {
                    client.log('ERROR', `Network issue count: ${count}${NetworkErrorThrottle.note(suppressed)}`, error ?? `Undefined uncaught exception:\n${JSON.stringify(error)}`);
                }

                await client.cluster.send({
                    _type:   messageType.CLIENT_REQUEST,
                    variant: 'ni'
                });
            }
            else
            {
                client.log('ERROR', `Error count: ${++client.data.errors}`, error ?? `Undefined uncaught exception:\n${JSON.stringify(error)}`);
            }
        });

        clientProcess.on('unhandledRejection', async error =>
        {
            if (isExtractionError(error))
            {
                client.log('WARN', `Music issue count: ${++client.data.music_issues}`, error);
            }
            else if (isNetworkError(error))
            {
                const {
                    print,
                    suppressed
                } = networkErrorThrottle.consider(error);
                const count = ++client.data.net_issues;

                if (print)
                {
                    client.log('ERROR', `Network issue count: ${count}${NetworkErrorThrottle.note(suppressed)}`, error ?? `Undefined unhandled rejection:\n${JSON.stringify(error)}`);
                }

                await client.cluster.send({
                    _type:   messageType.CLIENT_REQUEST,
                    variant: 'ni'
                });
            }
            else
            {
                client.log('ERROR', `Error count: ${++client.data.errors}`, error ?? `Undefined unhandled rejection:\n${JSON.stringify(error)}`);
            }
        });

        client.on(client.imports.discord.Events.Error, async error =>
        {
            if (!errorToString(error).includes(', stat'))
            {
                client.log('ERROR', `Error count: ${++client.data.errors}`, error);
            }
        });

        client.on(client.imports.discord.Events.Warn, warning =>
        {
            client.log('WARN', `Warning count: ${++client.data.warns}`, warning ?? 'Unrecognizable warning');
        });

        client.on(client.imports.discord.Events.Invalidated, () => client.log('ERROR', 'Session invalidated!'));

        client.on(client.imports.discord.Events.Debug, debug =>
        {
            const isHeartbeat = debug.includes('Heartbeat');
            if (client.flags.logs.debug || isHeartbeat && client.flags.logs.heartbeats)
            {
                client.log('DEBUG', debug);
            }
        });

        setTimeout(async () =>
        {
            try
            {
                await this.client.mkdir(profileDir, { recursive: true });

                if (client.flags.logs.cpu_monitor)
                {
                    this.client.log('DEBUG', `Ensured profile directory exists: ${profileDir}`);
                }

                const files = await this.client.readDir(profileDir);
                if (files.length > 0)
                {
                    const fileStats = await Promise.all(files.map(async file =>
                    {
                        const filePath = path.join(profileDir, file);

                        try
                        {
                            const stats = await this.client.fileStats(filePath);
                            return {
                                name:    file,
                                path:    filePath,
                                mtimeMs: stats.mtimeMs
                            };
                        }
                        catch (statErr)
                        {
                            client.log('ERROR', `Failed to get stats for file ${filePath}:`, statErr);
                            return null;
                        }
                    }));

                    const validFiles = fileStats.filter(file => file !== null);

                    if (validFiles.length > 0)
                    {
                        validFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);
                        const oldestFile = validFiles[0];
                        const currentTime = Date.now();
                        const ageInSeconds = (currentTime - oldestFile.mtimeMs) / 1000;

                        const thresholdSeconds = 30;

                        if (ageInSeconds > thresholdSeconds)
                        {
                            if (client.flags.logs.cpu_monitor)
                            {
                                client.log('DEBUG', `Oldest profile file '${oldestFile.name}' is ${ageInSeconds.toFixed(2)} seconds old. Clearing ${validFiles.length} existing files in ${profileDir}...`);
                            }

                            for (const fileInfo of validFiles)
                            {
                                try
                                {
                                    await client.unlink(fileInfo.path);
                                }
                                catch (unlinkErr)
                                {
                                    client.log('ERROR', `Failed to delete file ${fileInfo.path}:`, unlinkErr);
                                }
                            }

                            if (client.flags.logs.cpu_monitor)
                            {
                                client.log('DEBUG', 'Profile directory cleared.');
                            }
                        }
                        else
                        {
                            if (client.flags.logs.cpu_monitor)
                            {
                                client.log('DEBUG', `Oldest profile file '${oldestFile.name}' is only ${ageInSeconds.toFixed(2)} seconds old. Skipping directory clear as files are recent.`);
                            }
                        }
                    }
                    else
                    {
                        if (client.flags.logs.cpu_monitor)
                        {
                            client.log('DEBUG', `Profile directory contains files, but failed to get stats for any of them.`);
                        }
                    }

                }
                else
                {
                    if (client.flags.logs.cpu_monitor)
                    {
                        client.log('DEBUG', 'Profile directory is already empty.');
                    }
                }

            }
            catch (dirErr)
            {
                client.log('ERROR', `Failed to setup or clear profile directory ${profileDir}:`, dirErr);
            }

            this.initializeProfilerSession();

            const cpuMonitor = setInterval(() =>
            {
                if (!this.inspectorSession)
                {
                    this.lastCpuUsage = clientProcess.cpuUsage();
                    return;
                }

                const currentCpuUsage = clientProcess.cpuUsage();
                const userCpuDiff = currentCpuUsage.user - this.lastCpuUsage.user;
                const systemCpuDiff = currentCpuUsage.system - this.lastCpuUsage.system;
                const totalCpuDiff = userCpuDiff + systemCpuDiff;

                const timeElapsedMicroseconds = MONITOR_INTERVAL_MS * 1000;

                const cpuPercentage = timeElapsedMicroseconds > 0
                    ? (totalCpuDiff / timeElapsedMicroseconds) * 100
                    : 0;

                this.lastCpuUsage = currentCpuUsage;

                if (cpuPercentage > client.utils.getAcceptableCPUUsage())
                {
                    const now = Date.now();
                    this.cpuSpikeTimestamps.push(now);

                    if (this.cpuSpikeTimestamps.length > this.maxSpikeTimestamps)
                    {
                        this.cpuSpikeTimestamps.shift();
                    }

                    if (this.cpuSpikeTimestamps.length >= 2)
                    {
                        let totalDiff = 0;
                        for (let i = 1; i < this.cpuSpikeTimestamps.length; i++)
                        {
                            totalDiff += this.cpuSpikeTimestamps[i] - this.cpuSpikeTimestamps[i - 1];
                        }

                        this.averageTimeBetweenSpikes = totalDiff / (this.cpuSpikeTimestamps.length - 1);
                    }
                    else
                    {
                        this.averageTimeBetweenSpikes = 0;
                    }

                    if (this.client.flags.logs.cpu_monitor && !this.isProfiling && now >= this.lastProfileEndTime + PROFILE_COOLDOWN_MS)
                    {
                        this.startProfiling();
                    }
                    else if (this.client.flags.logs.cpu_monitor)
                    {
                        client.log('DEBUG',
                            `CPU spike detected (${cpuPercentage.toFixed(2)}%), ` + `Avg time between spikes: ${this.averageTimeBetweenSpikes
                                ? (this.averageTimeBetweenSpikes / 1000).toFixed(2) + 's'
                                : 'N/A'}, ` + `but skipping profile (isProfiling: ${this.isProfiling}, cooldown: ${now < this.lastProfileEndTime + PROFILE_COOLDOWN_MS
                                ? 'active'
                                : 'inactive'}).`);
                    }
                }

            }, MONITOR_INTERVAL_MS);
        }, 20 * 1000);
    }

    initializeProfilerSession()
    {
        this.inspectorSession = new Session();

        this.inspectorSession.on('error', err =>
        {
            this.client.log('ERROR', 'Inspector Session Error:', err);
            this.inspectorSession = null;
            this.isProfiling = false;
            this.lastProfileEndTime = Date.now();
        });

        try
        {
            this.inspectorSession.connect();
        }
        catch (err)
        {
            this.client.log('ERROR', 'Failed to connect V8 inspector session:', err);
            this.inspectorSession = null;
            this.isProfiling = false;
            this.lastProfileEndTime = Date.now();
            return;
        }

        this.inspectorSession.post('Profiler.enable', (err) =>
        {
            if (err)
            {
                this.client.log('ERROR', 'Failed to enable V8 profiler:', err);
                this.inspectorSession = null;
                this.isProfiling = false;
                this.lastProfileEndTime = Date.now();
            }
            else
            {
                this.client.log('DEBUG', 'V8 profiler enabled. Monitoring CPU...');
            }
        });
    }

    startProfiling()
    {
        if (!this.inspectorSession || this.isProfiling || Date.now() < this.lastProfileEndTime + PROFILE_COOLDOWN_MS)
        {
            return;
        }

        this.isProfiling = true;

        if (this.client.flags.logs.cpu_monitor)
        {
            this.client.log('WARN', `CPU spike detected! Starting ${PROFILE_DURATION_MS / 1000}s profile...`);
        }

        this.inspectorSession.post('Profiler.start', (err) =>
        {
            if (err)
            {
                this.client.log('ERROR', 'Failed to start V8 profile:', err);
                this.isProfiling = false;
                return this.lastProfileEndTime = Date.now();
            }

            setTimeout(() => this.stopProfilingAndReport(), PROFILE_DURATION_MS);
        });
    }

    stopProfilingAndReport()
    {
        if (!this.inspectorSession || !this.isProfiling)
        {
            return this.lastProfileEndTime = Date.now();
        }

        this.inspectorSession.post('Profiler.stop', (err, { profile }) =>
        {
            this.isProfiling = false;
            this.lastProfileEndTime = Date.now();

            if (err)
            {
                return this.client.log('ERROR', 'Failed to stop V8 profile:', err);
            }

            if (this.client.flags.logs.cpu_monitor)
            {
                this.client.log('DEBUG', 'Profile stopped. Analyzing and saving...');
            }

            this.saveProfileToFile(this.analyzeProfile(profile), profile);
        });
    }

    analyzeProfile(profile)
    {
        const nodeMap = new Map();

        const traverse = node =>
        {
            const functionName = node.callFrame.functionName || '(anonymous)';
            const lineNumber = node.callFrame.lineNumber;
            const columnNumber = node.callFrame.columnNumber;
            const url = node.callFrame.url || '(unknown)';

            const key = `${functionName} (${url}:${lineNumber}:${columnNumber})`;

            const selfSamples = node.hitCount || 0;

            if (nodeMap.has(key))
            {
                nodeMap.set(key, nodeMap.get(key) + selfSamples);
            }
            else
            {
                nodeMap.set(key, selfSamples);
            }

            if (node.children)
            {
                for (const childId of node.children)
                {
                    const childNode = profile.nodes.find(n => n.id === childId);
                    if (childNode)
                    {
                        traverse(childNode);
                    }
                    else
                    {
                        this.client.log('WARN', `analyzeProfile: Child node with ID ${childId} not found in profile.nodes array.`);
                    }
                }
            }
        };

        const rootNode = profile && profile.nodes
            ? profile.nodes.find(node => node.id === 1)
            : null;

        if (rootNode)
        {
            traverse(rootNode);
        }
        else
        {
            return this.client.log('WARN', 'Profile data is missing or invalid (could not find root node with ID 1).', profile);
        }

        const sortedFunctions = Array.from(nodeMap.entries())
                                     .map(([key, samples]) => ({
                                         name:    key,
                                         samples: samples
                                     }))
                                     .sort((a, b) => b.samples - a.samples);

        const totalSamples = profile.samples
            ? profile.samples.length
            : (profile && profile.nodes
                ? profile.nodes.reduce((sum, node) => sum + (node.hitCount || 0), 0)
                : 0);

        let returnData = `Average time between spikes: ${this.averageTimeBetweenSpikes
            ? (this.averageTimeBetweenSpikes / 1000).toFixed(2) + 's'
            : 'N/A'}`;
        let data = `\n--- Top 10 CPU Consumers During Spike Profile (${PROFILE_DURATION_MS / 1000}s) ---\n\n`;
        if (totalSamples === 0)
        {
            returnData += 'No CPU activity recorded in the profile or samples/node data is incomplete.';
            data = 'No CPU activity recorded in the profile or samples/node data is incomplete.';
        }
        else
        {
            for (let i = 0; i < Math.min(sortedFunctions.length, 10); i++)
            {
                const func = sortedFunctions[i];
                const percentage = totalSamples > 0
                    ? (func.samples / totalSamples) * 100
                    : 0;
                data += `${(i + 1)}. ${func.name} - ${func.samples} samples (${percentage.toFixed(2)}%)\n`;
            }
        }

        data += '\n-----------------------------------------------------';
        returnData += data;

        if (this.client.flags.logs.cpu_monitor)
        {
            this.client.log(data);
        }

        return returnData;
    }

    saveProfileToFile(top10, profile)
    {
        if (!this.client.flags.logs.cpu_monitor_file_logs)
        {
            return;
        }

        const timestamp = Date.now();
        const filename = `cpu_profile_${timestamp}.cpuprofile`;
        const fileContent = `${top10}\n\n${this.client.imports.beautify(profile, null, 4, 80)}`;

        this.client.writeFile(`logs/cpu_profiles/${filename}`, fileContent)
            .then(() =>
            {
                if (this.client.flags.logs.cpu_monitor)
                {
                    this.client.log('DEBUG', `Full CPU profile saved to ${filename}`);
                }
            })
            .catch(err =>
            {
                this.client.log('ERROR', `Failed to save CPU profile to ${filename}:`, err);
            });
    }
}