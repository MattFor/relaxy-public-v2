'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'inventory',
    usage: '=inventory [user]',
    description:
        "Shows your (or another user's) Relaxy! inventory. The number in front of each item is its internal slot.\nAfter running `=inventory`, you can type `equip`, `unequip`, `discard` or `scrap` followed by an item ID to act on it. Scrapping any item gives you 100 money.",

    slashDescription: "Show your inventory, or someone else's.",

    slash: new Discord.SlashCommandBuilder().addUserOption((option) =>
        option.setName('user').setDescription('Whose inventory to show. Defaults to you.').setRequired(false)
    ),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        let member = (await client.utils.member(message, args, 0, { cut: true })) ?? message.member;

        let user = member?.user;

        const User = await client.module.database.User(user.id);

        if (message.author.id !== user.id || args.length !== 2) {
            return client.send(interaction ? 1 : message.channel, null, [
                await client.module.profiles.getInventoryEmbed(message, user, User)
            ]);
        }

        const actionType = args[0].toLowerCase();

        if (!['equip', 'unequip', 'discard', 'scrap'].includes(actionType)) {
            return client.qEmbed(
                'First argument is invalid, use: equip, unequip, discard, scrap!',
                interaction ?? message
            );
        }

        const itemIndex = Number(args[1]) - 1;

        if (isNaN(itemIndex) || !User.inv[itemIndex]) {
            return client.qEmbed("Item with this ID isn't present in your inventory!", interaction ?? message);
        }

        const itemSplit = User.inv[itemIndex].split('.');
        const itemType = itemSplit[itemSplit.length - 2];

        let moneyModified = false;

        switch (actionType) {
            case 'equip':
                {
                    for (let i = 0; i < User.inv.length; i++) {
                        const tempItemSplit = User.inv[i].split('.');
                        if (tempItemSplit[tempItemSplit.length - 2] === itemType) {
                            User.inv[i] = `${User.inv[i].slice(0, User.inv[i].length - 1)}X`;
                        }
                    }

                    User.inv[itemIndex] = `${User.inv[itemIndex].slice(0, User.inv[itemIndex].length - 1)}u`;
                }
                break;

            case 'unequip':
                {
                    User.inv[itemIndex] = `${User.inv[itemIndex].slice(0, User.inv[itemIndex].length - 1)}X`;
                }
                break;

            case 'discard':
                {
                    User.inv.splice(itemIndex, 1);
                }
                break;

            case 'scrap':
                {
                    User.inv.splice(itemIndex, 1);
                    User.m += 100;
                    moneyModified = true;
                }
                break;
        }

        client.saveProfile(
            user.id,
            {
                alter: 'inv',
                value: User.inv
            },
            moneyModified
                ? {
                      alter: 'm',
                      value: User.m
                  }
                : null
        );

        return client.send(interaction ? 1 : message.channel, null, [
            await client.module.profiles.getInventoryEmbed(message, user, User)
        ]);
    }
};
