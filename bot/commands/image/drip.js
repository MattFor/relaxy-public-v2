'use strict';

import Discord from 'discord.js';
import jimp from 'jimp';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'drip',
    usage: '=drip [user]',
    description: 'Place your or the specified user\'s avatar onto the "drip" meme template.',

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        let member = (await client.utils.member(message, args, 0)) ?? message.member;

        let result = null;

        await Promise.all([
            jimp.read(client.cdn.overlays.drip),
            jimp.read(
                member.displayAvatarURL({
                    dynamic: true,
                    extension: 'png'
                })
            )
        ]).then(async ([a, b]) => {
            b.circle();
            a.resize(768, 574);
            b.resize(165, 165);
            a.composite(b, 300, 70);

            result = await a.getBufferAsync('image/png');
        });

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(result, { name: 'drip.png' })
        ]);
    }
};
