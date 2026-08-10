'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'heartboard',
    usage:       '=heartboard [#channel] [count]',
    description: 'Creates a heartboard channel. When any message Relaxy! can see reaches the required number of special reactions (3 by default, :heart: by default), it is reposted to the heartboard. If a post falls back to 0 special reactions, it is removed.\nPass a number when creating one to set the reaction requirement (between 2 and 10).\n## Configuring a heartboard\nRun the command again with the heartboard channel as the first argument to open its settings panel, where buttons let you:\n- set the embed colour,\n- set the reaction emojis (5 emojis; the first is the required one),\n- set the name display mode (usernames, display names or nicknames),\n- set the reaction requirement (between 2 and 10),\n- delete the heartboard.\n\nYou can create multiple heartboards, each configured independently.',

    permissionsUser: [
        'SEND_MESSAGES',
        'MANAGE_CHANNELS'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES',
        'ADD_REACTIONS',
        'MANAGE_MESSAGES',
        'MANAGE_CHANNELS'
    ],

    async run(client, message, args, guild, interaction)
    {
        if (interaction)
        {
            const data = message.embeds[0].data.thumbnail.url.split('=')[1].split('_');
            const interactionUserId = data[0];

            if (!interactionUserId || interaction.member.user.id !== interactionUserId)
            {
                return 0b01100101_01110010_01110010_01101111_01110010;
            }

            const channel = await client.channels.fetch(data[1]).catch(client.swallow('heartboard: fetch')) ?? null;
            const existingHeartBoard = await client.module.database.findHeartBoard(channel?.id, guild.id);
            if (!channel || !existingHeartBoard)
            {

                return client.utils.interactionReplySpecial('The channel doesn\'t exist anymore!', interaction, true);
            }

            let exit = false;
            let returnMessage = null;

            const interactionId = interaction.customId.split('_')[1];

            if ([
                'requirement',
                'emojis',
                'colour',
                'delete',
                'name'
            ].includes(interactionId))
            {
                client.collections.interactionsInProgress.set(message.id, true);
            }

            switch (interactionId)
            {
                case 'requirement':
                {
                    client.utils.interactionReplySpecial({
                        embeds: [
                            {
                                color: client.data.embedColor,
                                title: 'Type a number\nIt will determine how many reactions a message has to get to be posted on the heartboard'
                            }
                        ],
                        flags:  Discord.MessageFlags.Ephemeral
                    }, interaction);

                    await interaction.channel.awaitMessages({
                        filter: m => m.author.id === interactionUserId,
                        max:    1,
                        time:   300000,
                        errors: ['time']
                    }).then(async m =>
                    {
                        m = m.first();
                        await client.delete(m);
                        const requirement = parseInt(m.content.split(' '));

                        if (isNaN(requirement) || !m.content || m.content.length === 0)
                        {
                            return returnMessage = client.utils.interactionReplySpecial('Invalid input!', interaction, true);
                        }

                        if (requirement > 10 || requirement < 2)
                        {
                            return returnMessage = client.utils.interactionReplySpecial('The heartboard requirement cannot be greater than 10 or lower than 2!', interaction, true);
                        }

                        client.saveHeartBoard(channel?.id, guild.id, {
                            alter: 'rq',
                            value: requirement
                        });

                        return returnMessage = client.utils.interactionReplySpecial(`Setting new heartboard requirement to ${requirement}!`, interaction, true);
                    }).catch(() => returnMessage = client.utils.interactionReplySpecial('Timeout setting emojis!', interaction, true));

                    break;
                }
                case 'emojis':
                {
                    client.utils.interactionReplySpecial({
                        embeds: [
                            {
                                color: client.data.embedColor,
                                title: 'Please type out 5 emojis separated by a space.\nThe first one is the one you react with to get a post on the heartboard.\nF.e Default is :heart:'
                            }
                        ],
                        flags:  Discord.MessageFlags.Ephemeral
                    }, interaction);

                    await interaction.channel.awaitMessages({
                        filter: m => m.author.id === interactionUserId,
                        max:    1,
                        time:   300000,
                        errors: ['time']
                    }).then(async m =>
                    {
                        m = m.first();
                        const args = m.content.split(' ');
                        await client.delete(m);

                        if (m.content.length === 0)
                        {
                            return returnMessage = client.utils.interactionReplySpecial('Incorrect input!', interaction, true);
                        }

                        const emojis = client.utils.isValidEmoji(m.content);

                        if (emojis.length <= 0)
                        {
                            return returnMessage = client.utils.interactionReplySpecial('No emojis detected!', interaction, true);
                        }

                        if (emojis.length !== args.length || emojis.length !== 5)
                        {
                            return returnMessage = client.utils.interactionReplySpecial('One or more emojis are invalid!\nOr the number of emojis isn\'t equal to 5!', interaction, true);
                        }

                        const emojiConflict = await client.module.database.findCorrectHeartBoardChannel(guild.id, emojis[0]);

                        if (emojiConflict)
                        {
                            return returnMessage = client.utils.interactionReplySpecial(`Emoji: ${emojis[0]} cannot be used as it's already a default emoji within ${await client.channels.fetch(emojiConflict.id).catch(client.swallow('heartboard: fetch'))}!`, interaction, true);
                        }

                        client.saveHeartBoard(channel?.id, guild.id, {
                            alter: 'em',
                            value: emojis
                        });

                        return returnMessage = client.utils.interactionReplySpecial('Emojis successfully changed!', interaction, true);
                    }).catch(() => returnMessage = client.utils.interactionReplySpecial('Timeout setting emojis!', interaction, true));

                    break;
                }
                case 'colour':
                {
                    client.utils.interactionReplySpecial({
                        embeds: [
                            {
                                color: client.data.embedColor,
                                title: 'Type out the HEX code of the colour you want on the heartboard.'
                            }
                        ],
                        flags:  Discord.MessageFlags.Ephemeral
                    }, interaction);

                    await interaction.channel.awaitMessages({
                        filter: m => m.author.id === interactionUserId,
                        max:    1,
                        time:   300000,
                        errors: ['time']
                    }).then(async m =>
                    {
                        m = m.first();
                        const args = m.content.split(' ');
                        await client.delete(m);

                        const colour = args[0].replace(/#/g, '').match(/^[0-9a-fA-F]{6}$/);

                        if (!colour)
                        {
                            return returnMessage = client.utils.interactionReplySpecial('Invalid hex code given!', interaction, true);
                        }

                        existingHeartBoard.co = parseInt(colour[0], 16);
                        client.saveHeartBoard(channel?.id, guild.id, {
                            alter: 'co',
                            value: existingHeartBoard.co
                        });

                        return returnMessage = client.utils.interactionReplySpecial('Colour successfully changed!', interaction, true);
                    }).catch(() => returnMessage = client.utils.interactionReplySpecial('Timeout setting colour!', interaction, true));

                    break;
                }
                case 'name':
                {
                    client.utils.interactionReplySpecial({
                        embeds: [
                            {
                                color: client.data.embedColor,
                                title: 'Type `usernames`, `display names` or `nicknames` to set the corresponding name display mode. Default: display names.'
                            }
                        ],
                        flags:  Discord.MessageFlags.Ephemeral
                    }, interaction);

                    await interaction.channel.awaitMessages({
                        filter: m => m.author.id === interactionUserId,
                        max:    1,
                        time:   300000,
                        errors: ['time']
                    }).then(async m =>
                    {
                        m = m.first();
                        const args = m.content.toLowerCase().split(' ');
                        await client.delete(m);

                        let mode = null;

                        if (args.find(a => a === '0' || a.includes('user') || a.includes('handle')))
                        {
                            mode = 0;
                        }

                        if (args.find(a => a === '1' || a.includes('display')))
                        {
                            mode = 1;
                        }

                        if (args.find(a => a === '2' || a.includes('nick')))
                        {
                            mode = 2;
                        }

                        if (mode === null)
                        {
                            return returnMessage = client.utils.interactionReplySpecial('Invalid name display mode provided!', interaction, true);
                        }

                        client.saveHeartBoard(channel?.id, guild.id, {
                            alter: 'nm',
                            value: mode
                        });

                        return returnMessage = client.utils.interactionReplySpecial('Successfully changed name display mode!', interaction, true);
                    }).catch(() => returnMessage = client.utils.interactionReplySpecial('Timeout setting name display mode!', interaction, true));

                    break;
                }
                case 'delete':
                {
                    await client.module.database.deleteHeartBoard(existingHeartBoard.id, guild.id);
                    await client.edit(message, null, [
                        {
                            colour: client.data.embedColor,
                            title:  'Heartboard functionality has been erased.'
                        }
                    ], null, null);

                    exit = true;

                    returnMessage = client.utils.interactionReplySpecial('Heartboard deleted!', interaction, true);
                    break;
                }
            }

            client.collections.interactionsInProgress.delete(message.id);

            if (returnMessage)
            {
                await (interaction.replied || interaction.deferred
                    ? interaction.followUp(returnMessage)
                    : interaction.reply(returnMessage)).catch(client.swallow('heartboard: answer'));
            }

            if (exit)
            {
                return;
            }

            const embed = Object.assign(message.embeds[0].data, client.module.panels.heartBoardPanelEmbed(existingHeartBoard, channel, guild.hb.on));

            if (!(message instanceof Discord.Message))
            {

                message = await message.channel.messages.fetch(message.id).catch(client.swallow('heartboard: panel')) ?? null;
            }

            if (!message)
            {
                return;
            }

            await client.edit(message, null, [embed], null, client.module.panels.generateHeartBoardPanel(), { override: true }).catch(client.swallow('heartboard: repaint'));

            return;
        }

        const existingChannel = await client.utils.channel(message, args, 0, { cut: true });

        if (existingChannel && existingChannel.type !== Discord.ChannelType.GuildText)
        {
            return client.qEmbed('Invalid channel type!', interaction ?? message);
        }

        const existingHeartBoard = await client.module.database.findHeartBoard(existingChannel?.id, guild.id);

        if (existingChannel && (!existingHeartBoard || !guild.hb.cs.includes(existingChannel?.id)))
        {
            return client.qEmbed('This channel is not a heartboard!', interaction ?? message);
        }

        if (guild.hb.on && existingChannel)
        {
            const embed = {
                ...client.module.panels.heartBoardPanelEmbed(existingHeartBoard, existingChannel, guild.hb.on),

                thumbnail: {
                    url: `https://www.youtube.com/results?search_query=${message.author.id}_${existingChannel.id}`
                }
            };

            const panel = await client.send(message.channel, null, [embed], null, null, client.module.panels.generateHeartBoardPanel());

            if (panel?.id)
            {

                client.saveHeartBoard(existingChannel.id, guild.id, {
                    alter: 'pc',
                    value: String(panel.channel?.id ?? message.channel.id)
                });

                client.saveHeartBoard(existingChannel.id, guild.id, {
                    alter: 'pm',
                    value: String(panel.id)
                });
            }

            return panel;
        }

        let requirement = 0;

        if (args[0])
        {
            requirement = client.utils.nums(args[0]);

            if (!requirement)
            {
                return client.qEmbed('Heartboard requirement is not a requirement!', interaction ?? message);
            }
            else if (requirement > 10 || requirement < 2)
            {
                return client.qEmbed('The heartboard requirement cannot be greater than 10 or lower than 2!', interaction ?? message);
            }

            client.qEmbed(`Setting heartboard requirement ${requirement}!`, interaction ?? message);
        }
        else
        {
            client.qEmbed('No heartboard requirement specified, using default: 3.', interaction ?? message);
        }

        if (!requirement)
        {
            requirement = 3;
        }

        try
        {
            await client.module.creators.createHeartboard({
                guild:    message.guild,
                guildDoc: guild,
                requirement,
                reason:   `=heartboard by ${client.utils.tag(message.author)}`
            });
        }
        catch (error)
        {
            client.data.errors++;

            return client.qEmbed(`Could not create the heartboard: ${error?.message ?? error}`, interaction ?? message);
        }

        client.module.profiles.Achievement(message, 'madeheartboard', guild);

        return client.qEmbed('Heartboard added!', interaction ?? message);
    }
};
