'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'profile',
    usage:       '=profile [user]',
    description: 'View your (or another user\'s) Relaxy profile.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('user').setDescription('Whose profile to show. Defaults to you.').setRequired(false)),

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {

        if (interaction && interaction.isButton?.())
        {
            const targetUserId = interaction.customId.split('_')[2];

            await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral }).catch(client.swallow('profile: deferReply'));

            const embed = await client.module.profiles.buildServerRanksEmbed(targetUserId);

            return void interaction.editReply({ embeds: [embed] }).catch(client.swallow('profile: editReply'));
        }

        const user = await client.utils.user(message, args, 0);
        const profileEmbed = await client.module.profiles.getProfileEmbed(message, user);

        return client.send(interaction
            ? 1
            : message.channel, null, profileEmbed[0], profileEmbed[1], null, profileEmbed[2]);
    }
};
