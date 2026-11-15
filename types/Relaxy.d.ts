import type * as Discord from 'discord.js';
import type { ClusterClient } from 'discord-hybrid-sharding';
import type ModuleLoader from '../src/Core/ModuleLoader.js';
import type * as CDN from '../src/Assets/CDN.js';
import type { Command } from './Command.js';
import type { RelaxyConfig } from './Config.js';
import type { LinkProposal, MessageTypeTable, ModlogEvent, OperatingMode } from './DataTable.js';
import type { BlacklistEntry, GuildDoc, MemberDoc, ProfileDoc, Snowflake } from './Database.js';

export type { GuildDoc, MemberDoc, ProfileDoc, Snowflake };
export type { LinkProposal };
export type Sendable = string | object;

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'DATA';

export type LogChannel =
    | 'debug'
    | 'heartbeats'
    | 'inter_process_messages'
    | 'file_operations'
    | 'garbage_collector'
    | 'cpu_monitor'
    | 'cpu_monitor_file_logs'
    | 'music_debug'
    | 'raw_events'
    | 'event_names'
    | 'rate_limiter'
    | 'message_debug'
    | 'database'
    | 'swallowed'
    | 'ratelimits'
    | 'statistics';

export interface DocumentChange {
    alter: string;
    value: unknown;
}

export interface RelaxyImports {
    fs: typeof import('fs');
    time: unknown;
    lodash: unknown;
    request: unknown;
    discord: typeof Discord;
    beautify: unknown;
    mongoose: typeof import('mongoose');
    canvacord: unknown;
    translator: unknown;
    progressbar: unknown;
}

export interface RelaxyCards {
    Rank: unknown;
    Welcomer: unknown;
    Leaver: unknown;
}

type C<K = unknown, V = unknown> = Discord.Collection<K, V>;

export interface RelaxyCollections {
    polls: C;
    events: C;
    forums: C;
    starts: C;
    aliases: C<string, string>;
    commands: C<string, Command>;
    cooldowns: C;
    ticketSystems: C;
    starterMessages: C;
    levelingCooldowns: C;
    fastCensoringLists: C;
    interactionCommands: C<string, Command>;
    modalInteractionData: C;
    interactionsInProgress: C;

    voiceChatTimes: C;
    voiceMuteTimes: C;
    voiceDeafTimes: C;
    voiceVideoTimes: C;
    voiceStreamTimes: C;
    voiceStaffMuteTimes: C;
    voiceStaffDeafTimes: C;

    ratelimitHits: C;
}

export interface RelaxyClassMap {
    modlog: unknown;
    heartboardpost: unknown;

    snake: unknown;
    minesweeper: unknown;
    tictactoe: unknown;

    poll: unknown;
    customEmbed: unknown;
    picker: unknown;

    fileRequestPacket: unknown;
}

export interface ModuleLookupItem {
    path: string;
    altPath?: string;
    spawnArgs?: unknown;
}

export interface RelaxyModuleLookupTable {
    [importName: string]: ModuleLookupItem;
}

export interface RelaxyModuleContainer {
    relaxyRequestManager: unknown | null;
    profiles: unknown | null;
    rl: unknown | null;
    ratelimits: unknown | null;
    files: unknown | null;
    quickResponseHandler: unknown | null;
    fileHandler: unknown | null;
    panels: unknown | null;
    tickets: unknown | null;
    creators: unknown | null;
    moderation: unknown | null;
    levelRewards: unknown | null;
    actions: unknown | null;
    docRev: unknown | null;

    database: unknown | null;
    processEventManager: unknown | null;
    clusterCommunicator: unknown | null;
    stats: unknown | null;

    recorder: unknown | null;
}

export interface RelaxyFlags {
    low_performance: boolean;
    logs: Record<LogChannel, boolean>;
}

export interface RelaxyBlacklistState {
    loaded: boolean;
    at: number;
    entries: BlacklistEntry[];
    enforced: Set<Snowflake>;
    grace: Set<Snowflake>;
}

