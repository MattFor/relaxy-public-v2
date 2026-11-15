'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';
import { shopData } from '../../../src/Core/DataTable.js';

const COLOR_PRICE = shopData.itemPrices.scolor[1];
const CATEGORIES = {
    bg: {
        label: 'Backgrounds',
        emoji: '🖼️',
        blurb: 'Rank-card backgrounds',
        items: () =>
            Object.keys(shopData.itemPrices['1']).map((key) => ({
                key,
                name: shopData.itemNames['1'][key].trim(),
                price: shopData.itemPrices['1'][key][1]
            }))
    },
    title: {
        label: 'Titles',
        emoji: '🏷️',
        blurb: 'Profile titles',
        items: () =>
            Object.keys(shopData.itemPrices['2']).map((key) => ({
                key,
                name: shopData.itemNames['2'][key].replace(/^Title:\s*/, '').trim(),
                price: shopData.itemPrices['2'][key][1]
            }))
    },
    color: {
        label: 'Status colour',
        emoji: '🎨',
        blurb: `Custom profile outline - ${COLOR_PRICE} 💵`
    }
};
const CATEGORY_ALIASES = {
    1: 'bg',
    bg: 'bg',
    background: 'bg',
    backgrounds: 'bg',
    2: 'title',
    title: 'title',
    titles: 'title',
    color: 'color',
    colour: 'color',
    scolor: 'color',
    statuscolor: 'color'
};

const money = (amount) =>
    amount > 1000000 ? `\`${amount}\` 🤑` : amount > 10000 ? `\`${amount}\` 💰` : `\`${amount}\` 💵`;

const parseHex = (raw) => {
    const match = String(raw ?? '')
        .trim()
        .match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

    return match ? `#${match[1].toUpperCase()}` : null;
};

const applyPurchase = (client, user, category, key, hex) => {
    let price;
    let label;
    let encoded;

    if (category === 'bg') {
        if (!shopData.itemPrices['1'][key]) {
            return {
                ok: false,
                reason: 'missing'
            };
        }

        price = shopData.itemPrices['1'][key][1];
        label = shopData.itemNames['1'][key].trim();
        encoded = client.module.profiles.encodeProfileBackgroundString(`${key} background unused`)[0];
    } else if (category === 'title') {
        if (!shopData.itemPrices['2'][key]) {
            return {
                ok: false,
                reason: 'missing'
            };
        }

        price = shopData.itemPrices['2'][key][1];
        label = shopData.itemNames['2'][key].replace(/^Title:\s*/, '').trim();
        encoded = `${shopData.itemPrices['2'][key][0]}.t.X`;
    } else {
        if (!hex) {
            return {
                ok: false,
                reason: 'missing'
            };
        }

        price = COLOR_PRICE;
        label = hex;
        encoded = client.module.profiles.encodeProfileStatusColorString(`${hex} statuscolor unused`)[0];
    }

    if (user.m < price) {
        return {
            ok: false,
            reason: 'funds',
            price
        };
    }

    user.m -= price;
    user.inv.push(encoded);

    client.saveProfile(
        user.id,
        {
            alter: 'inv',
            value: user.inv
        },
        {
            alter: 'm',
            value: user.m
        }
    );

    return {
        ok: true,
        price,
        label
    };
};

const renderColorCard = async (client, message, user, hex) => {
    const rank = new client.cards.Rank()
        .setAvatar(
            message.author.displayAvatarURL({
                extension: 'png',
                size: 4096
            })
        )
        .setCurrentXP(user.xp)
        .setRequiredXP(client.utils.nextLevel(user.lvl))
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
        );

    const background = client.module.profiles.decodeProfileBackgroundStringArray(user.inv);

    if (background !== -1) {
        rank.setBackground('IMAGE', client.cdn.background(background[0][0][0]));
    }

    rank.setCustomStatusColor(hex);

    return rank.build();
};

