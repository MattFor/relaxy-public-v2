'use strict';

import Discord from 'discord.js';
import DIG     from 'discord-image-generation';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'slap',
    usage:       '=slap <user> [user]',
    description: 'Slap someone! Pass a second user to make them the one doing the slapping instead of you.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('user1').setDescription('User whose profile picture will be slapped.').setRequired(true))
               .addUserOption(option => option.setName('user2').setDescription('User whose profile picture will do the slap.').setRequired(false)),

    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'ATTACH_FILES'
    ],
    async run(client, message, args, guild, interaction)
    {
        let member2 = await client.utils.member(message, args, 0);
        let member1 = await client.utils.member(message, args, 1) ?? message.member;

        if (!member1 || !member2)
        {
            return client.qEmbed('No user specified to slap!', interaction ?? message);
        }

        if (client.isOwner(member2.user.id))
        {
            return client.qEmbed(client.utils.randErr(), interaction ?? message);
        }

        let image1 = member1.displayAvatarURL({
            dynamic:   true,
            extension: 'png'
        });
        let image2 = member2.displayAvatarURL({
            dynamic:   true,
            extension: 'png'
        });

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(await new DIG.Batslap().getImage(image1, image2), { name: 'slap.png' })
        ]);
    }
};
