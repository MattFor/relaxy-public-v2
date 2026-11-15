'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const LIST = ['list', 'status', 'show', 'info'];

const listPanels = async (client, message, interaction) => {
    const doc = await client.module.database.getReactionRoles(message.guild.id);
    const entries = doc?.e ?? [];

    const base = {
        color: client.data.embedColor,
        author: {
            name: 'Reaction roles',
            icon_url: client.utils.guildIcon(message.guild)
        },
        footer: client.data.footer,
        timestamp: new Date().toISOString()
    };

    if (!entries.length) {
        return client.send(interaction ? 1 : message.channel, null, [
            {
                ...base,
                description:
                    'This server has no reaction roles.\n\nBind one to a message that already exists with `=reactionrole <channel> <message id>`, or send a new one with `=reactionrole <your message>`.'
            }
        ]);
    }

    const detail = async (entry) => {
        const channel = client.channels.cache.get(entry.channel);

        const pairs = (entry.emojis ?? []).map((emoji, i) => {
            const roleId = entry.roles?.[i];

            return `**-** ${emoji} → ${roleId ? `<@&${roleId}>` : '*no role bound*'}`;
        });

        return {
            ...base,
            author: {
                name: `Reaction roles - #${channel?.name ?? 'deleted channel'}`,
                icon_url: client.utils.guildIcon(message.guild)
            },
            fields: [
                {
                    name: 'Message',
                    value: channel
                        ? `[Jump to it](https://discord.com/channels/${message.guild.id}/${entry.channel}/${entry.id})\n\`${entry.id}\``
                        : `\`${entry.id}\` *(its channel is gone)*`
                },
                {
                    name: `Roles [${pairs.length}]`,
                    value: (pairs.join('\n') || '*None bound*').slice(0, 1024)
                },
                {
                    name: 'Rebind it',
                    value: `\`=reactionrole #${channel?.name ?? '<channel>'} ${entry.id}\``
                }
            ]
        };
    };

    return new client.class.picker(client).run({
        message,
        interaction,
        id: 'rrlistui',
        placeholder: 'Select a reaction-role message…',
        empty: {
            ...base,
            description: `**${entries.length}** reaction-role messages on this server. Pick one to see it.`
        },
        choices: entries.map((entry, i) => ({
            value: String(i),
            label: `#${client.channels.cache.get(entry.channel)?.name ?? 'deleted channel'}`,
            description: `${(entry.roles ?? []).length} role(s) - ${entry.id}`,
            emoji: '🎭'
        })),
        render: async (value) => ({ embeds: [await detail(entries[Number(value)])] })
    });
};