const buildSuccess = async (client, message, user, category, key, hex, label) => {
    const base = {
        color: client.data.embedColor,
        author: {
            name: 'Purchase complete!',
            icon_url: client.cdn.profile.paymentComplete
        },
        footer: client.data.footer,
        timestamp: new Date().toISOString()
    };

    if (category === 'bg') {
        return {
            embeds: [
                {
                    ...base,
                    description: `Your new rank-card background: **${label}**\nUse it from \`=inventory\` (equip its slot). Balance: **${money(user.m)}**`,
                    image: { url: client.cdn.background(key) }
                }
            ],
            files: []
        };
    }

    if (category === 'title') {
        return {
            embeds: [
                {
                    ...base,
                    description: `Your profile now has the title:\n\`\`\`\n${label}\n\`\`\`\nUse it from \`=inventory\`. Balance: **${money(user.m)}**`
                }
            ],
            files: []
        };
    }

    const buffer = await renderColorCard(client, message, user, hex);

    return {
        embeds: [
            {
                ...base,
                description: `Your profile-picture outline on \`=profile\` / \`=lvl\` will now be **\`${hex}\`**! Balance: **${money(user.m)}**`,
                image: { url: 'attachment://preview.png' }
            }
        ],
        files: [new Discord.AttachmentBuilder(buffer, { name: 'preview.png' })]
    };
};
const closeButton = () =>
    new Discord.ButtonBuilder().setCustomId('shopui_close').setLabel('Close').setStyle(Discord.ButtonStyle.Secondary);

const backButton = () =>
    new Discord.ButtonBuilder().setCustomId('shopui_back').setLabel('Back').setStyle(Discord.ButtonStyle.Secondary);

const categoryRow = () =>
    new Discord.ActionRowBuilder().addComponents(
        new Discord.StringSelectMenuBuilder()
            .setCustomId('shopui_cat')
            .setPlaceholder('Choose a category…')
            .addOptions(
                Object.entries(CATEGORIES).map(([value, category]) => ({
                    value,
                    label: category.label,
                    description: category.blurb.slice(0, 100),
                    emoji: category.emoji
                }))
            )
    );
const homeView = (client, user) => ({
    embeds: [
        {
            color: client.data.embedColor,
            author: {
                name: 'Relaxy! Shop',
                icon_url: client.cdn.profile.shop
            },
            description: `Balance: **${money(user.m)}**\n\nPick a category to browse. The preview updates live - nothing is charged until you press **Confirm**.`,
            footer: client.data.footer
        }
    ],
    files: [],
    components: [categoryRow(), new Discord.ActionRowBuilder().addComponents(closeButton())]
});

const listView = (client, user, category) => {
    const items = CATEGORIES[category].items();

    const menu = new Discord.StringSelectMenuBuilder()
        .setCustomId('shopui_pick')
        .setPlaceholder('Choose an item to preview…')
        .addOptions(
            items.map((item) => {
                const affordable = user.m >= item.price;

                return {
                    value: item.key,
                    label: item.name.slice(0, 100),
                    description: `${item.price} 💵${affordable ? '' : ' - too expensive'}`.slice(0, 100),
                    emoji: affordable ? '🟢' : '🔴'
                };
            })
        );

    const list = items
        .map((item) => `${user.m >= item.price ? '🟢' : '🔴'} **${item.name}** - \`${item.price}\` 💵`)
        .join('\n');

    return {
        embeds: [
            {
                color: client.data.embedColor,
                author: {
                    name: `Shop - ${CATEGORIES[category].label}`,
                    icon_url: client.cdn.profile.shop
                },
                description: `Balance: **${money(user.m)}**\n\n${list}\n\n🟢 you can afford · 🔴 you can't`,
                footer: client.data.footer
            }
        ],
        files: [],
        components: [
            new Discord.ActionRowBuilder().addComponents(menu),
            new Discord.ActionRowBuilder().addComponents(backButton(), closeButton())
        ]
    };
};

const colorPromptView = (client, user) => ({
    embeds: [
        {
            color: client.data.embedColor,
            author: {
                name: 'Shop - Status colour',
                icon_url: client.cdn.profile.shop
            },
            description: `A custom outline colour for your \`=profile\` / \`=lvl\` card.\nPrice: **${COLOR_PRICE} 💵** · Balance: **${money(user.m)}**\n\nPress **Enter a hex code** to preview it on your own card first.`,
            footer: client.data.footer
        }
    ],
    files: [],
    components: [
        new Discord.ActionRowBuilder().addComponents(
            new Discord.ButtonBuilder()
                .setCustomId('shopui_hex')
                .setLabel('Enter a hex code')
                .setEmoji('🎨')
                .setStyle(Discord.ButtonStyle.Primary),
            backButton(),
            closeButton()
        )
    ]
});

