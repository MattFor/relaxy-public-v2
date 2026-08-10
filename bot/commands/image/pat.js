'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'pat',
    usage:       '=pat <user> [user]',
    description: 'Pat someone! Optionally pass a second user to make the first user pat them.',

    slash: new Discord.SlashCommandBuilder().addUserOption(option => option.setName('user').setDescription('Whoever you want to pat.').setRequired(true)),
    args:  true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const converted = [...(await client.readDir(client.cdn.reactionDir('pat')))];

        let member1 = await client.utils.member(message, args, 0) ?? message.member;
        let member2 = await client.utils.member(message, args, 1);

        if (!member1)
        {
            return client.qEmbed('No user to pat!', interaction ?? message);
        }

        if (interaction)
        {
            member1 = await client.getMember(message.guild, args[0]);
            member2 = await client.getMember(message.guild, args[1]);

            if (!member2)
            {
                member2 = member1;
                member1 = message.member;
            }
        }

        const file = converted[Math.floor(Math.random() * converted.length)];

        return client.send(interaction ?? message.channel, null, [
            {
                color:       client.data.embedColor,
                description: `**${member1} just pat ${member2}!${Math.floor(Math.random() * 10) == 5
                    ? ' \*pat pat\***'
                    : '**'}`,
                image:       {
                    url: `attachment://${file}`
                }
            }
        ], [
            {
                attachment: client.cdn.reaction('pat', file),
                name:       `${file}`
            }
        ]);
    }
};
