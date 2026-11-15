'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';
import { shopData } from '../../../src/Core/DataTable.js';

export default {
    name: 'preview',
    usage: '=preview <category> [item]',
    description:
        'Preview an item from the Relaxy! shop. **category** is the item category (e.g. `color`, a title category number, or a background category) and **item** is the specific item within it (a hex code for `color`).',

    args: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        if (message.mentions.users.first()) {
            message.author = message.mentions.users.first();
        }

        args.unshift('z');
        let item = null;

        try {
            item = args[2] ? (shopData.itemPrices[args[1]] ? shopData.itemPrices[args[1]][args[2]] : null) : null;
        } catch {
            args.shift();
            return client.qEmbed(`There's no such item as ${args.join(' ')}`, interaction ?? message);
        }

        if (!item) {
            try {
                item = shopData.itemPrices[args[1]];
            } catch {}
        }

        if (!item && args[1] !== 'color') {
            return client.qEmbed("Item specified doesn't exist!", interaction ?? message);
        }

        let user = await client.module.database.User(message.author.id);

        switch (args[1]) {
            case 'color': {
                let hex;
                try {
                    hex = args[2].match(/^#(?:[0-9a-fA-F]{3}){1,2}$/gm)[0];
                } catch {
                    return client.qEmbed('Invalid hex code!', interaction ?? message);
                }
                let f = await client.utils.calculateGlobalRank(message, user);
                let nxtLvl = client.utils.nextLevel(user.lvl);
                let rank = new client.cards.Rank()
                    .setAvatar(
                        message.author.displayAvatarURL({
                            extension: 'png',
                            size: 4096
                        })
                    )
                    .setCurrentXP(user.xp)
                    .setRequiredXP(nxtLvl)
                    .setLevel(user.lvl + 1)
                    .setLevelColor('#FF69B4')
                    .setRankColor('#FF69B4')

                    .setProgressBar('#FF69B4', 'COLOR')
                    .setRank(f, f, true)
                    .setDisplayName(client.utils.norm(message.member?.displayName ?? message.author.displayName))
                    .setUsername(client.utils.norm(message.author.username))
                    .setDiscriminator(
                        client.utils
                            .tag(message.author)
                            .match(/#\d{1,4}/g)?.[0]
                            .replace('#', '')
                    );
                let getBg = client.module.profiles.decodeProfileBackgroundStringArray(user.inv);
                if (getBg !== -1) {
                    rank.setBackground('IMAGE', client.cdn.background(getBg[0][0][0]));
                }
                rank.setCustomStatusColor(hex);
                return rank.build().then((buffer) => {
                    return client.send(message.channel, null, null, [
                        new Discord.AttachmentBuilder(buffer, { name: 'rank.png' })
                    ]);
                });
            }
            case '2': {
                if (!args[2]) {
                    return client.qEmbed('No item number given!', interaction ?? message);
                }
                if (!shopData.itemPrices['2'][args[2]][0]) {
                    return client.qEmbed("That item doesn't exist!", interaction ?? message);
                }

                let god_text = `${shopData.itemPrices['2'][args[2]][0]}.t.u`;
                let text = god_text ? god_text.split('.') : [];

                let actual_title = text[0];
                let special_title_addition = text[2] !== 't' ? text[2] : null;
                let color = text[1];
                let title = `${
                    god_text
                        ? `\`\`\`${color}\n${actual_title}\n\`\`\`${
                              special_title_addition
                                  ? special_title_addition === 'nnnn'
                                      ? '\n'
                                      : special_title_addition
                                  : ''
                          }`
                        : ''
                }`;
                let embed = await client.module.profiles.getProfileEmbed(message, message.author);
                embed = embed[0][0];
                embed.description = embed.description.slice(embed.description.indexOf('🗓️'), embed.description.length);
                embed.description = `${title}${embed.description}`;
                return client
                    .send(message.channel, null, [embed])
                    .catch(() => client.qEmbed('Something went wrong!', interaction ?? message));
            }
            default: {
                let nxtLvl = client.utils.nextLevel(user.lvl);
                let f = await client.utils.calculateGlobalRank(message, user);
                let rank = new client.cards.Rank()
                    .setAvatar(
                        message.author.displayAvatarURL({
                            extension: 'png',
                            size: 4096
                        })
                    )
                    .setCurrentXP(user.xp)
                    .setRequiredXP(nxtLvl)
                    .setLevel(user.lvl + 1)
                    .setLevelColor('#FF69B4')
                    .setRankColor('#FF69B4')

                    .setProgressBar('#FF69B4', 'COLOR')
                    .setDisplayName(client.utils.norm(message.member?.displayName ?? message.author.displayName))
                    .setUsername(client.utils.norm(message.author.username))
                    .setDiscriminator(
                        client.utils
                            .tag(message.author)
                            .match(/#\d{1,4}/g)?.[0]
                            .replace('#', '')
                    )
                    .setRank(f, f, true);

                rank.setBackground('IMAGE', client.cdn.background(item[0].replace(' background', '')));

                let getStatusColor = client.module.profiles.decodeProfileStatusColorStringArray(user.inv);

                if (getStatusColor !== -1) {
                    rank.setCustomStatusColor(getStatusColor[0][0][0]);
                }
                return rank.build().then((buffer) => {
                    return client.send(message.channel, null, null, [
                        new Discord.AttachmentBuilder(buffer, { name: 'rank.png' })
                    ]);
                });
            }
        }
    }
};
