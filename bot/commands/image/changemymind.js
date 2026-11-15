'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'changemymind',
    aliases: ['cmm'],
    usage: '=changemymind <text>',
    description: 'Place your text onto the "change my mind" meme template.',

    args: true,

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        if (await client.censored(args, guild, message)) {
            return;
        }

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(
                await client.imports.canvacord.Canvas.changemymind(args.join(' ').slice(0, 100)),
                { name: 'changemymind.png' }
            )
        ]);
    }
};
