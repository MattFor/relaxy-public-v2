'use strict';

import Discord from 'discord.js';
import DIG     from 'discord-image-generation';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'spank',
    usage:       '=spank <user> [user]',
    description: 'Spank someone! Pass a second user to make them the one doing the spanking instead of you.',

    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        let member1 = await client.utils.member(message, args, 0);
        let member2 = await client.utils.member(message, args, 1) ?? message.member;

        if (!member1 || !member2)
        {
            return client.qEmbed('No user specified to spank!', interaction ?? message);
        }

        let image1 = member2.displayAvatarURL({
            dynamic:   true,
            extension: 'png'
        });
        let image2 = member1.displayAvatarURL({
            dynamic:   true,
            extension: 'png'
        });

        if (args.length === 2 && interaction)
        {
            let interactionMember2 = await client.getMember(message.guild, args[0]);
            let interactionMember1 = await client.getMember(message.guild, args[1]);

            image1 = interactionMember1.displayAvatarURL({
                dynamic:   true,
                extension: 'png'
            });
            image2 = interactionMember2.displayAvatarURL({
                dynamic:   true,
                extension: 'png'
            });
        }

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(await new DIG.Spank().getImage(image1, image2), { name: 'spank.png' })
        ]);
    }
};