const confirmView = (client, user, category, item, extra = {}) => {
    const affordable = user.m >= item.price;

    const confirmButton = new Discord.ButtonBuilder()
        .setCustomId('shopui_confirm')
        .setLabel(affordable ? `Buy - ${item.price} 💵` : 'Not enough money')
        .setStyle(Discord.ButtonStyle.Success)
        .setDisabled(!affordable);

    const embed = {
        color: client.data.embedColor,
        author: {
            name: 'Confirm purchase',
            icon_url: client.cdn.profile.shop
        },
        description: `**${item.name}**\nPrice: **\`${item.price}\`** 💵 · Balance after: **${money(user.m - item.price)}**`,
        footer: client.data.footer,
        ...extra.embed
    };

    return {
        embeds: [embed],
        files: extra.files ?? [],
        components: [new Discord.ActionRowBuilder().addComponents(confirmButton, backButton(), closeButton())]
    };
};
const settled = (view) => ({
    embeds: view.embeds,
    files: view.files ?? [],
    components: []
});

export default {
    name: 'buy',
    usage: '=buy [category] [item]',
    description:
        'Open the Relaxy! shop and buy profile backgrounds, titles or a custom status colour. Run `=buy` on its own for an interactive, button-driven shop, or go straight to an item with `=buy <category> <item>` (e.g. `=buy bg 3`, `=buy title 2`, `=buy color #FF69B4`). Browse with `=shop` and preview with `=preview`.',

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        const user = await client.module.database.User(message.author.id);

        if (args.length) {
            const category = CATEGORY_ALIASES[args[0].toLowerCase()];

            if (!category) {
                return client.qEmbed(
                    'Unknown category. Use `background`, `title` or `color` - or just run `=buy` for the interactive shop.',
                    interaction ?? message
                );
            }

            let key;
            let hex;

            if (category === 'color') {
                hex = parseHex(args[1]);

                if (!hex) {
                    return client.qEmbed(
                        'That is not a valid hex code. Try something like `=buy color #FF69B4`.',
                        interaction ?? message
                    );
                }
            } else {
                key = args[1];

                if (!key || !CATEGORIES[category].items().some((item) => item.key === key)) {
                    return client.qEmbed(
                        `No such item in **${CATEGORIES[category].label}**. Browse them with \`=shop\`.`,
                        interaction ?? message
                    );
                }
            }

            const result = applyPurchase(client, user, category, key, hex);

            if (!result.ok) {
                if (result.reason === 'funds') {
                    return client.qEmbed(
                        `You can't afford that - it costs **${result.price} 💵** and you have **${money(user.m)}**.`,
                        interaction ?? message
                    );
                }

                return client.qEmbed("That item doesn't exist!", interaction ?? message);
            }

            const success = await buildSuccess(client, message, user, category, key, hex, result.label);

            return client.send(message.channel, null, success.embeds, success.files);
        }

        let view = homeView(client, user);
        const shopMessage = await client.send(message.channel, null, view.embeds, view.files, [], view.components);

        if (!shopMessage) {
            return;
        }

        let category = null;
        let selected = null;
        let hex = null;

        const collector = shopMessage.createMessageComponentCollector({
            filter: (pressed) => pressed.user.id === message.author.id,
            idle: 120 * 1000
        });

        const show = (pressed, next) => {
            view = next;

            return pressed.update({
                content: null,
                embeds: next.embeds,
                components: next.components,
                files: next.files ?? [],
                ...(next.files?.length ? {} : { attachments: [] })
            });
        };

        collector.on('collect', async (pressed) => {
            try {
                const fresh = await client.module.database.User(message.author.id);

                switch (pressed.customId) {
                    case 'shopui_close': {
                        collector.stop('closed');
                        return;
                    }

                    case 'shopui_back': {
                        category = null;
                        selected = null;
                        hex = null;
                        return show(pressed, homeView(client, fresh));
                    }

                    case 'shopui_cat': {
                        category = pressed.values[0];
                        selected = null;
                        hex = null;

                        return show(
                            pressed,
                            category === 'color' ? colorPromptView(client, fresh) : listView(client, fresh, category)
                        );
                    }

                    case 'shopui_pick': {
                        const item = CATEGORIES[category].items().find((i) => i.key === pressed.values[0]);

                        if (!item) {
                            return show(pressed, listView(client, fresh, category));
                        }

                        selected = item;

                        const extra =
                            category === 'bg'
                                ? { embed: { image: { url: client.cdn.background(item.key) } } }
                                : {
                                      embed: {
                                          description: `**${item.name}**\nPrice: **\`${item.price}\`** 💵 · Balance after: **${money(fresh.m - item.price)}**\n\nPreview:\n\`\`\`\n${item.name}\n\`\`\``
                                      }
                                  };

                        return show(pressed, confirmView(client, fresh, item, extra));
                    }

                    case 'shopui_hex': {
                        const modal = new Discord.ModalBuilder()
                            .setCustomId('shopui_hexmodal')
                            .setTitle('Custom status colour')
                            .addComponents(
                                new Discord.ActionRowBuilder().addComponents(
                                    new Discord.TextInputBuilder()
                                        .setCustomId('shopui_hexvalue')
                                        .setLabel('Hex code (e.g. #FF69B4)')
                                        .setStyle(Discord.TextInputStyle.Short)
                                        .setMinLength(3)
                                        .setMaxLength(7)
                                        .setRequired(true)
                                )
                            );

                        await pressed.showModal(modal);

                        const submitted = await pressed
                            .awaitModalSubmit({
                                time: 120 * 1000,
                                filter: (modalInteraction) =>
                                    modalInteraction.user.id === message.author.id &&
                                    modalInteraction.customId === 'shopui_hexmodal'
                            })
                            .catch(() => null);

                        if (!submitted) {
                            return;
                        }

                        const parsed = parseHex(submitted.fields.getTextInputValue('shopui_hexvalue'));

                        if (!parsed) {
                            return submitted.reply({
                                content: 'That is not a valid hex code. Try `#FF69B4`.',
                                flags: Discord.MessageFlags.Ephemeral
                            });
                        }

                        hex = parsed;
                        selected = {
                            key: null,
                            name: `Status colour \`${hex}\``,
                            price: COLOR_PRICE
                        };

                        const buffer = await renderColorCard(client, message, fresh, hex);
                        const view2 = confirmView(client, fresh, selected, {
                            embed: { image: { url: 'attachment://preview.png' } },
                            files: [new Discord.AttachmentBuilder(buffer, { name: 'preview.png' })]
                        });

                        view = view2;

                        return submitted.update({
                            content: null,
                            embeds: view2.embeds,
                            components: view2.components,
                            files: view2.files
                        });
                    }

                    case 'shopui_confirm': {
                        if (!selected) {
                            return show(pressed, homeView(client, fresh));
                        }

                        const result = applyPurchase(client, fresh, category, selected.key, hex);

                        if (!result.ok) {
                            if (result.reason === 'funds') {
                                return show(pressed, confirmView(client, fresh, selected));
                            }

                            collector.stop('error');
                            return;
                        }

                        const success = await buildSuccess(
                            client,
                            message,
                            fresh,
                            category,
                            selected.key,
                            hex,
                            result.label
                        );

                        collector.stop('bought');

                        return pressed.update({
                            content: null,
                            embeds: success.embeds,
                            files: success.files,
                            components: [],
                            ...(success.files.length ? {} : { attachments: [] })
                        });
                    }

                    default: {
                        return;
                    }
                }
            } catch (e) {
                client.log('ERROR', 'buy shop interaction failed:', e);
            }
        });

        collector.on('end', (_collected, reason) => {
            if (reason === 'bought') {
                return;
            }

            client
                .edit(shopMessage, null, settled(view).embeds, settled(view).files, settled(view).components)
                .catch(client.swallow('buy: settled'));
        });
    }
};
