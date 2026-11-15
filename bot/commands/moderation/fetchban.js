'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'fetchban',
    aliases: ['getban'],
    usage: '=fetchban <userId|name>',
    description:
        'Fetch the ban record for a user, by ID or by any name they were known by here.\n\nShows the case the ban was recorded under, so `=case <number>` gets you the rest of it - who banned them, when, and anything that has happened since.',

    slashDescription: 'Fetch the ban record for a user, by ID or by any name they were known by here.',

    slash: new Discord.SlashCommandBuilder().addStringOption((option) =>
        option
            .setName('userid')
            .setDescription('The ID, or any name the user was known by in this server.')
            .setRequired(true)
    ),
    args: true,

    defer: true,

    permissionsUser: ['SEND_MESSAGES', 'MODERATE_MEMBERS'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'BAN_MEMBERS'],

    async run(client, message, args, guild, interaction) {
        const resolved = await client.utils.resolveMemberByName(message.guild.id, args.join(' '));

        if (!resolved) {
            return client.qEmbed(
                'No user id given, and no member of this server is known by that name.',
                interaction ?? message
            );
        }

        if (resolved.ambiguous.length) {
            return client.qEmbed(
                `**\`${args.join(' ')}\`** has been used by ${resolved.ambiguous.length} different people here. Use an id:\n${resolved.ambiguous.map((hit) => `• \`${hit.id}\``).join('\n')}`,
                interaction ?? message
            );
        }

        const userId = resolved.id;
        const user = await client.getUser(userId);

        if (!user) {
            return client.qEmbed('This user does not exist!', interaction ?? message);
        }

        const fetchedBan = (await message.guild.bans.fetch(user).catch(client.swallow('fetchban: fetch'))) ?? null;

        if (!fetchedBan) {
            return client.qEmbed('No ban record exists for this user!', interaction ?? message);
        }

        const banCase = await client.utils.banCase(guild.id, userId);

        return client.send(interaction ? 1 : message.channel, null, [
            {
                color: client.data.embedColor,
                title: `${client.utils.tag(fetchedBan.user)}'s ban information${
                    banCase ? ` - Case #${banCase.n}` : ''
                }`,
                description: `${fetchedBan.user} **${client.utils.tag(fetchedBan.user)}** \`${fetchedBan.user.id}\`\n${fetchedBan.reason ?? 'No reason given.'}${
                    banCase
                        ? `\n\nBanned by ${banCase.md ? `<@${banCase.md}>` : '*someone Relaxy could not identify*'}${
                              banCase.at ? ` <t:${Math.floor(banCase.at / 1000)}:R>` : ''
                          }.`
                        : '\n\n*No case on record - the ban predates Relaxy, or was not seen.*'
                }`,
                thumbnail: {
                    url: fetchedBan.user.displayAvatarURL({
                        dynamic: true,
                        size: 4096
                    })
                }
            }
        ]);
    }
};
