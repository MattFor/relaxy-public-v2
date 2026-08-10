'use strict';

import Discord              from 'discord.js';
import Relaxy               from '../../../src/Client/Relaxy.js';
import { emojiCollections } from '../../../src/Core/DataTable.js';

const responseArray = {
    'title':     'Successfully set the title.',
    'options':   'Successfully set the options.',
    'reactions': 'Successfully set the reactions.',
    'time':      'Successfully set the time of the poll.',
    'complete':  'Successfully sent the poll!',
    'channel':   'Successfully set the channel.'
};

const POLL_MODAL_FIELDS = {
    'title':     {
        title:       'Set poll title',
        label:       'Poll title / question',
        style:       'short',
        max:         256,
        placeholder: 'Do you like pancakes?'
    },
    'options':   {
        title:       'Set poll options',
        label:       'Options - one per line (2 or more)',
        style:       'paragraph',
        max:         2000,
        placeholder: 'Yes\nNo\nMaybe'
    },
    'time':      {
        title:       'Set poll duration',
        label:       'How long should the poll run?',
        style:       'short',
        max:         50,
        placeholder: 'e.g. 10 minutes, 2 hours, 3 days'
    },
    'reactions': {
        title:       'Set poll reactions',
        label:       'One emoji per option, in order',
        style:       'short',
        max:         200,
        placeholder: '1️⃣ 2️⃣ 3️⃣'
    },
    'channel':   {
        title:       'Set poll channel',
        label:       'Channel name or ID',
        style:       'short',
        max:         100,
        placeholder: '#general or 123456789012345678'
    }
};
const POLL_TEXT_CHANNEL_TYPES = [
    Discord.ChannelType.GuildText,
    Discord.ChannelType.GuildNews,
    Discord.ChannelType.PublicThread,
    Discord.ChannelType.PrivateThread,
    Discord.ChannelType.GuildNewsThread,
    Discord.ChannelType.GuildPublicThread,
    Discord.ChannelType.GuildPrivateThread,
    Discord.ChannelType.AnnouncementThread
];

