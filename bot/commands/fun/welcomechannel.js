'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';
import { wmTypes } from '../../../src/Core/DataTable.js';

const generateButtonPanel = () => {
    const switchCardMode = new Discord.ButtonBuilder()
        .setCustomId('welcomechannel_switch')
        .setLabel('Switch Card Mode')
        .setStyle(Discord.ButtonStyle.Success);

    const editCurrentCard = new Discord.ButtonBuilder()
        .setCustomId('welcomechannel_edit')
        .setLabel('Edit Card')
        .setStyle(Discord.ButtonStyle.Secondary);

    return new Discord.ActionRowBuilder().addComponents(switchCardMode, editCurrentCard);
};

const encodedInteractionIds = {
    'welcomechannel_modal-edit-pic-top': ['wc.j.t', 'wc.l.t'],
    'welcomechannel_modal-edit-pic-bottom': ['wc.j.b', 'wc.l.b'],
    'welcomechannel_modal-edit-channel': ['wc.j.c', 'wc.l.c'],
    'welcomechannel_modal-edit-message': ['wc.j.m', 'wc.l.m']
};

export default {
    name: 'welcomechannel',
    aliases: ['wcl', 'entrance'],
    usage: '=welcomechannel [type] [welcome|leave] [message]',
    description:
        'Adds a channel where Relaxy! will send welcome/goodbye messages when people join/leave your server.\n**type** is the card style (1-16, defaults to 7), and you can optionally pass `welcome` or `leave` followed by a custom message.\n## After it is used, use it again to configure how the welcome messages function / look',

    permissionsUser: ['SEND_MESSAGES', 'EMBED_LINKS', 'MANAGE_GUILD'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES', 'MANAGE_CHANNELS'],

    async run(client, message, args, guild, interaction) {
        if (interaction) {
            const data = message.embeds[0].data.thumbnail.url.split('=')[1].split('_');

            let type = data[1] === 'ON';
            const interactionUserId = data[0];

            if (!interactionUserId || interaction.member.user.id !== interactionUserId) {
                return 0b01100101_01110010_01110010_01101111_01110010;
            }

            let attachmentPresentLeave = [4, 6, 7, 8, 9, 11, 13].includes(Number(guild.wc.t)) && !type;
            let attachmentPresentWelcome = [2, 3, 7, 9, 10, 11, 13].includes(Number(guild.wc.t)) && type;

            let content = type ? guild.wc.j.m.split('[SPLIT_FLAG]') : guild.wc.l.m.split('[SPLIT_FLAG]');

            let attachmentPresent = attachmentPresentLeave || attachmentPresentWelcome;

            let additionalMessage = '';
            const interactionId = interaction.customId.split('_')[1];

            if (interactionId.startsWith('modal-edit')) {
                const fieldsToSave = [];
                let fields = interaction.fields.fields;

                const _field = fields.find((f) => f.customId === 'welcomechannel_modal-edit-channel');
                if (_field && _field.value !== '') {
                    const channel = await client.utils.channel(message, [_field.value], 0);

                    fieldsToSave.push({
                        alter: encodedInteractionIds[_field.customId][type ? 0 : 1],
                        value: channel.id
                    });

                    fields = fields.filter((f) => f.customId !== 'welcomechannel_modal-edit-channel');
                }

                fields
                    .filter((f) => f.value !== '')
                    .forEach(async (field) => {
                        fieldsToSave.push({
                            alter: encodedInteractionIds[field.customId][type ? 0 : 1],
                            value: field.value
                        });
                    });

                if (fieldsToSave.length !== 0) {
                    client.save(guild.id, ...fieldsToSave);
                }
            } else {
                switch (interactionId) {
                    case 'edit': {
                        const cardEditModal = new Discord.ModalBuilder()
                            .setCustomId('welcomechannel_modal-edit-main')
                            .setTitle(`${type ? 'Welcome message' : 'Goodbye message'} edit form.`);

                        const cardEditModal_PictureTopText = new Discord.TextInputBuilder()
                            .setCustomId('welcomechannel_modal-edit-pic-top')
                            .setLabel(`${type ? 'Welcome ' : 'Goodbye '} Card Top Text`)
                            .setStyle(Discord.TextInputStyle.Short)
                            .setPlaceholder(type ? guild.wc.j.t : guild.wc.l.t)
                            .setMaxLength(15)
                            .setRequired(false);

                        const cardEditModal_PictureBottomText = new Discord.TextInputBuilder()
                            .setCustomId('welcomechannel_modal-edit-pic-bottom')
                            .setLabel(`${type ? 'Welcome ' : 'Goodbye '} Card Bottom Text`)
                            .setStyle(Discord.TextInputStyle.Short)
                            .setPlaceholder(type ? guild.wc.j.b : guild.wc.l.b)
                            .setMaxLength(30)
                            .setRequired(false);

                        const channelId = type ? guild.wc.j.c : guild.wc.l.c;
                        const channel =
                            (await client.channels.fetch(channelId).catch(client.swallow('welcomechannel: fetch'))) ??
                            null;

                        const cardEditModal_Channel = new Discord.TextInputBuilder()
                            .setCustomId('welcomechannel_modal-edit-channel')
                            .setLabel(`${type ? 'Welcome ' : 'Goodbye '} Channel ID / Name`)
                            .setStyle(Discord.TextInputStyle.Short)
                            .setPlaceholder(`${channelId}${channel ? ` / ${channel.name}` : ''}`)
                            .setMaxLength(20)
                            .setRequired(false);

                        const cardEditModal_Message = new Discord.TextInputBuilder()
                            .setCustomId('welcomechannel_modal-edit-message')
                            .setLabel(`${type ? 'Welcome ' : 'Goodbye '} Message`)
                            .setStyle(Discord.TextInputStyle.Paragraph)
                            .setPlaceholder(type ? guild.wc.j.m : guild.wc.l.m)
                            .setMaxLength(2000)
                            .setRequired(false);

                        const actionRowOptional1 = new Discord.ActionRowBuilder().addComponents(
                            cardEditModal_PictureTopText
                        );
                        const actionRowOptional2 = new Discord.ActionRowBuilder().addComponents(
                            cardEditModal_PictureBottomText
                        );

                        const actionRowRequired1 = new Discord.ActionRowBuilder().addComponents(cardEditModal_Channel);
                        const actionRowRequired2 = new Discord.ActionRowBuilder().addComponents(cardEditModal_Message);

                        cardEditModal.addComponents(
                            actionRowOptional1,
                            actionRowOptional2,

                            actionRowRequired1,
                            actionRowRequired2
                        );

                        return await interaction.showModal(cardEditModal);
                    }
                    case 'switch':
                        type = !type;
                        break;
                }
            }

            attachmentPresentLeave = [4, 6, 7, 8, 9, 11, 13].includes(Number(guild.wc.t)) && !type;
            attachmentPresentWelcome = [2, 3, 7, 9, 10, 11, 13].includes(Number(guild.wc.t)) && type;

            content = type ? guild.wc.j.m.split('[SPLIT_FLAG]') : guild.wc.l.m.split('[SPLIT_FLAG]');

            attachmentPresent = attachmentPresentLeave || attachmentPresentWelcome;

            let card = null;

            let buffer = null;
            if (attachmentPresent) {
                if (attachmentPresentLeave) {
                    card = new client.cards.Leaver();
                } else {
                    card = new client.cards.Welcomer();
                }

                card.setColor('#FF69B4')
                    .setGuildName(interaction.member.guild.name)
                    .setMemberCount(interaction.member.guild.memberCount)
                    .setUsername(client.utils.norm(interaction.member.user.username))
                    .setDiscriminator(
                        client.utils
                            .tag(interaction.member.user)
                            .match(/#\d{1,4}/g)?.[0]
                            .replace('#', '')
                    )
                    .setAvatar(
                        interaction.member.displayAvatarURL({
                            extension: 'png',
                            size: 4096
                        })
                    );

                card.colorTitle = '#FF69B4';
                card.textMessage = (type ? guild.wc.j.b : guild.wc.l.b)
                    .replace(/\bbotver\b/g, client.config.keys.version)
                    .replace(/\|U\|/g, interaction.member.nickname ?? interaction.member.user.username)
                    .replace(/\|G\|/g, interaction.member.guild.name)
                    .replace(/\|MC\|/g, interaction.guild.memberCount);
                card.textTitle = (type ? guild.wc.j.t : guild.wc.l.t)
                    .replace(/\bbotver\b/g, client.config.keys.version)
                    .replace(/\|U\|/g, interaction.member.nickname ?? interaction.member.user.username)
                    .replace(/\|G\|/g, interaction.member.guild.name)
                    .replace(/\|MC\|/g, interaction.guild.memberCount);

                buffer = await card.build();
            }

            const channelId = type ? guild.wc.j.c : guild.wc.l.c;
            const channel =
                (await client.channels.fetch(channelId).catch(client.swallow('welcomechannel: fetch'))) ?? null;

            await client.update(
                interaction,
                null,
                [
                    {
                        color: client.data.embedColor,
                        title: type ? 'Displaying Welcome Message' : 'Displaying Goodbye Message',

                        description:
                            content[0] === 'NULL(0)'
                                ? null
                                : content[0]
                                      .replace(/\bbotver\b/g, client.config.keys.version)
                                      .replace(/\|U\|/g, interaction.member)
                                      .replace(/\|G\|/g, interaction.member.guild.name)
                                      .replace(/\|MC\|/g, interaction.guild.memberCount),

                        thumbnail: {
                            url: `https://www.youtube.com/results?search_query=${interaction.member.user.id}_${
                                type ? 'ON' : 'OFF'
                            }`
                        },

                        image: attachmentPresent
                            ? {
                                  url: 'attachment://card.gif'
                              }
                            : null,

                        footer: {
                            text: `Channel: ${channel.name} - ${channel.id}`
                        }
                    }
                ],
                attachmentPresent ? [new Discord.AttachmentBuilder(buffer, { name: 'card.gif' })] : null,
                null,
                [generateButtonPanel()]
            );

            if (additionalMessage !== '') {
            }

            return;
        }

        if (guild.wc.on) {
            const mode = guild.wc.j.c !== 'null';

            const attachmentPresentLeave = [4, 6, 7, 8, 9, 11, 13].includes(Number(guild.wc.t)) && !mode;
            const attachmentPresentWelcome = [2, 3, 7, 9, 10, 11, 13].includes(Number(guild.wc.t)) && mode;

            const content = mode ? guild.wc.j.m.split('[SPLIT_FLAG]') : guild.wc.l.m.split('[SPLIT_FLAG]');

            const attachmentPresent = attachmentPresentLeave || attachmentPresentWelcome;

            let card = null;

            let buffer = null;
            if (attachmentPresent) {
                if (attachmentPresentLeave) {
                    card = new client.cards.Leaver();
                } else {
                    card = new client.cards.Welcomer();
                }

                card.setColor('#FF69B4')
                    .setGuildName(message.member.guild.name)
                    .setMemberCount(message.member.guild.memberCount)
                    .setUsername(client.utils.norm(message.member.user.username))
                    .setDiscriminator(
                        client.utils
                            .tag(message.member.user)
                            .match(/#\d{1,4}/g)?.[0]
                            .replace('#', '')
                    )
                    .setAvatar(
                        message.member.displayAvatarURL({
                            extension: 'png',
                            size: 4096
                        })
                    );

                card.colorTitle = '#FF69B4';
                card.textMessage = (mode ? guild.wc.j.b : guild.wc.l.b)
                    .replace(/\bbotver\b/g, client.config.keys.version)
                    .replace(/\|U\|/g, message.member.nickname ?? message.member.user.username)
                    .replace(/\|G\|/g, message.member.guild.name)
                    .replace(/\|MC\|/g, message.guild.memberCount);
                card.textTitle = (mode ? guild.wc.j.t : guild.wc.l.t)
                    .replace(/\bbotver\b/g, client.config.keys.version)
                    .replace(/\|U\|/g, message.member.nickname ?? message.member.user.username)
                    .replace(/\|G\|/g, message.member.guild.name)
                    .replace(/\|MC\|/g, message.guild.memberCount);

                buffer = await card.build();
            }

            const channelId = mode ? guild.wc.j.c : guild.wc.l.c;
            const channel =
                (await client.channels.fetch(channelId).catch(client.swallow('welcomechannel: fetch'))) ?? null;

            return client.send(
                message.channel,
                null,
                [
                    {
                        color: client.data.embedColor,
                        title: mode ? 'Displaying Welcome Message' : 'Displaying Goodbye Message',

                        description:
                            content[0] === 'NULL(0)'
                                ? null
                                : content[0]
                                      .replace(/\bbotver\b/g, client.config.keys.version)
                                      .replace(/\|U\|/g, message.member)
                                      .replace(/\|G\|/g, message.member.guild.name)
                                      .replace(/\|MC\|/g, message.guild.memberCount),

                        thumbnail: {
                            url: `https://www.youtube.com/results?search_query=${message.author.id}_${
                                mode ? 'ON' : 'OFF'
                            }`
                        },

                        image: attachmentPresent
                            ? {
                                  url: 'attachment://card.gif'
                              }
                            : null,

                        footer: {
                            text: `Channel: ${channel.name} - ${channel.id}`
                        }
                    }
                ],
                attachmentPresent ? [new Discord.AttachmentBuilder(buffer, { name: 'card.gif' })] : null,
                null,
                [generateButtonPanel()]
            );
        }

        let type = Number(client.utils.nums(args.shift()));

        if (isNaN(type) || type > 16 || type < 1) {
            client.qEmbed('Invalid / no type present setting default - 7.', interaction ?? message);
            type = 7;
        }

        if (args[0]) {
            const option = args.shift();

            if (!args[0]) {
                return client.qEmbed('No message given!', interaction ?? message);
            }

            const joinedArgs = args.join(' ');

            if (await client.censored(args, guild, message)) {
                return client.qEmbed(
                    "That message trips this server's censor - it has not been saved.",
                    interaction ?? message
                );
            }

            switch (option) {
                case 'welcome':
                    client.save(guild.id, {
                        alter: 'wc.j.m',
                        value: joinedArgs
                    });
                    break;
                case 'leave':
                    client.save(guild.id, {
                        alter: 'wc.l.m',
                        value: joinedArgs
                    });
                    break;
                default:
                    return client.qEmbed('Invalid option specifier. Use join/leave.', interaction ?? message);
            }
        }

        if (!isNaN(type)) {
            client.save(guild.id, {
                alter: 'wc.t',
                value: type
            });
        } else {
            client.save(guild.id, {
                alter: 'wc.t',
                value: 1
            });
        }

        let channel;

        try {
            ({ channel } = await client.module.creators.createWelcome({
                guild: message.guild,
                guildDoc: guild,
                type,
                reason: `=welcomechannel by ${client.utils.tag(message.author)}`
            }));
        } catch (error) {
            client.data.errors++;

            return client.qEmbed(
                `Could not create the welcome channel: ${error?.message ?? error}`,
                interaction ?? message
            );
        }

        return client.qEmbed(
            `Setting welcome channel type ${type}. Showing ${wmTypes[type - 1]}`,
            interaction ?? message
        );
    }
};
