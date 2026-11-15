import type { ClusterManager } from 'discord-hybrid-sharding';
import type ModuleLoader from '../src/Core/ModuleLoader.js';
import type { LogChannel, LogLevel } from './Relaxy.js';

export interface RelaxyClusterManagerOptions {
    clientFilePath: string;
    totalShards: number;
    shardsPerCluster?: number;
    execute_arguments?: string[];
    token?: string;
    mode?: string | number;
    respawn?: boolean;
    shardArgs?: string[];
    dirname?: string;
    totalClusters?: number;
}

export interface SelfRepairHeartbeat {
    cur: number;
    prev: number;
    timeout: number;
}

export interface RelaxyManagerFlags {
    low_performance: boolean;
    logs: Record<LogChannel, boolean>;
}

export interface SuspendedLine {
    date: number;
    data: string;
}

export interface HostVitals {
    [key: string]: unknown;
}

export default class RelaxyClusterManager extends ClusterManager {
    constructor(options: RelaxyClusterManagerOptions);

    ln: number;

    output: boolean;

    suspendedOutput: SuspendedLine[];

    suspendedOutputDropped: number;

    _output?: boolean | null;

    color: unknown;

    config: unknown;
    flags: RelaxyManagerFlags;
    dirname: string | undefined;
    totalShards: number;
    usableClusters: Record<number, unknown>;
    _trueRelaxyClusterId: number | null;
    operatingMode: number;
    reclustering: boolean;

    moduleCore: ModuleLoader;
    SelfRepair: unknown;
    SelfRepairHeartBeat: SelfRepairHeartbeat;
    hostVitals: HostVitals;

    ConsoleInputProcessor?: { process: (line: string) => unknown } | null;
    ClusterSpawnProcessor?: { handleClusterCreation: (cluster: unknown) => unknown } | null;

    logMethodMap: Record<LogLevel, (source: string, data: unknown, isInternal?: boolean) => void>;

    _reclusterAck?: unknown;
    _settingsSyncInterval?: NodeJS.Timeout | null;
    _hostVitalsInterval?: NodeJS.Timeout | null;
    _hostReportInterval?: NodeJS.Timeout | null;

    print: (data: string | Buffer) => number;

    timestamp: (date?: number | Date) => string;

    log: (source: string, data: unknown, colour?: (text: string) => string, isInternal?: boolean) => number | void;

    info: (source: string, data: unknown, isInternal?: boolean) => void;
    warn: (source: string, data: unknown, isInternal?: boolean) => void;
    error: (source: string, data: unknown, isInternal?: boolean) => void;
    data: (source: string, data: unknown, isInternal?: boolean) => void;
    debug: (source: string, data: unknown, isInternal?: boolean) => void;

    updateConfig: () => Promise<void>;

    initialize(options?: RelaxyClusterManagerOptions): Promise<void>;

    restartSelfRepair(reason?: string): Promise<void>;

    _recluster(
        executionDelay: number,
        options?: {
            timeout?: number;
            delay?: number;
            restartMode?: string | null;
            totalShards?: number;
            totalClusters?: number;
            shardsPerClusters?: number;
            shardClusterList?: number[];
            shardList?: number[];
        }
    ): Promise<unknown>;

    _awaitReclusterAck(...args: unknown[]): Promise<unknown>;

    _shutdown(ms: number): void;

    startSettingsSync(): void;

    startHostVitals(): void;

    startHostReporting(): void;

    _returnOutputState(): void;

    _resumeStdout(): void;

    _pauseStdout(): void;

    _flushSuspendedOutput(): void;
}
