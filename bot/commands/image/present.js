'use strict';

import Discord from 'discord.js';
import DIG from 'discord-image-generation';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'present',
    usage: '=present <text>',
    description: 'Place your text onto the Lisa presentation meme template.',

    args: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        if (await client.censored(args, guild, message)) {
            return;
        }

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(await new DIG.LisaPresentation().getImage(args.join(' ').slice(0, 300)), {
                name: 'presenting.png'
            })
        ]);
    }
};
