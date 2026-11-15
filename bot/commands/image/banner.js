'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'banner',
    usage: '=banner [user|server]',
    description: "Shows your or another user's banner image. Pass `server` to show the server banner instead.",

    slash: new Discord.SlashCommandBuilder().addStringOption((option) =>
        option
            .setName('target')
            .setDescription('A user, or "server" for the server banner. Defaults to you.')
            .setRequired(false)
    ),

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        if (args[0]?.toLowerCase() === 'server') {
            const banner = message.guild.bannerURL({
                dynamic: true,
                size: 4096
            });

            if (!banner) {
                return client.qEmbed('This server does not have a banner.', interaction ?? message);
            }

            return client.send(interaction ?? message.channel, null, null, [
                new Discord.AttachmentBuilder(banner, 'banner.gif')
            ]);
        }

        const member = (await client.utils.member(message, args, 0)) ?? message.member;

        try {
            await client.users.fetch(member.user.id, { force: true });
        } catch {}

        const banner = member.user.bannerURL({
            dynamic: true,
            size: 4096
        });

        if (!banner) {
            return client.qEmbed('This user does not have a banner.', interaction ?? message);
        }

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(banner, { name: 'banner.gif' })
        ]);
    }
};
