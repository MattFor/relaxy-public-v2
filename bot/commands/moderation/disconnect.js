'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'disconnect',
    usage:       '=disconnect <user>',
    description: 'Disconnect someone from their voice channel.',

    slash:    new Discord.SlashCommandBuilder().addUserOption(option => option.setName('user').setDescription('User to disconnect from a voice channel.').setRequired(true)),
    args:     true,
    cooldown: 5,

    permissionsUser:         [
        'SEND_MESSAGES',
        'MOVE_MEMBERS',
        'MODERATE_MEMBERS'
    ],
    permissionsBot:          [
        'SEND_MESSAGES',
        'MOVE_MEMBERS'
    ],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        const member = await client.utils.member(message, args, 0);

        if (!member)
        {
            return client.qEmbed('No user specified to disconnect!', interaction ?? message);
        }

        if (!member.voice.channel)
        {
            return client.qEmbed('Specified user outside of a voice channel!', interaction ?? message);
        }

        if (client.isOwner(member.user.id))
        {
            return client.qEmbed(client.utils.randErr(), interaction ?? message);
        }

        try
        {
            member.voice.setChannel(null, `Disconnected with ${guild.px[0]}disconnect by ${client.utils.tag(message.author)} - ${message.author.id}`);
        }
        catch
        {
            client.qEmbed('Cannot disconnect this user!', interaction ?? message);
        }

        return client.qEmbed(`Successfully disconnected ${member}!`, interaction ?? message);
    }
};
