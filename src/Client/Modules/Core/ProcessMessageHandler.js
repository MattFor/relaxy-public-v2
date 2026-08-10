'use strict';

import Fuse                      from 'fuse.js';
import Relaxy                    from '../../Relaxy.js';
import {
    messageType,
    logChannels
}                                from '../../../Core/DataTable.js';
import { explainHotReloadLimit } from '../../../Core/ModuleLoader.js';
import { IS_WINDOWS }            from '../../../../detect_os.js';

const RECLUSTER_CLOG_ATTEMPTS = 10;
const RECLUSTER_CLOG_RETRY_MS = 500;
const CHANGE_PAST_TENSE = {
    add:    'Added',
    update: 'Updated',
    delete: 'Deleted'
};

const CHANGE_CLOG_COLOR = {
    add:    'good',
    update: null,
    delete: 'bad'
};

const cacheBuster = () =>
{
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';

    for (let i = 0; i < 20; i++)
    {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return result;
};

export default class ProcessMessageHandler
{
    constructor(client)
    {
        this.client = client;
    }

    _formatBytes(bytes)
    {
        if (!bytes)
        {
            return '0 B';
        }

        const units = [
            'B',
            'KB',
            'MB',
            'GB'
        ];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, i);

        return `${i === 0
            ? value
            : value.toFixed(2)} ${units[i]}`;
    }

    _formatStats(stats)
    {
        if (!stats || typeof stats !== 'object')
        {
            return '';
        }

        if (!stats.hadBaseline)
        {
            return `\n\n\`${stats.linesAfter}\` lines · \`${this._formatBytes(stats.bytesAfter)}\`\n_(no prior snapshot - diff unavailable for this first change)_`;
        }

        const byteDelta = stats.bytesAfter - stats.bytesBefore;
        const netSign = stats.net > 0
            ? '+'
            : '';
        const byteSign = byteDelta >= 0
            ? '+'
            : '-';

        return `\n\n\`+${stats.added}\` added / \`-${stats.removed}\` removed · net \`${netSign}${stats.net}\` lines` + `\n\`${stats.linesAfter}\` lines total · \`${this._formatBytes(stats.bytesAfter)}\` (\`${byteSign}${this._formatBytes(Math.abs(byteDelta))}\`)`;
    }

    async process(message)
    {
        if (this.client.flags.logs.inter_process_messages)
        {
            this.client.log(message);
        }

        switch (message._type)
        {
            case messageType.CLIENT_CORE_CHANGED:
            {
                if (!this.client._trueRelaxy)
                {
                    return;
                }

                await this.client.clog(`${this.client.utils.firstLetterUp(message.data.name)}.js has been updated!\nA core part of Relaxy has been changed. [ADSR] hotswap finished.${this._formatStats(message.data.stats)}`, 'CLIENT CORE PART: [HOT RELOAD]', 'good');
                return this.client.cluster.send({ _type: messageType.CLIENT_CORE_CHANGED });
            }

            case messageType.MANAGER_RECLUSTER_START:
            {

                if (!this.client._trueRelaxy)
                {
                    return;
                }

                return void this.client.clog('Bet you won\'t even notice.', '[↻ - ReClustering] - Initiating', null, null, { color: 0 });
            }

            case messageType.MANAGER_RECLUSTER_FINISHED:
            {

                const info = typeof message.data === 'object' && message.data !== null
                    ? message.data
                    : { start: message.data };

                const fleet = info.totalClusters != null
                    ? `\nFleet: **\`${info.totalClusters}\`** cluster(s) · **\`${info.totalShards}\`** shard(s) · True Relaxy on cluster **\`#${info.clusterId}\`**`
                    : '';

                for (let attempt = 0; attempt < RECLUSTER_CLOG_ATTEMPTS; attempt++)
                {
                    if (this.client.isReady() && this.client.channels)
                    {
                        break;
                    }

                    await new Promise(resolve => setTimeout(resolve, RECLUSTER_CLOG_RETRY_MS));
                }

                const posted = await this.client.clog(`Reclustering lasted: **\`${this.client.imports.time(Date.now() - info.start)}\`**${fleet}\nIt is now safe to use Relaxy!`, '[↻ - ReClustering] - Completed', null, null, { color: 0 })
                                         .catch(error =>
                                         {
                                             this.client.log('ERROR', 'Recluster completion report threw:', error);

                                             return null;
                                         });

                if (!posted)
                {
                    this.client.log('ERROR', 'Recluster completion report could NOT be posted to #relaxy-log.');
                }

                return void this.client.cluster.send({
                    _type: messageType.MANAGER_RECLUSTER_ACK,
                    data:  {
                        posted:    Boolean(posted),
                        clusterId: this.client.cluster?.id ?? null
                    }
                }).catch(() =>
                {

                    this.client.log('WARN', 'Could not acknowledge the recluster report to the manager.');
                });
            }

            case messageType.MANAGER_DELIVER:
            {
                switch (message.variant)
                {
                    case 'rr':
                    {
                        return this.client.module.relaxyRequestManager.Receive(message.data);
                    }

                    case 'rr_over':
                    {
                        return this.client.send(this.client.users.cache.get(this.client.config.keys.owner), message.data);
                    }

                    default:
                    {
                        return;
                    }
                }
            }

            case messageType.CLIENT_SET:
            {
                switch (message.variant)
                {
                    case 'steam_names':
                    {
                        this.client.data.steamNames = true;
                        this.client.log('Steam names received.');

                        this.client.caches.steamAppNames = message.data.applist.apps;
                        return this.client.caches.steamAppNamesFused = new Fuse(this.client.caches.steamAppNames, {
                            keys:         ['name'],
                            includeScore: true
                        });
                    }

                    default:
                    {
                        return;
                    }
                }
            }

            case messageType.CLIENT_PROCESS_SPAWNED:
            {
                this.client.data.ready = true;
                return this.client.startUp(message.data);
            }

            case messageType.CLIENT_SHOW:
            {
                switch (message.variant)
                {
                    case 'cpusage':
                    {
                        return this.client.module.processEventManager.startProfiling(true);
                    }

                    case 'owners':
                    {
                        return this.client.guilds.cache.forEach(async guild => this.client.log(`\n${guild.name} - ${this.client.utils.tag((await guild.fetchOwner())?.user)} - ${guild.ownerId}`));
                    }

                    case 'music_dependencies':
                    {
                        return this.client.log(this.client.player.scanDeps());
                    }

                    case 'servers':
                    {
                        let index = 0;
                        return this.client.log(`\nNumber of this shard"s servers: ${this.client.guilds.cache.size}\n${this.client.guilds.cache.sort((g1, g2) => g2.createdTimestamp - g1.createdTimestamp).map(guild => `${++index}. ${guild.name} - [${guild.id}] - (${guild.memberCount}) - ${guild.ownerId}`).join('\n')}`);
                    }

                    default:
                    {
                        return;
                    }
                }
            }

            case messageType.CLIENT_DELETE:
            {
                switch (message.variant)
                {
                    case 'slash':
                    {
                        return this.client.deleteSlashCommands();
                    }

                    default:
                    {
                        return;
                    }
                }
            }

            case messageType.CLIENT_CREATE:
            {
                switch (message.variant)
                {
                    case 'slash':
                    {
                        return this.client.createSlashCommands();
                    }

                    default:
                    {
                        return;
                    }
                }
            }

            case messageType.CLIENT_TOGGLE:
            {

                if (message.variant === 'all')
                {
                    for (const channel of Object.keys(logChannels))
                    {
                        this.client.flags.logs[channel] = message.data;
                    }

                    return this.client.log(`All log channels turned ${message.data
                        ? 'ON!'
                        : 'OFF!'}`);
                }

                if (Object.prototype.hasOwnProperty.call(logChannels, message.variant))
                {
                    const value = typeof message.data === 'boolean'
                        ? message.data
                        : !this.client.flags.logs[message.variant];

                    this.client.flags.logs[message.variant] = value;

                    return this.client.log(`${logChannels[message.variant].description} logging turned ${value
                        ? 'ON!'
                        : 'OFF!'}`);
                }

                switch (message.variant)
                {
                    case 'low_performance':
                    {
                        this.client.log(`Low Performance mode turned ${!message.data
                            ? 'OFF!'
                            : 'ON!'}`);
                        return this.client.flags.low_performance = message.data;
                    }

                    default:
                    {
                        return;
                    }
                }
            }

            case messageType.CLIENT_UPDATE:
            {
                switch (message.variant)
                {
                    case 'version':
                    {
                        const previous = this.client.config.keys.version;

                        if (this.client._trueRelaxy)
                        {
                            this.client.clog(`**${previous} -> ${message.data}**`, 'VERSION UPDATE', 'good');
                        }

                        this.client.config.keys.version = message.data;

                        return this.client.log('INFO', `Version updated: ${previous} -> ${message.data}`);
                    }

                    case 'settings':
                    {
                        if (!message.data)
                        {
                            return;
                        }

                        this.client.applySettings(message.data);

                        return this.client.log('INFO', `Settings synced from the database (version: ${message.data.version}).`);
                    }

                    case 'owners':
                    {
                        if (!Array.isArray(message.data) || message.data.length === 0)
                        {
                            return this.client.log('WARN', 'Ignoring an empty owner list broadcast.');
                        }

                        this.client.config.keys.owners = message.data;

                        if (this.client._trueRelaxy)
                        {
                            this.client.clog(`**${message.data.join(', ')}**`, 'OWNERS UPDATE', 'good');
                        }

                        return this.client.log('INFO', `Owners updated: ${message.data.join(', ')}`);
                    }

                    case 'status':
                    {
                        if (message.data === null)
                        {
                            this.client.log('INFO',
                                `Turning status refreshing ${this.client.data.refreshStatus
                                    ? 'OFF'
                                    : 'ON'}`);
                            return this.client.data.refreshStatus = !this.client.data.refreshStatus;
                        }

                        return this.client.setStatus(message.data);
                    }

                    case 'cookie':
                    {

                        this.client.config.keys.youtubeCookie = message.data || '';

                        return this.client.log('INFO',
                            `Shared YouTube cookie ${message.data
                                ? 'updated'
                                : 'cleared'}.`);
                    }

                    default:
                    {
                        return;
                    }
                }
            }

            case messageType.CLIENT_RESPONSE:
            {
                switch (message.variant)
                {
                    case 'rr_processed':
                    {
                        const user = this.client.users.cache.get(message.data.authorId);
                        const hasImage = message.data?.attachment?.contentType?.includes('image');

                        return this.client.send(user,
                                       `Hey **${user}** your request [ID: \`#${message.data.index}\`] has been ${message.data.accepted
                                           ? '**ACCEPTED!**'
                                           : '**REJECTED!**'}`,
                                       [
                                           {
                                               color:       this.client.data.embedColor,
                                               title:       'Response:',
                                               description: `${message.data.reason}\n\n[Click here to go to the request.](${message.data.url})`,
                                               footer:      this.client.data.footer,
                                               image:       {
                                                   url: hasImage
                                                            ? message.data?.attachment?.url
                                                            : null
                                               }
                                           }
                                       ],
                                       hasImage
                                           ? []
                                           : [message.data.attachment])
                                   .then(() => this.client.cluster.send({
                                       _type:   messageType.CLIENT_RESPONSE,
                                       variant: 'rr_over',
                                       data:    `SUCCESS! request \`#${message.data.index}\` has been sent through!`
                                   }))
                                   .catch(() => this.client.cluster.send({
                                       _type:   messageType.CLIENT_RESPONSE,
                                       variant: 'rr_over',
                                       data:    `ERROR request \`#${message.data.index}\` has failed!`
                                   }));
                    }

                    default:
                    {
                        return;
                    }
                }
            }

            case messageType.CLIENT_COMMAND_CHANGE:
            {

                const operation = message.variant;
                const commandName = message.data.name;

                try
                {
                    const splitChar = IS_WINDOWS
                        ? '\\'
                        : '/';
                    const segments = message.data.path.split(splitChar);
                    const cmdDir = segments[segments.length - 2];

                    for (const dir of await this.client.readDir('./bot/commands'))
                    {
                        if (dir !== cmdDir)
                        {
                            continue;
                        }

                        for (const file of await this.client.readDir(`./bot/commands/${dir}`))
                        {
                            if (file.split('.')[0].toLowerCase() !== commandName)
                            {
                                continue;
                            }

                            await new Promise(resolve => setTimeout(resolve, 1000));

                            const command = (await import(`../../../bot/commands/${cmdDir}/${file}?v=${cacheBuster()}`)).default;

                            if (operation === 'delete')
                            {
                                command.aliases?.forEach(alias => this.client.collections.aliases.delete(alias));

                                if (command.slash)
                                {
                                    this.client.collections.interactionCommands.delete(command.name);

                                    if (this.client._trueRelaxy)
                                    {
                                        this.client.data.slashCommands = this.client.data.slashCommands.filter(c => c.name !== command.name);
                                    }
                                }

                                this.client.collections.commands.delete(command.name.toLowerCase());
                            }
                            else
                            {
                                command.aliases?.forEach(alias => this.client.collections.aliases.set(alias, command));

                                if (command.slash)
                                {
                                    this.client.collections.interactionCommands.set(command.name, command);

                                    if (this.client._trueRelaxy)
                                    {
                                        this.client.data.slashCommands = this.client.data.slashCommands.filter(c => c.name !== command.name);
                                        this.client.data.slashCommands.push(command);
                                    }
                                }

                                this.client.collections.commands.set(command.name.toLowerCase(), command);
                            }
                        }
                    }

                    if (this.client._trueRelaxy)
                    {
                        this.client.clog(`${this.client.utils.firstLetterUp(commandName)} has just been ${CHANGE_PAST_TENSE[operation].toLowerCase()}!\nCategory: \`${cmdDir}\`${this._formatStats(message.data.stats)}`,
                            'COMMAND: [HOT RELOAD]',
                            CHANGE_CLOG_COLOR[operation],
                            null,
                            cmdDir === 'administrator'
                                ? {
                                    title: '[OWNER] ',
                                    color: 6750207
                                }
                                : null);
                    }

                    return this.client.hotReloadLog(`${CHANGE_PAST_TENSE[operation]} ${commandName} successfully!`);
                }
                catch
                {
                    return this.client.hotReloadLog(`${commandName} ${operation.toUpperCase()} ERROR!`, 'error');
                }
            }

            case messageType.CLIENT_EVENT_CHANGE:
            {

                const operation = message.variant;

                let eventName = '';

                try
                {
                    const splitChar = IS_WINDOWS
                        ? '\\'
                        : '/';
                    const pathSegments = message.data.path.split(splitChar);
                    const botIndex = pathSegments.lastIndexOf('bot');

                    if (botIndex === -1 || pathSegments.length < botIndex + 3)
                    {
                        throw new Error(`Invalid event file path structure: ${message.data.path}`);
                    }

                    const eventType = pathSegments[botIndex + 2];
                    eventName = pathSegments[pathSegments.length - 1].split('.')[0];

                    const oldEventData = this.client.collections.events.get(eventName);

                    if (oldEventData?.listenerFunction)
                    {
                        if (oldEventData.type === 'discord')
                        {
                            this.client.off(eventName, oldEventData.listenerFunction);
                        }
                        else
                        {
                            this.client.player.events.off(eventName, oldEventData.listenerFunction);
                        }

                        this.client.collections.events.delete(eventName);
                    }

                    if (operation === 'delete')
                    {
                        if (this.client._trueRelaxy)
                        {
                            this.client.clog(`${this.client.utils.firstLetterUp(eventName)} has just been Deleted!${this._formatStats(message.data.stats)}`, 'EVENT: [HOT RELOAD]', 'bad');
                        }

                        return this.client.hotReloadLog(`Deleted event "${eventName}" successfully!`);
                    }

                    const newEventModule = (await import(`../../../${pathSegments.slice(botIndex).join(splitChar)}?v=${cacheBuster()}`)).default;

                    let newListenerFunction = null;

                    switch (eventType)
                    {
                        case 'discord':
                        {
                            if (['clientReady'].includes(eventName))
                            {
                                return this.client.hotReloadLog(`"${eventName}" is a "once" event, skipping dynamic re-registration.`, 'data');
                            }

                            newListenerFunction = async (...args) =>
                            {
                                if (eventName !== 'raw' && this.client.flags.logs.event_names)
                                {
                                    this.client.print(eventName + '\n');
                                }

                                this.client.module?.stats?.count(`event.${eventName}`);

                                this.client.garbageCollector.handle(eventName, ...args);

                                return newEventModule.run(this.client, ...args);
                            };

                            this.client.on(eventName, newListenerFunction);
                        }
                            break;

                        case 'music':
                        {
                            newListenerFunction = (...args) => newEventModule(this.client, ...args);
                            this.client.player.events.on(eventName, newListenerFunction);
                        }
                            break;

                        default:
                        {
                            return this.client.hotReloadLog(`Unknown event type "${eventType}" during reload.`, 'error');
                        }
                    }

                    this.client.collections.events.set(eventName, {
                        moduleExport:     newEventModule,
                        listenerFunction: newListenerFunction,
                        type:             eventType
                    });

                    if (this.client._trueRelaxy)
                    {
                        this.client.clog(`${this.client.utils.firstLetterUp(eventName)} has just been ${CHANGE_PAST_TENSE[operation]}!\nType: \`${eventType}\`${this._formatStats(message.data.stats)}`, 'EVENT: [HOT RELOAD]', CHANGE_CLOG_COLOR[operation]);
                    }

                    return this.client.hotReloadLog(`${CHANGE_PAST_TENSE[operation]} event "${eventName}" successfully!`);
                }
                catch (e)
                {

                    const limitation = explainHotReloadLimit(e);

                    if (limitation)
                    {
                        return this.client.hotReloadLog(`Event "${eventName}" not reloaded.\n${limitation}`, 'warn');
                    }

                    return this.client.hotReloadLog(`${operation.toUpperCase()} event "${eventName}" REQUEST FAILURE!\n${e?.stack ?? e?.message ?? e}`, 'error');
                }
            }

            default:
            {
                return;
            }
        }
    }
}
