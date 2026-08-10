'use strict';

import fixer                    from 'dirty-json';
import Discord                  from 'discord.js';
import Relaxy                   from '../../../../Relaxy.js';
import { normalizeWhiteSpaces } from 'normalize-text';

import {
    validateEmbed,
    describeViolations
} from '../EmbedLimits.js';

const exceptions = [
    'url',
    'text',
    'name',
    'image',
    'title',
    'color',
    'fields',
    'author',
    'footer',
    'icon_url',
    'thumbnail',
    'timestamp',
    'description'
];

export default class CustomEmbed
{
    constructor(client)
    {
        this.text = '';
        this.data = null;
        this.parts = null;
        this.channel = null;
        this.client = client;
        this.rawEmbedText = '';
    }

    async fullRoutine(message, args, guild, options = {})
    {
        this.rawEmbedText = args.join(' ');

        const error = msg =>
        {
            if (!options.noError)
            {
                return this.client.qEmbed(msg, message);
            }

            return null;
        };

        let timeout = false;
        let messageToEdit = null;

        if (args.length === 3 && args[0].toLowerCase() === 'edit')
        {
            const channel = await this.client.utils.channel(message, args, 1);

            if (!channel)
            {
                return error('Channel does not exist');
            }

            if (guild.ch.t.rs.includes(channel.id) && !this.client.utils.isExempt(guild, message))
            {
                return error('Cannot use Relaxy in that channel.');
            }

            const fetchedMessage = await channel.messages.fetch(args[2], {
                cache: false,
                limit: 1
            });

            if (!fetchedMessage)
            {
                return error('Message with provided Id doesn\'t exist.');
            }

            if (fetchedMessage.author.id !== this.client.user.id)
            {
                return error('Message is not from Relaxy, cannot edit.');
            }

            messageToEdit = fetchedMessage;

            await this.client.send(message.channel, null, [
                {
                    color: this.client.data.embedColor,
                    title: 'Provide text or file that includes the embed code'
                }
            ]);

            const collected = await message.channel.awaitMessages({
                filter: m => m.author.id === message.author.id,
                max:    1,
                time:   300000,
                errors: ['time']
            }).catch(() => timeout = true);

            if (timeout)
            {
                return error('Timeout, please try again!');
            }

            message = collected.first();
            args = message.content.split(' ');
        }

        try
        {
            if (message.attachments.size > 0)
            {
                await this.createFromFile(message);
            }
            else
            {
                await this.createFromText(args);
            }
        }
        catch (e)
        {
            this.data = null;
            this.rawEmbedText = '';

            if (!options.ignoreEmbed)
            {
                return error('Parsing provided data failed!');
            }
        }

        if ([
            undefined,
            null
        ].includes(this.data) && !options.ignoreEmbed)
        {
            return error('The data you provided is invalid!');
        }

        if (this.data && typeof this.data === 'object')
        {
            const verdict = validateEmbed(this.data);

            if (!verdict.ok)
            {
                const report = describeViolations(verdict);

                this.data = null;
                this.rawEmbedText = '';

                return error(report);
            }
        }

        if ((!options.ignoreEmbed || !!this.data) && !options.preset)
        {
            const _ = await this.client.send(message.channel, null, [
                {
                    color:       this.client.data.embedColor,
                    description: 'Do you want text above the embed? It will not show any text if you reply with **`no`**.'
                }
            ]);

            const opDelete = async () =>
            {
                try
                {
                    await _.delete();
                }
                catch
                {
                }
            };

            setTimeout(async () =>
            {
                opDelete();
            }, 30 * 1000);

            const collected = await message.channel.awaitMessages({
                filter: m => m.author.id === message.author.id,
                max:    1,
                time:   300000,
                errors: ['time']
            }).catch(() => timeout = true);

            if (timeout)
            {
                opDelete();
                return error('Timeout, please try again!');
            }

            const content = collected.first()?.content;

            if (!content)
            {
                opDelete();
                return error('Invalid response!');
            }

            if (!content.toLowerCase().split(' ')?.[0].includes('no'))
            {
                this.text = content;
            }

            opDelete();

            try
            {
                await collected.first().delete();
            }
            catch
            {
            }
        }
        else if (options.ignoreEmbed && !this.data)
        {
            this.text = args.join(' ');
        }

        this.parts = await this.client.utils.generateCustomMessageParts(message, this.text, this.data);

        if (!this.parts)
        {
            return;
        }

        if (!options.noChannel && !messageToEdit)
        {
            await this.client.send(message.channel, null, [
                {
                    color:       this.client.data.embedColor,
                    description: 'To which channel you want to sent this embed? **channel mention/name/id**'
                }
            ]);

            const awaitChannel = await message.channel.awaitMessages({
                filter: m => m.author.id === message.author.id,
                max:    1,
                time:   300000,
                errors: ['time']
            }).catch(() => timeout = true);

            if (timeout)
            {
                return error('Timeout, please try again!');
            }

            const awaitChannelContent = awaitChannel.first().content;

            if (!awaitChannelContent)
            {
                return error('No text provided!');
            }

            const channel = await this.client.utils.channel(awaitChannel.first(), awaitChannelContent.split(' '));

            if (!channel || ![
                Discord.ChannelType.GuildText,
                Discord.ChannelType.GuildAnnouncement,
                Discord.ChannelType.PublicThread,
                Discord.ChannelType.PrivateThread,
                Discord.ChannelType.AnnouncementThread
            ].includes(channel.type))
            {
                return error('Invalid channel!');
            }

            const permissions = channel.permissionsFor(message.member).serialize();

            const everyOneCheck = this.parts?.[0]?.includes('@everyone') ?? null;
            const fileCheck = this.parts?.[3]?.length !== 0 ?? null;

            if (!permissions.SendMessages || !permissions.EmbedLinks || (everyOneCheck
                ? !permissions.MentionEveryone
                : false) || (fileCheck
                ? !permissions.AttachFiles
                : false))
            {
                return error('You do not have the permissions required to post in that channel!');
            }

            if (this.client.utils.isRestricted(guild, channel.id) && !this.client.utils.isExempt(guild, message))
            {
                return error('Cannot use that channel as it\'s restricted!');
            }

            this.channel = channel;
        }

        try
        {
            if (options.valuesOnly)
            {
                return this.parts;
            }

            if (messageToEdit)
            {
                this.client.qEmbed('Message successfully edited!', message);
                return this.client.edit(messageToEdit, ...this.parts);
            }

            return this.client.send(this.channel, ...this.parts).catch(e =>
            {
                return error('An error occurred while sending the embed!');
            });
        }
        catch
        {
            return error('An error occurred while sending the embed!');
        }
    }

