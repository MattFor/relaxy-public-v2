'use strict';

import Discord from 'discord.js';
import jimp from 'jimp';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'execute',
    aliases: ['kill'],
    usage: '=execute <user> [user]',
    description:
        "Place the specified user's avatar onto an execution meme template, with you (or a second user) as the executioner.",

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
            return client.qEmbed('No user specified to execute!', interaction ?? message);
        }

        const base = jimp.read(client.cdn.overlays.kill);
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
            a.resize(165, 165);
            b.resize(165, 165);

            c.composite(a, 105, 200);
            c.composite(b, 525, 20);

            result = await c.getBufferAsync('image/png');
        });

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(result, { name: 'execution.png' })
        ]);
    }
};
