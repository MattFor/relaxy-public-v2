'use strict';

import ModuleLoader from '../Core/ModuleLoader.js';
import { config } from '../Config/Config.js';
import { ensureStorageSync } from '../Assets/Storage.js';
import { registerCardFonts } from './Modules/Cards/Cards.js';
import { bump as bumpDailyStat } from './Modules/Progression/DailyStats.js';
import { loadSettings } from '../Config/Settings.js';
import { CDN, cdnText, warmTextCache, warmFileCache, startTextRefresh } from '../Assets/CDN.js';
import { patchPrototype } from '../Core/HotPatch.js';
import { IS_RASPBERRY_PI } from '../../detect_os.js';

import RC_Core from './Modules/Core/CommonRoutines.js';
import RC_Utilities from './Modules/Core/Utilities.js';
import * as RC_DataTypes from '../Core/DataTable.js';
import { operatingMode, relaxyLogs, messageType, logChannels, isGone } from '../Core/DataTable.js';
import { ClusterClient as RC_ClusterClient } from 'discord-hybrid-sharding';
import RM_H_C_FileHandler from './Modules/Handlers/Features/Files/FileHandler.js';
import RM_H_C_RateLimiter from './Modules/ADSR/RateLimiter.js';
import RM_H_C_RateLimitHandler from './Modules/ADSR/RateLimitHandler.js';
import RM_H_C_Requests from './Modules/Handlers/Features/Requests.js';
import RM_H_C_Profiles from './Modules/Handlers/Features/Profiles.js';
import RM_H_C_QuickResponseBuilder from './Modules/Handlers/QuickInteractionResponse.js';
import RM_H_C_FileInteractions from './Modules/Handlers/Features/Files/FileInteractions.js';
import RM_H_S_Database from './Modules/Database/Database.js';
import RM_S_GarbageCollector from './Modules/Database/GarbageCollector.js';
import RM_S_Statistics from './Modules/Core/Statistics.js';
import RM_S_EventCatcher from './Modules/ADSR/ActiveDiagnosis.js';
import RM_S_IPCMessenger from './Modules/Core/ProcessMessageHandler.js';

import { DefaultExtractors } from '@discord-player/extractor';
import { SoundcloudExtractor } from 'discord-player-soundcloud';
import { Player as RM_V_MusicPlayer } from './Modules/MusicPlayer/index.js';
import RM_V_VoiceRecorder from './Modules/VoiceRecorder/RecordingFactory.js';
import YtDlpExtractor from './Modules/MusicPlayer/extractors/ytdlp/ytdlpExtractor.js';
import MusicPrefetcher from './Modules/Music/MusicPrefetcher.js';

import RI_Snake from './Modules/Handlers/Games/Snake.js';
import RI_Minesweeper from './Modules/Handlers/Games/Minesweeper.js';
import RI_TicTacToe from './Modules/Handlers/Games/TicTacToe.js';
import RI_ModLogEmbed from './Modules/Handlers/Embeds/Static/Modlog.js';
import RI_HeartBoardPostEmbed from './Modules/Handlers/Embeds/Static/HeartBoardPost.js';

import RI_R_Poll from './Modules/Handlers/Embeds/Dynamic/Poll.js';
import RI_R_CustomEmbed from './Modules/Handlers/Embeds/Dynamic/CustomEmbed.js';

import RI_DT_FileRequest from './Modules/Handlers/Features/Files/FileRequest.js';

import util from 'util';
import Queue from 'queue';

import fs from 'fs-extra';
import { BSON } from 'bson';
import Lodash from 'lodash';
import Time from 'pretty-ms';
import Request from 'request';
import Mongoose from 'mongoose';
import Discord from 'discord.js';
import FileSystem from 'fs-extra';
import Canvacord from 'canvacord';

const Beautify = (value, replacer = null, space = 2) => JSON.stringify(value, replacer, space);
import Progressbar from 'string-progressbar';
import Translator from '@iamtraction/google-translate';
import Cards from './Modules/Cards/Cards.js';

const logTypes = {
    DATA: ['JUNK', 'GREY'],
    INFO: ['GOOD', 'GREEN'],
    WARN: ['WARNING', 'YELLOW'],
    DEBUG: ['IMPORTANT', 'BLUE'],
    ERROR: ['ISSUE', 'BAD', 'RED']
};
const RELAXY_LOG_CHANNEL_ID = '1052357652048515132';

const LOG_REPEAT_WINDOW = 60 * 1000;
const LOG_REPEAT_MAX_KEYS = 500;

