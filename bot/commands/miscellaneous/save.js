'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'save',
    usage: '=save <filename> <file|text>',
    description:
        "Save a file (an attachment, or text) under a short **filename** so you can fetch it later with `=fetch`, list it with `=files`, and reuse it.\n\n**Server storage** - prefix the filename with `server-` (e.g. `server-logo`) to save a shared image to the server. Needs the `ManageGuild` permission, and only images are allowed (no webp/gif). Server images can be dropped into embeds, custom boost messages and ticket designs as a **thumbnail** / **image** (an author or footer icon still needs a real `https://` URL).\n\n**Limits** - up to **20 MB per user** and **50 MB per server**. Saving the same filename overwrites the old file.\nManage what you've saved with `=files` (list / rename / delete).",

    args: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsUser: ['MANAGE_GUILD'],

    async run(client, message, args, guild, interaction) {
        const attachmentPresent = message.attachments.size > 0;

        if (!args[0] && !attachmentPresent) {
            return client.qEmbed('No files to save provided!', interaction ?? message);
        }

        if (!args[0] && attachmentPresent) {
            return client.qEmbed('No filename given!', interaction ?? message);
        }

        if (args[2] && attachmentPresent) {
            return client.qEmbed('Can store text OR something else, not both at once!', interaction ?? message);
        }

        if (args[0] && !args[1] && !attachmentPresent) {
            return client.qEmbed('File name given with no text to store!', interaction ?? message);
        }

        if (args[0].length > 40) {
            return client.qEmbed('The name of the file cannot exceed 40 characters!', interaction ?? message);
        }

        client.module.profiles.Achievement(message, 'saved', guild);

        const filePacket = new client.class.fileRequestPacket(message, args);

        if (!filePacket.valid) {
            return client.qEmbed(
                'File packet invalid!\nMake sure to have a valid extension and size under 25mb.',
                interaction ?? message
            );
        }

        client.module.files.give(filePacket);
    }
};
