'use strict';

import Discord from 'discord.js';
import DIG from 'discord-image-generation';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'pfp',
    aliases: ['avatar'],
    usage: '=pfp [user|server|circle] [user] [raw]',
    description:
        "Show or modify a profile picture.\n**server** shows the server icon, **circle** crops the avatar into a circle, and **raw** shows the user's global avatar instead of their server avatar.\nThe standalone `=circlepfp` command still works too.",

    slashDescription: 'Show or modify a profile picture.',

    slash: new Discord.SlashCommandBuilder()
        .addStringOption((option) =>
            option
                .setName('style')
                .setDescription('How to display the picture.')
                .addChoices(
                    {
                        name: 'server',
                        value: 'server'
                    },
                    {
                        name: 'circle',
                        value: 'circle'
                    }
                )
                .setRequired(false)
        )
        .addUserOption((option) =>
            option
                .setName('member')
                .setDescription('Member whose profile picture will be displayed.')
                .setRequired(false)
        )
        .addBooleanOption((option) =>
            option
                .setName('raw')
                .setDescription("Show the user's global avatar, not their server avatar (different pfp due to nitro).")
                .setRequired(false)
        ),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        let mode;
        let raw;
        let member;

        if (interaction) {
            mode = interaction.options.getString('style') ?? 'default';
            raw = interaction.options.getBoolean('raw') ?? false;

            const picked = interaction.options.getUser('member');
            member = (picked ? await client.getMember(message.guild, picked.id) : null) ?? message.member;
        } else {
            const first = args?.[0]?.toLowerCase();
            const lookupArgs = first === 'server' || first === 'circle' ? args.slice(1) : args;

            mode = first === 'server' || first === 'circle' ? first : 'default';

            const joined = args.join(' ').toLowerCase();
            raw = joined.includes('raw') || joined.includes('false');

            member = (await client.utils.member(message, lookupArgs, 0)) ?? message.member;
        }

        if (mode === 'server') {
            return client.send(interaction ? 1 : message.channel, null, null, [
                new Discord.AttachmentBuilder(client.utils.guildIcon(message.guild), 'server.gif')
            ]);
        }

        const source = raw ? member.user : member;

        if (mode === 'circle') {
            return client.send(interaction ? 1 : message.channel, null, null, [
                new Discord.AttachmentBuilder(
                    await new DIG.Circle().getImage(
                        source.displayAvatarURL({
                            dynamic: true,
                            size: 4096,
                            extension: 'png'
                        })
                    ),
                    { name: 'circle.png' }
                )
            ]);
        }

        return client.send(interaction ? 1 : message.channel, null, null, [
            new Discord.AttachmentBuilder(
                source.displayAvatarURL({
                    dynamic: true,
                    size: 4096
                }),
                { name: 'avatar.gif' }
            )
        ]);
    }
};
