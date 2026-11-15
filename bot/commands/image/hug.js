'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'hug',
    usage: '=hug <user> [user]',
    description: 'Hug someone! Optionally pass a second user to make the first user hug them.',

    slash: new Discord.SlashCommandBuilder().addUserOption((option) =>
        option.setName('user').setDescription('Whoever you want to hug.').setRequired(true)
    ),
    args: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['EMBED_LINKS', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        const converted = [...(await client.readDir(client.cdn.reactionDir('hug')))];

        let member1 = (await client.utils.member(message, args, 0)) ?? message.member;
        let member2 = await client.utils.member(message, args, 1);

        if (!member1) {
            return client.qEmbed('No user to hug!', interaction ?? message);
        }

        if (args.length === 2 && interaction) {
            member1 = await client.getMember(message.guild, args[0]);
            member2 = await client.getMember(message.guild, args[1]);
        }

        let file = converted[Math.floor(Math.random() * converted.length)];

        return client.send(
            interaction ?? message.channel,
            null,
            [
                {
                    color: client.data.embedColor,
                    description: `**${member1} just hugged ${member2}!${
                        Math.floor(Math.random() * 10) == 5 ? '** **big hug :)**' : '**'
                    }`,
                    image: {
                        url: `attachment://${file}`
                    }
                }
            ],
            [
                {
                    attachment: client.cdn.reaction('hug', file),
                    name: `${file}`
                }
            ]
        );
    }
};
