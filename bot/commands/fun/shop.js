'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'shop',
    usage:       '=shop',
    description: '**Show the Relaxy shop!**',

    slash: new Discord.SlashCommandBuilder(),

    cooldown: 7,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const shop = await client.module.profiles.getShopEmbed(message);

        return client.send(interaction
            ? 1
            : message.channel, null, shop);
    }
};