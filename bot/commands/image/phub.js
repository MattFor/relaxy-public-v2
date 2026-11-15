'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'phub',
    usage: '=phub <text>',
    description: 'Falsifies a pornhub comment.',

    args: true,
    cooldown: 5,

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        if (await client.censored(args, guild, message)) {
            return;
        }

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(
                await client.imports.canvacord.Canvas.phub({
                    username: message.author.username,
                    message: args.join(' ').slice(0, 300),
                    image: message.author.displayAvatarURL({
                        dynamic: true,
                        extension: 'png',
                        size: 4096
                    })
                }),
                { name: 'pornhub_comment.png' }
            )
        ]);
    }
};
