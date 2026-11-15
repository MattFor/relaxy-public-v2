'use strict';

import { emojiList } from '../../../src/Core/DataTable.js';
import { normalizeFormKey, REQUIRED_PREFIX, MAX_FORM_KEY_LENGTH } from '../../../src/Client/Modules/Guilds/Tickets.js';
import Discord, { ChannelType, ThreadAutoArchiveDuration } from 'discord.js';

const splitChunks = (str, size) => {
    let pos = 0;
    const chunks = [];

    while (pos < str.length) {
        let end = Math.min(pos + size, str.length);

        if (end < str.length) {
            let lastNewline = str.lastIndexOf('\n', end);
            if (lastNewline > pos) {
                end = lastNewline;
            }
        }

        chunks.push(str.slice(pos, end).trim());
        pos = end + 1;
    }

    return chunks;
};

const addNewButton = (ticketChannel) => {
    for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
            let positionTaken = Object.values(ticketChannel.bt).some((button) => button.x === x && button.y === y);

            if (!positionTaken) {
                return {
                    x,
                    y
                };
            }
        }
    }

    return null;
};

const generateUserPanel = () => {
    const closeButton = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_closure')
        .setLabel('Close Ticket')
        .setStyle(Discord.ButtonStyle.Danger);

    const viewStatusButton = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_cstatus')
        .setLabel('View Ticket Status')
        .setStyle(Discord.ButtonStyle.Secondary);

    return [new Discord.ActionRowBuilder().addComponents(closeButton, viewStatusButton)];
};

const generateCustomButtonPanel = (client, ticketSys) => client.module.panels.generateCustomButtonPanel(ticketSys);

const generateControlPanel = (alternate = 0) => {
    const claim = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_statechange_claim')
        .setLabel('Claim')
        .setStyle(Discord.ButtonStyle.Success);

    const completed = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_statechange_completed')
        .setLabel('Completed')
        .setStyle(Discord.ButtonStyle.Primary);

    const chat = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_statechange_privchat')
        .setLabel('Private Chat')
        .setStyle(alternate !== 0 ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Primary);

    const close = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_closure_mod')
        .setLabel('Close')
        .setStyle(Discord.ButtonStyle.Danger);

    const closeAnswer = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_closure_mod_ans')
        .setLabel('Close with Answer')
        .setStyle(Discord.ButtonStyle.Danger);

    switch (alternate) {
        case 0: {
            return [
                new Discord.ActionRowBuilder().addComponents(claim, completed, chat),
                new Discord.ActionRowBuilder().addComponents(close, closeAnswer)
            ];
        }

        case 1: {
            return [
                new Discord.ActionRowBuilder().addComponents(completed, chat),
                new Discord.ActionRowBuilder().addComponents(close, closeAnswer)
            ];
        }

        case 2: {
            return [new Discord.ActionRowBuilder().addComponents(completed, close, closeAnswer)];
        }
    }

    return alternate
        ? [new Discord.ActionRowBuilder().addComponents(completed, close)]
        : [new Discord.ActionRowBuilder().addComponents(claim, completed, chat, close)];
};

const generateEditButtonPanel1 = (cp) => {
    const ticketSystemEdit = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_edit_edit')
        .setLabel('Edit')
        .setStyle(Discord.ButtonStyle.Success);

    const ticketSystemRemove = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_edit_rem')
        .setLabel('Remove')
        .setStyle(Discord.ButtonStyle.Danger);

    const ticketSystemPartInputs = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_edit_in')
        .setLabel('Inputs')
        .setStyle(Discord.ButtonStyle.Secondary);

    const ticketSystemPartOutputs = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_edit_out')
        .setLabel('Outputs')
        .setStyle(Discord.ButtonStyle.Secondary);

    const ticketSystemPartControlPanel = new Discord.ButtonBuilder()
        .setCustomId('ticketsystem_edit_cp')
        .setLabel('Control Panel')
        .setStyle(cp ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Danger);

    return new Discord.ActionRowBuilder().addComponents(
        ticketSystemEdit,
        ticketSystemPartInputs,
        ticketSystemPartOutputs,
        ticketSystemRemove,
        ticketSystemPartControlPanel
    );
};

const editRenames = {
    title: 'title',
    modal: 'modalTitle',
    color: 'color',
    emoji: 'emoji'
};
const LIST = ['list', 'status', 'show', 'info', 'systems'];

const listSystems = async (client, message, guild, interaction) => {
    const systems = await client.module.database.getTicketSystems({ g: message.guild.id });

    const empty = {
        color: client.data.embedColor,
        author: {
            name: 'Ticket systems',
            icon_url: client.utils.guildIcon(message.guild)
        },
        description: systems?.length
            ? null
            : 'This server has no ticket systems.\n\nRun `=ticketsystem` to create one, or `=ticketsystem #channel` to add one to a channel that already exists.',
        footer: client.data.footer,
        timestamp: new Date().toISOString()
    };

    if (!systems?.length) {
        return client.send(interaction ? 1 : message.channel, null, [empty]);
    }

    const detail = async (system) => {
        const channel = client.channels.cache.get(system.c);

        const buttons = Object.entries(system.bt ?? {});

        return {
            color: client.data.embedColor,
            author: {
                name: `Ticket system - ${channel?.name ?? 'deleted channel'}`,
                icon_url: client.utils.guildIcon(message.guild)
            },
            fields: [
                {
                    name: 'Message',
                    value: channel
                        ? `[Jump to it](https://discord.com/channels/${message.guild.id}/${system.c}/${system.mid})\n\`${system.mid}\``
                        : `\`${system.mid}\` *(its channel is gone)*`
                },
                {
                    name: `Buttons [${buttons.length}]`,
                    value: (
                        buttons
                            .map(([buttonId, button]) => {
                                const forms = Object.keys(system.fm?.[buttonId] ?? {}).length;

                                return `**-** ${button.emoji ?? ''} **${button.title || 'Untitled'}** - ${forms} form question${
                                    forms === 1 ? '' : 's'
                                }`;
                            })
                            .join('\n') || '*None*'
                    ).slice(0, 1024)
                },
                {
                    name: 'Edit it',
                    value: `\`=ticketsystem #${channel?.name ?? '<channel>'} ${system.mid}\``
                }
            ],
            footer: client.data.footer,
            timestamp: new Date().toISOString()
        };
    };

    return new client.class.picker(client).run({
        message,
        interaction,
        id: 'ticketlistui',
        placeholder: 'Select a ticket system…',
        empty: {
            ...empty,
            description: `**${systems.length}** ticket systems on this server. Pick one to see it.`
        },
        choices: systems.map((system, i) => ({
            value: String(i),
            label: `#${client.channels.cache.get(system.c)?.name ?? 'deleted channel'}`,
            description: `${Object.keys(system.bt ?? {}).length} button(s) - ${system.mid}`,
            emoji: '🎫'
        })),
        render: async (value) => ({ embeds: [await detail(systems[Number(value)])] })
    });
};