const LOG_REPEAT_TYPES = new Set(['ERROR', 'WARN']);
const ANSI = /\x1B\[[0-9;]*m/g;

const toNormalPerm = (str) => {
    return str
        .split('_')
        .map((word) => {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join('');
};
const REDACTED_INPUT = "**`[withheld - it tripped this server's censor]`**";
const QUICK_EMBED_KEYS = Object.freeze({
    NotPlaying: 'Nothing is playing!',
    NotConnected: "You aren't connected to any channel!",
    UnableToJoin: 'No permissions to join!',
    NoFilterName: 'Invalid filter name!',
    NoFilter: 'No filter given!',
    InvalidNumber: '**Enter a valid number (between 1 and 1000)!**',
    FileTooLarge: 'The file is too large, cannot send!',
    NotSameVoiceChannel: 'You are not in the same voice channel!',
    TooManyFilters: 'Cannot add more filters!',
    ActiveQueue: 'Cannot record while something is playing/already recording!',
    Recording: 'Cannot play while recording!',
    RecordingA: 'Cannot use while recording!',
    MusicStarting: 'Music is still starting! Please do not interrupt!'
});
const QUICK_EMBED_COLOR = 16738740;

export default class Relaxy extends Discord.Client {
    constructor(options) {
        super(options.defaultClient);

        this.createdAt = Date.now();

        this.moduleLookupTable = {
            RC_Core: {
                path: './Client/Modules/Core/CommonRoutines.js',
                altPath: 'core',
                spawnArgs: this
            },
            RC_Utilities: {
                path: './Client/Modules/Core/Utilities.js',
                altPath: 'utils',
                spawnArgs: this
            },

            RM_H_C_Requests: {
                path: './Client/Modules/Handlers/Features/Requests.js',
                altPath: 'module.relaxyRequestManager',
                spawnArgs: this
            },
            RM_H_C_Profiles: {
                path: './Client/Modules/Handlers/Features/Profiles.js',
                altPath: 'module.profiles',
                spawnArgs: this
            },
            RM_H_C_RateLimiter: {
                path: './Client/Modules/ADSR/RateLimiter.js',
                altPath: 'module.rl',
                spawnArgs: [this, 5]
            },
            RM_H_C_RateLimitHandler: {
                path: './Client/Modules/ADSR/RateLimitHandler.js',
                altPath: 'module.ratelimits',
                spawnArgs: this
            },
            RM_H_C_FileInteractions: {
                path: './Client/Modules/Handlers/Features/Files/FileInteractions.js',
                altPath: 'module.files',
                spawnArgs: this
            },
            RM_H_C_QuickResponseBuilder: {
                path: './Client/Modules/Handlers/QuickInteractionResponse.js',
                altPath: 'module.quickResponseHandler',
                spawnArgs: this
            },
            RM_H_C_FileHandler: {
                path: './Client/Modules/Handlers/Features/Files/FileHandler.js',
                altPath: 'module.fileHandler',
                spawnArgs: this
            },
            RM_H_C_Panels: {
                path: './Client/Modules/Guilds/Panels.js',
                altPath: 'module.panels',
                spawnArgs: this
            },
            RM_H_C_Tickets: {
                path: './Client/Modules/Guilds/Tickets.js',
                altPath: 'module.tickets',
                spawnArgs: this
            },
            RM_H_C_Creators: {
                path: './Client/Modules/Guilds/Creators.js',
                altPath: 'module.creators',
                spawnArgs: this
            },
            RM_H_C_Moderation: {
                path: './Client/Modules/Moderation/Moderation.js',
                altPath: 'module.moderation',
                spawnArgs: this
            },
            RM_H_C_LevelRewards: {
                path: './Client/Modules/Progression/LevelRewards.js',
                altPath: 'module.levelRewards',
                spawnArgs: this
            },
            RM_H_C_Actions: {
                path: './Client/Modules/Dashboard/Actions.js',
                altPath: 'module.actions',
                spawnArgs: this
            },
            RM_H_C_DocRev: {
                path: './Client/Modules/Dashboard/DocRev.js',
                altPath: 'module.docRev',
                spawnArgs: this
            },

            RM_H_S_Database: {
                path: './Client/Modules/Database/Database.js',
                altPath: 'module.database',
                spawnArgs: this
            },
            RM_S_EventCatcher: {
                path: './Client/Modules/ADSR/ActiveDiagnosis.js',
                altPath: 'module.processEventManager',
                spawnArgs: [this, process]
            },
            RM_S_IPCMessenger: {
                path: './Client/Modules/Core/ProcessMessageHandler.js',
                altPath: 'module.clusterCommunicator',
                spawnArgs: this
            },
            RM_S_GarbageCollector: {
                path: './Client/Modules/Database/GarbageCollector.js',
                altPath: 'garbageCollector',
                spawnArgs: this
            },
            RM_S_Statistics: {
                path: './Client/Modules/Core/Statistics.js',
                altPath: 'module.stats',
                spawnArgs: this
            },

            RM_V_VoiceRecorder: {
                path: './Client/Modules/VoiceRecorder/RecordingFactory.js',
                altPath: 'module.recorder',
                spawnArgs: this
            },
            RM_V_MusicPlayer: {
                path: './Client/Modules/MusicPlayer/index.js',
                altPath: 'player',
                spawnArgs: this
            },

            RI_Snake: {
                path: './Client/Modules/Handlers/Games/Snake.js',
                altPath: 'class.snake',
                spawnArgs: 0b101
            },
            RI_Minesweeper: {
                path: './Client/Modules/Handlers/Games/Minesweeper.js',
                altPath: 'class.minesweeper',
                spawnArgs: 0b101
            },
            RI_TicTacToe: {
                path: './Client/Modules/Handlers/Games/TicTacToe.js',
                altPath: 'class.tictactoe',
                spawnArgs: 0b101
            },
            RI_ModLogEmbed: {
                path: './Client/Modules/Handlers/Embeds/Static/Modlog.js',
                altPath: 'class.modlog',
                spawnArgs: 0b101
            },
            RI_HeartBoardPostEmbed: {
                path: './Client/Modules/Handlers/Embeds/Static/HeartBoardPost.js',
                altPath: 'class.heartboardpost',
                spawnArgs: 0b101
            },

            RI_R_Poll: {
                path: './Client/Modules/Handlers/Embeds/Dynamic/Poll.js',
                altPath: 'class.poll',
                spawnArgs: 0b101
            },
            RI_R_CustomEmbed: {
                path: './Client/Modules/Handlers/Embeds/Dynamic/CustomEmbed.js',
                altPath: 'class.customEmbed',
                spawnArgs: 0b101
            },
            RI_R_Picker: {
                path: './Client/Modules/Handlers/Embeds/Dynamic/Picker.js',
                altPath: 'class.picker',
                spawnArgs: 0b101
            },

            RI_DT_FileRequest: {
                path: './Client/Modules/Handlers/Features/Files/FileRequest.js',
                altPath: 'class.fileRequestPacket',
                spawnArgs: 0b101
            }
        };

        this._trueRelaxy = false;

        this._trueRelaxyClusterId = null;

        this.imports = {
            fs: fs,
            time: Time,
            lodash: Lodash,
            request: Request,
            discord: Discord,
            beautify: Beautify,
            mongoose: Mongoose,
            canvacord: Canvacord,
            translator: Translator,
            progressbar: Progressbar
        };

        this.cards = {
            Rank: Cards.Rank,
            Welcomer: Cards.Welcomer,
            Leaver: Cards.Leaver
        };

        this.collections = {
            polls: new Discord.Collection(),
            events: new Discord.Collection(),
            forums: new Discord.Collection(),
            starts: new Discord.Collection(),
            aliases: new Discord.Collection(),
            commands: new Discord.Collection(),
            cooldowns: new Discord.Collection(),
            ticketSystems: new Discord.Collection(),
            starterMessages: new Discord.Collection(),
            levelingCooldowns: new Discord.Collection(),
            fastCensoringLists: new Discord.Collection(),
            interactionCommands: new Discord.Collection(),
            modalInteractionData: new Discord.Collection(),
            interactionsInProgress: new Discord.Collection(),

            voiceChatTimes: new Discord.Collection(),
            voiceMuteTimes: new Discord.Collection(),
            voiceDeafTimes: new Discord.Collection(),
            voiceVideoTimes: new Discord.Collection(),
            voiceStreamTimes: new Discord.Collection(),
            voiceStaffMuteTimes: new Discord.Collection(),
            voiceStaffDeafTimes: new Discord.Collection(),

            ratelimitHits: new Discord.Collection()
        };

        this.class = {
            modlog: RI_ModLogEmbed,
            heartboardpost: RI_HeartBoardPostEmbed,

            snake: RI_Snake,
            minesweeper: RI_Minesweeper,
            tictactoe: RI_TicTacToe,

            poll: RI_R_Poll,
            customEmbed: RI_R_CustomEmbed,

            fileRequestPacket: RI_DT_FileRequest
        };

        this.config = config;

        this.cdn = CDN;

        this.cdnText = (name) =>
            cdnText(name, (e) => this.log('WARN', `CDN text "${name}" unavailable: ${e?.message ?? e}`));

        ensureStorageSync();

        this.flags = {
            low_performance: IS_RASPBERRY_PI,

            logs: {
                ...Object.fromEntries(Object.keys(logChannels).map((channel) => [channel, false]))
            }
        };

        this.caches = {
            steamAppNames: null,
            databaseUsersAll: null,
            steamAppNamesFused: null
        };

        this.data = {
            platform: process.platform.includes('win') ? 'win' : 'unix',

            allUsersCache: null,

            ready: false,
            steamNames: false,
            refreshStatus: true,

            id: 0,
            warns: 0,
            errors: 0,
            status: 0,
            net_issues: 0,
            music_issues: 0,
            swallowed: 0,
            shardCount: 0,
            embedColor: 16738740,
            startTime: Date.now(),

            serverCache: {},
            modlogs: {},
            forumRejections: new Map(),
            databaseQueue: {
                0: {},
                1: {},
                2: {},
                3: {},
                4: {},
                5: {}
            },
            raidPrevention: {},
            joinMessages: {},

            blacklist: {
                loaded: false,
                at: 0,
                entries: [],
                enforced: new Set(),
                grace: new Set()
            },

            footer: {
                text: `Relaxy! ${this.config.keys.version} • relaxy.xyz • by MattFor`,
                iconURL: this.config.text.links.relaxyImage
            },

            snakeGames: [],
            slashCommands: [],
            snakeGameChannelIds: [],

            loggerDisplayName: 'Shard [NOT_SET]'
        };

        this.player = new RM_V_MusicPlayer(this);

        this.prefetcher = new MusicPrefetcher(this);
        this.prefetcher.install();

        this.types = RC_DataTypes;

        this.core = new RC_Core(this);

        this.utils = new RC_Utilities(this);

        this.garbageCollector = new RM_S_GarbageCollector(this);

        this.module = {
            relaxyRequestManager: null,

            quickResponseHandler: null,

            recorder: null,

            database: null,
            profiles: null,
            files: null,

            rl: null,
            processEventManager: null,
            fileHandler: null,
            clusterCommunicator: new RM_S_IPCMessenger(this)
        };

        this.cluster = new RC_ClusterClient(this);
        this.log('Cluster client initiated!');

        process.on('message', (message) => this.module.clusterCommunicator.process(message));
        setTimeout(async () => {
            this.moduleCore = new ModuleLoader(
                this,
                null,
                {
                    data: 'DATA',
                    info: 'INFO',
                    warn: 'WARN',
                    debug: 'DEBUG',
                    error: 'ERROR'
                },
                this.log.bind(this)
            );

            this.log('DEBUG', 'Attempting to load modules...');
            try {
                await this.loadModules();
            } catch (e) {
                return this.log('ERROR', 'Critical error loading modules!', e);
            }

            this.mkdir = (...args) => this.module.fileHandler.mkdir(...args);
            this.unlink = (...args) => this.module.fileHandler.unlink(...args);
            this.readDir = (...args) => this.module.fileHandler.readDir(...args);
            this.readFile = (...args) => this.module.fileHandler.readFile(...args);
            this.writeFile = (...args) => this.module.fileHandler.writeFile(...args);
            this.fileStats = (...args) => this.module.fileHandler.fileStats(...args);
            this.pathExists = (...args) => this.module.fileHandler.pathExists(...args);
            this.downloadFile = (...args) => this.module.fileHandler.downloadFile(...args);

            this.parseJSON = (...args) => this.module.fileHandler.parseJSON(...args);
            this.stringifyJSON = (...args) => this.module.fileHandler.stringifyJSON(...args);
            this.fixerParseJSON = (...args) => this.module.fileHandler.fixerParseJSON(...args);

            this.log('DEBUG', 'Modules loaded successfully.');

            this.loadMusicExtractors().catch((e) => this.log('ERROR', 'Music extractor load failed:', e));

            this.log(`${this.flags.logs.debug ? 'Not showing' : 'Showing'} debug information`);
            Mongoose.set('strictQuery', true);
            this.setMaxListeners(12);

            const commandsReady = this.loadCommands();

            const assetsReady = Promise.all([
                warmTextCache((name, e) =>
                    this.log('WARN', `CDN text "${name}" unavailable, using cache: ${e?.message ?? e}`)
                ),
                warmFileCache(
                    (name, e) => this.log('WARN', `CDN file "${name}" unavailable: ${e?.message ?? e}`),
                    (note) => this.log('WARN', note)
                )
            ]);

            startTextRefresh((name, e) =>
                this.log('WARN', `CDN text refresh failed for "${name}": ${e?.message ?? e}`)
            );

            Mongoose.connect(this.config.keys.dbtoken)
                .then(async () => {
                    this.log(`Database connection resolved. [${this.imports.time(Date.now() - this.createdAt)}]`);

                    const settings = await loadSettings(
                        this.config.keys.dbtoken,
                        {
                            version: this.config.keys.version,
                            wmStatus: this.config.text.wmStatus,
                            clientStatus: this.config.text.clientStatus,
                            ownerIds: this.config.keys.owners,
                            youtubeCookie: this.config.keys.youtubeCookie
                        },
                        (e) => this.log('WARN', `Could not read settings, using .env values: ${e?.message ?? e}`)
                    );

                    this.applySettings(settings);

                    if (!settings.fromDatabase) {
                        this.convergeSettings();
                    }

                    await commandsReady;
                    await assetsReady;

                    registerCardFonts();

                    const login = await this.login(this.config.keys.token);
                    this.log(
                        'DEBUG',
                        `${
                            login === this.config.keys.token ? 'Login successful' : 'Authentication failed'
                        } [${this.imports.time(Date.now() - this.createdAt)}]`
                    );
                    await this.initiateRequestManager();
                })
                .catch((e) => {
                    this.log('Database connection severed!', e);
                });
        }, 0);
    }

    isOwner(user) {
        const id = typeof user === 'string' ? user : user?.id;

        return !!id && this.config.keys.owners.includes(String(id));
    }

    get version() {
        return this.config.keys.version;
    }

    set version(string) {
        return (this.config.keys.version = string);
    }

    async loadMusicExtractors() {
        if (!this.player.extractors.eventNames().includes('error')) {
            this.player.extractors.on('error', (_context, extractor, error) => {
                this.log('ERROR', `Extractor "${extractor?.identifier ?? 'unknown'}" failed:`, error);
            });
        }

        const tryRegister = async (label, run) => {
            try {
                if (await run()) {
                    this.log('DEBUG', `Music extractor loaded: ${label}`);
                    return true;
                }

                this.log('DEBUG', `Music extractor skipped (duplicate or inactive): ${label}`);

                return false;
            } catch (error) {
                this.log('ERROR', `Music extractor "${label}" threw during registration:`, error);
                return false;
            }
        };

        await tryRegister('youtube-ytdlp', () => this.player.extractors.register(YtDlpExtractor, {}));

        await this.player.extractors.unregister('com.discord-player.soundcloudextractor');
        await tryRegister('soundcloud', () => this.player.extractors.register(SoundcloudExtractor, {}));

        try {
            const extractors = await this.player.extractors.loadMulti(DefaultExtractors);
            if (!extractors.success) {
                this.log('ERROR', 'DefaultExtractors load reported failure:', extractors.error);
            }
        } catch (error) {
            this.log('ERROR', 'DefaultExtractors load threw:', error);
        }

        const active = [...this.player.extractors.store.values()].map((extractor) => extractor.identifier).sort();
        this.log(`Music extractors ready (${active.length}): ${active.join(', ')}`);
    }

    async loadModules() {
        return new Promise(async (resolve) => {
            const promises = [];

            for (const module of Object.keys(this.moduleLookupTable)) {
                promises.push(
                    this.moduleCore.loadModule(
                        this.moduleLookupTable[module].path,
                        this.moduleLookupTable[module].spawnArgs,
                        null,
                        false,
                        false,
                        this.moduleLookupTable[module].altPath,
                        !this.flags.logs.debug,
                        this.moduleLookupTable[module].path.includes('MusicPlayer') ? 'Player' : null
                    )
                );
            }

            Promise.allSettled(promises).then(() => resolve(true));
        });
    }

    hotReloadLog(text, level = 'info') {
        try {
            this.cluster.send({
                _type: messageType.CLIENT_REQUEST,
                variant: 'hrlog',
                level,
                data: `[Shard ${this.cluster.id}] ${text}`
            });
        } catch {
            this.log('HOT RELOAD', text);
        }
    }

    async hotPatchSelf(bust) {
        const Fresh = (await import(`./Relaxy.js?v=${bust}`)).default;
        patchPrototype(this, Fresh);
        this.hotReloadLog('Relaxy core methods hot-patched live (no recluster).');
    }

    async hotReloadTypes(bust) {
        this.types = await import(`../Core/DataTable.js?v=${bust}`);
        this.hotReloadLog('DataTable types reloaded live.');
    }

    startUp(data) {
        for (const channel of Object.keys(logChannels)) {
            if (typeof data.logs?.[channel] === 'boolean') {
                this.flags.logs[channel] = data.logs[channel];
            }
        }

        this.flags.logs.debug =
            data.logs?.debug === true || [operatingMode.DEBUG, operatingMode.MAINTENANCE].includes(data.status);

        this._debounceTimeouts = {};
        this._updateInProgress = {};

        this.data.id = data.clusterId;
        this.data.shardCount = data.shards;
        this.data.loggerDisplayName = `Shard ${data.clusterId}`;

        this._pendingStatus = {
            status: data.status,
            reclustering: data.reclustering
        };

        if (this.isReady()) {
            this.setStatus(data.status, data.reclustering, true);
            this._pendingStatus = null;
        }

        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
        }

        const beat = () => {
            try {
                this.cluster.send({
                    _type: this.types.messageType.HEARTBEAT_ACK,
                    date: Date.now()
                });
            } catch {}
        };

        beat();
        this._heartbeatInterval = setInterval(beat, data.heartbeatInterval ?? 5000);

        this._adsrTripped = false;

        setInterval(async () => {
            if (this._adsrTripped) {
                return;
            }

            const errThreshold = Math.floor(Math.random() * (30 - 15 + 1)) + 20;
            const warnThreshold = Math.floor(Math.random() * (50 - 25 + 1)) + 25;

            const errors = this.data.errors;
            const warns = this.data.warns;

            const tripped =
                errors >= errThreshold
                    ? {
                          kind: 'errors',
                          count: errors,
                          threshold: errThreshold
                      }
                    : warns >= warnThreshold
                      ? {
                            kind: 'warnings',
                            count: warns,
                            threshold: warnThreshold
                        }
                      : null;

            if (!tripped) {
                this.data.errors = Math.floor(errors / 2);
                this.data.warns = Math.floor(warns / 2);

                return;
            }

            this._adsrTripped = true;

            const debugMsg = `[ADSR] - Relaxy! passed safe ${
                tripped.kind === 'errors' ? 'error' : 'warning'
            } threshold. Restarting Shard [${this.cluster.id}]`;

            this.log('DEBUG', debugMsg);

            await this.clog(
                `Shard ${this.cluster.id} has endured too many ${tripped.kind}. \`${tripped.count}\` out of random limit: \`${tripped.threshold}\`\nAutomatic restart to preserve functionality.`,
                '[ADSR] Watchdog trigger.',
                'bad'
            );

            setTimeout(async () => {
                await this.cluster.evalOnManager(
                    `this.clusters.get(${this.cluster.id}).respawn(this?.spawnOptions, "ADSR Watchdog trigger.");`
                );
            }, 5 * 1000);
        }, 10 * 1000);
    }

    async setupGuilds() {
        const usersPipeline = this.module.database
            .getUsers(
                {
                    $expr: {
                        $gt: [
                            {
                                $size: {
                                    $ifNull: ['$rm', []]
                                }
                            },
                            0
                        ]
                    }
                },
                { useCursor: true }
            )
            .then((users) => {
                let remindUsers = 0;
                for (const u of users) {
                    remindUsers++;
                    if (!this.module.database._cache.users.has(u.id)) {
                        this.module.database._cache.users.set(u.id, u);
                    }
                }

                this.log('DATA', `Cached ${remindUsers} reminder users.`);
            });

        const dbGuildsPipeline = this.module.database
            .getGuilds(
                {},
                {
                    projection: {
                        id: 1,
                        dm: 1
                    },
                    lean: true,
                    useCursor: true
                }
            )
            .then((databaseGuilds) => {
                let deletedGuilds = 0;
                let skippedGuilds = 0;
                const toDelete = [];

                for (const g of databaseGuilds) {
                    if (!g.dm || g.dm === -1) {
                        skippedGuilds++;
                        continue;
                    }

                    if (Date.now() - g.dm > 31 * 24 * 60 * 60 * 1000) {
                        deletedGuilds++;
                        toDelete.push(this.module.database.deleteGuild(g.id));
                    }
                }

                this.log('DATA', `Deleted ${deletedGuilds} | Skipped ${skippedGuilds} Servers`);

                return Promise.allSettled(toDelete);
            });

        const liveGuildsPipeline = this.guilds
            .fetch()
            .then((guilds) => {
                this.log('DATA', `Client fetched ${guilds.size} servers.`);
                return Promise.allSettled(guilds.map((guild) => this.newGuild(guild)));
            })
            .catch((err) => this.log('ERROR', 'Failed to fetch guilds:', err));

        Promise.allSettled([dbGuildsPipeline, liveGuildsPipeline]).then(() => {
            this.log(`Server database [DONE] ${this.imports.time(Date.now() - this.createdAt)}`);
            this.databaseLoaded = true;
        });

        Promise.all([usersPipeline]).then(() => {
            this.log(`User Reminds [DONE] ${this.imports.time(Date.now() - this.createdAt)}`);
        });
    }

    applySettings(settings) {
        this.config.keys.version = settings.version;
        this.config.keys.owners = settings.ownerIds;
        this.config.text.wmStatus = settings.wmStatus;
        this.config.text.clientStatus = settings.clientStatus;
        this.config.keys.youtubeCookie = settings.youtubeCookie ?? '';
    }

    convergeSettings() {
        if (this._settingsConverging) {
            return;
        }

        this._settingsConverging = true;

        let delay = 30 * 1000;
        const MAX_DELAY = 10 * 60 * 1000;

        const attempt = async () => {
            const settings = await loadSettings(
                this.config.keys.dbtoken,
                {
                    version: this.config.keys.version,
                    wmStatus: this.config.text.wmStatus,
                    clientStatus: this.config.text.clientStatus,
                    ownerIds: this.config.keys.owners,
                    youtubeCookie: this.config.keys.youtubeCookie
                },
                () => {}
            );

            if (settings.fromDatabase) {
                this._settingsConverging = false;
                this.applySettings(settings);

                return this.log('Settings recovered from the database - this cluster is back in step with the fleet.');
            }

            delay = Math.min(delay * 2, MAX_DELAY);
            setTimeout(attempt, delay).unref?.();
        };

        setTimeout(attempt, delay).unref?.();

        this.log(
            'WARN',
            `Running on .env settings (version / owners / YouTube cookie may differ from the other clusters). Retrying the database every ${delay / 1000}s until they agree.`
        );
    }

    async initiateRequestManager() {
        let server = null;

        try {
            server = await this.guilds.fetch(RC_DataTypes.SUPPORT_GUILD_ID);
        } catch (e) {
            return this.log('ERROR', e);
        }

        const trueRelaxyId = await this.cluster.evalOnManager('this._trueRelaxyClusterId').catch(() => null);

        if (!server || (typeof trueRelaxyId === 'number' && trueRelaxyId >= 0) || server.shardId !== this.cluster.id) {
            return;
        }

        this._trueRelaxy = true;
        this._trueRelaxyClusterId = this.cluster.id;
        this.module.relaxyRequestManager = new RM_H_C_Requests(this);

        await this.cluster.send({
            _type: RC_DataTypes.messageType.CLIENT_RESPONSE,
            variant: 'rrsid',
            data: this.cluster.id
        });

        this.log("Relaxy's Requests initiated!");
    }

    async newGuild(guild) {
        this.data.serverCache[guild.id] ??= {};
        this.data.modlogs[guild.id] ??= [];

        this.data.raidPrevention[guild.id] ??= {
            recent: [],
            triggeredUntil: 0
        };

        this.data.joinMessages[guild.id] ??= [];

        await this.module.database.getGuild(guild.id);

        if (guild?.members?.me?.voice?.channel) {
            return guild.members.me.voice.disconnect();
        }
    }

    save(guildId, ...changes) {
        changes = changes.filter((c) => c && typeof c === 'object' && ('alter' in c || 'path' in c));

        if (!changes.length) {
            return Promise.resolve();
        }

        return this.module.database.saveGuild(guildId, changes);
    }

    async countCommandUse(guild, guildId, userId, commandName, options = {}) {
        await this.save(
            guildId,
            {
                alter: 'd.cg',
                value: (guild?.d?.cg ?? 0) + 1
            },
            {
                alter: `d.cs.${commandName}`,
                value: (guild?.d?.cs?.[commandName] ?? 0) + 1
            }
        );

        bumpDailyStat(guildId, 'c');

        if (!options.countUser) {
            return;
        }

        const [member, profile] = await Promise.all([
            this.module.database.Member(userId, guildId),
            this.module.database.User(userId)
        ]).catch(() => [null, null]);

        if (member) {
            this.saveMember(guildId, userId, {
                alter: 'cmd',
                value: (member.cmd ?? 0) + 1
            });
        }

        if (profile) {
            this.saveProfile(userId, {
                alter: 'cmd',
                value: (profile.cmd ?? 0) + 1
            });
        }
    }

    saveMember(guildId, userId, ...changes) {
        return this.module.database.saveDoc(
            'member',
            {
                g: guildId,
                id: userId
            },
            changes.filter(Boolean)
        );
    }

    saveProfile(userId, ...changes) {
        return this.module.database.saveDoc('profile', { id: userId }, changes.filter(Boolean));
    }

    saveForum(channelId, guildId, ...changes) {
        return this.module.database.saveDoc(
            'forumChannel',
            {
                id: channelId,
                g: guildId
            },
            changes.filter(Boolean)
        );
    }

    saveHeartBoard(channelId, guildId, ...changes) {
        return this.module.database.saveDoc(
            'heartBoard',
            {
                id: channelId,
                g: guildId
            },
            changes.filter(Boolean)
        );
    }

    saveHeartBoardPost(originalId, ...changes) {
        return this.module.database.saveDoc('heartBoardPost', { oid: originalId }, changes.filter(Boolean));
    }

    saveTicket(guildId, channelId, messageId, ...changes) {
        return this.module.database.saveDoc(
            'ticketSystem',
            {
                g: guildId,
                c: channelId,
                mid: messageId
            },
            changes.filter(Boolean)
        );
    }

    noteForumRejection(guildId, threadId, rejection) {
        const now = Date.now();

        for (const [key, value] of this.data.forumRejections) {
            if (now - value.at > 60_000) {
                this.data.forumRejections.delete(key);
            }
        }

        this.data.forumRejections.set(`${guildId}:${threadId}`, {
            ...rejection,
            at: now
        });
    }

    takeForumRejection(guildId, threadId) {
        const key = `${guildId}:${threadId}`;
        const hit = this.data.forumRejections.get(key) ?? null;

        this.data.forumRejections.delete(key);

        return hit;
    }

    pushModlog(guildId, event, embed, actor = null, files = null) {
        const actorId = typeof actor === 'string' ? actor : (actor?.id ?? actor?.user?.id ?? null);

        if (actorId && this.isOwner(actorId)) {
            if (this.flags.logs.debug) {
                this.log('DEBUG', `Modlog "${event}" in ${guildId} suppressed - performed by owner ${actorId}.`);
            }

            return false;
        }

        if (!this.data.modlogs[guildId]) {
            return false;
        }

        this.data.modlogs[guildId].push(files ? [event, embed, files] : [event, embed]);

        return true;
    }

    cacheFor(guildId, key, ttl) {
        this.data.serverCache[guildId] ??= {};

        return (this.data.serverCache[guildId][key] = Date.now() + ttl);
    }

    clearServerCache() {
        const _ = setInterval(() => {
            const now = Date.now();

            let dropped = 0;

            for (const bucket of Object.values(this.data.serverCache)) {
                if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
                    continue;
                }

                for (const [key, value] of Object.entries(bucket)) {
                    if (typeof value === 'number' && value <= now) {
                        delete bucket[key];
                        dropped++;
                    }
                }
            }

            if (dropped && this.flags.logs.debug) {
                this.log('DEBUG', `Server cache: dropped ${dropped} expired entr${dropped === 1 ? 'y' : 'ies'}.`);
            }
        }, 60 * 1000);

        return _;
    }

    print(data) {
        process.stdout.write(data);
    }

    log(...items) {
        let logType = 'INFO';

        for (const key of Object.keys(logTypes)) {
            if (items[0] === key || logTypes[key].includes(items[0])) {
                logType = key;
                items.shift();
                break;
            }
        }

        let content = '';
        for (const item of items) {
            content +=
                typeof item === 'string'
                    ? `${items.length !== 1 ? '\n' : ''}` + item + '\n'
                    : '\n' +
                      util.inspect(item, {
                          depth: null,
                          colors: true
                      });
        }

        content = content.replace(/\\n+/g, '\n');

        if (LOG_REPEAT_TYPES.has(logType)) {
            const repeat = this.throttleLog(logType, content);

            if (repeat === null) {
                return;
            }

            content += repeat;
        }

        this.print(`${logType} ${this.data.loggerDisplayName} ${content}${content.endsWith('\n') ? '' : '\n'}`);
    }

    throttleLog(logType, content) {
        if (!this._logRepeats) {
            this._logRepeats = new Map();
        }

        const key = `${logType} ${content.replace(ANSI, '').replace(/\d+/g, '#')}`;
        const now = Date.now();
        const seen = this._logRepeats.get(key);

        if (seen && now - seen.printed < LOG_REPEAT_WINDOW) {
            seen.count++;

            return null;
        }

        this._logRepeats.delete(key);

        for (const [oldKey, entry] of this._logRepeats) {
            if (this._logRepeats.size < LOG_REPEAT_MAX_KEYS && now - entry.printed < LOG_REPEAT_WINDOW) {
                break;
            }

            this._logRepeats.delete(oldKey);
        }

        this._logRepeats.set(key, {
            printed: now,
            count: 0
        });

        if (!seen?.count) {
            return '';
        }

        return `\n(the same entry repeated ${seen.count} more time${
            seen.count === 1 ? '' : 's'
        } in the last ${this.imports.time(now - seen.printed)} - suppressed)\n`;
    }

    async trueRelaxyClusterId() {
        if (typeof this._trueRelaxyClusterId === 'number' && this._trueRelaxyClusterId >= 0) {
            return this._trueRelaxyClusterId;
        }

        const id = await this.cluster.evalOnManager('this._trueRelaxyClusterId').catch(() => null);

        this._trueRelaxyClusterId = typeof id === 'number' && id >= 0 ? id : null;

        return this._trueRelaxyClusterId;
    }

    async clog(message, title, type, overwrite, additional) {
        if (!this._trueRelaxy) {
            const target = await this.trueRelaxyClusterId();

            if (target === null) {
                return;
            }

            return this.cluster
                .broadcastEval(
                    (client, payload) =>
                        client.clog(
                            payload.message,
                            payload.title,
                            payload.type,
                            payload.overwrite,
                            payload.additional
                        ),
                    {
                        cluster: target,
                        context: {
                            message,
                            title,
                            type,
                            overwrite: overwrite ?? null,
                            additional: additional ?? null
                        }
                    }
                )
                .catch(() => {
                    this._trueRelaxyClusterId = null;
                });
        }

        const channel = await this.channels.fetch(RELAXY_LOG_CHANNEL_ID).catch((error) => {
            this.log(
                'WARN',
                `clog: could not reach the support log channel (${error?.message ?? error}). "${title}" was not posted.`
            );

            return null;
        });

        if (!channel) {
            return null;
        }

        return await this.send(channel, null, [
            overwrite ?? {
                color: additional?.color ?? (type === 'bad' ? 16711680 : type === 'good' ? 65280 : 16738740),
                title: `${additional?.title ?? ''}${title}`,
                description: `${additional?.message ?? ''}${message}`,
                footer: {
                    text: 'Event emitted',
                    iconURL: this.config.text.links.relaxyImage
                },
                timestamp: new Date()
            }
        ]).catch((error) => {
            this.log('WARN', `clog: the support log channel refused "${title}" (${error?.message ?? error}).`);

            return null;
        });
    }

    loadCommands() {
        return new Promise(async (resolve, reject) => {
            try {
                const start = Date.now();
                this.log('Loading commands and events...');

                const commandLoadPromises = [];

                const commandDirectories = await this.readDir('./bot/commands');

                for (const dir of commandDirectories.filter((d) =>
                    ['administrator', 'fun', 'moderation', 'miscellaneous', 'music', 'image'].includes(d)
                )) {
                    const files = await this.readDir(`./bot/commands/${dir}`);

                    files.forEach((file) => {
                        const loadCommand = async () => {
                            const command = (await import(`../../bot/commands/${dir}/${file}`)).default;

                            if (command.aliases) {
                                command.aliases.forEach((alias) => this.collections.aliases.set(alias, command));
                            }

                            command.dir = dir;

                            if (command.slash) {
                                this.collections.interactionCommands.set(command.name, command);
                                if (
                                    this.data.id === 0 &&
                                    !command.leaveout &&
                                    !command.owner &&
                                    !command.undergoingchange
                                ) {
                                    this.data.slashCommands.push(command);
                                }
                            }

                            this.collections.commands.set(command.name.toLowerCase(), command);
                        };

                        commandLoadPromises.push(loadCommand());
                    });
                }

                const discordEventLoadPromises = (await this.readDir('./bot/events/discord')).map(async (file) => {
                    const eventModule = (await import(`../../bot/events/discord/${file}`)).default;
                    const eventName = file.split('.')[0];

                    let listenerFunction = null;

                    if (['clientReady'].includes(eventName)) {
                        listenerFunction = (...args) => eventModule.run(this, ...args);
                        this.once(eventName, listenerFunction);
                    } else {
                        listenerFunction = async (...args) => {
                            if (eventName !== 'raw' && this.flags.logs.event_names) {
                                this.print(eventName + '\n');
                            }

                            this.module?.stats?.count(`event.${eventName}`);

                            this.garbageCollector.handle(eventName, ...args);
                            return eventModule.run(this, ...args);
                        };

                        this.on(eventName, listenerFunction);
                    }

                    this.collections.events.set(eventName, {
                        moduleExport: eventModule,
                        listenerFunction: listenerFunction,
                        type: 'discord'
                    });
                });

                const playerEventLoadPromises = (await this.readDir('./bot/events/music')).map(async (file) => {
                    const eventModule = await import(`../../bot/events/music/${file}`);
                    const eventName = file.split('.')[0];
                    const listenerFunction = (...args) => eventModule.default(this, ...args);

                    this.player.events.on(eventName, listenerFunction);

                    this.collections.events.set(eventName, {
                        moduleExport: eventModule.default,
                        listenerFunction: listenerFunction,
                        type: 'music'
                    });
                });

                await Promise.all([...commandLoadPromises, ...discordEventLoadPromises, ...playerEventLoadPromises]);

                this.log(`Commands and events loaded! Took: ${this.imports.time(Date.now() - start)}`);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    async deleteSlashCommands() {
        if (this.data.id !== 0) {
            return;
        }

        void this.clog('They will be back soon...', 'SLASH COMMANDS DELETED', 'bad', null, { onlyMainShard: true });

        try {
            await this.application.commands.set([]);
        } catch (e) {
            this.log('ERROR', e);
        }

        this.log('Slash commands have been deleted!');
    }

    async createSlashCommands() {
        if (this.data.id !== 0) {
            return;
        }

        this.clog('Enjoy them again', 'SLASH COMMANDS RESTORED', 'good', null, { onlyMainShard: true });

        let i = 0;
        let activated = {};

        const slash = this.data.slashCommands
            .filter(
                (command) =>
                    !command.leaveout && ['moderation', 'music', 'image', 'miscellaneous', 'fun'].includes(command.dir)
            )
            .sort((a, b) => {
                if (a.dir === 'music' && b.dir !== 'music') {
                    return -1;
                }

                return 0;
            })
            .map((command) => {
                try {
                    command.slash.setName(command.name).setDescription(command.slashDescription ?? command.description);

                    const json = command.slash.toJSON();

                    if (!activated[command.dir]) {
                        activated[command.dir] = '';
                    }

                    activated[command.dir] += `${command.name} has been activated.\n`;

                    i++;

                    return json;
                } catch (error) {
                    this.log(
                        'ERROR',
                        `Slash command "${command.name}" is invalid and was NOT registered: ${error?.message ?? error}. Give it a 'slashDescription' of 100 characters or fewer.`
                    );

                    return null;
                }
            })
            .filter(Boolean);

        try {
            this.log('DEBUG', `Initiating ${i} slash commands...`);
            await this.application.commands.set(slash);

            let final = '';

            for (const category in activated) {
                final += `Commands in category "${category}":\n${activated[category]}`;
            }

            final += 'Slash commands have been successfully initiated!';

            this.log(final);
        } catch (error) {
            this.log('ERROR', error);
        }
    }

    permissions(message, required, channels, additional) {
        let { permissionsUser, suggestedPermissionsUser, permissionsBot, suggestedPermissionsBot } = required ?? {};

        const { voiceChannel } = channels ?? {};

        const textChannel =
            (channels ?? {}).textChannel === undefined ? (message?.channel ?? null) : channels.textChannel;

        const realPermissions = {
            lacking: {
                user: false,
                bot: false
            },
            toCheck: {
                required: {
                    user: permissionsUser ? permissionsUser.map((p) => toNormalPerm(p)) : [],
                    bot: permissionsBot ? permissionsBot.map((p) => toNormalPerm(p)) : []
                },
                suggested: {
                    user: suggestedPermissionsUser ? suggestedPermissionsUser.map((p) => toNormalPerm(p)) : [],
                    bot: suggestedPermissionsBot ? suggestedPermissionsBot.map((p) => toNormalPerm(p)) : []
                }
            },
            result: {
                required: {
                    user: [],
                    bot: []
                },
                suggested: {
                    user: [],
                    bot: []
                }
            }
        };

        const { userExempt, userOnly, botOnly, interaction, report } = additional ?? {};

        let fallBackMessageContent = '## Missing permissions!\n\n';
        let permissionsEmbed = new this.imports.discord.EmbedBuilder()
            .setColor(this.data.embedColor)
            .setTitle('Missing permissions!')
            .setFooter(this.data.footer);

        const me = message?.guild?.members?.me ?? null;

        const botBypass = me?.permissions?.has(this.imports.discord.PermissionFlagsBits.Administrator);
        const userBypass = message?.member?.permissions?.has(this.imports.discord.PermissionFlagsBits.Administrator);

        const voicePermissions = new Set([
            'Connect',
            'Speak',
            'Stream',
            'UseVAD',
            'UseVad',
            'PrioritySpeaker',
            'MuteMembers',
            'DeafenMembers',
            'MoveMembers',
            'RequestToSpeak'
        ]);

        const holds = (member, permission) => {
            const flag = this.imports.discord.PermissionFlagsBits[permission];

            if (!member || !flag) {
                return !flag;
            }

            const channel = voicePermissions.has(permission) ? voiceChannel : textChannel;

            return typeof channel?.permissionsFor === 'function'
                ? (channel.permissionsFor(member)?.has(flag) ?? false)
                : (member.permissions?.has(flag) ?? false);
        };

        if (permissionsUser && !userBypass && !botOnly) {
            for (const permission of realPermissions.toCheck.required.user) {
                if (!holds(message?.member, permission)) {
                    realPermissions.result.required.user.push(permission);
                }
            }
        }

        if (suggestedPermissionsUser && !userBypass && !botOnly) {
            for (const permission of realPermissions.toCheck.suggested.user) {
                if (!holds(message?.member, permission)) {
                    realPermissions.result.suggested.user.push(permission);
                }
            }
        }

        if (permissionsBot && !botBypass && !userOnly) {
            for (const permission of realPermissions.toCheck.required.bot) {
                if (!holds(me, permission)) {
                    realPermissions.result.required.bot.push(permission);
                }
            }
        }

        if (suggestedPermissionsBot && !botBypass && !userOnly) {
            for (const permission of realPermissions.toCheck.suggested.bot) {
                if (!holds(me, permission)) {
                    realPermissions.result.suggested.bot.push(permission);
                }
            }
        }

        realPermissions.lacking.bot = realPermissions.result.required.bot.length > 0;
        realPermissions.lacking.user = realPermissions.result.required.user.length > 0;

        const owner = this.isOwner(message?.author?.id);

        const bypassed = Boolean(userExempt || owner);

        if (report === false) {
            return (!realPermissions.lacking.user || bypassed) && !realPermissions.lacking.bot;
        }

        if (realPermissions.lacking.bot) {
            const missingPerms = `\`${realPermissions.result.required.bot.join('`, `')}\`.`;
            fallBackMessageContent += `**Missing permissions for Relaxy:**\n${missingPerms}\n\n`;
            permissionsEmbed.setThumbnail(
                this.user.displayAvatarURL({
                    dynamic: true,
                    size: 4096
                })
            );
            permissionsEmbed.addFields([
                {
                    name: 'Missing permissions for Relaxy:',
                    value: missingPerms
                }
            ]);
        }

        if (realPermissions.result.suggested.bot.length > 0) {
            const missingPerms = `\`${realPermissions.result.suggested.bot.join('`, `')}\`.`;
            fallBackMessageContent += `**Suggested permissions for Relaxy:**\n${missingPerms}\n\n`;
            permissionsEmbed.addFields([
                {
                    name: 'Suggested permissions for Relaxy:',
                    value: missingPerms
                }
            ]);
        }

        if (realPermissions.lacking.user && !bypassed) {
            const missingPerms = `\`${realPermissions.result.required.user.join('`, `')}\`.`;
            permissionsEmbed.setThumbnail(
                this.user.displayAvatarURL({
                    dynamic: true,
                    size: 4096
                })
            );
            fallBackMessageContent += `**You have missing permissions to use this command:**\n${missingPerms}\n\n`;
            permissionsEmbed.addFields([
                {
                    name: 'You have missing permissions to use this command:',
                    value: missingPerms
                }
            ]);
        }

        if (realPermissions.result.suggested.user.length > 0) {
            const missingPerms = `\`${realPermissions.result.suggested.user.join('`, `')}\`.`;
            fallBackMessageContent += `**You need those permissions for further functionality:**\n${missingPerms}\n\n`;
            permissionsEmbed.addFields([
                {
                    name: 'You need those permissions for further functionality:',
                    value: missingPerms
                }
            ]);
        }

        const noteExemption = bypassed && realPermissions.lacking.user && realPermissions.lacking.bot;

        if (noteExemption) {
            const note = owner
                ? "-# Your own missing permissions were skipped - you own Relaxy. Relaxy's are below, and those it cannot skip."
                : "-# Your own missing permissions were skipped - you are exempt here. Relaxy's are below, and those it cannot skip.";

            fallBackMessageContent += `${note}\n\n`;
            permissionsEmbed.setDescription(note);
        }

        if (realPermissions.lacking.bot || (realPermissions.lacking.user && !bypassed)) {
            if (interaction) {
                return [
                    this.send(1, null, {
                        default: [permissionsEmbed],
                        alternate: `${fallBackMessageContent}- non-embed fallback, enabling \`EmbedLinks\` for the bot is highly recommended.`
                    }),
                    realPermissions.lacking
                ];
            }

            this.send(message.channel, null, {
                default: [permissionsEmbed],
                alternate: `${fallBackMessageContent}- non-embed fallback, enabling \`EmbedLinks\` for the bot is highly recommended.`
            });
        }

        return realPermissions.lacking;
    }

    setActivity(text, type) {
        this.user.setActivity({
            name: text,
            type: this.imports.discord.ActivityType[type],
            shardId: this.data.id
        });
    }

    async setStatus(status, reclustering, boot = false) {
        this.log('Status updated.');

        status = status === operatingMode.SILENT ? operatingMode.NORMAL : status;

        if (this._trueRelaxy && !reclustering) {
            switch (status) {
                case operatingMode.SPECIAL:
                    void this.clog(relaxyLogs.SPECIAL, 'BACK ONLINE', 'good', null, { onlyMainShard: true });
                    status = operatingMode.NORMAL;
                    break;
                case operatingMode.NORMAL:
                    if (this.cluster instanceof RC_ClusterClient) {
                        this.cluster.maintenance = false;
                    }

                    if (!boot) {
                        void this.clog(relaxyLogs.NORMAL, 'NORMAL MODE', 'good', null, { onlyMainShard: true });
                    }

                    break;
                case operatingMode.DEBUG:
                    void this.clog(relaxyLogs.DEBUG, 'DEBUG MODE', null, null, { onlyMainShard: true });
                    break;
                case operatingMode.MAINTENANCE:
                    void this.clog(relaxyLogs.MAINTENANCE, 'MAINTENANCE MODE', 'bad', null, { onlyMainShard: true });
                    break;
                case operatingMode.OFFLINE:
                    void this.clog(relaxyLogs.OFFLINE, 'SHUTTING DOWN', 'bad', null, { onlyMainShard: true });
                    break;
            }
        }

        this.flags.logs.debug = [operatingMode.DEBUG, operatingMode.MAINTENANCE].includes(status);
        this.data.status = status;
    }

    async getUser(userId) {
        const cached = this.users.cache.get(userId);

        if (cached) {
            return cached;
        }

        try {
            return await this.users.fetch(userId, {
                cache: true,
                limit: 1
            });
        } catch {
            return null;
        }
    }

    async getMember(guild, userId) {
        if (!guild || !userId) {
            return null;
        }

        userId = userId.toString();

        const cached = guild.members.cache.get(userId);
        if (cached) {
            return cached;
        }

        try {
            const member = await guild.members.fetch(userId, { cached: true });

            if (member instanceof Discord.Collection) {
                return member.first();
            }

            return member;
        } catch {
            return null;
        }
    }

    async getMessage(channel, messageID, starter) {
        if ((messageID !== null && starter) || !channel) {
            return null;
        }

        const cached = channel.messages.cache.get(messageID) || this.collections.starterMessages.get(channel.id);
        if (cached) {
            return cached;
        }

        try {
            if (starter) {
                const message = await channel.fetchStarterMessage();

                this.collections.starterMessages.set(channel.id, message);

                return message;
            }

            const messages = await channel.messages.fetch(messageID, {
                cache: false,
                limit: 1
            });

            if (messages instanceof Discord.Collection) {
                return messages.first();
            }

            return messages;
        } catch (error) {
            if (this.flags.logs.swallowed) {
                this.log(
                    'DEBUG',
                    `getMessage: ${channel?.id}/${messageID ?? 'starter'} could not be fetched (${error?.message ?? error}).`
                );
            }

            return null;
        }
    }

    async getForum(channelId, guildId) {
        const cached = this.collections.forums.find((f) => f.id === channelId);

        if (cached) {
            return cached;
        }

        const forum = await this.module.database.findForumChannel(channelId, guildId);
        this.collections.forums.set(channelId, forum);

        return forum;
    }

    async respond(message, destination, options) {
        return this.module.quickResponseHandler.handle(message, destination, options);
    }

    swallow(context) {
        return (error) => {
            this.data.swallowed = (this.data.swallowed ?? 0) + 1;

            if (this.flags.logs.swallowed) {
                this.log('DEBUG', `[swallowed] ${context}:`, error?.stack ?? error?.message ?? error);
            }

            return undefined;
        };
    }

    async waiting(message, interaction, options = {}) {
        const embed = (extra) => [
            {
                color: this.data.embedColor,
                title: options.title ?? 'Working on it...',
                description: extra ?? options.description ?? 'This may take a moment.',
                thumbnail: { url: this.cdn.loading }
            }
        ];

        if (interaction) {
            const show = (payload) =>
                interaction.deferred || interaction.replied
                    ? interaction.editReply(payload)
                    : interaction.reply(payload);

            await show({ embeds: embed() }).catch(this.swallow('waiting: initial interaction reply'));

            return {
                update: async (text) =>
                    void (await interaction.editReply({ embeds: embed(text) }).catch(this.swallow('waiting: update'))),

                finish: async (content, embeds, files) =>
                    interaction
                        .editReply({
                            content: content ?? null,
                            embeds: embeds ?? [],
                            files: files ?? []
                        })
                        .catch(this.swallow('waiting: finish')),

                dismiss: async () => void 0
            };
        }

        const placeholder = await this.send(message.channel, null, embed()).catch(
            this.swallow('waiting: initial channel send')
        );

        return {
            update: async (text) => {
                if (placeholder) {
                    await this.edit(placeholder, null, embed(text)).catch(this.swallow('waiting: update'));
                }
            },

            finish: async (content, embeds, files) => {
                if (!placeholder) {
                    return this.send(message.channel, content ?? null, embeds ?? [], files ?? []);
                }

                return this.edit(placeholder, content ?? null, embeds ?? [], files ?? []).catch(
                    this.swallow('waiting: finish')
                );
            },

            dismiss: async () => {
                await placeholder?.delete?.().catch(this.swallow('waiting: dismiss'));
            }
        };
    }

    async censored(input, guild, message) {
        if (!guild || input === undefined || input === null) {
            return false;
        }

        const args = (Array.isArray(input) ? input : String(input).split(/\s+/))
            .filter((word) => word !== undefined && word !== null && word !== '')
            .map((word) => String(word));

        if (!args.length) {
            return false;
        }

        try {
            return Boolean(
                await this.utils.censorCheck(args, guild, message?.guild ?? null, false, false, false, message)
            );
        } catch (error) {
            this.data.errors++;
            this.log('ERROR', error);

            return true;
        }
    }

    async redact(input, guild, message, replacement = REDACTED_INPUT) {
        if (await this.censored(input, guild, message)) {
            return replacement;
        }

        return Array.isArray(input) ? input.join(' ') : input;
    }

    qEmbed(text, destination, overwrites) {
        const resolved = QUICK_EMBED_KEYS[text] ?? text;
        const content = resolved.startsWith('_ ') ? resolved.slice(2) : resolved;
        const description =
            content.includes('*') || content.includes('[') || content.includes('(') ? content : `**${content}**`;

        const embed = overwrites
            ? Object.assign(
                  {
                      color: QUICK_EMBED_COLOR,
                      description
                  },
                  overwrites
              )
            : {
                  color: QUICK_EMBED_COLOR,
                  description
              };

        if (typeof destination !== 'object' || destination === null) {
            return embed;
        }

        if (typeof destination.deletable !== 'boolean') {
            return { embeds: [embed] };
        }

        return destination.guild.members.me.permissions.has(Discord.PermissionFlagsBits.EmbedLinks)
            ? this.send(destination.channel, null, [embed])
            : this.send(destination.channel, description);
    }

    async delete(item, reason) {
        if (!item) {
            return false;
        }

        if (item instanceof Discord.Message || (item?.author && item?.channel)) {
            item = await this.getMessage(this.channels.cache.get(item.channelId), item.id);

            if (!item || item?.channel?.archived) {
                return false;
            }

            if (item.deletable) {
                try {
                    await item?.delete(reason);
                } catch (e) {
                    return false;
                }

                return true;
            }
        } else if (
            item instanceof Discord.InteractionResponse ||
            item instanceof Discord.BaseChannel ||
            item instanceof Discord.ThreadChannel
        ) {
            try {
                await item?.delete(reason);
            } catch (e) {
                return false;
            }

            return true;
        }

        throw new Error('Item is not an instance of a deletable object!');
    }

    flattenToText(messageOptions) {
        const lines = [];

        if (messageOptions?.content) {
            lines.push(messageOptions.content);
        }

        for (const raw of messageOptions?.embeds ?? []) {
            const embed = raw?.data ?? raw ?? {};

            if (embed.title) {
                lines.push(`**${embed.title}**`);
            }

            if (embed.description) {
                lines.push(embed.description);
            }

            for (const field of embed.fields ?? []) {
                lines.push(`**${field.name}**\n${field.value}`);
            }

            for (const url of [embed.image?.url, embed.thumbnail?.url]) {
                if (typeof url === 'string' && /^https?:/i.test(url)) {
                    lines.push(url);
                }
            }
        }

        const text = lines.filter(Boolean).join('\n\n').trim();

        if (!text) {
            return null;
        }

        return `${text.slice(0, 1900)}\n\n-# Relaxy is missing \`Embed Links\` / \`Attach Files\` here - this is a plain-text fallback.`;
    }

    async send(channel, ...content) {
        if (!channel || !content || content.length === 0) {
            this.log(channel, content);

            throw new Error('Invalid channel or content');
        }

        const interactionMode = channel instanceof Discord.BaseInteraction || typeof channel === 'number';

        if (
            !((channel.id && channel instanceof Discord.BaseChannel) || channel instanceof Discord.User) &&
            !interactionMode
        ) {
            throw new Error(
                'The channel argument is not an instance of Discord.BaseChannel, its derivative, Discord.User or a number (interaction object).'
            );
        }

        const noRateLimiterEntry = content.find((i) => i === 'noRateLimiterEntry');

        const permissionsHere = (() => {
            const self = channel?.guild?.members?.me;

            if (!self) {
                return null;
            }

            return typeof channel.permissionsFor === 'function'
                ? (channel.permissionsFor(self) ?? self.permissions)
                : self.permissions;
        })();

        const hasLinkPermission = permissionsHere ? permissionsHere.has(Discord.PermissionFlagsBits.EmbedLinks) : true;

        const hasFilePermission = permissionsHere ? permissionsHere.has(Discord.PermissionFlagsBits.AttachFiles) : true;

        const messageOptions = {
            content:
                !hasLinkPermission && content[1]
                    ? Array.isArray(content[1])
                        ? null
                        : content[1].alternate
                    : (content[0] ?? null),

            embeds: content[1]
                ? hasLinkPermission || (channel === 1 && interactionMode)
                    ? Array.isArray(content[1])
                        ? content[1]
                        : content[1].default
                    : Array.isArray(content[1])
                      ? content[1]
                      : []
                : [],

            files: hasFilePermission ? (content[2] ?? []) : [],

            stickers: content[3] ?? [],
            components: content[4] ?? []
        };

        const badMedia = (() => {
            const isBad = (v) => typeof v === 'string' && v.length > 0 && !/^(https?:|attachment:|data:)/i.test(v);

            for (const raw of messageOptions.embeds ?? []) {
                const e = raw?.data ?? raw ?? {};

                for (const [field, value] of [
                    ['author icon', e.author?.icon_url ?? e.author?.iconURL],
                    ['footer icon', e.footer?.icon_url ?? e.footer?.iconURL],
                    ['thumbnail', e.thumbnail?.url],
                    ['image', e.image?.url]
                ]) {
                    if (isBad(value)) {
                        return {
                            field,
                            value
                        };
                    }
                }
            }

            return null;
        })();

        if (badMedia) {
            this.log('WARN', `Blocked send with invalid embed ${badMedia.field} URL: "${badMedia.value}"`);

            messageOptions.content = null;
            messageOptions.files = [];
            messageOptions.components = [];
            messageOptions.embeds = [
                {
                    color: 16711680,
                    title: 'Invalid image reference',
                    description: `\`${String(badMedia.value).slice(0, 100)}\` isn't a valid URL for the embed **${badMedia.field}**.\n\nA saved file (from \`=save\`) can't be dropped straight in there - only a direct \`https://\` link works for an **${badMedia.field}**. Saved server images are attached automatically for an embed **thumbnail** or **image**; an author/footer icon needs a real URL.`
                }
            ];
        }

        if (interactionMode) {
            return messageOptions;
        }

        const deliver = async () => {
            try {
                return await channel.send(messageOptions);
            } catch (error) {
                if (error?.message?.includes('stat')) {
                    return null;
                }

                if (isGone(error)) {
                    return null;
                }

                const code = error?.code;
                const refused = code === 50013 || code === 50001;
                const carriedRichContent =
                    (messageOptions.embeds?.length ?? 0) > 0 ||
                    (messageOptions.files?.length ?? 0) > 0 ||
                    (messageOptions.components?.length ?? 0) > 0 ||
                    (messageOptions.stickers?.length ?? 0) > 0;

                if (refused && carriedRichContent) {
                    const flattened = this.flattenToText(messageOptions);

                    if (flattened) {
                        const retried = await channel.send({ content: flattened }).catch(() => null);

                        if (retried) {
                            this.log(
                                'WARN',
                                `Missing embed/file permissions in #${channel?.name ?? channel?.id} (${channel?.guild?.name ?? 'DM'}); sent a plain-text fallback instead.`
                            );
                            return retried;
                        }
                    }
                }

                if (channel instanceof Discord.User) {
                    return null;
                }

                this.data.errors++;

                this.log(
                    'ERROR',
                    refused
                        ? `Cannot send to #${channel?.name ?? channel?.id} in "${channel?.guild?.name ?? 'unknown guild'}": Relaxy is missing permissions there (${code}). Message dropped.`
                        : error
                );

                if (refused && channel?.guild) {
                    this.core
                        ?.notifyMissingPermissions?.(channel.guild, {
                            channel,
                            what: 'to post a message'
                        })
                        .catch(this.swallow('send: permission notice'));
                }

                return null;
            }
        };

        const promiseFunc = () => {
            return deliver();
        };

        if (noRateLimiterEntry) {
            return promiseFunc;
        }

        if (!content.find((i) => i === 0b1111011_11010) && !this.collections.ratelimitHits[channel.id]) {
            return await deliver();
        }

        const route = `messages/send/channelName_${
            channel instanceof Discord.User ? channel.username : channel.name
        }:${channel.id}`;

        const eventId = this.module.rl.handleEvent(route, promiseFunc, 1100, {
            emptyCountThreshold: 10,
            guildSize: channel?.guild?.memberCount ?? 1
        });

        const messageOptionKeys = Object.keys(messageOptions);
        return await this.module.rl.getResult(
            route,
            eventId,
            (messageOptionKeys.length - (messageOptionKeys.length === 1 && messageOptions.content)) / 2
        );
    }

    async edit(message, ...content) {
        if (!message || !content || content.length === 0) {
            throw new Error('Invalid message or content');
        }

        if (!(message instanceof Discord.Message)) {
            throw new Error('Provided message must be an instance of Discord.Message or its derivative.');
        }

        const messageOptions = {
            content: content[0] ?? null,
            embeds: content[1] ?? [],
            files: content[2] ?? [],
            components: content[3] ?? []
        };

        const route = `messages/edit/${message.id}`;
        const promiseFunc = () => {
            return new Promise(async (resolve, reject) => {
                try {
                    if (!message) {
                        resolve(null);
                    }

                    const msg = await message.edit(messageOptions);
                    resolve(msg);
                } catch (error) {
                    if (isGone(error)) {
                        resolve(null);

                        return;
                    }

                    reject(error);
                }
            });
        };

        const eventId = this.module.rl.handleEvent(route, promiseFunc, 1500, {
            guildSize: message?.guild?.memberCount ?? 1
        });

        const messageOptionKeys = Object.keys(messageOptions);
        return await this.module.rl.getResult(
            route,
            eventId,
            (messageOptionKeys.length - (messageOptionKeys.length === 1 && messageOptions.content)) / 2
        );
    }

    async update(interaction, ...content) {
        if (!interaction || !content || content.length === 0) {
            throw new Error('Invalid message or content');
        }

        if (!(interaction instanceof Discord.BaseInteraction)) {
            throw new Error('Provided main argument must be an instance of Discord.BaseInteraction or its derivative.');
        }

        const messageOptions = {
            content: content[0] ?? null,
            embeds: content[1] ?? [],
            files: content[2] ?? [],
            stickers: content[3] ?? [],
            components: content[4] ?? []
        };

        const route = `interactions/messages/edit/${interaction.id}`;
        const promiseFunc = () => {
            return new Promise(async (resolve, reject) => {
                try {
                    if (!interaction?.message) {
                        resolve(null);
                    }

                    const update = await interaction.update(messageOptions);
                    resolve(update);
                } catch (error) {
                    if (error.message.includes('Unknown')) {
                        resolve(null);
                    }

                    reject(error);
                }
            });
        };

        const eventId = this.module.rl.handleEvent(route, promiseFunc, 1100, {
            guildSize: interaction?.guild?.memberCount ?? 1
        });

        const messageOptionKeys = Object.keys(messageOptions);
        return await this.module.rl.getResult(
            route,
            eventId,
            messageOptionKeys.length - (messageOptionKeys.length === 1 && messageOptions.content)
        );
    }

    async react(message, ...emojis) {
        if (Array.isArray(emojis[0])) {
            emojis = [...emojis[0]];
        }

        const reactFunctions = emojis.map((emoji) => {
            return () => {
                return new Promise(async (resolve, reject) => {
                    try {
                        if (!message) {
                            resolve(null);
                        }

                        const reaction = await message.react(emoji);
                        resolve(reaction);
                    } catch (error) {
                        if (isGone(error)) {
                            resolve(null);

                            return;
                        }

                        reject(error);
                    }
                });
            };
        });

        const results = reactFunctions.map((reactFunc) => {
            const eventId = this.module.rl.handleEvent(`reaction/emojis/add/${message.id}`, reactFunc, 800, {
                guildSize: message.guild.memberCount
            });

            return this.module.rl.getResult(`reaction/emojis/add/${message.id}`, eventId, emojis.length);
        });

        return Promise.allSettled(results);
    }

    async unreact(message, ...emojis) {
        if (Array.isArray(emojis[0])) {
            emojis = [...emojis[0]];
        }

        const unreactFunctions = emojis.map((emoji) => {
            return () => {
                return new Promise(async (resolve, reject) => {
                    try {
                        if (!message) {
                            resolve(null);
                        }

                        const reaction = message.reactions.resolve(emoji);
                        const uneaction = await reaction?.remove();
                        resolve(uneaction);
                    } catch (error) {
                        reject(error);
                    }
                });
            };
        });

        return Promise.allSettled(
            unreactFunctions.map((unreactFunc) => {
                const eventId = this.module.rl.handleEvent(`reaction/emojis/remove/${message.id}`, unreactFunc, 800, {
                    guildSize: message.guild.memberCount
                });

                return this.module.rl.getResult(`reaction/emojis/remove/${message.id}`, eventId, emojis.length);
            })
        );
    }

    async removeReaction(...reactions) {
        if (Array.isArray(reactions[0])) {
            reactions = [...reactions[0]];
        }

        const unreactFunctions = reactions.map((reaction) => {
            return () => {
                return new Promise(async (resolve, reject) => {
                    try {
                        if (!reaction.message) {
                            resolve(null);
                        }

                        const uneaction = await reaction.remove();
                        resolve(uneaction);
                    } catch (error) {
                        reject(error);
                    }
                });
            };
        });

        return Promise.allSettled(
            unreactFunctions.map((unreactFunc) => {
                const eventId = this.module.rl.handleEvent(
                    `reaction/remove/${reactions[0].message.id}`,
                    unreactFunc,
                    800,
                    {
                        guildSize: reactions[0].message.guild.memberCount
                    }
                );

                return this.module.rl.getResult(
                    `reaction/remove/${reactions[0].message.id}`,
                    eventId,
                    reactions.length
                );
            })
        );
    }

    assembleModal(title, customId, ...components) {
        if (typeof title !== 'string') {
            throw new Error('The *title* must be string!');
        }

        if (typeof customId !== 'string') {
            throw new Error('The *customId* must be string!');
        }

        const modal = new Discord.ModalBuilder().setTitle(title).setCustomId(customId);

        const actionRows = [];

        let i = 0;
        for (const component of components) {
            if (!(component instanceof Discord.TextInputBuilder)) {
                throw new Error(`Component #${i} is not an instance of Discord.TextInputBuilder`);
            }

            actionRows.push(new Discord.ActionRowBuilder().addComponents(component));
            i++;
        }

        modal.addComponents(...actionRows);

        return modal;
    }
}
