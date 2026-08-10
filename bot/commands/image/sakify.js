'use strict';

import jimp    from 'jimp';
import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'sakify',
    usage:       '=sakify [user]',
    description: 'Overlay the sakify template onto your or the specified user\'s avatar, or onto an attached image.',

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        let member = await client.utils.member(message, args, 0) ?? message.member;

        let file = message.attachments.first();
        let imageUrl = member.displayAvatarURL({
            dynamic:   true,
            extension: 'png',
            size:      4096
        });

        if (file && file.contentType.startsWith('image/'))
        {
            imageUrl = file.url;
        }

        let result = null;
        await Promise.all([
            jimp.read(client.cdn.overlays.sakify),
            jimp.read(imageUrl)
        ]).then(async ([a, b]) =>
        {
            b.resize(a.getWidth(), a.getHeight());

            const combinedImage = new jimp(a.getWidth(), a.getHeight());
            combinedImage.composite(b, 0, 0);
            combinedImage.composite(a, 0, 0);

            result = await combinedImage.getBufferAsync(jimp.MIME_PNG);
        });

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(result, { name: 'sakified.png' })
        ]);
    }
};