export interface RelaxyData {
    platform: 'win' | 'unix';
    allUsersCache: unknown | null;

    ready: boolean;
    steamNames: boolean;
    refreshStatus: boolean;

    id: number;
    warns: number;
    errors: number;
    status: number;
    net_issues: number;
    music_issues: number;
    swallowed: number;
    shardCount: number;
    embedColor: number;
    startTime: number;

    serverCache: Record<string, unknown>;
    modlogs: Record<string, unknown>;
    forumRejections: Map<string, unknown>;
    databaseQueue: Record<0 | 1 | 2 | 3 | 4 | 5, Record<string, unknown>>;
    raidPrevention: Record<string, unknown>;
    joinMessages: Record<string, unknown>;

    blacklist: RelaxyBlacklistState;

    footer: { text: string; iconURL: string };

    snakeGames: unknown[];
    slashCommands: unknown[];
    snakeGameChannelIds: string[];

    loggerDisplayName: string;
}

export interface RelaxyStartUpData {
    clusterId: number;
    shards: number;
    messageLogFile?: string;
    status: number | string;
    logs?: Partial<Record<LogChannel, boolean>>;
    reclustering?: boolean;
}

export default class Relaxy extends Discord.Client {
    constructor(options?: unknown);

    createdAt: number;
    created?: number;
    moduleLookupTable: RelaxyModuleLookupTable;

    _trueRelaxy: boolean;
    _trueRelaxyClusterId: number | null;

    imports: RelaxyImports;
    cards: RelaxyCards;
    collections: RelaxyCollections;
    class: RelaxyClassMap;
    config: RelaxyConfig;
    flags: RelaxyFlags;
    data: RelaxyData;

    caches: {
        steamAppNames: unknown | null;
        databaseUsersAll: unknown | null;
        steamAppNamesFused: unknown | null;
    };

    cdn: typeof CDN;
    cdnText: (name: string) => Promise<string | null>;

    player: unknown;
    prefetcher: unknown;
    types: {
        messageType: MessageTypeTable;
        operatingMode: OperatingMode;
        modlogEvents: readonly ModlogEvent[];
        [table: string]: unknown;
    };
    core: unknown;
    utils: unknown;
    garbageCollector: unknown;
    module: RelaxyModuleContainer;

    cluster: ClusterClient<Relaxy>;
    moduleCore?: ModuleLoader;

    databaseLoaded?: boolean;
    _debounceTimeouts: Record<string, NodeJS.Timeout | number | undefined>;
    _updateInProgress: Record<string, boolean>;
    _pendingStatus?: unknown;
    _heartbeatInterval?: NodeJS.Timeout | null;
    _adsrTripped?: boolean;
    _settingsConverging?: boolean;

    mkdir?: (...args: unknown[]) => unknown;
    unlink?: (...args: unknown[]) => unknown;
    readDir?: (...args: unknown[]) => unknown;
    readFile?: (...args: unknown[]) => unknown;
    writeFile?: (...args: unknown[]) => unknown;
    fileStats?: (...args: unknown[]) => unknown;
    pathExists?: (...args: unknown[]) => unknown;
    downloadFile?: (...args: unknown[]) => unknown;
    parseJSON?: (...args: unknown[]) => unknown;
    stringifyJSON?: (...args: unknown[]) => unknown;
    fixerParseJSON?: (...args: unknown[]) => unknown;

    get version(): string;

    set version(v: string);

    isOwner(idOrUser: Snowflake | Discord.User): boolean;

    loadModules(): Promise<boolean>;

    loadMusicExtractors(): Promise<void>;

    startUp(data: RelaxyStartUpData): void;

    setupGuilds(): Promise<void>;

    applySettings(settings?: unknown): Promise<void> | void;

    convergeSettings(): Promise<void>;

    initiateRequestManager(): Promise<void>;

    newGuild(guild: Discord.Guild, additional?: unknown): Promise<void>;

