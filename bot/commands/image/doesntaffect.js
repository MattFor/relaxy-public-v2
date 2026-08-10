'use strict';

import Discord from 'discord.js';
import DIG     from 'discord-image-generation';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'doesntaffect',
    aliases:     ['affect'],
    usage:       '=doesntaffect [user]',
    description: 'Place your or the specified user\'s avatar onto the "this does not affect my baby" meme template.',

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        let member = await client.utils.member(message, args, 0) ?? message.member;

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(await new DIG.Affect().getImage(member.displayAvatarURL({
                dynamic:   true,
                size:      4096,
                extension: 'png'
            })), { name: 'doesntaffect.png' })
        ]);
    }
};