export default {
    name:        'poll',
    usage:       '=poll',
    description: 'After initiating the command, press any of the first 5 buttons to fill in the poll\'s properties through a pop-up form (title, options, channel, duration and reactions).\n**To start the poll, press the button \'Post Poll\'.**',

    cooldown: 10,

    permissionsUser: [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ADD_REACTIONS',
        'MANAGE_MESSAGES'
    ],

    async run(client, message, args, guild, interaction)
    {
        if (interaction)
        {
            const interactionUserId = message.embeds[0].data.thumbnail.url.split('=')[1];

            const polls = client.collections.polls.get(message.guild.id);
            const poll = polls[message.id] ?? polls.filter(p =>
            {
                p.pollMessage.id === message.id;
            })?.[0];

            if (!interactionUserId || interaction.member.user.id !== interactionUserId)
            {
                return 0b01100101_01110010_01110010_01101111_01110010;
            }

            const interactionId = interaction.customId.split('_')[1];

            if (!poll || poll?.length === 0)
            {
                return client.utils.interactionReplySpecial('This poll doesn\'t exist!', interaction);
            }

            if (interaction.isModalSubmit())
            {
                const property = interactionId.replace('modal-', '');
                const value = client.readModal(interaction).field;

                let error = null;

                switch (property)
                {
                    case 'title':
                        if (!value)
                        {
                            error = 'Incorrect input!';
                        }
                        else
                        {
                            poll.title = value;
                        }
                        break;
                    case 'options':
                    {
                        const options = (value ?? '').split('\n').map(option => option.trim()).filter(Boolean);

                        if (options.length < 2)
                        {
                            error = 'You need at least two options!';
                        }
                        else if (options.join('').length > 2000)
                        {
                            error = 'Options too long!';
                        }
                        else
                        {
                            poll.options = options;

                            if (poll.data.options.length !== poll.data.emojis.length && !poll.emojisModified)
                            {
                                poll.emojis = emojiCollections.numbers.slice(0, poll.data.options.length);
                            }
                        }
                        break;
                    }
                    case 'time':
                        if (!client.utils.nums(value))
                        {
                            error = 'No time number found!';
                        }
                        else
                        {
                            poll.time = client.utils.getTime(value.split(' '));
                        }
                        break;
                    case 'reactions':
                    {
                        const emojis = client.utils.isValidEmoji(value ?? '');

                        if (!emojis || emojis.length <= 0)
                        {
                            error = 'No emojis detected!';
                        }
                        else if (emojis.length !== poll.data.options.length)
                        {
                            error = 'Emoji count doesn\'t match the number of options!';
                        }
                        else
                        {
                            poll.emojis = emojis;
                        }
                        break;
                    }
                    case 'channel':
                    {
                        const channel = await client.utils.channel(message, (value ?? '').split(' '), 0);

                        if (!channel)
                        {
                            error = 'Channel not found!';
                        }
                        else if (!client.utils.isExempt(guild, null, interaction.member ?? null) && client.utils.isRestricted(guild, channel.id))
                        {
                            error = 'You lack the permissions to post there!';
                        }
                        else if (!POLL_TEXT_CHANNEL_TYPES.includes(channel.type))
                        {
                            error = 'Invalid channel type!';
                        }
                        else
                        {
                            poll.channel = channel;
                        }
                        break;
                    }
                }

                if (error)
                {
                    await interaction.reply(client.utils.interactionReplySpecial(error, interaction, true));
                    return;
                }

                if (poll.changed)
                {
                    poll.changed = false;
                    await client.edit(poll.panel, null, poll.generateEmbed(), null, poll.generateButtonPanel());
                }

                const modalPollAddition = {};
                modalPollAddition[message.id] = poll;
                client.collections.polls.set(guild.id, Object.assign(polls, modalPollAddition));

                await interaction.reply(client.utils.interactionReplySpecial(responseArray[property], interaction, true));
                return;
            }
            if (POLL_MODAL_FIELDS[interactionId])
            {
                const field = POLL_MODAL_FIELDS[interactionId];

                await interaction.showModal(client.buildModal({
                    id:    `poll_modal-${interactionId}`,
                    title: field.title
                }, {
                    id:          'poll_field',
                    label:       field.label,
                    style:       field.style,
                    max:         field.max,
                    placeholder: field.placeholder,
                    required:    true
                }));
                return;
            }

            if (client.collections.interactionsInProgress.get(message.id))
            {
                return client.utils.interactionReplySpecial('You\'re already in an interaction!', interaction);
            }

            let quitFlag = false;
            let interactionToDelete = null;
            switch (interactionId)
            {
                case 'complete':
                {
                    client.collections.interactionsInProgress.set(message.id, true);

                    interactionToDelete = await interaction.reply({
                        embeds: [
                            {
                                color:       client.data.embedColor,
                                description: `Sending poll to ${poll.data.channel}...`
                            }
                        ],
                        flags:  Discord.MessageFlags.Ephemeral
                    });

                    if (!poll.ready)
                    {
                        return quitFlag = client.utils.interactionReplySpecial('Cannot construct poll, fix remaining issues!', interaction, true);
                    }

                    await poll.construct(interaction);
                }
                    break;
                case 'end':
                {
                    client.collections.interactionsInProgress.set(message.id, true);

                    interactionToDelete = await interaction.reply({
                        embeds: [
                            {
                                color: client.data.embedColor,
                                title: 'Deleting poll...'
                            }
                        ],
                        flags:  Discord.MessageFlags.Ephemeral
                    });

                    await poll.end(interaction.member);
                }
                    break;
            }

            await client.delete(interactionToDelete, true);

            client.collections.interactionsInProgress.set(message.id, false);

            if (quitFlag)
            {
                if (interactionToDelete)
                {
                    return interaction.followUp(quitFlag);
                }
                else
                {
                    return client.utils.interactionReplySpecial(quitFlag, interaction);
                }
            }

            if (poll.changed)
            {
                poll.changed = !poll.changed;
                await client.edit(poll.panel, null, poll.generateEmbed(), null, poll.generateButtonPanel());
            }

            const pollAddition = {};
            pollAddition[message.id] = poll;
            client.collections.polls.set(guild.id, Object.assign(polls, pollAddition));

            if (!poll.ended)
            {
                return interaction.followUp(client.utils.interactionReplySpecial(responseArray[interactionId], interaction, true));
            }

            return interaction.followUp(client.utils.interactionReplySpecial('Poll has successfully been closed.', interaction, true));
        }

        const existingPolls = client.collections.polls.get(guild.id);

        const poll = new client.class.poll(client, interaction ?? message, client);

        poll.panel = await client.send(message.channel, null, poll.generateEmbed(), null, null, poll.generateButtonPanel());

        const pollAddition = {};
        pollAddition[poll.panel.id] = poll;
        if (existingPolls)
        {
            client.collections.polls.set(guild.id, Object.assign(existingPolls, pollAddition));
        }
        else
        {
            client.collections.polls.set(guild.id, pollAddition);
        }
    }
};
