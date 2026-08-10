'use strict';

import jimp    from 'jimp';
import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'sus',
    usage:       '=sus [user]',
    description: 'I fucking hate this command don\'t use it.',

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const member = await client.utils.member(message, args, 0) ?? message.member;

        let result = null;

        await Promise.all([
            (jimp.read(Math.floor(Math.random() * 10) === 4
                ? client.cdn.overlays.goos
                : client.cdn.overlays.sus)),
            jimp.read(member.displayAvatarURL({
                dynamic:   true,
                extension: 'png'
            }))
        ]).then(async ([a, b]) =>
        {
            b.circle();
            a.resize(679, 653);
            b.resize(100, 100);
            a.composite(b, 340, 400);

            result = await a.getBufferAsync('image/png');
        });

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(result, { name: 'sus.png' })
        ]);
    }
};