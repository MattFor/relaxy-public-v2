'use strict';

import Discord from 'discord.js';
import DIG     from 'discord-image-generation';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'circlepfp',
    aliases:     ['circle'],
    usage:       '=circlepfp [user]',
    description: 'Shows a large, circular crop of your or the specified user\'s avatar.',

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const member = await client.utils.member(message, args, 0) ?? message.member;

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(await new DIG.Circle().getImage(member.displayAvatarURL({
                dynamic:   true,
                size:      4096,
                extension: 'png'
            })), { name: 'circle.png' })
        ]);
    }
};