    async createFromText(args)
    {
        return new Promise(async (resolve, reject) =>
        {
            if (!args?.[0])
            {
                this.data = undefined;
                return resolve(this.data);
            }

            this.data = args.join(' ');
            this.rawEmbedText = this.data;

            if (!this.data.startsWith('{'))
            {
                this.data = `{${this.data}`;
            }
            if (!this.data.endsWith('}'))
            {
                this.data += '}';
            }

            this.data = this.data.replaceAll('\'', '"').replaceAll('//', '\/\/').replaceAll('\'', '"').replaceAll('\r\n', '').replaceAll('\n', '')
                            .replaceAll('~=', '--DOWNSPACE--').replaceAll('[[', 'FLAG[').replaceAll('{{', 'FLAG{').replaceAll('((', 'FLAG(').replaceAll(']]', 'FLAG]')
                            .replaceAll('}}', 'FLAG}').replaceAll('))', 'FLAG)');

            const exceptionsMatches = this.data.match(/\"(.*?)\"/g);
            if (exceptionsMatches)
            {
                for (let i = 0; i < exceptionsMatches.length; i++)
                {
                    for (let j = 0; j < 13; j++)
                    {
                        if (!exceptionsMatches[i].includes(exceptions[j]))
                        {
                            this.data = this.data.replace(exceptionsMatches[i], `${exceptionsMatches[i].replaceAll(' ', '+++').replaceAll('|', '888888').replaceAll(';;', '--TTTTewdqccrfqw--')}`);
                        }
                    }
                }
            }

            this.data = this.data.replaceAll('botver', this.client.config.keys.version);

            const embedObject = await this.objectify();

            if (embedObject === undefined)
            {
                this.data = undefined;
                return reject(this.data);
            }

            if (embedObject.color)
            {
                embedObject.color = parseInt(embedObject.color.toLowerCase().replace('#', ''),
                    isNaN(embedObject.color)
                        ? 16
                        : 10);
            }

            if (embedObject.timestamp)
            {
                embedObject.timestamp = new Date();
            }

            this.data = embedObject;

            try
            {
                await this.client.parseJSON(await this.client.stringifyJSON(this.data));

                const keys = Object.keys(this.data);
                for (const key of keys)
                {
                    if (!exceptions.includes(key))
                    {
                        this.data = null;
                        return resolve(this.data);
                    }
                }
            }
            catch
            {
                this.data = null;
            }

            resolve(this.data);
        });
    }

    async createFromFile(message)
    {
        return new Promise(async (resolve, reject) =>
        {
            try
            {
                let path = `./storage/cache/users/${message.author.id}`;
                if (!(await this.client.pathExists(path)))
                {
                    await this.client.mkdir(path);
                }

                const currentTime = Date.now();
                const attachment = message.attachments.first();

                if (!attachment.contentType?.includes('text'))
                {
                    return resolve(this.data);
                }

                const filePath = `${path}/${currentTime}.txt`;

                await this.client.downloadFile(attachment.url, filePath);

                const awaitEmbedFile = setInterval(async () =>
                {
                    const fileExists = await this.client.pathExists(filePath);
                    if (fileExists)
                    {
                        const stats = await this.client.fileStats(filePath);
                        if (stats.size < 15)
                        {
                            return null;
                        }

                        clearInterval(awaitEmbedFile);

                        const interval = setInterval(async () =>
                        {
                            if (await this.client.pathExists(filePath) && (await this.client.fileStats(filePath)).size >= 15)
                            {
                                clearInterval(interval);
                                resolve(this.data);
                            }
                        }, 1000);

                        this.data = (await this.client.readFile(filePath)).toString().replaceAll('\r\n', '').replaceAll('\n', '');
                        this.rawEmbedText = this.data;

                        this.data = this.data
                                        .replaceAll('\'', '"').replaceAll('//', '\/\/').replaceAll('\'', '"')
                                        .replaceAll('~=', '--DOWNSPACE--').replaceAll('[[', 'FLAG[').replaceAll('{{', 'FLAG{').replaceAll('((', 'FLAG(').replaceAll(']]', 'FLAG]')
                                        .replaceAll('}}', 'FLAG}').replaceAll('))', 'FLAG)');

                        if (!this.data.startsWith('{'))
                        {
                            this.data = `{${this.data}`;
                        }

                        if (!this.data.endsWith('}'))
                        {
                            this.data += '}';
                        }

                        const exceptionsMatches = this.data.match(/"(.*?)"/g);
                        if (exceptionsMatches)
                        {
                            for (let i = 0; i < exceptionsMatches.length; i++)
                            {
                                for (let j = 0; j < 13; j++)
                                {
                                    if (!exceptionsMatches[i].includes(exceptions[j]))
                                    {
                                        this.data = this.data.replace(exceptionsMatches[i], `${exceptionsMatches[i].replaceAll(' ', '+++').replaceAll('|', '888888').replaceAll(';;', '--TTTTewdqccrfqw--')}`);
                                    }
                                }
                            }
                        }

                        this.data = this.data.replaceAll('botver', this.client.config.keys.version);

                        const embedObject = await this.objectify();

                        if (!embedObject)
                        {
                            this.data = undefined;
                            return this.data;
                        }

                        if (embedObject.color)
                        {
                            embedObject.color = parseInt(embedObject.color.toLowerCase().replace('#', ''),
                                isNaN(embedObject.color)
                                    ? 16
                                    : null);
                        }

                        if (embedObject.timestamp)
                        {
                            embedObject.timestamp = new Date();
                        }

                        this.data = embedObject;

                        try
                        {
                            await this.client.parseJSON(await this.client.stringifyJSON(this.data));

                            const keys = Object.keys(this.data);
                            for (const key of keys)
                            {
                                if (!exceptions.includes(key))
                                {
                                    this.data = null;
                                    return this.data;
                                }
                            }
                        }
                        catch (e)
                        {
                            this.data = null;
                        }

                        return this.data;
                    }
                }, 1000);
            }
            catch (error)
            {
                throw error;
            }
        });
    }

    async objectify()
    {
        let convertedText = normalizeWhiteSpaces(this.data)
            .replace(/(\r\n|\n|\r)/gm, '').replace(/ /g, '').replace(/"/g, '').replace(/'/g, '')
            .replace(/{/g, '{"').replace(/}/g, '"}').replace(/:/g, '":"').replace(/,/g, '","')
            .replace(/:"{/g, ':{').replace(/}"}/g, '}}').replace(/}","{/g, '},{').replace(/]"}/g, ']}')
            .replace(/:"\[/g, ':["').replace(/]",/g, '],').replace(/],/g, '"],').replace(/]}/g, '"]}')
            .replace(/\(/g, '("').replace(/\)/g, '")').replace(/"{/g, '{').replace(/}"/g, '}').replaceAll('""', '').replaceAll(',}', '}').replaceAll('"https":"//', '"https://')
            .replaceAll(',]', ']').replaceAll('+++', ' ').replaceAll('888888', '\'').replaceAll('--TTTTewdqccrfqw--', ':')
            .replaceAll('--DOWNSPACE--', '\n').replaceAll('<>', ',').replaceAll('("', '(').replaceAll('")', ')')
            .replaceAll('FLAG"', 'FLAG').replaceAll('in', '\in').replaceAll('FLAG]}', 'FLAG]').replaceAll('FLAG)}', 'FLAG)').replaceAll('FLAG}}', 'FLAG}')
            .replaceAll('FLAG[', '[').replaceAll('FLAG]', ']').replaceAll('FLAG{', '{').replaceAll('FLAG}', '}').replaceAll('FLAG(', '(').replaceAll('FLAG)', ')').replaceAll('http":"', 'http:').replaceAll('https":"', 'https:');

        const parseFail1 = convertedText.match(/[^(0-9\)|\]|\}]]\,\"/g);
        for (let i = 0; i < parseFail1?.length; i++)
        {
            convertedText = convertedText.replace(parseFail1[i], parseFail1[i].replace('],', ']",'));
        }

        if (this.client.flags.logs.debug)
        {
            this.client.log(convertedText);
        }

        try
        {
            this.data = await this.client.fixerParseJSON(convertedText);
        }
        catch
        {
        }

        try
        {
            if (typeof this.data !== 'object')
            {
                this.data = await this.client.fixerParseJSON(`${convertedText}}`);
            }
        }
        catch
        {
        }

        try
        {
            if (typeof this.data !== 'object')
            {
                this.data = await this.client.fixerParseJSON(`{${convertedText}`);
            }
        }
        catch
        {
        }

        if (this.client.flags.logs.debug)
        {
            this.client.log(this.data);
            this.client.log(typeof this.data,
                typeof this.data !== 'object'
                    ? this.data = undefined
                    : this.data);
        }

        return typeof this.data !== 'object'
            ? this.data = undefined
            : this.data;
    }
}
