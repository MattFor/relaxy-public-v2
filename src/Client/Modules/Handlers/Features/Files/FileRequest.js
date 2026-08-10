'use strict';

import Discord from 'discord.js';

export default class FileRequest
{
    constructor(message, args)
    {

        const splitContent = message.content.split(' ');

        this.fileName = args.shift().replace(/[\\/:*?"<>|]/g, '').slice(0, 100);
        this.isServer = this.fileName.startsWith('server-');

        if (this.isServer)
        {
            this.fileName = this.fileName.replace('server-', '');
        }

        this.commandType = splitContent[0];
        this.message = message;
        const attachment = message.attachments.first() ?? null;
        this.data = attachment
            ? attachment
            : args.join(' ').slice(0, 1850);
        this.extension = attachment
            ? attachment.url.split('.').pop()
            : 'txt';

        this.fullFileName = `${this.fileName}.${this.extension}`.split('?')[0];

        this.valid = this.commandType === 'fetch'
            ? true
            : (args.length !== 0 || attachment) && (attachment && !this.data.contentType
            ? !!this.extension
            : true) && (attachment
            ? attachment.size / 1000000 < 25
            : true) && this.fileName.length >= 1;
    }
}
