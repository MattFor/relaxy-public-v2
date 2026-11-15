'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'countingleaderboard',
    aliases: ['countlb', 'clb', 'countingtop'],
    usage: '=countingleaderboard',
    description:
        "Show the counting leaderboard - the members who have contributed the most correct counts, along with the server's current count and all-time record.",

    slashDescription: 'Show who has contributed the most correct counts.',

    slash: new Discord.SlashCommandBuilder(),

    cooldown: 5,

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        if (!guild.co.on && !guild.co.c) {
            return client.qEmbed(
                "Counting isn't set up on this server yet. An admin can start it with `=counting setup`.",
                interaction ?? message
            );
        }

        const members = await client.module.database.findMembers(message.guild.id);

        const ranked = members
            .filter((m) => (m.co ?? 0) > 0)
            .sort((a, b) => (b.co ?? 0) - (a.co ?? 0))
            .slice(0, 15);

        const list = [];
        for (let i = 0; i < ranked.length; i++) {
            const entry = ranked[i];
            const name = (await client.getUser(entry.id))?.username ?? 'Unavailable';
            const medal = ['🥇', '🥈', '🥉'][i] ?? `\`${i + 1}.\``;

            list.push(`${medal} **${name}** - \`${entry.co}\` count${entry.co === 1 ? '' : 's'}`);
        }

        const me = members.find((m) => m.id === message.author.id);
        const myCount = me?.co ?? 0;

        return client.send(interaction ? 1 : message.channel, null, [
            {
                color: client.data.embedColor,
                title: `🔢 Counting leaderboard - ${message.guild.name}`,
                description:
                    `Current count: **${guild.co.cur}** · Record: **${guild.co.hi}**\n\n` +
                    (list.length ? list.join('\n') : 'No one has counted yet - be the first!') +
                    `\n\nYou've counted **${myCount}** time${myCount === 1 ? '' : 's'}.`,
                thumbnail: { url: client.utils.guildIcon(message.guild) },
                footer: client.data.footer,
                timestamp: new Date()
            }
        ]);
    }
};
