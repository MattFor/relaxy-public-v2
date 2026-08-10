'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'fetch',
    usage:       '=fetch <filename>',
    description: 'Return the file you previously saved under the given filename.',

    args: true,

    permissionsUser: [
        'SEND_MESSAGES',
        'ATTACH_FILES'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        client.module.files.give(new client.class.fileRequestPacket(message, args));
    }
};
