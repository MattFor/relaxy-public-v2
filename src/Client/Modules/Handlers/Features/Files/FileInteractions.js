'use strict';

import fs          from 'fs-extra';
import fetch       from 'request';
import Discord     from 'discord.js';
import Relaxy      from '../../../../Relaxy.js';
import FileRequest from './FileRequest.js';

export default class PacketManager
{
    constructor(client)
    {
        this.client = client;
        this.fileSaveQueue = [];
    }

    async _directorySize(dir)
    {
        if (!(await this.client.pathExists(dir)))
        {
            return 0;
        }

        let total = 0;

        for (const file of await this.client.readDir(dir))
        {
            try
            {
                total += (await fs.stat(`${dir}/${file}`)).size;
            }
            catch
            { }
        }

        return total;
    }

    async save(fileRequest)
    {
        const member = fileRequest.message.member;
        const channel = fileRequest.message.channel;

        const authorId = fileRequest.isServer
            ? fileRequest.message.guild.id
            : fileRequest.message.author.id;
        const authorStoragePath = `./storage/${fileRequest.isServer
            ? 'guilds'
            : 'users'}/${authorId}`;
        const fullFilePath = `${authorStoragePath}/${fileRequest.fullFileName}`;

        if (fileRequest.isServer)
        {

            if (!this.client.permissions(fileRequest.message, {
                permissionsUser: [
                    'MANAGE_GUILD'
                ]
            }, {
                textChannel:  null,
                voiceChannel: null
            }, {
                report:     false,
                userExempt: this.client.utils.isExempt(await this.client.module.database.Guild(fileRequest.message.guild.id), fileRequest.message, member)
            }))
            {
                return this.client.qEmbed('You do not have the permissions required to save this file to the server\'s storage.', fileRequest.message);
            }

            if (!(fileRequest.data instanceof Discord.Attachment) || !fileRequest.data.contentType?.includes('image') || fileRequest.data.url.endsWith('webp') || fileRequest.data.url.endsWith('gif'))
            {
                return this.client.qEmbed('The file can only be an image (webp not allowed)!', fileRequest.message);
            }
        }

        const LIMIT = fileRequest.isServer
            ? 50 * 1024 * 1024
            : 20 * 1024 * 1024;
        const incomingBytes = fileRequest.data instanceof Discord.Attachment
            ? (fileRequest.data.size ?? 0)
            : Buffer.byteLength(String(fileRequest.data ?? ''), 'utf8');

        let usedBytes = await this._directorySize(authorStoragePath);

        if (await this.client.pathExists(fullFilePath))
        {
            try
            {
                usedBytes -= (await fs.stat(fullFilePath)).size;
            }
            catch
            { }
        }

        if (usedBytes + incomingBytes > LIMIT)
        {
            const mb = n => (Math.max(n, 0) / 1048576).toFixed(1);

            return this.client.qEmbed(`${fileRequest.isServer
                ? 'This server\'s'
                : 'Your'} file storage is full - **${mb(usedBytes)} / ${mb(LIMIT)} MB** used. Saving **${fileRequest.fileName}** (${mb(incomingBytes)} MB) would go over the limit.\nFree some space with \`=files${fileRequest.isServer
                ? ' server'
                : ''} delete <index>\` first.`, fileRequest.message);
        }

        return new Promise(async (resolve, reject) =>
        {
            if (!(await this.client.pathExists(authorStoragePath)))
            {
                this.client.mkdir(authorStoragePath);
            }

            if (fileRequest.data.url)
            {
                if (await this.client.pathExists(fullFilePath))
                {
                    this.client.unlink(fullFilePath);
                }

                let tries = 0;

                this.client.downloadFile(fileRequest.data.url, fullFilePath);

                const awaitFile = setInterval(async () =>
                {
                    if (tries > 10)
                    {
                        clearInterval(awaitFile);

                        if (await this.client.pathExists(fullFilePath))
                        {
                            resolve(this.client.send(channel, `**${member}!** - **${fileRequest.fileName}** has been successfully saved!`));
                        }
                        else
                        {
                            reject(this.client.send(channel, `**${member}!** - **${fileRequest.fileName}** error!`));
                        }

                        return;
                    }

                    tries++;
                }, 500);
            }
            else
            {
                this.client.writeFile(fullFilePath, fileRequest.data);
                resolve(this.client.send(channel, `**${member}!** - **${fileRequest.fileName}** has been successfully saved!`));
            }
        });
    }

    async fetch(fileRequest)
    {
        this.client.log(fileRequest);

        const member = fileRequest.message.member;
        const channel = fileRequest.message.channel;

        const authorId = fileRequest.isServer
            ? fileRequest.message.guild.id
            : fileRequest.message.author.id;
        const authorStoragePath = `./storage/${fileRequest.isServer
            ? 'guilds'
            : 'users'}/${authorId}`;

        return (async () =>
        {

            if (!await this.client.pathExists(authorStoragePath))
            {
                return this.client.send(channel, `**${member}!** - You do not have anything saved!`);
            }

            const files = await this.client.readDir(authorStoragePath);

            const fileName = fileRequest.fileName;
            const duplicateFiles = files.filter(file => file.startsWith(fileName));

            const giveOutFile = async fileName =>
            {
                const filePath = `${authorStoragePath}/${fileName}`;

                if (fileName.endsWith('txt'))
                {
                    try
                    {
                        return this.client.send(channel, `${member}! - here's your text file!:\n${await this.client.readFile(filePath)}`);
                    }
                    catch
                    {
                        return this.client.send(channel, `${member}! - Something went wrong while fetching the file!`);
                    }
                }

                try
                {
                    return this.client.send(channel, `${member}! - here's your file!`, null, [
                        new Discord.AttachmentBuilder(filePath, { name: fileName })
                    ]);
                }
                catch
                {
                    return this.client.send(channel, `${member}! - Something went wrong while fetching the file!`);
                }
            };

            if (duplicateFiles.length > 1)
            {
                let options = duplicateFiles.map((file, index) => `${index + 1}. ${file}`).join('\n');

                const promptMessage = await this.client.send(channel, `**${member}!** - multiple files found. Please choose one by typing the number:\n${options}`);

                const collector = channel.createMessageCollector({
                    filter: m => m.author.id === fileRequest.message.author.id,
                    max:    1,
                    time:   30000
                });

                collector.on('collect', m =>
                {
                    const chosenIndex = parseInt(m.content, 10) - 1;
                    if (chosenIndex >= 0 && chosenIndex < duplicateFiles.length)
                    {
                        return giveOutFile(duplicateFiles[chosenIndex]);
                    }
                    else
                    {
                        return this.client.qEmbed(`Invalid index! Initiate the command again to redo!`, promptMessage);
                    }
                });

                collector.on('end', collected =>
                {
                    if (collected.size === 0)
                    {
                        return this.client.qEmbed('Selection time ran out, try again later.', promptMessage);
                    }
                });
            }
            else if (duplicateFiles.length === 1)
            {
                return giveOutFile(duplicateFiles[0]);
            }
            else
            {
                return this.client.qEmbed('No file found under that name.', fileRequest.message);
            }
        })();
    }

    async give(fileRequest)
    {
        const promiseFunc = () =>
        {
            if (fileRequest.commandType.toLowerCase().includes('fetch'))
            {
                return this.fetch(fileRequest);
            }

            this.save(fileRequest);
        };

        this.client.module.rl.handleEvent(`file/${fileRequest.message.author.id}`, promiseFunc, 1500, {
            emptyCountThreshold: 3,
            guildSize:           fileRequest.message.guild?.memberCount ?? 1
        });
    }
}
