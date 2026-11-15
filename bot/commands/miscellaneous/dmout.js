'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'dmout',
    usage: '=dmout',
    description: 'Toggle opting out of DM welcome/leave messages when joining or leaving a server.',

    slash: new Discord.SlashCommandBuilder(),
    args: false,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const user = await client.module.database.User(message.author.id);

        if (user.dm) {
            user.dm = false;

            client.saveProfile(message.author.id, {
                alter: 'dm',
                value: user.dm
            });

            return client.qEmbed(
                "You've successfully opted into DM welcome/leave server messages.",
                interaction ?? message
            );
        }

        user.dm = true;

        client.saveProfile(message.author.id, {
            alter: 'dm',
            value: user.dm
        });

        return client.qEmbed(
            "You've successfully opted out of DM welcome/leave server messages.",
            interaction ?? message
        );
    }
};
