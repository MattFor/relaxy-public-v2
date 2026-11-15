'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';
import { emojiCollections } from '../../../src/Core/DataTable.js';

const PER_PAGE = 15;

const renderPage = async (client, message, ranked, page, field) => {
    const start = PER_PAGE * (page - 1);
    const slice = ranked.slice(start, start + PER_PAGE);
    const lines = [];

    for (let i = 0; i < slice.length; i++) {
        const row = slice[i];
        const profile = await client.module.database.User(row.id);

        if (profile.lo) {
            continue;
        }

        const name =
            message.author.id === row.id
                ? message.member.toString()
                : ((await client.getUser(row.id))?.username ?? null);

        if (!name) {
            continue;
        }

        const shown = field === 'lvl' ? (Number(row.lvl) || 0) + 1 : (Number(row.msg) || 0).toLocaleString();

        lines.push(`\`${start + i + 1}\`** - ${name}**  [${shown}]`);
    }

    return lines.join('\n') || '*Nobody to show on this page.*';
};

export default {
    name: 'leaderboard',
    aliases: ['lb'],
    usage: '=leaderboard',
    description:
        'Shows the server leaderboard.\nReact with 🔠 for the top 15 by message count (since Relaxy! joined), 🔢 for the top 15 by level, and ⏹️ to return to the main page.',

    cooldown: 4,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ADD_REACTIONS', 'MANAGE_MESSAGES'],

    async run(client, message, args, guild, interaction) {
        let guildMembers = await client.module.database.findMembers(message.guild.id);
        let User = await client.module.database.Member(message.author.id, guild.id);

        if (!guild.lv.on) {
            return client.qEmbed('Leveling is disabled on this server!', interaction ?? message);
        }

        let page = 1;
        let last_pressed = '';

        const member_level_list = client.utils.rankedBy(guildMembers, 'lvl', 'xp');
        const member_message_list = client.utils.rankedBy(guildMembers, 'msg');

        const spot = (ranked, id) => {
            const at = ranked.findIndex((row) => row.id === id);

            return at === -1 ? 'unranked' : at + 1;
        };

        const summary = () =>
            `🔠 ***- leaderboard for number of messages sent***\n🔢 ***- leaderboard for guild levels***\n⏹️ ***- main page***\n\nYour level spot: **\`[${spot(member_level_list, message.author.id)}]\`**\nYour messages spot: **\`[${spot(member_message_list, message.author.id)}]\`**\nYou sent \`${User.msg.toLocaleString()}\` messages and your level is \`${User.lvl + 1}\``;

        const lastPage = (list) => Math.max(1, Math.ceil(list.length / PER_PAGE));

        client
            .send(message.channel, null, [
                {
                    color: client.data.embedColor,
                    title: summary(),
                    footer: client.data.footer,
                    timestamp: new Date(),
                    thumbnail: {
                        url: client.utils.guildIcon(message.guild)
                    }
                }
            ])
            .then(async (m) => {
                await client.react(m, emojiCollections.leaderboard);

                const collector = m.createReactionCollector({
                    filter: (r, user) => {
                        return user.id === message.author.id && !user.bot;
                    }
                });

                collector.on('collect', async (reaction, user) => {
                    m.reactions.cache.get(reaction.emoji.name).users.remove(user.id);

                    last_pressed = ['🔠', '🔢'].includes(reaction.emoji.name) ? reaction.emoji.name : last_pressed;

                    if (last_pressed !== reaction.emoji.name && ['🔠', '🔢'].includes(reaction.emoji.name)) {
                        page = 1;
                    }

                    switch (reaction.emoji.name) {
                        case '⏹️':
                            return client.edit(m, null, [
                                {
                                    color: client.data.embedColor,
                                    title: summary(),
                                    footer: client.data.footer,
                                    timestamp: new Date(),
                                    thumbnail: { url: client.utils.guildIcon(message.guild) }
                                }
                            ]);

                        case '🔠':
                        case '🔢': {
                            page = 1;
                            break;
                        }

                        case '◀️': {
                            if (page === 1 || last_pressed.length === 0) {
                                return;
                            }

                            page--;
                            break;
                        }

                        case '▶️': {
                            const list = last_pressed === '🔠' ? member_message_list : member_level_list;

                            if (last_pressed.length === 0 || page >= lastPage(list)) {
                                return;
                            }

                            page++;
                            break;
                        }
                    }

                    if (last_pressed.length) {
                        const ranked = last_pressed === '🔠' ? member_message_list : member_level_list;

                        return client.edit(m, null, [
                            {
                                color: client.data.embedColor,
                                title: `${
                                    last_pressed === '🔠' ? 'Messages' : 'Leveling'
                                } leaderboard for **${client.utils.firstLetterUp(message.guild.name)}** - page ${page}/${lastPage(ranked)}`,
                                footer: client.data.footer,
                                description: await renderPage(
                                    client,
                                    message,
                                    ranked,
                                    page,
                                    last_pressed === '🔠' ? 'msg' : 'lvl'
                                ),
                                timestamp: new Date(),
                                thumbnail: { url: client.utils.guildIcon(message.guild) }
                            }
                        ]);
                    }
                });

                setTimeout(async () => {
                    m.reactions.removeAll().catch(client.swallow('leaderboard: removeAll'));
                    return collector.stop();
                }, 120 * 1000);
            });
    }
};
