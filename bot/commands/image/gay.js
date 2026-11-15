'use strict';

import Discord from 'discord.js';
import DIG from 'discord-image-generation';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'gay',
    aliases: ['gae'],
    usage: '=gay [user]',
    description: "Overlay a pride flag onto your or the specified user's avatar.",

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        let member = (await client.utils.member(message, args, 0)) ?? message.member;

        if (client.isOwner(member.user.id)) {
            return client.qEmbed(client.utils.randErr(), interaction ?? message);
        }

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(
                await new DIG.Gay().getImage(
                    member.displayAvatarURL({
                        dynamic: true,
                        size: 4096,
                        extension: 'png'
                    })
                ),
                { name: 'gay.png' }
            )
        ]);
    }
};