    loadCommands(): Promise<void>;

    createSlashCommands(): Promise<void>;

    deleteSlashCommands(): Promise<void>;

    hotPatchSelf(...args: unknown[]): Promise<unknown>;

    hotReloadLog(...args: unknown[]): unknown;

    hotReloadTypes(...args: unknown[]): Promise<unknown>;

    save(guildId: Snowflake, ...changes: DocumentChange[]): Promise<void>;

    saveMember(guildId: Snowflake, userId: Snowflake, ...changes: DocumentChange[]): Promise<void>;

    saveProfile(userId: Snowflake, ...changes: DocumentChange[]): Promise<void>;

    saveForum(channelId: Snowflake, guildId: Snowflake, ...changes: DocumentChange[]): Promise<void>;

    saveHeartBoard(channelId: Snowflake, guildId: Snowflake, ...changes: DocumentChange[]): Promise<void>;

    saveHeartBoardPost(originalId: Snowflake, guildId: Snowflake, ...changes: DocumentChange[]): Promise<void>;

    saveTicket(messageId: Snowflake, guildId: Snowflake, ...changes: DocumentChange[]): Promise<void>;

    countCommandUse(guildId: Snowflake, command: string): void;

    clearServerCache(): void;

    cacheFor(...args: unknown[]): unknown;

    noteForumRejection(...args: unknown[]): unknown;

    takeForumRejection(...args: unknown[]): unknown;

    pushModlog(
        guildId: Snowflake,
        event: ModlogEvent,
        embed: unknown,
        actor?: Snowflake | Discord.User | null
    ): Promise<unknown>;

    print(data: string | object): void;

    log(level: LogLevel, ...items: unknown[]): void;

    throttleLog(...args: unknown[]): unknown;

    clog(
        message: string,
        title?: string,
        type?: string | null,
        overwrite?: unknown,
        additional?: unknown
    ): Promise<unknown>;

    trueRelaxyClusterId(...args: unknown[]): unknown;

    setActivity(text: string, type: string): void;

    setStatus(status: unknown, reclustering?: boolean): Promise<void>;

    getUser(userId: Snowflake | number): Promise<Discord.User | null>;

    getMember(guild: Discord.Guild, userId: Snowflake | number): Promise<Discord.GuildMember | null>;

    getMessage(
        channel: Discord.TextChannel | Discord.ThreadChannel,
        messageId: Snowflake | number,
        starter?: boolean
    ): Promise<Discord.Message | null>;

    getForum(channelId: Snowflake, guildId: Snowflake): Promise<unknown | null>;

    send(channel: Discord.BaseChannel | Discord.User | number, ...content: Sendable[]): Promise<unknown>;

    respond(
        message: string,
        destination: Discord.Message | Discord.BaseInteraction | number,
        options?: unknown
    ): Promise<unknown>;

    edit(message: Discord.Message, ...content: Sendable[]): Promise<unknown>;

    update(interaction: Discord.BaseInteraction, ...content: Sendable[]): Promise<unknown>;

    interactionChain(interaction: unknown, ...content: Sendable[]): Promise<unknown>;

    delete(item: unknown, reason?: string): Promise<boolean>;

    react(message: Discord.Message, ...emojis: (string | string[])[]): Promise<PromiseSettledResult<unknown>[]>;

    unreact(message: Discord.Message, ...emojis: (string | string[])[]): Promise<PromiseSettledResult<unknown>[]>;

    removeReaction(...reactions: unknown[]): Promise<PromiseSettledResult<unknown>[]>;

    qEmbed(...args: unknown[]): unknown;

    censored(...args: unknown[]): unknown;

    redact(...args: unknown[]): unknown;

    flattenToText(...args: unknown[]): string;

    waiting(...args: unknown[]): unknown;

    swallow(...args: unknown[]): unknown;

    permissions(...args: unknown[]): unknown;

    assembleModal(title: string, customId: string, ...components: unknown[]): Discord.ModalBuilder;
}