export default {
    name: 'ticketsystem',
    aliases: ['ticketchannel'],
    usage: '=ticketsystem [list|#channel [message id]]',
    description:
        'Create and manage a server-wide ticket system. Members open tickets by pressing buttons on a message; each ticket is delivered to the channels / staff you choose, while the member who opened it keeps a private copy in their DMs.\n\n**Setup**\n`=ticketsystem list` - every ticket system on this server, in a dropdown. Pick one to see its buttons and the command that edits it.\n`=ticketsystem` - create a brand new ticket channel with a starter message and a single "Create Ticket" button.\n`=ticketsystem #channel` - add another ticket system message to an existing text channel.\n`=ticketsystem [message id]` - open the editor for a ticket message in the current channel.\n`=ticketsystem #channel [message id]` - open the editor for a ticket message in another channel.\n\n**The editor** lets you fully customise a message. Use the two dropdowns to pick which **button** and which **form** (modal question) you are editing, then:\n```fix\nEdit\n```Change the selected button (title, modal title, colour, emoji, X/Y position) or the selected form (key, title, style, placeholder, min/max length). Moving a button onto an occupied slot swaps the two buttons.\n\n```fix\nRemove\n```Delete the selected button or form. A message must always keep at least one button, and a button at least one form.\n\n```fix\nInputs\n```Restrict who may open this ticket - mention or paste the IDs of the allowed users / roles. Leave empty to allow everyone.\n\n```fix\nOutputs\n```Choose where submitted tickets are delivered - mention or paste the IDs of the destination channels / users. Defaults to the ticket channel itself.\n\n```fix\nControl Panel\n```Toggle the moderator control panel (Claim / Completed / Private Chat / Close / Close with Answer) attached to delivered tickets.\n\n```fix\nEdit Ticket System Message Design\n```Replace the message itself with an =embed formatted message or text file.\n\n```fix\nAdd New Button / Form\n```Add another button (up to 25 in a 5x5 grid) or another form question (up to 5 per button).\n\n**Forms:** a form whose key starts with `req` is a required field. Keys must be under 10 characters, and the `req` marker does not count towards that: `reqwhatsused` is accepted (the name `whatsused` is 9), while `description` is refused whether or not it carries the marker (11). `short` forms allow up to 100 characters, `long` forms up to 4000. The dashboard shows the same questions with `req` as a switch, so you do not have to rename anything there.\n\n**Submitting:** a member presses a button, fills in the form, and the ticket is sent to every configured output plus a private copy in their DMs. Both sides follow the ticket through the buttons attached to it.',

    cooldown: 10,

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_CHANNELS', 'MANAGE_GUILD'],
    permissionsBot: [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES',
        'MANAGE_CHANNELS',

        'CREATE_PRIVATE_THREADS',
        'SEND_MESSAGES_IN_THREADS',
        'MANAGE_THREADS'
    ],

    async run(client, message, args, guild, interaction) {
        let toSave = [];

        if (interaction) {
            let ticketChannel = null;

            const interactionIdData = interaction.customId.split('_');
            const data =
                message?.embeds[1]?.data?.thumbnail?.url?.split('=')?.[1]?.split('_') ??
                message?.embeds[0]?.data?.thumbnail?.url?.split('=')?.[1]?.split('_') ??
                null;

            if (
                !['real', 'list'].includes(interactionIdData[1]) &&
                !['edit'].includes(interactionIdData[2]) &&
                !['ans'].includes(interactionIdData[3])
            ) {
                await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
            }

            let saveData = [];
            if (!['list'].includes(interactionIdData[1])) {
                saveData = [
                    data?.[3] ?? interaction.channelId,
                    interaction.guildId,
                    data?.[0] === 'edit' ? data[2] : interaction.message.id
                ];
                ticketChannel = await client.module.database.findTicketSystem(...saveData);
            }

            let flag = false;
            let lastSelected = null;
            let selectedForm = null;
            let selectedButton = null;

            switch (interactionIdData[1]) {
                case 'endans': {
                    let isPublic = false;
                    const ogEmbedData = interaction.message.embeds[0].data;

                    let embed = [
                        {
                            color: client.data.embedColor,
                            title: `Answer for ${ogEmbedData.title.split('|')[0]}`,
                            fields: []
                        }
                    ];

                    const fields = interaction.fields.fields;
                    for (const [key, value] of Array.from(fields.entries())) {
                        const _value = value.value;
                        switch (key.split('-')[1]) {
                            case 'ans':
                                {
                                    embed[0].description =
                                        _value !== '' ? _value : "We're very sorry, but your message sucked ;(";
                                }
                                break;

                            case 'anon':
                                {
                                    switch (_value) {
                                        case '':
                                        case 'no':
                                            {
                                                embed[0].fields.push({
                                                    name: 'Provided by:',
                                                    value: `${interaction.member} - ${interaction.member.user.displayName} - \`${interaction.member.user.id}\`\nFrom: **${interaction.guild.name}**`
                                                });
                                            }
                                            break;

                                        case 'yes':
                                            {
                                                embed[0].fields.push({
                                                    name: 'Provided by:',
                                                    value: 'Anonymous moderator.'
                                                });
                                            }
                                            break;

                                        default:
                                            {
                                                embed[0].fields.push({
                                                    name: 'Provided by:',
                                                    value: 'Our mysterious benefactor.'
                                                });
                                            }
                                            break;
                                    }
                                }
                                break;

                            case 'public': {
                                switch (_value) {
                                    case 'no':
                                        {
                                        }
                                        break;

                                    case '':
                                    case 'yes': {
                                    }

                                    default:
                                        {
                                            isPublic = true;
                                        }
                                        break;
                                }
                            }
                        }
                    }

                    if (embed[0].fields.length === 0) {
                        embed[0].fields = null;
                    }

                    const ticketCreator = ogEmbedData.image.url.split('=')[1].split('_')[1];

                    const discoveryResults = await client.cluster.broadcastEval(
                        async (c, context) => {
                            const user = await c.users.fetch(context.userIdToFetch, { force: true });
                            if (user) {
                                return {
                                    canReach: true,
                                    shardId: c.data.id
                                };
                            }

                            return {
                                canReach: false,
                                shardId: c.data.id
                            };
                        },
                        {
                            context: {
                                userIdToFetch: ticketCreator
                            }
                        }
                    );

                    const capableShards = discoveryResults.filter((res) => res && res.canReach);

                    let dmActuallySent = false;
                    let canSend = capableShards.length > 0;
                    if (canSend) {
                        const chosenShardId = capableShards[0].shardId;
                        const sendAttemptResults = await client.cluster.broadcastEval(
                            async (c, context) => {
                                if (c.data.id === context.designatedShardId) {
                                    try {
                                        const user = await c.users.fetch(context.userIdToSendTo);
                                        if (user) {
                                            const finalEmbed = Object.assign({}, context.baseEmbed, {
                                                footer: {
                                                    text: 'This is the latest status of your ticket. Please press the refresh button to update the original embed.'
                                                }
                                            });

                                            await c.send(user, null, [finalEmbed]);

                                            return {
                                                sent: true,
                                                shardId: c.data.id
                                            };
                                        }

                                        return {
                                            sent: false,
                                            error: 'User not found on second fetch',
                                            shardId: c.data.id
                                        };
                                    } catch (e) {
                                        return {
                                            sent: false,
                                            error: e.message,
                                            shardId: c.data.id
                                        };
                                    }
                                }
                                return {
                                    sent: 'not_designated_shard'
                                };
                            },
                            {
                                cluster: chosenShardId,
                                context: {
                                    designatedShardId: chosenShardId,
                                    userIdToSendTo: ticketCreator,
                                    baseEmbed: embed[0]
                                }
                            }
                        );

                        const successResult = sendAttemptResults.find((res) => res && res.sent === true);
                        if (successResult) {
                            dmActuallySent = true;
                        }
                    }

                    let postedPublicly = false;

                    if (canSend && dmActuallySent && isPublic) {
                        const copyEmbed = [
                            {
                                ...embed[0],
                                fields: [
                                    ...(embed[0].fields ?? []).slice(1),
                                    {
                                        name: 'Provided by:',
                                        value: `${interaction.member} - ${interaction.member.user.displayName} - \`${interaction.member.user.id}\`\nFrom: **${interaction.guild.name}**`
                                    }
                                ]
                            }
                        ];

                        postedPublicly = Boolean(
                            await interaction.message.reply({ embeds: copyEmbed }).catch((error) => {
                                client.log(
                                    'WARN',
                                    `Ticket response could not be posted publicly in ${interaction.guild.id}: ${error?.message ?? error}`
                                );

                                return null;
                            })
                        );
                    }

                    if (postedPublicly) {
                        return client.utils.interactionReplySpecial(
                            { content: 'Response sent - it is posted publicly under the ticket.' },
                            interaction
                        );
                    }

                    return client.utils.interactionReplySpecial(
                        {
                            content: canSend && dmActuallySent ? null : 'Cannot send a response to this user',
                            embeds: embed
                        },
                        interaction
                    );
                }

                case 'closure': {
                    const isMod = interactionIdData[2] === 'mod';
                    const isAnswer = interactionIdData[3] === 'ans';
                    const info = message.embeds[0].data.image.url.split('=')[1].split('_');

                    let leaveMessage = isMod ? 'Ticket closure complete.' : 'Your ticket has been closed successfully.';

                    let overwrite = false;

                    if (info[0] === 'closed') {
                        leaveMessage = 'The ticket has been closed!';
                        overwrite = true;
                    } else if (message.embeds[0].data.description.includes('completed')) {
                        leaveMessage = 'The ticket has already been completed!';
                        overwrite = true;
                    }

                    let newEmbed = Object.assign(message.embeds[0].data, {
                        description: `${message.embeds[0].data.description}\n\`\`\`diff\n- Ticket Closed by ${
                            isMod ? `a Moderator${isAnswer ? ' with an answer' : ''}` : 'the User'
                        } -\n\`\`\``,
                        image: {
                            url: message.embeds[0].data.image.url.replace('open', 'closed')
                        },
                        type: null,
                        thumbnail: {
                            url: message.embeds[0].data.thumbnail.url
                        }
                    });

                    let channelIds;
                    let messageIds;

                    try {
                        channelIds = info[4].split('-');
                        messageIds = info[5].split('-');
                    } catch (e) {
                        client.log(e, info, interaction.message);
                    }

                    if (messageIds.length !== channelIds.length) {
                        overwrite = true;
                        leaveMessage = 'Critical error; Internal data not matching. Ending operation.';
                    }

                    const idPairs = [];
                    for (let i = 0; i < messageIds.length; i++) {
                        idPairs.push([messageIds[i], channelIds[i]]);
                    }

                    let f = false;
                    if (!overwrite) {
                        let OPID = newEmbed.description.split('|');
                        OPID = client.utils.nums(OPID[OPID.length - 1]);

                        for (const [mId, cId] of idPairs) {
                            let Message = await client.cluster
                                .broadcastEval(
                                    async (c, a) => {
                                        const channel = await c.channels.fetch(a.cId);

                                        if (!channel) {
                                            return null;
                                        }

                                        channel.messages.cache.delete(a.mId);

                                        const msg = await channel.messages.fetch(a.mId, {
                                            force: true,
                                            cache: true
                                        });

                                        return msg;
                                    },
                                    {
                                        context: {
                                            mId,
                                            cId
                                        }
                                    }
                                )
                                .catch(() => {
                                    return [null];
                                });

                            Message = Message?.filter((i) => !!i)?.[0];

                            if (Message?.embeds?.[0]?.description?.includes('Closed by a Moderator')) {
                                newEmbed.description = newEmbed.description.replace('the User', 'a Moderator');
                                leaveMessage = 'The ticket has already been closed by a moderator!';
                                break;
                            }

                            await client.cluster
                                .broadcastEval(
                                    async (c, a) => {
                                        const channel = await c.channels.fetch(a.cId);

                                        if (!channel) {
                                            return null;
                                        }

                                        channel.messages.cache.delete(a.mId);

                                        const msg = await channel.messages.fetch(a.mId, {
                                            force: true,
                                            cache: true
                                        });

                                        if (msg) {
                                            await c.edit(msg, null, [
                                                channel.isDMBased() && channel.recipientId === a.OPID
                                                    ? Object.assign(a.newEmbed, {
                                                          description: a.newEmbed.description.replace(
                                                              'Moderator',
                                                              a.displayName
                                                          )
                                                      })
                                                    : a.newEmbed
                                            ]);
                                        }
                                    },
                                    {
                                        context: {
                                            mId,
                                            cId,
                                            newEmbed,
                                            OPID,
                                            displayName:
                                                interaction?.member?.displayName ??
                                                interaction?.member?.user?.displayName ??
                                                interaction?.member?.user?.username
                                        }
                                    }
                                )
                                .catch((e) => {
                                    return [null];
                                });
                        }
                    }
                    if (!messageIds.includes(message.id) && !overwrite) {
                        await client.edit(interaction.message, null, [newEmbed]);
                    }

                    if (isMod && isAnswer) {
                        const modalAnonymous = new Discord.TextInputBuilder()
                            .setCustomId('ans-anon')
                            .setLabel('Should the Answer Be Anonymous?')
                            .setStyle(Discord.TextInputStyle.Short)
                            .setPlaceholder('no / yes [default: no]')
                            .setMaxLength(3)
                            .setRequired(false);

                        const modalPublic = new Discord.TextInputBuilder()
                            .setCustomId('ans-public')
                            .setLabel('Show Answer Publicly in This Channel?')
                            .setStyle(Discord.TextInputStyle.Short)
                            .setPlaceholder('no / yes [default: yes]')
                            .setMaxLength(3)
                            .setRequired(false);

                        const modalAnswer = new Discord.TextInputBuilder()
                            .setCustomId('ans-ans')
                            .setLabel('Write Your Answer Here')
                            .setStyle(Discord.TextInputStyle.Paragraph)
                            .setPlaceholder("We're very sorry, but your message sucked ;(")
                            .setMaxLength(2048)
                            .setRequired(false);

                        const inputModalPlaceholder = client.assembleModal(
                            `Answer-Close ${interaction.message.embeds[0].data.title.split('|')[0]}`,
                            'ticketsystem_endans',
                            modalAnonymous,
                            modalPublic,
                            modalAnswer
                        );

                        return interaction.showModal(inputModalPlaceholder);
                    }

                    return client.utils.interactionReplySpecial(
                        {
                            embeds: [
                                {
                                    color: client.data.embedColor,
                                    title: leaveMessage
                                }
                            ],
                            flags: Discord.MessageFlags.Ephemeral
                        },
                        interaction
                    );
                }

                case 'cstatus':
                case 'statechange': {
                    try {
                        const cstatus = interactionIdData[1] === 'cstatus';

                        let noPanel = false;
                        let alternate = false;

                        const info = message.embeds[0].data.image.url.split('=')[1].split('_');

                        const channelIds = info[4].split('-');
                        const messageIds = info[5].split('-');

                        const idPairs = [];
                        for (let i = 0; i < messageIds.length; i++) {
                            idPairs.push([messageIds[i], channelIds[i]]);
                        }

                        let action = 'Action completed successfully';
                        let newEmbed = { ...message.embeds[0].data };

                        if (cstatus) {
                            let Message = await client.cluster
                                .broadcastEval(
                                    async (c, a) => {
                                        const channel = await c.channels.fetch(a.idPairs[0][1]);

                                        if (!channel) {
                                            return null;
                                        }

                                        channel.messages.cache.delete(a.idPairs[0][0]);

                                        const msg = await channel.messages.fetch(a.idPairs[0][0], {
                                            force: true,
                                            cache: true
                                        });

                                        return msg;
                                    },
                                    {
                                        context: {
                                            idPairs
                                        }
                                    }
                                )
                                .catch(() => {
                                    return [null];
                                });

                            Message = Message?.filter((i) => !!i)?.[0];

                            let changed = false;

                            if (!Message) {
                                newEmbed = {
                                    color: 16711680,
                                    title: 'The ticket has been deleted.'
                                };

                                changed = true;
                            } else {
                                newEmbed = { ...Message.embeds[0] };
                                changed = Message.embeds[0].description !== message.embeds[0].data.description;
                            }

                            if (!newEmbed) {
                                return;
                            }

                            await client.edit(
                                interaction.message,
                                null,
                                [newEmbed],
                                null,
                                newEmbed.title === 'The ticket has been deleted.' ||
                                    newEmbed.description.includes('Closed') ||
                                    newEmbed.description.includes('completed')
                                    ? null
                                    : generateUserPanel()
                            );

                            return client.utils.interactionReplySpecial(
                                {
                                    embeds: [
                                        {
                                            color: client.data.embedColor,
                                            title: changed ? 'The ticket status has changed!' : 'Nothing changed.'
                                        }
                                    ],
                                    flags: Discord.MessageFlags.Ephemeral
                                },
                                interaction
                            );
                        }

                        switch (interactionIdData[2]) {
                            case 'claim':
                                {
                                    alternate = 1;
                                    action = 'Ticket claimed successfully.';
                                    newEmbed.description = `## Claimed by ${interaction.member}\n${newEmbed.description}`;
                                }
                                break;

                            case 'completed':
                                {
                                    noPanel = true;
                                    action = 'Ticket marked as completed successfully.';
                                    newEmbed.description = `\`\`\`fix\nTicket completed.\n\`\`\`\n${newEmbed.description}`;

                                    try {
                                        const channel = await client.channels.fetch(info[3]);
                                        const thread = await channel.threads.fetch(
                                            client.utils.nums(
                                                interaction.message.embeds[0].description.match(/- `(\d{18,22})`/g)[0]
                                            )
                                        );
                                        await thread.setArchived(true);
                                    } catch {}
                                }
                                break;

                            case 'privchat':
                                {
                                    try {
                                        const cId = interaction.message.embeds[0].data.title.split('|')[0];
                                        const channel = await client.channels.fetch(info[3]);

                                        const thread = await channel.threads.create({
                                            name: cId,
                                            autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays,
                                            type: ChannelType.PrivateThread,
                                            reason: `Requested by ${interaction.member}`
                                        });

                                        let otherUserId = interaction.message.embeds[0].data.description.split('|');
                                        otherUserId = otherUserId[otherUserId.length - 1];

                                        await thread.members.add(otherUserId);
                                        await thread.members.add(interaction.user.id);

                                        await client.send(thread, null, [
                                            {
                                                color: client.data.embedColor,
                                                description: `# [${cId}](${interaction.message.url})\n**Ticket claimed by ${interaction.member}**\nThe moderator will be here shortly...`
                                            }
                                        ]);

                                        alternate = 2;
                                        action = `Successfully opened private chat and claimed the ticket: ${thread.url}`;
                                        newEmbed.description = !newEmbed.description.includes('Claimed by')
                                            ? `## Claimed by ${interaction.member}\n### Private chat created: ${thread.url} - \`${thread.id}\`\n${newEmbed.description}`
                                            : `### Private chat created: ${thread.url} - \`${thread.id}\`\n${newEmbed.description}`;
                                    } catch (e) {
                                        client.log(e);
                                        action = 'Ticket System channel does not exist anymore!';
                                        newEmbed.description = `Ticket System channel **MISSING**\n${newEmbed.description}`;
                                    }
                                }
                                break;
                        }

                        const controlPanel = generateControlPanel(alternate);
                        for (const [mId, cId] of idPairs) {
                            let Message = await client.cluster
                                .broadcastEval(
                                    async (c, a) => {
                                        const channel = await c.channels.fetch(a.cId);

                                        if (!channel) {
                                            return null;
                                        }

                                        channel.messages.cache.delete(a.mId);

                                        const msg = await channel.messages.fetch(a.mId, {
                                            force: true,
                                            cache: true
                                        });

                                        if (msg) {
                                            await c.edit(
                                                msg,
                                                null,
                                                [a.newEmbed],
                                                null,
                                                a.noPanel ? null : a.controlPanel
                                            );
                                        }
                                    },
                                    {
                                        context: {
                                            mId,
                                            cId,
                                            newEmbed,
                                            controlPanel,
                                            noPanel
                                        }
                                    }
                                )
                                .catch((e) => {
                                    client.log(e);
                                    return [null];
                                });
                        }

                        return client.utils.interactionReplySpecial(
                            {
                                embeds: [
                                    {
                                        color: client.data.embedColor,
                                        title: action
                                    }
                                ],
                                flags: Discord.MessageFlags.Ephemeral
                            },
                            interaction
                        );
                    } catch (e) {
                        client.log(e);

                        return client.utils.interactionReplySpecial(
                            {
                                embeds: [
                                    {
                                        color: client.data.embedColor,
                                        title: 'An error occurred while updating the ticket status.'
                                    }
                                ],
                                flags: Discord.MessageFlags.Ephemeral
                            },
                            interaction
                        );
                    }
                }

                case 'edit':
                    {
                        if (data[1] !== interaction.user.id) {
                            return 0b01100101_01110010_01110010_01101111_01110010;
                        }

                        if (['edit', 'rem', 'in', 'out', 'cp', 'add'].includes(interactionIdData[2])) {
                            client.collections.interactionsInProgress.set(message.id, true);
                        }

                        const editPanelEmbed = interaction.message.embeds[1] ?? interaction.message.embeds[0];

                        selectedForm = client.utils.cleanup(editPanelEmbed.title.split('|')[1].split(' '))[4];
                        selectedButton = client.utils.cleanup(editPanelEmbed.title.split('|')[1].split(' '))[1];

                        switch (interactionIdData[2]) {
                            case 'modal':
                                {
                                    const fields = interaction.fields.fields;
                                    lastSelected = editPanelEmbed.description.indexOf('**') < 22;

                                    let modified = false;
                                    let editMessage = '';

                                    let keyError = null;
                                    const sortedFields = Array.from(
                                        fields
                                            .filter((f) => f.value !== '')
                                            .sort((a, b) => {
                                                const A = a.customId.replace('form-', '');
                                                const B = b.customId.replace('form-', '');

                                                if (A === 'key') {
                                                    return -1;
                                                }

                                                if (B === 'key') {
                                                    return 1;
                                                }

                                                return A.localeCompare(B);
                                            })
                                    ).reverse();
                                    sortedFields.forEach(async (field) => {
                                        modified = true;
                                        field = field[1];

                                        const fieldType = field.customId.split('-')[1];

                                        if (lastSelected) {
                                            if (
                                                ticketChannel.bt[selectedButton][editRenames[fieldType]] === field.value
                                            ) {
                                                return (modified = false);
                                            }
                                        } else {
                                            if (
                                                ticketChannel.fm[selectedButton][selectedForm][fieldType] ===
                                                field.value
                                            ) {
                                                return (modified = false);
                                            }
                                        }

                                        if (!lastSelected && ['minmax', 'key'].includes(fieldType)) {
                                            if (fieldType === 'minmax') {
                                                const values = field.value.split(' | ');

                                                if (values.length !== 2) {
                                                    return (modified = false);
                                                }

                                                const val1 = parseInt(values[0], 10);
                                                const val2 = parseInt(values[1], 10);
                                                if (
                                                    isNaN(val1) ||
                                                    isNaN(val2) ||
                                                    val1 < 0 ||
                                                    val1 > 4000 ||
                                                    val2 < 0 ||
                                                    val2 > 4000 ||
                                                    (val2 > 0 && val1 > val2)
                                                ) {
                                                    return (modified = false);
                                                }

                                                ticketChannel.fm[selectedButton][selectedForm].min = val1;
                                                ticketChannel.fm[selectedButton][selectedForm].max = val2;

                                                toSave.push(
                                                    {
                                                        alter: `fm.${selectedButton}.${selectedForm}.min`,
                                                        value: ticketChannel.fm[selectedButton][selectedForm].min,
                                                        data: saveData,
                                                        filter: {
                                                            channelId: saveData[0],
                                                            guildId: saveData[1],
                                                            messageId: saveData[2]
                                                        }
                                                    },
                                                    {
                                                        alter: `fm.${selectedButton}.${selectedForm}.max`,
                                                        value: ticketChannel.fm[selectedButton][selectedForm].max,
                                                        data: saveData,
                                                        filter: {
                                                            channelId: saveData[0],
                                                            guildId: saveData[1],
                                                            messageId: saveData[2]
                                                        }
                                                    }
                                                );

                                                editMessage += `- changed minimum length requirement to: \`${val1}\`\n`;
                                                editMessage += `- changed maximum length requirement to: \`${val2}\`\n`;
                                            } else {
                                                const cleaned = normalizeFormKey(field.value);

                                                if (cleaned.error) {
                                                    keyError = cleaned.error;

                                                    return (modified = false);
                                                }

                                                const newKey = cleaned.key;

                                                if (
                                                    !newKey ||
                                                    newKey === selectedForm ||
                                                    ticketChannel.fm[selectedButton][newKey]
                                                ) {
                                                    return (modified = false);
                                                }

                                                ticketChannel.fm[selectedButton][newKey] =
                                                    ticketChannel.fm[selectedButton][selectedForm];
                                                delete ticketChannel.fm[selectedButton][selectedForm];

                                                editMessage += `- changed the form key from **${selectedForm}** to: **${newKey}**\n`;

                                                selectedForm = newKey;

                                                toSave.push({
                                                    alter: `fm.${selectedButton}`,

                                                    value: structuredClone(ticketChannel.fm[selectedButton]),
                                                    data: saveData,
                                                    filter: {
                                                        channelId: saveData[0],
                                                        guildId: saveData[1],
                                                        messageId: saveData[2]
                                                    }
                                                });
                                            }
                                        } else {
                                            if (lastSelected) {
                                                if (fieldType === 'xy') {
                                                    const values = field.value.split(' | ');

                                                    if (values.length !== 2) {
                                                        return (modified = false);
                                                    }

                                                    const val1 = parseInt(values[0], 10);
                                                    const val2 = parseInt(values[1], 10);

                                                    if (
                                                        isNaN(val1) ||
                                                        isNaN(val2) ||
                                                        val1 < 0 ||
                                                        val1 > 4 ||
                                                        val2 < 0 ||
                                                        val2 > 4
                                                    ) {
                                                        return (modified = false);
                                                    }

                                                    const samePlace = Object.entries(ticketChannel.bt).find(
                                                        (b) => b[1].x === val1 && b[1].y === val2
                                                    );
                                                    const conflict = !!samePlace && samePlace[0] !== selectedButton;

                                                    const oldX = ticketChannel.bt[selectedButton].x;
                                                    const oldY = ticketChannel.bt[selectedButton].y;

                                                    if (conflict) {
                                                        ticketChannel.bt[samePlace[0]].x = oldX;
                                                        ticketChannel.bt[samePlace[0]].y = oldY;

                                                        editMessage += `- swapped the positions of the buttons with keys: **${samePlace[0]}** and **${selectedButton}**\n`;
                                                    }

                                                    ticketChannel.bt[selectedButton].x = val1;
                                                    ticketChannel.bt[selectedButton].y = val2;

                                                    toSave.push(
                                                        {
                                                            alter: `bt.${selectedButton}.x`,
                                                            value: ticketChannel.bt[selectedButton].x,
                                                            data: saveData,
                                                            filter: {
                                                                channelId: saveData[0],
                                                                guildId: saveData[1],
                                                                messageId: saveData[2]
                                                            }
                                                        },
                                                        {
                                                            alter: `bt.${selectedButton}.y`,
                                                            value: ticketChannel.bt[selectedButton].y,
                                                            data: saveData,
                                                            filter: {
                                                                channelId: saveData[0],
                                                                guildId: saveData[1],
                                                                messageId: saveData[2]
                                                            }
                                                        }
                                                    );

                                                    if (conflict) {
                                                        toSave.push(
                                                            {
                                                                alter: `bt.${samePlace[0]}.x`,
                                                                value: ticketChannel.bt[samePlace[0]].x,
                                                                data: saveData,
                                                                filter: {
                                                                    channelId: saveData[0],
                                                                    guildId: saveData[1],
                                                                    messageId: saveData[2]
                                                                }
                                                            },
                                                            {
                                                                alter: `bt.${samePlace[0]}.y`,
                                                                value: ticketChannel.bt[samePlace[0]].y,
                                                                data: saveData,
                                                                filter: {
                                                                    channelId: saveData[0],
                                                                    guildId: saveData[1],
                                                                    messageId: saveData[2]
                                                                }
                                                            }
                                                        );
                                                    } else {
                                                        editMessage += `- changed the X and Y position of the button **${selectedButton}** to: \`${val1}\` and \`${val2}\` respectively\n`;
                                                    }

                                                    return (modified = true);
                                                }

                                                let val = field.value.replace(
                                                    !['title', 'modal'].includes(fieldType)
                                                        ? /[\s\n]+/g
                                                        : '----{[SPLITTER]}----',
                                                    ''
                                                );

                                                if (fieldType === 'emoji') {
                                                    const customEmojiTest = client.utils.isValidEmoji(val)[0];

                                                    if (!customEmojiTest) {
                                                        val = emojiList[val.replaceAll(':', '')];

                                                        if (val === undefined) {
                                                            return (modified = false);
                                                        }
                                                    }
                                                }

                                                ticketChannel.bt[selectedButton][editRenames[fieldType]] = val;

                                                editMessage +=
                                                    `- changed the parameter **${editRenames[fieldType]}** to: ${val}\n`.slice(
                                                        0,
                                                        512
                                                    );

                                                toSave.push({
                                                    alter: `bt.${selectedButton}.${editRenames[fieldType]}`,
                                                    value: ticketChannel.bt[selectedButton][editRenames[fieldType]],
                                                    data: saveData,
                                                    filter: {
                                                        channelId: saveData[0],
                                                        guildId: saveData[1],
                                                        messageId: saveData[2]
                                                    }
                                                });
                                            } else {
                                                if (fieldType === 'style') {
                                                    if (!['short', 'long'].includes(field.value.toLowerCase())) {
                                                        return (modified = false);
                                                    }
                                                }

                                                const val = field.value.replace(
                                                    !['title', 'ph'].includes(fieldType)
                                                        ? /[\s\n]+/g
                                                        : '----{[SPLITTER]}----',
                                                    ''
                                                );

                                                ticketChannel.fm[selectedButton][selectedForm][fieldType] = val;

                                                editMessage +=
                                                    `- changed the parameter **${fieldType}** to: ${val}\n`.slice(
                                                        0,
                                                        512
                                                    );

                                                toSave.push({
                                                    alter: `fm.${selectedButton}.${selectedForm}.${fieldType}`,
                                                    value: ticketChannel.fm[selectedButton][selectedForm][fieldType],
                                                    data: saveData,
                                                    filter: {
                                                        channelId: saveData[0],
                                                        guildId: saveData[1],
                                                        messageId: saveData[2]
                                                    }
                                                });
                                            }
                                        }
                                    });

                                    client.utils.interactionReplySpecial(
                                        {
                                            embeds: [
                                                {
                                                    color: client.data.embedColor,
                                                    title: !modified
                                                        ? keyError
                                                            ? 'That form key was not accepted.'
                                                            : 'You submitted no changes!'
                                                        : `Successfully edited ${
                                                              lastSelected
                                                                  ? `button ${selectedButton}`
                                                                  : `button ${selectedButton}'s form ${selectedForm}`
                                                          }.\nWith the following changes:\n`,

                                                    description:
                                                        [modified ? editMessage : null, keyError]
                                                            .filter(Boolean)
                                                            .join('\n') || null
                                                }
                                            ],
                                            flags: Discord.MessageFlags.Ephemeral
                                        },
                                        interaction
                                    );
                                }
                                break;

                            case 'add':
                                {
                                    const editPanelEmbed =
                                        interaction.message.embeds[1] ?? interaction.message.embeds[0];
                                    lastSelected = editPanelEmbed.description.indexOf('**') < 22;

                                    let newId = null;
                                    let errMsg = null;

                                    if (lastSelected) {
                                        const newButtonPositions = addNewButton(ticketChannel);

                                        if (!newButtonPositions || Object.keys(ticketChannel.bt).length >= 25) {
                                            client.collections.interactionsInProgress.set(message.id, false);

                                            return client.utils.interactionReplySpecial(
                                                {
                                                    embeds: [
                                                        {
                                                            color: client.data.embedColor,
                                                            title: 'Maximum number of buttons reached!'
                                                        }
                                                    ],
                                                    flags: Discord.MessageFlags.Ephemeral
                                                },
                                                interaction
                                            );
                                        }

                                        let n = 1;
                                        while (ticketChannel.bt[`new${n}`]) {
                                            n++;
                                        }
                                        newId = `new${n}`;

                                        ticketChannel.bt[newId] = {
                                            x: newButtonPositions.x,
                                            y: newButtonPositions.y,
                                            color: 'blue',
                                            title: 'Create Ticket',
                                            modalTitle: 'Placeholder Modal',
                                            emoji: '📥',
                                            control: true,

                                            in: {
                                                users: [],
                                                roles: []
                                            },
                                            out: {
                                                users: [],
                                                channels: [ticketChannel.c]
                                            }
                                        };

                                        ticketChannel.fm[newId] = {
                                            new1: {
                                                title: `Form question 1`,
                                                style: 'short',
                                                ph: 'Input type - short',
                                                max: 15,
                                                min: 0
                                            }
                                        };

                                        toSave.push(
                                            {
                                                alter: 'fm',
                                                value: ticketChannel.fm,
                                                data: saveData,
                                                filter: {
                                                    channelId: saveData[0],
                                                    guildId: saveData[1],
                                                    messageId: saveData[2]
                                                }
                                            },
                                            {
                                                alter: 'bt',
                                                value: ticketChannel.bt,
                                                data: saveData,
                                                filter: {
                                                    channelId: saveData[0],
                                                    guildId: saveData[1],
                                                    messageId: saveData[2]
                                                }
                                            }
                                        );
                                    } else {
                                        const formLength = Object.keys(ticketChannel.fm[selectedButton]).length;
                                        if (formLength >= 5) {
                                            client.collections.interactionsInProgress.set(message.id, false);

                                            return client.utils.interactionReplySpecial(
                                                {
                                                    embeds: [
                                                        {
                                                            color: client.data.embedColor,
                                                            title: 'Maximum number of forms reached!'
                                                        }
                                                    ],
                                                    flags: Discord.MessageFlags.Ephemeral
                                                },
                                                interaction
                                            );
                                        }

                                        let n = 1;
                                        while (ticketChannel.fm[selectedButton][`new${n}`]) {
                                            n++;
                                        }
                                        newId = `new${n}`;

                                        ticketChannel.fm[selectedButton][newId] = {
                                            title: `Form question ${formLength + 1}`,
                                            style: 'short',
                                            ph: 'Input type - short',
                                            max: 15,
                                            min: 0
                                        };

                                        toSave.push({
                                            alter: 'fm',
                                            value: ticketChannel.fm,
                                            data: saveData,
                                            filter: {
                                                channelId: saveData[0],
                                                guildId: saveData[1],
                                                messageId: saveData[2]
                                            }
                                        });
                                    }

                                    client.utils.interactionReplySpecial(
                                        {
                                            embeds: [
                                                {
                                                    color: client.data.embedColor,
                                                    title: `Successfully added new ${
                                                        lastSelected ? 'button!' : `form!`
                                                    } Key: ${newId}`
                                                }
                                            ],
                                            flags: Discord.MessageFlags.Ephemeral
                                        },
                                        interaction
                                    );

                                    let msg = null;

                                    try {
                                        msg = await interaction.guild.channels.fetch(ticketChannel.c);
                                    } catch {
                                        errMsg = 'The ticket system message does not exist anymore!';
                                    }

                                    try {
                                        msg = await msg.messages.fetch(ticketChannel.mid);
                                    } catch {
                                        errMsg = 'The ticket system message does not exist anymore!';
                                    }

                                    try {
                                        await client.edit(
                                            msg,
                                            msg.content,
                                            msg.embeds,
                                            msg.attachments,
                                            generateCustomButtonPanel(client, ticketChannel)
                                        );
                                    } catch (e) {
                                        client.log('Critical error updating ticket system main message', e);

                                        client.utils.interactionReplySpecial(
                                            {
                                                embeds: [
                                                    {
                                                        color: client.data.embedColor,
                                                        title: 'Critical error updating Ticket System message! Contact @mattfor'
                                                    }
                                                ],
                                                flags: Discord.MessageFlags.Ephemeral
                                            },
                                            interaction,
                                            null,
                                            null,
                                            null,
                                            true
                                        );
                                    }
                                }
                                break;

                            case 'edit': {
                                const editPanelEmbed = interaction.message.embeds[1] ?? interaction.message.embeds[0];

                                lastSelected = editPanelEmbed.description.indexOf('~~') < 22;

                                const upKeep = client.utils.cleanup(editPanelEmbed.title.split('|')[1].split(' '));

                                if (lastSelected) {
                                    const editModalFormKey = new Discord.TextInputBuilder()
                                        .setCustomId('form-key')
                                        .setLabel('Form key')
                                        .setStyle(Discord.TextInputStyle.Short)
                                        .setPlaceholder(
                                            `Current: ${upKeep[4]} | Under ${MAX_FORM_KEY_LENGTH} chars. Start with "${REQUIRED_PREFIX}" to make it required.`
                                        )

                                        .setMaxLength(REQUIRED_PREFIX.length + MAX_FORM_KEY_LENGTH - 1)
                                        .setRequired(false);

                                    const editModalFormTitle = new Discord.TextInputBuilder()
                                        .setCustomId('form-title')
                                        .setLabel('Form Title')
                                        .setStyle(Discord.TextInputStyle.Short)
                                        .setPlaceholder(`Current: ${ticketChannel.fm[upKeep[1]][upKeep[4]].title}`)
                                        .setMaxLength(45)
                                        .setRequired(false);

                                    const editModalFormStyle = new Discord.TextInputBuilder()
                                        .setCustomId('form-style')
                                        .setLabel('Form Style')
                                        .setStyle(Discord.TextInputStyle.Short)
                                        .setPlaceholder(
                                            `short / long - Current: ${ticketChannel.fm[upKeep[1]][upKeep[4]].style}`
                                        )
                                        .setMaxLength(5)
                                        .setRequired(false);

                                    const maxLen =
                                        ticketChannel.fm[upKeep[1]][upKeep[4]].style === 'short' ? 100 : 4000;

                                    const editModalFormPlaceholder = new Discord.TextInputBuilder()
                                        .setCustomId('form-ph')
                                        .setLabel('Form Placeholder')
                                        .setStyle(Discord.TextInputStyle.Paragraph)
                                        .setPlaceholder(
                                            `Current: ${ticketChannel.fm[upKeep[1]][upKeep[4]].ph}`.slice(0, 100)
                                        )
                                        .setMaxLength(maxLen)
                                        .setRequired(false);

                                    const editModalFormMinMax = new Discord.TextInputBuilder()
                                        .setCustomId('form-minmax')
                                        .setLabel('Form Min / Max length')
                                        .setStyle(Discord.TextInputStyle.Paragraph)
                                        .setPlaceholder(
                                            `Format: min | max. If you do not want one, type 0 in its place.`
                                        )
                                        .setMaxLength(16)
                                        .setRequired(false);

                                    const inputModalPlaceholder = client.assembleModal(
                                        `Editing Button: ${upKeep[1]} | Form: ${upKeep[4]}`.slice(0, 45),
                                        'ticketsystem_edit_modal_form',
                                        editModalFormKey,
                                        editModalFormTitle,
                                        editModalFormStyle,
                                        editModalFormPlaceholder,
                                        editModalFormMinMax
                                    );

                                    return await interaction.showModal(inputModalPlaceholder);
                                }

                                const editModalButtonTitle = new Discord.TextInputBuilder()
                                    .setCustomId('button-title')
                                    .setLabel('Button Title')
                                    .setStyle(Discord.TextInputStyle.Short)
                                    .setPlaceholder(`Current: ${ticketChannel.bt[upKeep[1]].title}`)
                                    .setMaxLength(45)
                                    .setRequired(false);

                                const editModalButtonModalTitle = new Discord.TextInputBuilder()
                                    .setCustomId('button-modal')
                                    .setLabel('Modal Title')
                                    .setStyle(Discord.TextInputStyle.Short)
                                    .setPlaceholder(`Current: ${ticketChannel.bt[upKeep[1]].modalTitle}`)
                                    .setMaxLength(45)
                                    .setRequired(false);

                                const editModalButtonColor = new Discord.TextInputBuilder()
                                    .setCustomId('button-color')
                                    .setLabel('Button Color')
                                    .setStyle(Discord.TextInputStyle.Short)
                                    .setPlaceholder(`Current: ${ticketChannel.bt[upKeep[1]].color}`)
                                    .setMaxLength(5)
                                    .setRequired(false);

                                const editModalButtonEmoji = new Discord.TextInputBuilder()
                                    .setCustomId('button-emoji')
                                    .setLabel('Button Emoji')
                                    .setStyle(Discord.TextInputStyle.Short)
                                    .setPlaceholder(`Current: ${ticketChannel.bt[upKeep[1]].emoji}`)
                                    .setMaxLength(40)
                                    .setRequired(false);

                                const editModalButtonXY = new Discord.TextInputBuilder()
                                    .setCustomId('button-xy')
                                    .setLabel('Button X and Y Position')
                                    .setStyle(Discord.TextInputStyle.Short)
                                    .setPlaceholder(
                                        `Format: min | max. Current: X-${ticketChannel.bt[upKeep[1]].x} | Y-${ticketChannel.bt[upKeep[1]].y}`.slice(
                                            0,
                                            45
                                        )
                                    )
                                    .setMaxLength(5)
                                    .setRequired(false);

                                const editButtonModal = client.assembleModal(
                                    `Editing Button "${upKeep[1]}"`.slice(0, 45),
                                    'ticketsystem_edit_modal_button',
                                    editModalButtonTitle,
                                    editModalButtonModalTitle,
                                    editModalButtonColor,
                                    editModalButtonEmoji,
                                    editModalButtonXY
                                );

                                return await interaction.showModal(editButtonModal);
                            }

                            case 'rem':
                                {
                                    const editPanelEmbed =
                                        interaction.message.embeds[1] ?? interaction.message.embeds[0];

                                    lastSelected = editPanelEmbed.description.indexOf('**') < 22;

                                    if (lastSelected) {
                                        if (Object.keys(ticketChannel.bt).length === 1) {
                                            client.collections.interactionsInProgress.set(message.id, false);
                                            return client.utils.interactionReplySpecial(
                                                {
                                                    embeds: [
                                                        {
                                                            color: client.data.embedColor,
                                                            title: `Cannot have no buttons on a message!\nIf you want a pure embed use **${guild.px[0]}embed**`
                                                        }
                                                    ],
                                                    flags: Discord.MessageFlags.Ephemeral
                                                },
                                                interaction
                                            );
                                        }

                                        const removedButton = selectedButton;

                                        delete ticketChannel.bt[removedButton];
                                        delete ticketChannel.fm[removedButton];

                                        selectedButton = Object.keys(ticketChannel.bt)[0];
                                        selectedForm = Object.keys(ticketChannel.fm[selectedButton] ?? {})[0];

                                        toSave.push(
                                            {
                                                alter: 'bt',
                                                value: ticketChannel.bt,
                                                data: saveData,
                                                filter: {
                                                    channelId: saveData[0],
                                                    guildId: saveData[1],
                                                    messageId: saveData[2]
                                                }
                                            },
                                            {
                                                alter: 'fm',
                                                value: ticketChannel.fm,
                                                data: saveData,
                                                filter: {
                                                    channelId: saveData[0],
                                                    guildId: saveData[1],
                                                    messageId: saveData[2]
                                                }
                                            }
                                        );

                                        client.utils.interactionReplySpecial(
                                            {
                                                embeds: [
                                                    {
                                                        color: client.data.embedColor,
                                                        title: `Successfully deleted button: **[\`${removedButton}\`]**`
                                                    }
                                                ],
                                                flags: Discord.MessageFlags.Ephemeral
                                            },
                                            interaction
                                        );
                                    } else {
                                        if (Object.keys(ticketChannel.fm[selectedButton]).length === 1) {
                                            client.collections.interactionsInProgress.set(message.id, false);
                                            return client.utils.interactionReplySpecial(
                                                {
                                                    embeds: [
                                                        {
                                                            color: client.data.embedColor,
                                                            title: 'Cannot have no forms on a button!'
                                                        }
                                                    ],
                                                    flags: Discord.MessageFlags.Ephemeral
                                                },
                                                interaction
                                            );
                                        }

                                        const removedForm = selectedForm;

                                        delete ticketChannel.fm[selectedButton][removedForm];

                                        selectedForm = Object.keys(ticketChannel.fm[selectedButton])[0];

                                        toSave.push({
                                            alter: 'fm',
                                            value: ticketChannel.fm,
                                            data: saveData,
                                            filter: {
                                                channelId: saveData[0],
                                                guildId: saveData[1],
                                                messageId: saveData[2]
                                            }
                                        });

                                        client.utils.interactionReplySpecial(
                                            {
                                                embeds: [
                                                    {
                                                        color: client.data.embedColor,
                                                        title: `Successfully deleted button's **[\`${selectedButton}\`]** form: **[\`${removedForm}\`]**`
                                                    }
                                                ],
                                                flags: Discord.MessageFlags.Ephemeral
                                            },
                                            interaction
                                        );
                                    }
                                }
                                break;

                            case 'in':
                            case 'out':
                                {
                                    const inputs = interactionIdData[2] === 'in';

                                    const waiting = await client.utils.interactionReplySpecial(
                                        {
                                            embeds: [
                                                {
                                                    color: client.data.embedColor,
                                                    title: `${
                                                        inputs
                                                            ? 'Type  IDs, @ or # the users / roles who will be able to send this ticket'
                                                            : 'Type  IDs, @ or # the channels / users where the tickets will be sent to.'
                                                    }\nChecking their validity will take a long time. Do not be alarmed.`
                                                }
                                            ],
                                            flags: Discord.MessageFlags.Ephemeral
                                        },
                                        interaction
                                    );

                                    let total = 0;
                                    let errMsg = null;

                                    const invalid = [];
                                    const correct = {
                                        roles: [],
                                        users: [],
                                        channels: []
                                    };

                                    const changes = {
                                        in: {
                                            a: [],
                                            r: []
                                        },
                                        out: {
                                            a: [],
                                            r: []
                                        }
                                    };

                                    await interaction.channel
                                        .awaitMessages({
                                            filter: (m) => m.author.id === interaction.user.id,
                                            max: 1,
                                            time: 300000,
                                            errors: ['time']
                                        })
                                        .then(async (m) => {
                                            m = m.first();
                                            await client.delete(m);
                                            const args = m.content.split(' ');

                                            let i = 0;
                                            while (args.length > 0) {
                                                const r = client.utils.role(m, args, 0);
                                                const [u, c] = await Promise.allSettled([
                                                    client.utils.user(m, args, 0),
                                                    client.utils.channel(m, args, 0)
                                                ]);

                                                if (c.status === 'fulfilled') {
                                                    correct.channels.push(c.value.id);
                                                } else if (u.status === 'fulfilled') {
                                                    correct.users.push(u.value.id);
                                                } else if (r) {
                                                    correct.roles.push(r.id);
                                                } else {
                                                    invalid.push(i + 1);
                                                }

                                                i++;
                                                args.shift();
                                            }
                                        })
                                        .catch(() => (errMsg = 'Took too long! Try again!'));

                                    for (const key in correct) {
                                        if (Array.isArray(correct[key])) {
                                            correct[key] = [...new Set(correct[key])];
                                        }
                                    }

                                    if (invalid.length > 0) {
                                        errMsg = `Item${invalid.length === 1 ? 's' : ''} [${invalid.join(', ')}] ${
                                            invalid.length === 1 ? 'is' : 'are'
                                        } invalid!`;
                                    }

                                    if (errMsg) {
                                        return client.utils.interactionReplySpecial(
                                            {
                                                embeds: [
                                                    {
                                                        color: client.data.embedColor,
                                                        title: errMsg
                                                    }
                                                ],
                                                flags: Discord.MessageFlags.Ephemeral
                                            },
                                            interaction
                                        );
                                    }

                                    if (inputs) {
                                        if (correct.users.length > 0) {
                                            total += correct.users.length;

                                            changes.in.a.push(
                                                ...correct.users.map((u) => {
                                                    return `<@!${u}>`;
                                                })
                                            );

                                            changes.in.r.push(
                                                ...ticketChannel.bt[selectedButton].in.users.map((u) => {
                                                    return `<@!${u}>`;
                                                })
                                            );

                                            ticketChannel.bt[selectedButton].in.users = correct.users;

                                            toSave.push({
                                                alter: `bt.${selectedButton}.in.users`,
                                                value: ticketChannel.bt[selectedButton].in.users,
                                                data: saveData,
                                                filter: {
                                                    channelId: saveData[0],
                                                    guildId: saveData[1],
                                                    messageId: saveData[2]
                                                }
                                            });
                                        }

                                        if (correct.roles.length > 0) {
                                            total += correct.roles.length;

                                            changes.in.a.push(
                                                ...correct.roles.map((r) => {
                                                    return `<@&${r}>`;
                                                })
                                            );

                                            changes.in.r.push(
                                                ...ticketChannel.bt[selectedButton].in.roles.map((r) => {
                                                    return `<@&${r}>`;
                                                })
                                            );

                                            ticketChannel.bt[selectedButton].in.roles = correct.roles;

                                            toSave.push({
                                                alter: `bt.${selectedButton}.in.roles`,
                                                value: ticketChannel.bt[selectedButton].in.roles,
                                                data: saveData,
                                                filter: {
                                                    channelId: saveData[0],
                                                    guildId: saveData[1],
                                                    messageId: saveData[2]
                                                }
                                            });
                                        }
                                    } else {
                                        if (correct.users.length > 0) {
                                            total += correct.users.length;

                                            changes.out.a.push(
                                                ...correct.users.map((u) => {
                                                    return `<@!${u}>`;
                                                })
                                            );

                                            changes.out.r.push(
                                                ...ticketChannel.bt[selectedButton].out.users.map((u) => {
                                                    return `<@!${u}>`;
                                                })
                                            );

                                            ticketChannel.bt[selectedButton].out.users = correct.users;

                                            toSave.push({
                                                alter: `bt.${selectedButton}.out.users`,
                                                value: ticketChannel.bt[selectedButton].out.users,
                                                data: saveData,
                                                filter: {
                                                    channelId: saveData[0],
                                                    guildId: saveData[1],
                                                    messageId: saveData[2]
                                                }
                                            });
                                        }

                                        if (correct.channels.length > 0) {
                                            total += correct.channels.length;

                                            changes.out.a.push(
                                                ...correct.channels.map((c) => {
                                                    return `<#${c}>`;
                                                })
                                            );

                                            changes.out.r.push(
                                                ...ticketChannel.bt[selectedButton].out.channels.map((c) => {
                                                    return `<#${c}>`;
                                                })
                                            );

                                            ticketChannel.bt[selectedButton].out.channels = correct.channels;

                                            toSave.push({
                                                alter: `bt.${selectedButton}.out.channels`,
                                                value: ticketChannel.bt[selectedButton].out.channels,
                                                data: saveData,
                                                filter: {
                                                    channelId: saveData[0],
                                                    guildId: saveData[1],
                                                    messageId: saveData[2]
                                                }
                                            });
                                        }
                                    }

                                    try {
                                        await waiting.delete();
                                    } catch {}

                                    client.utils.interactionReplySpecial(
                                        {
                                            embeds: [
                                                {
                                                    color: client.data.embedColor,
                                                    title: `Successfully edited button ${
                                                        inputs ? 'inputs' : 'outputs'
                                                    }!\nIt currently has ${total} ${inputs ? 'input' : 'output'}${
                                                        total !== 1 ? 's' : ''
                                                    }.`,
                                                    description: `## Changes:\n**\`Current:\`**\n${
                                                        inputs
                                                            ? changes.in.a
                                                                  .map((t) => {
                                                                      return `**${t}**`;
                                                                  })
                                                                  .join(', ')
                                                            : changes.out.a
                                                                  .map((t) => {
                                                                      return `**${t}**`;
                                                                  })
                                                                  .join(', ')
                                                    }\n**\`\nPrevious:\`**\n${
                                                        inputs
                                                            ? changes.in.r
                                                                  .map((t) => {
                                                                      return `**${t}**`;
                                                                  })
                                                                  .join(', ')
                                                            : changes.out.r
                                                                  .map((t) => {
                                                                      return `**${t}**`;
                                                                  })
                                                                  .join(', ')
                                                    }`
                                                }
                                            ],
                                            flags: Discord.MessageFlags.Ephemeral
                                        },
                                        interaction
                                    );
                                }
                                break;

                            case 'cp':
                                {
                                    ticketChannel.bt[selectedButton].control =
                                        !ticketChannel.bt[selectedButton].control;

                                    toSave.push({
                                        alter: `bt.${selectedButton}`,
                                        value: ticketChannel.bt[selectedButton],
                                        data: saveData,
                                        filter: {
                                            channelId: saveData[0],
                                            guildId: saveData[1],
                                            messageId: saveData[2]
                                        }
                                    });

                                    client.utils.interactionReplySpecial(
                                        {
                                            embeds: [
                                                {
                                                    color: client.data.embedColor,
                                                    title: `Control panel for this button response has been turned **${
                                                        ticketChannel.bt[selectedButton].control ? 'ON' : 'OFF'
                                                    }**.`
                                                }
                                            ],
                                            flags: Discord.MessageFlags.Ephemeral
                                        },
                                        interaction
                                    );
                                }
                                break;

                            case 'message':
                                {
                                    const embedMaker = new client.class.customEmbed(client);

                                    client.utils.interactionReplySpecial(
                                        {
                                            embeds: [
                                                {
                                                    color: client.data.embedColor,
                                                    title: `Provide a ${guild.px[0]}embed formatted message or text file.\nThis will represent the ticket system message.`
                                                }
                                            ],
                                            flags: Discord.MessageFlags.Ephemeral
                                        },
                                        interaction
                                    );

                                    let parts = null;
                                    let errMsg = null;
                                    await interaction.channel
                                        .awaitMessages({
                                            filter: (m) => m.author.id === interaction.user.id,
                                            max: 1,
                                            time: 300000,
                                            errors: ['time']
                                        })
                                        .then(async (m) => {
                                            m = m.first();
                                            parts = await embedMaker.fullRoutine(m, m.content.split(' '), guild, {
                                                noChannel: true,
                                                valuesOnly: true,
                                                ignoreEmbed: true
                                            });
                                            await m.delete();
                                        })
                                        .catch(() => (errMsg = 'Took too long to reply! Try again.'));

                                    let msg = null;

                                    try {
                                        msg = await interaction.guild.channels.fetch(ticketChannel.c);
                                    } catch {
                                        errMsg = 'The ticket system message does not exist anymore!';
                                    }

                                    try {
                                        msg = await msg.messages.fetch(ticketChannel.mid);
                                    } catch {
                                        errMsg = 'The ticket system message does not exist anymore!';
                                    }

                                    if (!parts || errMsg) {
                                        return client.utils.interactionReplySpecial(
                                            {
                                                embeds: [
                                                    {
                                                        color: client.data.embedColor,
                                                        title: !parts ? 'Invalid data provided!' : errMsg
                                                    }
                                                ],
                                                flags: Discord.MessageFlags.Ephemeral
                                            },
                                            interaction,
                                            null,
                                            null,
                                            null,
                                            true
                                        );
                                    }

                                    ticketChannel.ds = `${embedMaker.text}[ĄSPLITTERĄ]${embedMaker.rawEmbedText}`;

                                    toSave.push({
                                        alter: 'ds',
                                        value: ticketChannel.ds,
                                        data: saveData,
                                        filter: {
                                            channelId: saveData[0],
                                            guildId: saveData[1],
                                            messageId: saveData[2]
                                        }
                                    });

                                    try {
                                        await client.edit(
                                            msg,
                                            parts[0],
                                            parts[1],
                                            parts[2],
                                            generateCustomButtonPanel(client, ticketChannel)
                                        );
                                    } catch (e) {
                                        client.log('Critical error updating ticket system main message', e);

                                        return client.utils.interactionReplySpecial(
                                            {
                                                embeds: [
                                                    {
                                                        color: client.data.embedColor,
                                                        title: 'Invalid content provided!'
                                                    }
                                                ],
                                                flags: Discord.MessageFlags.Ephemeral
                                            },
                                            interaction,
                                            null,
                                            null,
                                            null,
                                            true
                                        );
                                    }
                                }
                                break;
                        }

                        if (['add', 'edit', 'rem', 'modal'].includes(interactionIdData[2])) {
                            let msg = null;
                            let errMsg = null;

                            try {
                                msg = await interaction.guild.channels.fetch(ticketChannel.c);
                            } catch {
                                errMsg = 'The ticket system message does not exist anymore!';
                            }

                            try {
                                msg = await msg.messages.fetch(ticketChannel.mid);
                            } catch {
                                errMsg = 'The ticket system message does not exist anymore!';
                            }

                            if (errMsg) {
                                return client.utils.interactionReplySpecial(
                                    {
                                        embeds: [
                                            {
                                                color: client.data.embedColor,
                                                title: errMsg
                                            }
                                        ],
                                        flags: Discord.MessageFlags.Ephemeral
                                    },
                                    interaction,
                                    null,
                                    null,
                                    null,
                                    true
                                );
                            }

                            try {
                                await client.edit(
                                    msg,
                                    msg.content,
                                    msg.embeds[0] ? [msg.embeds[0].data] : null,
                                    msg.attachments,
                                    generateCustomButtonPanel(client, ticketChannel)
                                );
                            } catch (e) {
                                client.log('Critical error updating ticket system main message', e);

                                return client.utils.interactionReplySpecial(
                                    {
                                        embeds: [
                                            {
                                                color: client.data.embedColor,
                                                title: 'Invalid content provided!'
                                            }
                                        ],
                                        flags: Discord.MessageFlags.Ephemeral
                                    },
                                    interaction,
                                    null,
                                    null,
                                    null,
                                    true
                                );
                            }
                        }

                        client.saveTicket(saveData[1], saveData[0], saveData[2], ...toSave);
                        client.collections.interactionsInProgress.set(message.id, false);
                    }
                    break;

                case 'real': {
                    const currentButton = interactionIdData[2];

                    const toAdd = [];
                    for (const [key, value] of Object.entries(ticketChannel.fm[currentButton])) {
                        const form = new Discord.TextInputBuilder();

                        form.setLabel(value.title.slice(0, 45))
                            .setRequired(key.startsWith('req'))
                            .setCustomId(`ticketsystem_modal_${currentButton}-${key}`)
                            .setStyle(
                                value.style === 'short'
                                    ? Discord.TextInputStyle.Short
                                    : Discord.TextInputStyle.Paragraph
                            );

                        if (value.ph.length > 0) {
                            form.setPlaceholder(value.ph);
                        }

                        if (value.max > 0) {
                            form.setMaxLength(value.max);
                        }

                        if (value.min > 0) {
                            form.setMinLength(value.min);
                        }

                        toAdd.push(form);
                    }

                    const modal = client.assembleModal(
                        ticketChannel.bt[currentButton].modalTitle,
                        `ticketsystem_modal_${currentButton}`,
                        ...toAdd
                    );

                    return await interaction.showModal(modal);
                }

                case 'modal':
                    {
                        const fields = interaction.fields.fields;

                        const ticketDate = client.utils.formatDate(new Date());

                        const createEmbed = () => ({
                            color: client.data.embedColor,
                            title: `Ticket ${ticketDate} | By`,
                            description: `${interaction.member} | ${interaction.member.displayName} | ${interaction.user.id}`,
                            thumbnail: {
                                url: interaction.member.displayAvatarURL({
                                    size: 4096,
                                    dynamic: true
                                })
                            },
                            fields: [],
                            image: {
                                url: `https://www.youtube.com/results?search_query=open_${interaction.user.id}_${interaction.guildId}_${ticketChannel.c}_PLACEHOLDER-CHANNEL-IDS_PLACEHOLDER-TICKET-IDS`
                            }
                        });

                        let embed = createEmbed();
                        let embeds = [embed];
                        let embedSize = 0;

                        let buttonName = null;
                        for (const [key, value] of Array.from(fields.entries())) {
                            const _value = value.value;
                            const _key = key.split('_')[2];

                            buttonName = _key;

                            const title = ticketChannel.fm[_key.split('-')[0]][_key.split('-')[1]].title;

                            const addField = (name, value) => {
                                const fieldSize = name.length + value.length;

                                if (embedSize + fieldSize > 5000) {
                                    embed = createEmbed();
                                    embeds.push(
                                        Object.assign(embed, {
                                            title: null,
                                            thumbnail: null,
                                            description: null
                                        })
                                    );
                                    embedSize = 0;
                                }

                                embed.fields.push({
                                    name,
                                    value
                                });
                                embedSize += fieldSize;
                            };

                            if (_value.length > 1024) {
                                const chunks = splitChunks(_value, 1024);

                                chunks.forEach((chunk, index) => {
                                    addField(index === 0 ? title : `${title} Continuation #${index + 1}`, chunk);
                                });
                            } else {
                                addField(title, _value === '' ? '```diff\n- No answer provided -\n```' : _value);
                            }
                        }

                        if (ticketChannel.bt[buttonName.split('-')[0]].in.users.length > 0) {
                            if (!ticketChannel.bt[buttonName.split('-')[0]].in.users.includes(interaction.user.id)) {
                                return 0b01100101_01110010_01110010_01101111_01110010;
                            }
                        }

                        if (ticketChannel.bt[buttonName.split('-')[0]].in.roles.length > 0) {
                            let hasRole = false;
                            for (const r of ticketChannel.bt[buttonName.split('-')[0]].in.roles) {
                                if (interaction.member.roles.cache.has(r)) {
                                    hasRole = true;
                                    break;
                                }
                            }

                            if (!hasRole) {
                                return 0b01100101_01110010_01110010_01101111_01110010;
                            }
                        }

                        const messageStorage = [];
                        const messageIdStorage = [];
                        const channelIdStorage = [];
                        for (const id of ticketChannel.bt[buttonName.split('-')[0]].out.users) {
                            const user = await client.getUser(id);

                            if (user) {
                                for (let i = 0; i < embeds.length; i++) {
                                    const last = i === embeds.length - 1;

                                    if (last) {
                                        Object.assign(embeds[i], {
                                            title: `Ticket ${ticketDate} | By`,
                                            description: `${interaction.member} | ${interaction.member.displayName} | ${interaction.user.id}`,
                                            thumbnail: {
                                                url: interaction.member.displayAvatarURL({
                                                    size: 4096,
                                                    dynamic: true
                                                })
                                            }
                                        });
                                    }

                                    const m = await client.send(
                                        user,
                                        null,
                                        [embeds[i]],
                                        null,
                                        null,
                                        ticketChannel.bt[buttonName.split('-')[0]].control && last
                                            ? generateControlPanel()
                                            : null
                                    );

                                    if (last) {
                                        messageStorage.push(m);
                                        messageIdStorage.push(m.id);
                                        channelIdStorage.push(user.id);
                                    }
                                }
                            }
                        }

                        for (const id of ticketChannel.bt[buttonName.split('-')[0]].out.channels) {
                            const channel = await interaction.guild.channels.fetch(id).catch(() => null);

                            if (channel) {
                                for (let i = 0; i < embeds.length; i++) {
                                    const last = i === embeds.length - 1;

                                    if (last) {
                                        Object.assign(embeds[i], {
                                            title: `Ticket ${ticketDate} | By`,
                                            description: `${interaction.member} | ${interaction.member.displayName} | ${interaction.user.id}`,
                                            thumbnail: {
                                                url: interaction.member.displayAvatarURL({
                                                    size: 4096,
                                                    dynamic: true
                                                })
                                            }
                                        });
                                    }

                                    const m = await client.send(
                                        channel,
                                        null,
                                        [embeds[i]],
                                        null,
                                        null,
                                        ticketChannel.bt[buttonName.split('-')[0]].control && last
                                            ? generateControlPanel()
                                            : null
                                    );

                                    if (last && m) {
                                        messageStorage.push(m);
                                        messageIdStorage.push(m.id);
                                        channelIdStorage.push(channel.id);
                                    }
                                }
                            }
                        }

                        const replacement = embed.image.url
                            .replace('PLACEHOLDER-TICKET-IDS', messageIdStorage.join('-'))
                            .replace('PLACEHOLDER-CHANNEL-IDS', channelIdStorage.join('-'));
                        embed.image.url = replacement;

                        for (let i = 0; i < embeds.length; i++) {
                            const last = i === embeds.length - 1;

                            if (last) {
                                Object.assign(embeds[i], {
                                    title: `Ticket ${ticketDate} | By`,
                                    description: `${interaction.member} | ${interaction.member.displayName} | ${interaction.user.id}`,
                                    thumbnail: {
                                        url: interaction.member.displayAvatarURL({
                                            size: 4096,
                                            dynamic: true
                                        })
                                    }
                                });
                            }

                            let _m = null;

                            try {
                                _m = await client.send(
                                    interaction.user,
                                    null,
                                    [embeds[i]],
                                    null,
                                    null,
                                    last ? generateUserPanel() : null
                                );
                            } catch {}
                            if (_m && last) {
                                messageStorage.push(_m);
                                messageIdStorage.push(_m.id);
                                channelIdStorage.push(_m.channelId);
                            }
                        }

                        const idPairs = [];
                        for (let i = 0; i < messageIdStorage.length; i++) {
                            idPairs.push([messageIdStorage[i], channelIdStorage[i]]);
                        }

                        for (const [mId, cId] of idPairs) {
                            let Message = await client.cluster
                                .broadcastEval(
                                    async (c, a) => {
                                        const channel = await c.channels.fetch(a.cId);

                                        if (!channel) {
                                            return null;
                                        }

                                        channel.messages.cache.delete(a.mId);

                                        const msg = await channel.messages.fetch(a.mId, {
                                            force: true,
                                            cache: true
                                        });

                                        if (msg) {
                                            await c.edit(
                                                msg,
                                                msg.content,
                                                Array.from(
                                                    msg.embeds.map((e) =>
                                                        Object.assign(e.data, {
                                                            image: {
                                                                url: a.replacement
                                                            }
                                                        })
                                                    )
                                                ),
                                                msg.attachments,
                                                msg.components
                                            );
                                        }
                                    },
                                    {
                                        context: {
                                            mId,
                                            cId,
                                            replacement
                                        }
                                    }
                                )
                                .catch(() => {
                                    return [null];
                                });
                        }

                        await client.utils.interactionReplySpecial(
                            {
                                embeds: [
                                    {
                                        color: client.data.embedColor,
                                        title: 'Ticket submitted successfully.'
                                    }
                                ],
                                flags: Discord.MessageFlags.Ephemeral
                            },
                            interaction
                        );

                        for (const msg of messageStorage) {
                            const OPID = msg.embeds[0].data.description.match(/\b\d{18,20}\b/g)?.[0];

                            await client.edit(
                                msg,
                                null,
                                [embed],
                                null,
                                msg.channel.isDMBased() && msg.channel.recipientId === OPID
                                    ? generateUserPanel()
                                    : ticketChannel.bt[buttonName.split('-')[0]].control
                                      ? generateControlPanel()
                                      : null
                            );

                            await client.utils.sleep(500);
                        }
                    }
                    break;

                case 'list':
                    {
                        if (data[1] !== interaction.user.id) {
                            return 0b01100101_01110010_01110010_01101111_01110010;
                        }

                        flag = true;
                        lastSelected = interactionIdData[2] === 'button';

                        if (lastSelected) {
                            selectedButton = interaction.values[0].split('_')[3];
                        } else {
                            selectedForm = interaction.values[0].split('_')[3];
                        }
                    }
                    break;
            }

            if (['list', 'edit'].includes(interactionIdData[1])) {
                const editPanelEmbed = interaction.message.embeds[1] ?? interaction.message.embeds[0];

                const upKeep = client.utils.cleanup(editPanelEmbed.title.split('|')[1].split(' '));

                if (interactionIdData[1] === 'list') {
                    const embed = {
                        ...editPanelEmbed.data,
                        title: `Selected | Button: ${selectedButton ?? upKeep[1]} - Form: ${selectedForm ?? upKeep[4]}`
                    };

                    const enabledPosition = embed.description.search(/\*\*/);

                    if (lastSelected && enabledPosition > 30) {
                        embed.description = embed.description
                            .replace('~~Button~~', '**Button**')
                            .replace('**Form**', '~~Form~~');
                    } else if (!lastSelected && enabledPosition < 20) {
                        embed.description = embed.description
                            .replace('**Button**', '~~Button~~')
                            .replace('~~Form~~', '**Form**');
                    }

                    await client.update(
                        interaction,
                        interaction.message.content,
                        [interaction.message.embeds[0].data, embed],
                        interaction.message.attachments,
                        null,
                        interaction.message.components
                    );

                    flag = false;
                    ticketChannel = await client.module.database.findTicketSystem(
                        data?.[3] ?? interaction.channelId,
                        interaction.guildId,
                        data?.[0] === 'edit' ? data[2] : interaction.message.id
                    );

                    if (selectedButton !== upKeep[1] && !!selectedButton) {
                        selectedForm = Object.keys(ticketChannel.fm[selectedButton])[0];
                    }
                }

                const buttonEntries = Object.entries(ticketChannel.bt);

                try {
                    ticketChannel.bt[selectedButton ?? upKeep[1]].control;
                } catch {
                    selectedButton = buttonEntries[0][0];
                }

                const embed = {
                    thumbnail: {
                        url: `https://www.youtube.com/results?search_query=edit_${interaction.user.id}_${ticketChannel.mid}_${ticketChannel.c}`
                    },

                    color: client.data.embedColor,
                    title: `Selected | Button: ${selectedButton ?? upKeep[1]} - Form: ${selectedForm ?? upKeep[4]}`,
                    description: ``,
                    fields: []
                };

                const ticketSystemDesignData = ticketChannel.ds.split('[ĄSPLITTERĄ]');

                const textData = ticketSystemDesignData[0];
                const embedData = ticketSystemDesignData[1].split(' ');

                const customEmbedMaker = new client.class.customEmbed(client);

                await customEmbedMaker.createFromText(embedData);

                const parts = await client.utils.generateCustomMessageParts(
                    interaction.message,
                    textData,
                    customEmbedMaker.data
                );

                const formEntries = Object.entries(ticketChannel.fm[selectedButton ?? upKeep[1]]);
                const controlPanelStatus = ticketChannel.bt[selectedButton ?? upKeep[1]].control;

                embed.description = `Selected to edit: ${lastSelected ? '**' : '~~'}Button${
                    lastSelected ? '**' : '~~'
                } - ${lastSelected ? '~~' : '**'}Form${lastSelected ? '~~' : '**'} \| Control Panel: **${
                    controlPanelStatus ? 'ON' : 'OFF'
                }**\n## Modal Title: ${ticketChannel.bt[selectedButton ?? upKeep[1]].modalTitle}\n${Object.entries(
                    ticketChannel.fm[selectedButton ?? upKeep[1]]
                )
                    .map(([questionKey, questionData]) => {
                        return (
                            `## Form Question Key - ${questionKey}:` +
                            `  Title: ${questionData.title}\n` +
                            `  Style: ${questionData.style}\n` +
                            `  Placeholder:\n\`\`\`\n${questionData.ph}\n\`\`\`\n` +
                            `  Max Length: ${questionData.max}\n` +
                            `  Required: ${questionKey.startsWith('req') ? 'Yes' : 'No'}`
                        );
                    })
                    .join('\n\n')}`.slice(0, 4096);

                embed.fields = [
                    {
                        name: 'Inputs - Who is allowed to create this ticket.',
                        value:
                            ticketChannel.bt[selectedButton ?? upKeep[1]].in.users.length === 0 &&
                            ticketChannel.bt[selectedButton ?? upKeep[1]].in.roles.length === 0
                                ? 'No custom inputs - everyone can submit this ticket.'
                                : `${
                                      ticketChannel.bt[selectedButton ?? upKeep[1]].in.users.length > 0
                                          ? `**Users:**\n${ticketChannel.bt[selectedButton ?? upKeep[1]].in.users
                                                .map((u) => {
                                                    return `<@!${u}>`;
                                                })
                                                .join(', ')}`
                                          : ''
                                  }${
                                      ticketChannel.bt[selectedButton ?? upKeep[1]].in.roles.length > 0
                                          ? `\n\n**Roles:**\n${ticketChannel.bt[selectedButton ?? upKeep[1]].in.roles
                                                .map((r) => {
                                                    return `<@&${r}>`;
                                                })
                                                .join(', ')}`
                                          : ''
                                  }`.slice(0, 1024)
                    },
                    {
                        name: 'Outputs - Where this ticket will be sent.',
                        value:
                            ticketChannel.bt[selectedButton ?? upKeep[1]].out.users.length === 0 &&
                            ticketChannel.bt[selectedButton ?? upKeep[1]].out.channels.length === 0
                                ? 'No custom outputs - the ticket will be sent to the same channel where it was submitted in.'
                                : `${
                                      ticketChannel.bt[selectedButton ?? upKeep[1]].out.channels.length > 0
                                          ? `**Channels:**\n${ticketChannel.bt[selectedButton ?? upKeep[1]].out.channels
                                                .map((c) => {
                                                    return `<#${c}>`;
                                                })
                                                .join(', ')}`
                                          : ''
                                  }${
                                      ticketChannel.bt[selectedButton ?? upKeep[1]].out.users.length > 0
                                          ? `\n\n**Users:**\n${ticketChannel.bt[selectedButton ?? upKeep[1]].out.users
                                                .map((u) => {
                                                    return `<@!${u}>`;
                                                })
                                                .join(', ')}`
                                          : ''
                                  }`.slice(0, 1024)
                    }
                ];

                const buttonSelectList = [];

                for (const [key, _] of buttonEntries) {
                    buttonSelectList.push({
                        label: `Selected button key: ${key}.`,
                        description: `This button has ${Object.keys(ticketChannel.fm[key]).length} forms.`,
                        value: `ticketsystem_select_button_${key}`
                    });
                }

                const buttonListMenu = new Discord.StringSelectMenuBuilder()
                    .setCustomId('ticketsystem_list_button')
                    .setPlaceholder('Select a button to edit.')
                    .addOptions(buttonSelectList);

                const formSelectList = [];
                for (const [key, _] of formEntries) {
                    formSelectList.push({
                        label: `Selected form key: ${key}.`,
                        value: `ticketsystem_select_form_${key}`
                    });
                }

                const formListMenu = new Discord.StringSelectMenuBuilder()
                    .setCustomId('ticketsystem_list_form')
                    .setPlaceholder('Select a form to edit.')
                    .addOptions(formSelectList);

                if (flag) {
                    return client.update(
                        interaction,
                        parts[0],
                        [parts[1]?.[0], embed].filter((i) => !!i),
                        parts[2],
                        null,
                        [
                            new Discord.ActionRowBuilder().addComponents(buttonListMenu),
                            new Discord.ActionRowBuilder().addComponents(formListMenu),
                            generateEditButtonPanel1(controlPanelStatus),
                            new Discord.ActionRowBuilder().addComponents(
                                new Discord.ButtonBuilder()
                                    .setCustomId('ticketsystem_edit_message')
                                    .setLabel('Edit Ticket System Message Design')
                                    .setStyle(Discord.ButtonStyle.Primary),
                                new Discord.ButtonBuilder()
                                    .setCustomId('ticketsystem_edit_add')
                                    .setLabel('Add New Button / Form')
                                    .setStyle(Discord.ButtonStyle.Primary)
                            )
                        ]
                    );
                }

                await client
                    .edit(
                        interaction.message,
                        parts[0],
                        [parts[1]?.[0], embed].filter((i) => !!i),
                        parts[2],
                        [
                            new Discord.ActionRowBuilder().addComponents(buttonListMenu),
                            new Discord.ActionRowBuilder().addComponents(formListMenu),
                            generateEditButtonPanel1(controlPanelStatus),
                            new Discord.ActionRowBuilder().addComponents(
                                new Discord.ButtonBuilder()
                                    .setCustomId('ticketsystem_edit_message')
                                    .setLabel('Edit Ticket System Message Design')
                                    .setStyle(Discord.ButtonStyle.Primary),
                                new Discord.ButtonBuilder()
                                    .setCustomId('ticketsystem_edit_add')
                                    .setLabel('Add New Button / Form')
                                    .setStyle(Discord.ButtonStyle.Primary)
                            )
                        ]
                    )
                    .catch(client.swallow('ticketsystem: edit panel'));

                return;
            }

            return;
        }

        let m = null;
        try {
            m = args.length > 0 ? await message.channel.messages.fetch(args[0]) : null;
        } catch {}

        if (m) {
            const waiting = await client.send(message.channel, null, [
                {
                    color: client.data.embedColor,
                    title: 'Loading edit panel...',
                    thumbnail: { url: client.cdn.loading }
                }
            ]);

            const ticketSystem = await client.module.database.findTicketSystem(message.channel.id, guild.id, args[0]);

            if (!ticketSystem) {
                try {
                    await waiting.delete();
                } catch {}

                return client.qEmbed('A Ticket System with that message Id does not exist!', message);
            }

            const buttonEntries = Object.entries(ticketSystem.bt);

            const embed = {
                thumbnail: {
                    url: `https://www.youtube.com/results?search_query=edit_${message.author.id}_${args[0]}_${message.channel.id}`
                },

                color: client.data.embedColor,
                title: `Selected | Button: ${buttonEntries[0][0]} - Form: ${Object.keys(ticketSystem.fm[buttonEntries[0][0]])[0]}`,
                description: ``,
                fields: []
            };

            const ticketSystemDesignData = ticketSystem.ds.split('[ĄSPLITTERĄ]');

            const textData = ticketSystemDesignData[0];
            const embedData = ticketSystemDesignData[1].split(' ');
            const customEmbedMaker = new client.class.customEmbed(client);

            await customEmbedMaker.createFromText(embedData);

            const parts = await client.utils.generateCustomMessageParts(message, textData, customEmbedMaker.data);

            const controlPanelStatus = ticketSystem.bt[buttonEntries[0][0]].control;

            const formEntries = Object.entries(ticketSystem.fm[buttonEntries[0][0]]);

            embed.description = `Selected to edit: **Button** - ~~Form~~ \| Control Panel: **${
                controlPanelStatus ? 'ON' : 'OFF'
            }**\n## Modal Title: ${ticketSystem.bt[buttonEntries[0][0]].modalTitle}\n${
                formEntries.length === 0
                    ? "```diff\n- There aren't forms tied to this button yet -\n```"
                    : formEntries
                          .map(([questionKey, questionData]) => {
                              return (
                                  `## Form Question Key - ${questionKey}:` +
                                  `  Title: ${questionData.title}\n` +
                                  `  Style: ${questionData.style}\n` +
                                  `  Placeholder:\n\`\`\`\n${questionData.ph}\n\`\`\`\n` +
                                  `  Max Length: ${questionData.max}\n` +
                                  `  Required: ${questionKey.startsWith('req') ? 'Yes' : 'No'}`
                              );
                          })
                          .join('\n\n')
            }`.slice(0, 4096);

            embed.fields = [
                {
                    name: 'Inputs - Who is allowed to create this ticket.',
                    value:
                        ticketSystem.bt[buttonEntries[0][0]].in.users.length === 0 &&
                        ticketSystem.bt[buttonEntries[0][0]].in.roles.length === 0
                            ? 'No custom inputs - everyone can submit this ticket.'
                            : `${
                                  ticketSystem.bt[buttonEntries[0][0]].in.users.length > 0
                                      ? `**Users:**\n${ticketSystem.bt[buttonEntries[0][0]].in.users
                                            .map((u) => {
                                                return `<@!${u}>`;
                                            })
                                            .join(', ')}`
                                      : ''
                              }${
                                  ticketSystem.bt[buttonEntries[0][0]].in.roles.length > 0
                                      ? `\n\n**Roles:**\n${ticketSystem.bt[buttonEntries[0][0]].in.roles
                                            .map((r) => {
                                                return `<@&${r}>`;
                                            })
                                            .join(', ')}`
                                      : ''
                              }`.slice(0, 1024)
                },
                {
                    name: 'Outputs - Where this ticket will be sent.',
                    value:
                        ticketSystem.bt[buttonEntries[0][0]].out.users.length === 0 &&
                        ticketSystem.bt[buttonEntries[0][0]].out.channels.length === 0
                            ? 'No custom outputs - the ticket will be sent to the same channel where it was submitted in.'
                            : `${
                                  ticketSystem.bt[buttonEntries[0][0]].out.channels.length > 0
                                      ? `**Channels:**\n${ticketSystem.bt[buttonEntries[0][0]].out.channels
                                            .map((c) => {
                                                return `<#${c}>`;
                                            })
                                            .join(', ')}`
                                      : ''
                              }${
                                  ticketSystem.bt[buttonEntries[0][0]].out.users.length > 0
                                      ? `\n\n**Users:**\n${ticketSystem.bt[buttonEntries[0][0]].out.users
                                            .map((u) => {
                                                return `<@!${u}>`;
                                            })
                                            .join(', ')}`
                                      : ''
                              }`.slice(0, 1024)
                }
            ];

            const buttonSelectList = [];
            for (const [key, _] of buttonEntries) {
                buttonSelectList.push({
                    label: `Selected button key: ${key}.`,
                    description: `This button has ${Object.keys(ticketSystem.fm[key]).length} forms.`,
                    value: `ticketsystem_select_button_${key}`
                });
            }

            const buttonListMenu = new Discord.StringSelectMenuBuilder()
                .setCustomId('ticketsystem_list_button')
                .setPlaceholder('Select a button to edit.')
                .addOptions(buttonSelectList);

            const formSelectList = [];
            for (const [key, _] of formEntries) {
                formSelectList.push({
                    label: `Selected form key: ${key}.`,
                    value: `ticketsystem_select_form_${key}`
                });
            }

            const formListMenu = new Discord.StringSelectMenuBuilder()
                .setCustomId('ticketsystem_list_form')
                .setPlaceholder('Select a form to edit.')
                .addOptions(formSelectList);

            try {
                await waiting.delete();
            } catch {}

            return client
                .send(
                    message.channel,
                    parts[0],
                    [parts[1]?.[0], embed].filter((i) => !!i),
                    null,
                    null,
                    [
                        new Discord.ActionRowBuilder().addComponents(buttonListMenu),
                        new Discord.ActionRowBuilder().addComponents(formListMenu),
                        generateEditButtonPanel1(controlPanelStatus),
                        new Discord.ActionRowBuilder().addComponents(
                            new Discord.ButtonBuilder()
                                .setCustomId('ticketsystem_edit_message')
                                .setLabel('Edit Ticket System Message Design')
                                .setStyle(Discord.ButtonStyle.Primary),
                            new Discord.ButtonBuilder()
                                .setCustomId('ticketsystem_edit_add')
                                .setLabel('Add New Button / Form')
                                .setStyle(Discord.ButtonStyle.Primary)
                        )
                    ],
                    parts[2]
                )
                .catch((e) =>
                    client.qEmbed(
                        `Relaxy has errored. This might indicate that the files saved with ${guild.px[0]}save are not present on the current system Relaxy is running on, please ${guild.px[0]}save them with the same filename to resolve this issue.\nShould that not work, dm @mattfor immediately.`,
                        message
                    )
                );
        }

        if (LIST.includes(args[0]?.toLowerCase())) {
            return listSystems(client, message, guild, interaction);
        }

        const existingChannel = await client.utils.channel(message, args, 0, { cut: true });

        if (existingChannel && existingChannel.type !== Discord.ChannelType.GuildText) {
            return client.qEmbed('Invalid channel type!', interaction ?? message);
        }

        let ticketChannelMessage = null;

        try {
            ticketChannelMessage = await existingChannel.messages.fetch(args[0]);
        } catch {}
        if (existingChannel && !ticketChannelMessage) {
            return client.qEmbed('The message with that ID does not exist on that channel!', interaction ?? message);
        }

        const existingTicketChannel = await client.module.database.findTicketSystem(
            existingChannel?.id,
            guild.id,
            args[0]
        );

        if (existingChannel && !existingTicketChannel) {
            return client.qEmbed(
                'This channel does not contain a ticket system! (Did you remember to put the message ID ?',
                interaction ?? message
            );
        }

        if (existingChannel && ticketChannelMessage && existingTicketChannel) {
            const waiting = await client.send(message.channel, null, [
                {
                    color: client.data.embedColor,
                    title: 'Loading edit panel...',
                    thumbnail: { url: client.cdn.loading }
                }
            ]);

            const buttonEntries = Object.entries(existingTicketChannel.bt);

            const embed = {
                thumbnail: {
                    url: `https://www.youtube.com/results?search_query=edit_${message.author.id}_${args[0]}_${existingTicketChannel.c}`
                },

                color: client.data.embedColor,
                title: `Selected | Button: ${buttonEntries[0][0]} - Form: ${Object.keys(existingTicketChannel.fm[buttonEntries[0][0]])[0]}`,
                description: ``,
                fields: []
            };

            const ticketSystemDesignData = existingTicketChannel.ds.split('[ĄSPLITTERĄ]');

            const textData = ticketSystemDesignData[0];
            const embedData = ticketSystemDesignData[1].split(' ');
            const customEmbedMaker = new client.class.customEmbed(client);

            await customEmbedMaker.createFromText(embedData);

            const parts = await client.utils.generateCustomMessageParts(message, textData, customEmbedMaker.data);

            const controlPanelStatus = existingTicketChannel.bt[buttonEntries[0][0]].control;

            const formEntries = Object.entries(existingTicketChannel.fm[buttonEntries[0][0]]);

            embed.description = `Selected to edit: **Button** - ~~Form~~ \| Control Panel: **${
                controlPanelStatus ? 'ON' : 'OFF'
            }**\n## Modal Title: ${existingTicketChannel.bt[buttonEntries[0][0]].modalTitle}\n${
                formEntries.length === 0
                    ? "```diff\n- There aren't forms tied to this button yet -\n```"
                    : formEntries
                          .map(([questionKey, questionData]) => {
                              return (
                                  `## Form Question Key - ${questionKey}:` +
                                  `  Title: ${questionData.title}\n` +
                                  `  Style: ${questionData.style}\n` +
                                  `  Placeholder:\n\`\`\`\n${questionData.ph}\n\`\`\`\n` +
                                  `  Max Length: ${questionData.max}\n` +
                                  `  Required: ${questionKey.startsWith('req') ? 'Yes' : 'No'}`
                              );
                          })
                          .join('\n\n')
            }`.slice(0, 4096);

            embed.fields = [
                {
                    name: 'Inputs - Who is allowed to create this ticket.',
                    value:
                        existingTicketChannel.bt[buttonEntries[0][0]].in.users.length === 0 &&
                        existingTicketChannel.bt[buttonEntries[0][0]].in.roles.length === 0
                            ? 'No custom inputs - everyone can submit this ticket.'
                            : `${
                                  existingTicketChannel.bt[buttonEntries[0][0]].in.users.length > 0
                                      ? `**Users:**\n${existingTicketChannel.bt[buttonEntries[0][0]].in.users
                                            .map((u) => {
                                                return `<@!${u}>`;
                                            })
                                            .join(', ')}`
                                      : ''
                              }${
                                  existingTicketChannel.bt[buttonEntries[0][0]].in.roles.length > 0
                                      ? `\n\n**Roles:**\n${existingTicketChannel.bt[buttonEntries[0][0]].in.roles
                                            .map((r) => {
                                                return `<@&${r}>`;
                                            })
                                            .join(', ')}`
                                      : ''
                              }`.slice(0, 1024)
                },
                {
                    name: 'Outputs - Where this ticket will be sent.',
                    value:
                        existingTicketChannel.bt[buttonEntries[0][0]].out.users.length === 0 &&
                        existingTicketChannel.bt[buttonEntries[0][0]].out.channels.length === 0
                            ? 'No custom outputs - the ticket will be sent to the same channel where it was submitted in.'
                            : `${
                                  existingTicketChannel.bt[buttonEntries[0][0]].out.channels.length > 0
                                      ? `**Channels:**\n${existingTicketChannel.bt[buttonEntries[0][0]].out.channels
                                            .map((c) => {
                                                return `<#${c}>`;
                                            })
                                            .join(', ')}`
                                      : ''
                              }${
                                  existingTicketChannel.bt[buttonEntries[0][0]].out.users.length > 0
                                      ? `\n\n**Users:**\n${existingTicketChannel.bt[buttonEntries[0][0]].out.users
                                            .map((u) => {
                                                return `<@!${u}>`;
                                            })
                                            .join(', ')}`
                                      : ''
                              }`.slice(0, 1024)
                }
            ];

            const buttonSelectList = [];
            for (const [key, _] of buttonEntries) {
                buttonSelectList.push({
                    label: `Selected button key: ${key}.`,
                    description: `This button has ${Object.keys(existingTicketChannel.fm[key]).length} forms.`,
                    value: `ticketsystem_select_button_${key}`
                });
            }

            const buttonListMenu = new Discord.StringSelectMenuBuilder()
                .setCustomId('ticketsystem_list_button')
                .setPlaceholder('Select a button to edit.')
                .addOptions(buttonSelectList);

            const formSelectList = [];
            for (const [key, _] of formEntries) {
                formSelectList.push({
                    label: `Selected form key: ${key}.`,
                    value: `ticketsystem_select_form_${key}`
                });
            }

            const formListMenu = new Discord.StringSelectMenuBuilder()
                .setCustomId('ticketsystem_list_form')
                .setPlaceholder('Select a form to edit.')
                .addOptions(formSelectList);

            try {
                await waiting.delete();
            } catch {}

            return client.send(
                message.channel,
                parts[0],
                [parts[1]?.[0], embed].filter((i) => !!i),
                null,
                null,
                [
                    new Discord.ActionRowBuilder().addComponents(buttonListMenu),
                    new Discord.ActionRowBuilder().addComponents(formListMenu),
                    generateEditButtonPanel1(controlPanelStatus),
                    new Discord.ActionRowBuilder().addComponents(
                        new Discord.ButtonBuilder()
                            .setCustomId('ticketsystem_edit_message')
                            .setLabel('Edit Ticket System Message Design')
                            .setStyle(Discord.ButtonStyle.Primary),
                        new Discord.ButtonBuilder()
                            .setCustomId('ticketsystem_edit_add')
                            .setLabel('Add New Button / Form')
                            .setStyle(Discord.ButtonStyle.Primary)
                    )
                ],
                parts[2]
            );
        }

        try {
            await client.module.tickets.createTicketSystem({
                guild: message.guild,
                guildDoc: guild,
                channel: existingChannel ?? null,
                reason: `=ticketsystem by ${client.utils.tag(message.author)}`
            });
        } catch (error) {
            client.data.errors++;

            return client.qEmbed(
                `Could not create the ticket system: ${error?.message ?? error}`,
                interaction ?? message
            );
        }

        return client.qEmbed('Ticketing system added!', interaction ?? message);
    }
};
