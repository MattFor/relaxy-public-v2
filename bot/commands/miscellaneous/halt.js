'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'halt',
    usage: '=halt',
    description:
        'Stop recording with Relaxy!\nRecording also stops when you kick Relaxy! or all users leave a channel.',

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES', 'CONNECT', 'SPEAK'],

    async run(client, message, args, guild, interaction) {
        return client.qEmbed('Currently unavailable.', interaction ?? message);

        client.module.recorder.Halt(message);
    }
};
