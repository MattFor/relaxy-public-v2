'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'record',
    aliases: ['rec', 'startrecord', 'startrec'],
    usage: '=record',
    description: 'Start recording the current voice channel; does not work while music is playing.',

    permissionsUser: ['SEND_MESSAGES', 'ATTACH_FILES', 'CONNECT', 'SPEAK'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES', 'CONNECT', 'SPEAK'],

    async run(client, message, args, guild, interaction) {
        return client.qEmbed('Currently unavailable.', interaction ?? message);

        client.save(guild.id, {
            alter: 'rec.n',
            value: ++guild.rec.n
        });

        return client.module.recorder.Record(message);
    }
};