export default {
    name: 'reactionrole',
    aliases: ['rr', 'reactionroles'],
    usage: '=reactionrole [list|<channel> <messageId>]',
    description:
        'Bind reaction roles to an existing message or send a new one. Accepts =embed formatting.\n`=reactionrole list` shows every reaction role on this server in a dropdown.\nTo bind to an existing message simply input the channel mention/id as the first argument and the message id as the second.\nTo construct a new one either type a normal message or an =embed formatted file.',

    permissionsUser: ['SEND_MESSAGES', 'EMBED_LINKS', 'ADD_REACTIONS', 'MANAGE_ROLES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ADD_REACTIONS', 'MANAGE_MESSAGES', 'MANAGE_ROLES'],

    async run(client, message, args, guild, interaction) {
        if (args.length === 1 && LIST.includes(args[0]?.toLowerCase()) && message.attachments.size === 0) {
            return listPanels(client, message, interaction);
        }

        if (message.attachments.size === 0 && !args[0]) {
            return client.qEmbed('No arguments provided!', interaction ?? message);
        }

        if (message.attachments.size > 0 && args[0]) {
            return client.qEmbed('Too many arguments provided!', interaction ?? message);
        }

        const info = {
            id: '',
            channel: '',
            emojis: [],
            roles: []
        };

        let text = null;
        let embed = null;

        let flag = false;
        let quickCase = false;

        let channel = await client.utils.channel(message, args, 0);
        const msg = await client.getMessage(channel, args[1]);

        try {
            channel = client.channels.cache.get(client.utils.nums(args[0]));
            quickCase = true;
        } catch {
            quickCase = false;
        }
        if (args.length === 2 && quickCase) {
            const msg =
                (await channel.messages
                    .fetch(client.utils.nums(args[1]))
                    .catch(client.swallow('reactionrole: nums'))) ?? null;

            if (channel && msg) {
                info.id = msg.id;
                info.channel = channel.id;

                client.send(message.channel, null, [
                    {
                        color: client.data.embedColor,
                        description: 'List the roles you want to appear by **mention** or **id** **`(in order)`**'
                    }
                ]);

                return message.channel
                    .awaitMessages({
                        filter: (m) => m.author.id === message.author.id,
                        max: 1,
                        time: 300000,
                        errors: ['time']
                    })
                    .then((c) => {
                        for (const item of client.utils.cleanup(c.first().content.split(' '))) {
                            let i = message.guild.roles.cache.find((role) => role.id === client.utils.nums(item));

                            if (!i) {
                                return client.qEmbed(`Role: [${item}] is invalid!`, interaction ?? message);
                            }

                            if (i.managed) {
                                return client.qEmbed(
                                    `Role: [${item}] cannot be added as it's managed another service!`,
                                    interaction ?? message
                                );
                            }

                            if (i.position > message.guild.members.me.roles.highest.position) {
                                return client.qEmbed(
                                    `Role: [${item}] is above Relaxy's highest role!`,
                                    interaction ?? message
                                );
                            }

                            info.roles.push(client.utils.nums(item));
                        }

                        client.send(message.channel, null, [
                            {
                                color: client.data.embedColor,
                                description:
                                    '**All roles valid!**\n**Please now type the corresponding emojis (in order)!**'
                            }
                        ]);

                        return message.channel
                            .awaitMessages({
                                filter: (m) => m.author.id === message.author.id,
                                max: 1,
                                time: 300000,
                                errors: ['time']
                            })
                            .then(async (c) => {
                                const messageReceived = c.first();

                                if (
                                    client.utils.cleanup(messageReceived.content.split(' ')).length !==
                                    info.roles.length
                                ) {
                                    info.roles.slice(
                                        0,
                                        client.utils.cleanup(messageReceived.content.split(' ')).length - 1
                                    );
                                }

                                try {
                                    if (
                                        client.utils.isValidEmoji(messageReceived.content, message).length !==
                                        client.utils.cleanup(messageReceived.content.split(' ')).length
                                    ) {
                                        return client.qEmbed(
                                            'One or more of the emojis is invalid!',
                                            interaction ?? message
                                        );
                                    }
                                } catch {
                                    return client.qEmbed(
                                        'One or more of the emojis is invalid!',
                                        interaction ?? message
                                    );
                                }

                                info.emojis = client.utils.isValidEmoji(messageReceived.content, message);

                                const reactionRoles = await client.module.database.getReactionRoles(guild.id);
                                reactionRoles.e.push(info);

                                await client.module.database.setReactionRoles(guild.id, reactionRoles.e);
                                client.core.ReactionRoles(msg, guild);

                                return client.qEmbed('Reaction roles applied, everything set!', interaction ?? message);
                            });
                    });
            }
        }

        const attachment = message.attachments.first();

        if (message.attachments.size > 0 && attachment?.contentType.includes('text')) {
            embed = new client.class.customEmbed(client);

            try {
                await embed.createFromFile(message);
            } catch {}

            if (embed.data === undefined || embed.data === null) {
                return client.qEmbed('The data you provided is invalid!', interaction ?? message);
            }

            client.send(message.channel, null, [
                {
                    color: client.data.embedColor,
                    description:
                        'Do you want text above the embed? It will not show any text if you reply with **`no`**.'
                }
            ]);

            await message.channel
                .awaitMessages({
                    filter: (m) => m.author.id === message.author.id,
                    max: 1,
                    time: 300000,
                    errors: ['time']
                })
                .then((c) => {
                    const messageReceived = c.first();

                    if (!messageReceived.content) {
                        flag = true;
                        return client.qEmbed('Invalid response!', interaction ?? message);
                    }

                    let a = messageReceived.content.toLowerCase();

                    if (a !== 'no' && a !== '`no`' && a !== '**`no`**') {
                        return (text = a);
                    }
                });

            if (flag) {
                return;
            }

            client.qEmbed('To which channel you want to sent this reaction role message?', interaction ?? message);

            return await message.channel
                .awaitMessages({
                    filter: (m) => m.author.id === message.author.id,
                    max: 1,
                    time: 300000,
                    errors: ['time']
                })
                .then(async (c) => {
                    const messageReceived = c.first();

                    if (!messageReceived.content) {
                        return client.qEmbed('No text provided!', interaction ?? message);
                    }

                    const channel = await client.utils.channel(messageReceived, messageReceived.content.split(' '), 0);

                    if (!channel) {
                        return client.qEmbed('Invalid channel!', interaction ?? message);
                    }

                    if (
                        guild.ch.t.rs.includes(channel.id) &&
                        !client.utils.isExempt(guild, interaction ?? message, client)
                    ) {
                        return client.qEmbed("Cannot use that channel as it's restricted!", interaction ?? message);
                    }

                    info.channel = channel.id;

                    return client
                        .send(channel, text, embed ? [embed.data] : null)
                        .then(async (msg) => {
                            info.id = msg.id;

                            client.send(message.channel, null, [
                                {
                                    color: client.data.embedColor,
                                    description:
                                        'List the roles you want to appear by **mention** or **id** **`(in order)`**'
                                }
                            ]);

                            await message.channel
                                .awaitMessages({
                                    filter: (m) => m.author.id === message.author.id,
                                    max: 1,
                                    time: 300000,
                                    errors: ['time']
                                })
                                .then((c) => {
                                    for (const item of client.utils.cleanup(c.first().content.split(' '))) {
                                        let i = message.guild.roles.cache.find(
                                            (role) => role.id === client.utils.nums(item)
                                        );

                                        if (!i) {
                                            return client.qEmbed(`Role: [${item}] is invalid!`, interaction ?? message);
                                        }

                                        if (i.managed) {
                                            return client.qEmbed(
                                                `Role: [${item}] cannot be added as it's managed another service!`,
                                                interaction ?? message
                                            );
                                        }

                                        if (i.position > message.guild.members.me.roles.highest.position) {
                                            return client.qEmbed(
                                                `Role: [${item}] is above Relaxy's highest role!`,
                                                interaction ?? message
                                            );
                                        }

                                        info.roles.push(client.utils.nums(item));
                                    }

                                    client.send(message.channel, null, [
                                        {
                                            color: client.data.embedColor,
                                            description:
                                                '**All roles valid!**\n**Please now type the corresponding emojis (in order)!**'
                                        }
                                    ]);

                                    message.channel
                                        .awaitMessages({
                                            filter: (m) => m.author.id === message.author.id,
                                            max: 1,
                                            time: 300000,
                                            errors: ['time']
                                        })
                                        .then(async (c) => {
                                            const messageReceived = c.first();

                                            if (
                                                client.utils.cleanup(messageReceived.content.split(' ')).length !==
                                                info.roles.length
                                            ) {
                                                info.roles.slice(
                                                    0,
                                                    client.utils.cleanup(messageReceived.content.split(' ')).length - 1
                                                );
                                            }

                                            try {
                                                if (
                                                    client.utils.isValidEmoji(messageReceived.content, message)
                                                        .length !==
                                                    client.utils.cleanup(messageReceived.content.split(' ')).length
                                                ) {
                                                    return client.qEmbed(
                                                        'One or more of the emojis is invalid!',
                                                        interaction ?? message
                                                    );
                                                }
                                            } catch {
                                                return client.qEmbed(
                                                    'One or more of the emojis is invalid!',
                                                    interaction ?? message
                                                );
                                            }

                                            info.emojis = client.utils.isValidEmoji(messageReceived.content, message);

                                            const reactionRoles = await client.module.database.getReactionRoles(
                                                guild.id
                                            );
                                            reactionRoles.e.push(info);

                                            await client.module.database.setReactionRoles(guild.id, reactionRoles.e);
                                            client.core.ReactionRoles(msg, guild);

                                            return client.qEmbed(
                                                'Reaction roles applied, everything set!',
                                                interaction ?? message
                                            );
                                        });
                                });
                        })
                        .catch(() => {
                            return client.qEmbed(
                                'An error occurred while sending the message!',
                                interaction ?? message
                            );
                        });
                });
        }

        client.qEmbed('To which channel you want to sent this reaction role message?', interaction ?? message);

        return message.channel
            .awaitMessages({
                filter: (m) => m.author.id === message.author.id,
                max: 1,
                time: 300000,
                errors: ['time']
            })
            .then(async (c) => {
                const messageReceived = c.first();

                if (!messageReceived.content) {
                    return client.qEmbed('No text provided!', interaction ?? message);
                }

                let channel = await client.utils.channel(messageReceived, messageReceived.content.split(' '), 0);

                if (!channel) {
                    return client.qEmbed('Invalid channel!', interaction ?? message);
                }

                if (guild.ch.t.rs.includes(channel.id) && !client.utils.isExempt(guild, message)) {
                    return client.qEmbed("Cannot use that channel as it's restricted!", interaction ?? message);
                }

                info.channel = channel.id;

                return client
                    .send(channel, args.join(' ') ?? null, null, attachment ? [attachment] : null)
                    .then(async (msg) => {
                        info.id = msg.id;

                        client.send(message.channel, null, [
                            {
                                color: client.data.embedColor,
                                description:
                                    'List the roles you want to appear by **mention** or **id** **`(in order)`**'
                            }
                        ]);

                        return message.channel
                            .awaitMessages({
                                filter: (m) => m.author.id === message.author.id,
                                max: 1,
                                time: 300000,
                                errors: ['time']
                            })
                            .then((c) => {
                                for (const item of client.utils.cleanup(c.first().content.split(' '))) {
                                    let i = message.guild.roles.cache.find(
                                        (role) => role.id === client.utils.nums(item)
                                    );

                                    if (!i) {
                                        return client.qEmbed(`Role: [${item}] is invalid!`, interaction ?? message);
                                    }

                                    if (i.managed) {
                                        return client.qEmbed(
                                            `Role: [${item}] cannot be added as it's managed another service!`,
                                            interaction ?? message
                                        );
                                    }

                                    if (i.position > message.guild.members.me.roles.highest.position) {
                                        return client.qEmbed(
                                            `Role: [${item}] is above Relaxy's highest role!`,
                                            interaction ?? message
                                        );
                                    }

                                    info.roles.push(client.utils.nums(item));
                                }

                                client.send(message.channel, null, [
                                    {
                                        color: client.data.embedColor,
                                        description:
                                            '**All roles valid!**\n**Please now type the corresponding emojis (in order)!**'
                                    }
                                ]);

                                return message.channel
                                    .awaitMessages({
                                        filter: (m) => m.author.id === message.author.id,
                                        max: 1,
                                        time: 300000,
                                        errors: ['time']
                                    })
                                    .then(async (c) => {
                                        const messageReceived = c.first();

                                        if (
                                            client.utils.cleanup(messageReceived.content.split(' ')).length !==
                                            info.roles.length
                                        ) {
                                            return client.qEmbed(
                                                "Number of emojis doesn't match number of roles!",
                                                interaction ?? message
                                            );
                                        }

                                        try {
                                            if (
                                                client.utils.isValidEmoji(messageReceived.content, message).length !==
                                                client.utils.cleanup(messageReceived.content.split(' ')).length
                                            ) {
                                                return client.qEmbed(
                                                    'One or more of the emojis is invalid!',
                                                    interaction ?? message
                                                );
                                            }
                                        } catch {
                                            return client.qEmbed(
                                                'One or more of the emojis is invalid!',
                                                interaction ?? message
                                            );
                                        }

                                        info.emojis = client.utils.isValidEmoji(messageReceived.content, message);

                                        const reactionRoles = await client.module.database.getReactionRoles(guild.id);
                                        reactionRoles.e.push(info);

                                        await client.module.database.setReactionRoles(guild.id, reactionRoles.e);
                                        client.core.ReactionRoles(msg, guild);

                                        return client.qEmbed(
                                            'Reaction roles applied, everything set!',
                                            interaction ?? message
                                        );
                                    });
                            });
                    })
                    .catch(() => {
                        return client.qEmbed('An error occurred while sending the message!', interaction ?? message);
                    });
            });
    }
};
