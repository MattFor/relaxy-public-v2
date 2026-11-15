'use strict';

import Discord from 'discord.js';
import jimp from 'jimp';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'myman',
    usage: '=myman <user> [user]',
    description: 'Place your and the specified user\'s avatars onto the "my man" meme template.',

    args: true,

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        let member1 = null;
        let member2 = null;

        switch (args.length) {
            case 1:
                member2 = message.member;
                member1 = await client.utils.member(message, args, 0);
                break;
            case 2:
                member1 = (await client.utils.member(message, args, 0)) ?? message.member;
                member2 = await client.utils.member(message, args, 1);
                break;
        }

        if (!member1) {
            return client.qEmbed('No bro provided :(', interaction ?? message);
        }

        const base = jimp.read(client.cdn.overlays.myman);
        const img1 = jimp.read(
            member1.displayAvatarURL({
                dynamic: true,
                extension: 'png'
            })
        );
        const img2 = jimp.read(
            member2.displayAvatarURL({
                dynamic: true,
                extension: 'png'
            })
        );

        let result = null;

        await Promise.all([img1, img2, base]).then(async ([a, b, c]) => {
            a.circle();
            b.circle();

            c.resize(768, 574);
            a.resize(150, 150);
            b.resize(150, 150);

            c.composite(a, 260, 280);
            c.composite(b, 480, 280);

            result = await c.getBufferAsync('image/png');
        });

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(result, { name: 'myman.png' })
        ]);
    }
};
