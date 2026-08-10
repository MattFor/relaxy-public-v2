'use strict';

import Discord from 'discord.js';
import DIG     from 'discord-image-generation';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'ross',
    aliases:     ['saint'],
    usage:       '=ross [user]',
    description: 'Place your or the specified user\'s avatar onto a Bob Ross painting.',

    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        let member = await client.utils.member(message, args, 0) ?? message.member;

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(await new DIG.Bobross().getImage(member.displayAvatarURL({
                dynamic:   true,
                size:      4096,
                extension: 'png'
            })), { name: 'ross.png' })
        ]);
    }
};