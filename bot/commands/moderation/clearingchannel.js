'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export const MIN_CLEAR_MS = 60 * 1000;
export const DEFAULT_CLEAR_MS = 3 * 60 * 1000;
export const normalizeClearEntry = entry => typeof entry === 'string'
    ? {
        id:       entry,
        interval: DEFAULT_CLEAR_MS
    }
    : {
        id:       entry.id,
        interval: Math.max(MIN_CLEAR_MS, Number(entry.interval) || DEFAULT_CLEAR_MS)
    };

export default {
    name:        'clearingchannel',
    usage:       '=clearingchannel [show | stop <channels> | <channels> [time] | <time>]',
    description: 'Manage auto-clearing channels.\n`=clearingchannel` - create a new channel cleared every 3 minutes.\n`=clearingchannel 10m` - create one cleared every 10 minutes.\n`=clearingchannel #a` - show how often #a is cleared, or start clearing it if it is not.\n`=clearingchannel #a #b 1h` - set those channels to clear every hour.\n`=clearingchannel stop #a` - stop clearing that channel.\n`=clearingchannel show` - list clearing channels and their timings.\nThe smallest timing is 1 minute.',

    cooldown: 5,

    permissionsUser:         [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES',
        'MANAGE_CHANNELS'
    ],
    permissionsBot:          [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES',
        'MANAGE_CHANNELS'
    ],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {

        const clearingChannels = (guild.ch.t.cl || []).map(normalizeClearEntry);
        const persist = () => client.save(guild.id, {
            alter: 'ch.t.cl',
            value: clearingChannels
        });
        const human = ms => client.imports.time(ms);
        const listText = () => clearingChannels.length
            ? clearingChannels.map(c => `<#${c.id}> - every \`${human(c.interval)}\``).join('\n')
            : 'None.';

        if (args[0]?.toLowerCase() === 'show')
        {
            return client.send(message.channel, null, [
                {
                    color:       client.data.embedColor,
                    title:       'Clearing channels:',
                    description: listText()
                }
            ]);
        }

        const stopping = [
            'stop',
            'remove',
            'delete',
            'off'
        ].includes(args[0]?.toLowerCase());

        let rest = stopping
            ? args.slice(1)
            : [...args];
        const targets = [];
        for (let i = 0; i < rest.length;)
        {
            const channel = await client.utils.channel(message, rest, i, { cut: true });
            if (channel)
            {
                targets.push(channel);
            }
            else
            {
                i++;
            }
        }

        let interval = null;
        if (rest.length)
        {
            const parsed = client.utils.getTime(rest);
            if (parsed === undefined || parsed === null || Number.isNaN(parsed) || parsed <= 0)
            {
                return client.qEmbed('Invalid time. Try e.g. `5m`, `30 minutes`, `1 hour`. Minimum is 1 minute.', interaction ?? message);
            }
            interval = Math.max(MIN_CLEAR_MS, parsed);
        }

        if (stopping)
        {
            if (!targets.length)
            {
                return client.qEmbed('Which channel? `=clearingchannel stop #channel`.', interaction ?? message);
            }

            const removed = [];
            for (const channel of targets)
            {
                const index = clearingChannels.findIndex(c => c.id === channel.id);
                if (index !== -1)
                {
                    clearingChannels.splice(index, 1);
                    removed.push(channel);
                }
            }
            persist();

            return client.send(message.channel, null, [
                {
                    color:       client.data.embedColor,
                    title:       'Clearing channels:',
                    description: listText(),
                    fields:      removed.length
                                     ? [
                            {
                                name:  'Stopped clearing:',
                                value: removed.join(', ')
                            }
                        ]
                                     : [
                            {
                                name:  'Note:',
                                value: 'None of those were clearing channels.'
                            }
                        ]
                }
            ]);
        }

        if (targets.length)
        {

            if (interval !== null)
            {
                const added = [];

                for (const channel of targets)
                {
                    const existing = clearingChannels.find(c => c.id === channel.id);

                    if (existing)
                    {
                        existing.interval = interval;
                    }
                    else
                    {
                        clearingChannels.push({
                            id: channel.id,
                            interval
                        });
                        added.push(channel);
                    }
                }

                persist();

                return client.qEmbed(`Now clearing ${targets.join(', ')} every \`${human(interval)}\`.${added.length
                    ? `\nRe-assigned: ${added.join(', ')}.`
                    : ''}`, interaction ?? message);
            }

            const known = [];
            const reassigned = [];

            for (const channel of targets)
            {
                const existing = clearingChannels.find(c => c.id === channel.id);

                if (existing)
                {
                    known.push(`<#${channel.id}> - every \`${human(existing.interval)}\``);
                }
                else
                {
                    clearingChannels.push({
                        id:       channel.id,
                        interval: DEFAULT_CLEAR_MS
                    });
                    reassigned.push(`<#${channel.id}> - every \`${human(DEFAULT_CLEAR_MS)}\``);
                }
            }

            if (reassigned.length)
            {
                persist();
            }

            return client.send(message.channel, null, [
                {
                    color:       client.data.embedColor,
                    title:       'Clearing channels:',
                    description: listText(),
                    fields:      [
                                     known.length
                                         ? {
                                             name:  'Already clearing:',
                                             value: known.join('\n')
                                         }
                                         : null,
                                     reassigned.length
                                         ? {
                                             name:  'Started clearing:',
                                             value: `${reassigned.join('\n')}\n\nPass a time to change it (\`=clearingchannel #channel 10m\`), or \`=clearingchannel stop #channel\` to turn it off.`
                                         }
                                         : null
                                 ].filter(Boolean)
                }
            ]);
        }

        const newInterval = interval ?? DEFAULT_CLEAR_MS;

        let channel;

        try
        {
            ({ channel } = await client.module.creators.createClearingChannel({
                guild:    message.guild,
                guildDoc: guild,
                interval: newInterval,
                reason:   `=clearingchannel by ${client.utils.tag(message.author)}`
            }));
        }
        catch (error)
        {
            client.data.errors++;

            return client.qEmbed(`Could not create the clearing channel: ${error?.message ?? error}`, interaction ?? message);
        }

        channel.setTopic(`Bot commands channel - cleared every ${human(newInterval)} while Relaxy is online.`).catch(client.swallow('clearingchannel: human'));
        channel.send(`New clearing channel \`${channel.id}\` - cleared every **${human(newInterval)}** by Relaxy!`).catch(client.swallow('clearingchannel: human'));
        channel.setPosition(message.channel.position).catch(client.swallow('clearingchannel: setPosition'));

        return client.qEmbed(`${channel.name} has been created - clears every \`${human(newInterval)}\`!`, interaction ?? message);
    }
};
