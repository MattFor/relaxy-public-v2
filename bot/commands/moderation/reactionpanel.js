'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';
import { emojiList } from '../../../src/Core/DataTable.js';

const responseArray = {
    removeAll: 'All reactions have been removed!',
    removeMessage: 'Message has been deleted!',
    removeType: 'Specific reaction type has been removed!',
    removeSpecific: 'Specific reaction from a user has been removed!',
    removeAnnoying: 'Controversial reactions have been removed!',
    removeAllFromUser: 'All reactions from the user removed!'
};

const reversedEmojiList = Object.fromEntries(Object.entries(emojiList).map(([key, value]) => [value, key]));

export default {
    name: 'reactionpanel',
    aliases: ['emojimanager', 'emojipanel', 'epanel', 'ep', 'rp'],
    usage: '=reactionpanel <messageId> [channelId]',
    description:
        'Open an emoji panel that lets you:\n- remove all emojis\n- delete the message\n- remove all occurrences of a specific reaction\n- remove one occurrence of a specific reaction from a specific user\n- remove all controversial reactions (flags, letters, anything within the relaxy censor list)\nOnly type the channelId if the message is outside of the channel where the command is called.',

    args: true,

    permissionsUser: ['SEND_MESSAGES', 'EMBED_LINKS', 'ADD_REACTIONS', 'MANAGE_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ADD_REACTIONS', 'MANAGE_MESSAGES'],

    async run(client, message, args, guild, interaction) {
        message = await (await client.channels.fetch(message.channelId)).messages.fetch(message.id);

        let missingUsers = [];

        if (interaction) {
            const data = message.embeds[0].data.thumbnail.url.split('=')[1].split('_');
            const interactionUserId = data[0];

            if (interaction.user.id !== interactionUserId) {
                return 0b01100101_01110010_01110010_01101111_01110010;
            }

            if (client.collections.interactionsInProgress.get(message.id)) {
                return client.utils.interactionReplySpecial('Another action is already being performed!', interaction);
            }

            const interactionId = interaction.customId.split('_')[1];
            const channel = await client.channels.fetch(client.utils.nums(data[2]));
            if (!channel) {
                return client.utils.interactionReplySpecial("Channel doesn't exist anymore!", interaction);
            }

            const messageToMod = await channel.messages.fetch(client.utils.nums(data[1]));
            if (!messageToMod) {
                return client.utils.interactionReplySpecial("Message doesn't exist anymore!", interaction);
            }

            client.collections.interactionsInProgress.set(message.id, true);

            let quitFlag = null;
            let deferInteraction = false;
            let interactionToDelete = null;
            await new Promise(async (resolve) => {
                switch (interactionId) {
                    case 'removeAll':
                        messageToMod.reactions.removeAll().catch(client.swallow('reactionpanel: removeAll'));
                        break;

                    case 'reactionpanel_removeAllFromUser': {
                        interactionToDelete = await interaction.reply({
                            embeds: [
                                {
                                    color: client.data.embedColor,
                                    description:
                                        "Which user's emojis should be removed?\nType the user information.\nf.e **USER_ID**"
                                }
                            ],
                            flags: Discord.MessageFlags.Ephemeral
                        });

                        let reactionCreators = {};
                        try {
                            for (let item of messageToMod.reactions.cache.values()) {
                                const author = item.users.cache.first() ?? '### Unavailable';

                                if (author === '### Unavailable') {
                                    missingUsers.push(item.users);
                                }

                                if (!reactionCreators[author.id]) {
                                    reactionCreators[author.id] = [];
                                }

                                reactionCreators[author.id].push(item);
                            }
                        } catch {
                            return (quitFlag = client.utils.interactionReplySpecial(
                                'Error performing action!',
                                interaction,
                                true
                            ));
                        }

                        reactionCreators = client.utils.flattenArray(Object.values(reactionCreators));

                        await interaction.channel
                            .awaitMessages({
                                filter: (m) => m.author.id === interactionUserId,
                                max: 1,
                                time: 300000,
                                errors: ['time']
                            })
                            .then(async (m) => {
                                m = m.first();

                                if (m.content.length === 0) {
                                    return (quitFlag = client.utils.interactionReplySpecial(
                                        'Incorrect input!!',
                                        interaction,
                                        true
                                    ));
                                }

                                let userId = (await client.utils.member(m, m.content.split(' '), 0))?.user?.id ?? null;

                                await client.delete(m);

                                if (!userId) {
                                    return (quitFlag = client.utils.interactionReplySpecial(
                                        'User not found!',
                                        interaction,
                                        true
                                    ));
                                }

                                if (!reactionCreators[userId]) {
                                    return (quitFlag = client.utils.interactionReplySpecial(
                                        "This user hasn't reacted!",
                                        interaction,
                                        true
                                    ));
                                }

                                deferInteraction = true;
                                return await new Promise(async (resolve) => {
                                    const i = setInterval(async () => {
                                        await reactionCreators[userId].shift().remove();

                                        if (promises.length <= 0) {
                                            clearInterval(i);
                                            resolve();
                                            return;
                                        }

                                        await reactionCreators[userId].shift().remove();
                                    }, 1500);
                                }).catch(
                                    () =>
                                        (quitFlag = client.utils.interactionReplySpecial(
                                            'Error performing action!',
                                            interaction,
                                            true
                                        ))
                                );
                            })
                            .catch(
                                () =>
                                    (quitFlag = client.utils.interactionReplySpecial(
                                        'Timeout! Try again.',
                                        interaction,
                                        true
                                    ))
                            );
                        break;
                    }

                    case 'removeType': {
                        interactionToDelete = await interaction.reply({
                            embeds: [
                                {
                                    color: client.data.embedColor,
                                    description:
                                        'Which emoji should be removed?\nType the number next to it in the chat.\nf.e **EMOJI_INDEX**'
                                }
                            ],
                            flags: Discord.MessageFlags.Ephemeral
                        });

                        let reactionCreators = {};
                        try {
                            for (let item of messageToMod.reactions.cache.values()) {
                                const author = item.users.cache.first() ?? '### Unavailable';

                                if (author === '### Unavailable') {
                                    missingUsers.push(item.users);
                                }

                                if (!reactionCreators[author.id]) {
                                    reactionCreators[author.id] = [];
                                }

                                reactionCreators[author.id].push(item);
                            }
                        } catch {
                            return (quitFlag = client.utils.interactionReplySpecial(
                                'Error performing action!',
                                interaction,
                                true
                            ));
                        }

                        reactionCreators = client.utils.flattenArray(Object.values(reactionCreators));

                        await interaction.channel
                            .awaitMessages({
                                filter: (m) => m.author.id === interactionUserId,
                                max: 1,
                                time: 300000,
                                errors: ['time']
                            })
                            .then(async (m) => {
                                m = m.first();

                                if (m.content.length === 0) {
                                    return (quitFlag = client.utils.interactionReplySpecial(
                                        'Incorrect input!',
                                        interaction,
                                        true
                                    ));
                                }

                                let nums = client.utils.nums(m.content);

                                await client.delete(m);

                                if (!nums || nums <= 0 || nums > reactionCreators.length) {
                                    return (quitFlag = client.utils.interactionReplySpecial(
                                        'Error performing action!',
                                        interaction,
                                        true
                                    ));
                                }

                                const reaction = reactionCreators.at(nums - 1);
                                if (reaction) {
                                    deferInteraction = true;
                                    return reaction
                                        .remove()
                                        .catch(
                                            () =>
                                                (quitFlag = client.utils.interactionReplySpecial(
                                                    'Error performing action!',
                                                    interaction,
                                                    true
                                                ))
                                        );
                                } else {
                                    return (quitFlag = client.utils.interactionReplySpecial(
                                        'Error performing action!',
                                        interaction,
                                        true
                                    ));
                                }
                            })
                            .catch(
                                () =>
                                    (quitFlag = client.utils.interactionReplySpecial(
                                        'Timeout! Try again.',
                                        interaction,
                                        true
                                    ))
                            );
                        break;
                    }

                    case 'removeSpecific':
                        {
                            interactionToDelete = await interaction.reply({
                                embeds: [
                                    {
                                        color: client.data.embedColor,
                                        description:
                                            'Which emoji should be removed?\nType the number next to it in the chat along with the user.\nf.e **USER_ID EMOJI_INDEX**'
                                    }
                                ],
                                flags: Discord.MessageFlags.Ephemeral
                            });

                            let reactionCreators = {};
                            try {
                                for (let item of messageToMod.reactions.cache.values()) {
                                    const author = item.users.cache.first() ?? '### Unavailable';

                                    if (author === '### Unavailable') {
                                        missingUsers.push(item.users);
                                    }

                                    if (!reactionCreators[author.id]) {
                                        reactionCreators[author.id] = [];
                                    }

                                    reactionCreators[author.id].push(item);
                                }
                            } catch {
                                return (quitFlag = client.utils.interactionReplySpecial(
                                    'Error performing action!',
                                    interaction,
                                    true
                                ));
                            }

                            reactionCreators = client.utils.flattenArray(Object.values(reactionCreators));

                            await interaction.channel
                                .awaitMessages({
                                    filter: (m) => m.author.id === interactionUserId,
                                    max: 1,
                                    time: 300000,
                                    errors: ['time']
                                })
                                .then(async (m) => {
                                    m = m.first();

                                    if (m.content.length === 0) {
                                        return (quitFlag = client.utils.interactionReplySpecial(
                                            'Incorrect input!',
                                            interaction,
                                            true
                                        ));
                                    }

                                    let split = m.content.split(' ');
                                    let nums = client.utils.nums(split[1]);
                                    let userId = (await client.utils.member(m, split, 0))?.user?.id ?? null;

                                    await client.delete(m);

                                    if (!userId) {
                                        return (quitFlag = client.utils.interactionReplySpecial(
                                            'User not found!',
                                            interaction,
                                            true
                                        ));
                                    }

                                    if (!nums || nums <= 0 || nums > reactionCreators.length) {
                                        return (quitFlag = client.utils.interactionReplySpecial(
                                            'Error performing action!',
                                            interaction,
                                            true
                                        ));
                                    }

                                    const reaction = reactionCreators.at(nums - 1);
                                    if (reaction) {
                                        if (!reaction.users.cache.has(userId)) {
                                            return client.utils.interactionReplySpecial(
                                                "This user hasn't reacted!",
                                                interaction,
                                                true
                                            );
                                        }

                                        deferInteraction = true;
                                        return reaction.users
                                            .remove(userId)
                                            .catch(
                                                () =>
                                                    (quitFlag = client.utils.interactionReplySpecial(
                                                        'Error performing action!',
                                                        interaction,
                                                        true
                                                    ))
                                            );
                                    } else {
                                        return client.utils.interactionReplySpecial(
                                            'Error performing action!',
                                            interaction,
                                            true
                                        );
                                    }
                                })
                                .catch(
                                    () =>
                                        (quitFlag = client.utils.interactionReplySpecial(
                                            'Timeout! Try again.',
                                            interaction,
                                            true
                                        ))
                                );
                        }
                        break;
                    case 'removeAnnoying':
                        const toRemove = [];

                        messageToMod.reactions.cache.forEach(async (r) => {
                            const emojiName = (
                                r.emoji.id ? r.emoji.name : reversedEmojiList[r.emoji.name]
                            )?.toLowerCase();

                            if (guild.cn.on) {
                                for (let i = 0; i < guild.cn.li.length; i++) {
                                    if (!emojiName || emojiName.includes(guild.cn.li[i])) {
                                        toRemove.push(r);
                                    }
                                }
                            }

                            if (
                                emojiName.includes('flag') ||
                                emojiName.includes('regional') ||
                                emojiName.includes('letter') ||
                                emojiName.includes('pregnant_man') ||
                                emojiName.includes('clown') ||
                                emojiName.includes('airplane') ||
                                emojiName.includes('city') ||
                                emojiName.includes('monkey') ||
                                emojiName.includes('vomit') ||
                                emojiName.includes('information_source')
                            ) {
                                toRemove.push(r);
                            }
                        });

                        await client.removeReaction(toRemove);

                        break;
                }

                resolve();
            });

            client.collections.interactionsInProgress.set(message.id, false);

            client.delete(interactionToDelete);

            if (quitFlag) {
                if (interactionToDelete) {
                    return client.utils.interactionReplySpecial(quitFlag, interaction, null, null, null, true);
                } else {
                    return client.utils.interactionReplySpecial(quitFlag, interaction);
                }
            }

            if (!messageToMod) {
                client.edit(interaction.message, null, {
                    color: client.data.embedColor,
                    title: 'Message unavailable.'
                });

                if (deferInteraction) {
                    return client.utils.interactionReplySpecial(
                        'Message has been deleted, stopping panel.',
                        interaction,
                        null,
                        null,
                        null,
                        true
                    );
                } else {
                    return client.utils.interactionReplySpecial(
                        'Message has been deleted, stopping panel.',
                        interaction
                    );
                }
            }

            if (deferInteraction) {
                return client.utils.interactionReplySpecial(
                    responseArray[interactionId],
                    interaction,
                    null,
                    null,
                    null,
                    true
                );
            } else {
                return client.utils.interactionReplySpecial(responseArray[interactionId], interaction);
            }
        }

        let flag = false;
        const channel = await client.utils.channel(message, args, 1);

        if (
            client.utils.isRestricted(guild, channel ? channel.id : message.channel.id) &&
            !message.member.permissions.has(Discord.PermissionFlagsBits.Administrator) &&
            !client.utils.isExempt(guild, message)
        ) {
            return client.qEmbed('You are not allowed to alter reactions within this channel!', interaction ?? message);
        }

        let messageToMod =
            (await channel?.messages.fetch(args[0]).catch(() => (flag = true))) ??
            (await message.channel.messages.fetch(args[0]).catch(() => (flag = true)));

        if (flag) {
            return client.qEmbed(
                'Something went wrong!\nMessage might be too old!\nChannelId and MessageId might be swapped!',
                interaction ?? message
            );
        }

        if (!messageToMod) {
            return client.qEmbed('Cannot retrieve message!', interaction ?? message);
        }

        if (args.length == 2 && !channel) {
            return client.qEmbed("Channel doesn't exist!", interaction ?? message);
        }

        if (messageToMod && messageToMod.reactions.cache.size === 0) {
            return client.qEmbed('This message has no reactions!', interaction ?? message);
        }

        const removeAll = new Discord.ButtonBuilder()
            .setCustomId('reactionpanel_removeAll')
            .setLabel('Remove All')
            .setStyle(Discord.ButtonStyle.Danger);

        const removeMessage = new Discord.ButtonBuilder()
            .setCustomId('reactionpanel_removeAllFromUser')
            .setLabel('Remove All (Single User)')
            .setStyle(Discord.ButtonStyle.Primary);

        const removeSpecific = new Discord.ButtonBuilder()
            .setCustomId('reactionpanel_removeType')
            .setLabel('Remove All of One')
            .setStyle(Discord.ButtonStyle.Primary);

        const removeSpecificUser = new Discord.ButtonBuilder()
            .setCustomId('reactionpanel_removeSpecific')
            .setLabel('Remove Specific One')
            .setStyle(Discord.ButtonStyle.Primary);

        const removeAllFlagsAndLetters = new Discord.ButtonBuilder()
            .setCustomId('reactionpanel_removeAnnoying')
            .setLabel('Remove All Controversial')
            .setStyle(Discord.ButtonStyle.Primary);

        const reactionCreators = {};
        const reactionCreatorMembers = {};

        const waiting = await client.send(message.channel, null, [
            {
                color: client.data.embedColor,
                title: 'Preparing panel...\nFetching users...',
                thumbnail: { url: client.cdn.loading }
            }
        ]);

        try {
            for (let item of messageToMod.reactions.cache.values()) {
                const author = item.users.cache.first() ?? '### Unavailable';

                if (author === '### Unavailable') {
                    missingUsers.push(item.users);
                }

                if (!reactionCreators[author.id]) {
                    reactionCreators[author.id] = [];
                }

                if (!reactionCreatorMembers[author.id]) {
                    reactionCreatorMembers[author.id] = author;
                }

                reactionCreators[author.id].push(item);
            }
        } catch {
            return client.qEmbed(
                'Something went wrong!\nMessage might be too old!\nChannelId and MessageId might be swapped!',
                interaction ?? message
            );
        }

        let i = 0;
        let description = '';
        for (const key of Object.keys(reactionCreators)) {
            const user = reactionCreatorMembers[key];
            description += `${user === '### Unavailable' ? '### Unavailable' : `\n${user}`}${
                user.username ? ` ${user.username}` : ''
            }${user.id ? ` \`${user.id}\`` : ''}\n`;
            description += `${reactionCreators[key]
                .map((r) => {
                    return `- **\`${++i}\`.**  ${
                        !r.emoji.id ? r.emoji.name : `<${r.emoji.animated ? 'a' : ''}:${r.emoji.name}:${r.emoji.id}>`
                    } **${
                        r.emoji.id ? r.emoji.name : reversedEmojiList[r.emoji.name]
                    }** \`${r.emoji.id ?? 'Default emoji'}\` {**${r.count}**}`;
                })
                .join('\n')}\n`;
        }

        const embed = [
            {
                color: client.data.embedColor,
                title: 'Reaction panel [Click here to jump to original]',
                url: messageToMod.url,
                description: description,

                thumbnail: {
                    url: `https://www.youtube.com/results?search_query=${message.author.id}_${messageToMod.id}_${messageToMod.channel.id}`
                },

                footer: client.data.footer
            }
        ];

        const buttonPanel = [
            new Discord.ActionRowBuilder().addComponents(
                removeMessage,
                removeSpecific,
                removeSpecificUser,
                removeAllFlagsAndLetters,
                removeAll
            )
        ];

        await client.delete(waiting);

        let timeoutMissingUsers = 20;
        const missingUserInterval = setInterval(async () => {
            if (
                missingUsers.length <= 0 ||
                timeoutMissingUsers <= 0 ||
                !panel ||
                ['Panel closed.', 'Time ran out, create another panel.'].includes(panel?.embeds[0]?.data.title)
            ) {
                return clearInterval(missingUserInterval);
            }

            await missingUsers.shift().fetch({ limit: 1 });
            timeoutMissingUsers--;
        }, 5500);

        const panel = await client.send(message.channel, null, embed, null, null, buttonPanel);

        client.collections.interactionsInProgress.set(panel.id, false);

        let timeout = 60;
        let errorCount = 0;
        let shutdown = false;
        let descriptionOld = description;
        const updateInterval = setInterval(async () => {
            let flag2 = false;

            if (errorCount >= 3) {
                client.edit(panel, null, [
                    {
                        color: client.data.embedColor,
                        title: 'Panel closed.'
                    }
                ]);

                client.collections.interactionsInProgress.delete(message.id);

                return clearInterval(updateInterval);
            }

            try {
                messageToMod =
                    (await channel?.messages.fetch(args[0]).catch(() => (flag2 = true))) ??
                    (await message.channel.messages.fetch(args[0]).catch(() => (flag2 = true)));
            } catch {
                errorCount++;
            }

            if (timeout <= 0) {
                client.edit(panel, null, [
                    {
                        color: client.data.embedColor,
                        title: 'Time ran out, create another panel.'
                    }
                ]);

                client.collections.interactionsInProgress.delete(message.id);

                return clearInterval(updateInterval);
            }

            if (
                !panel ||
                panel?.embeds[0]?.data?.title === 'Message unavailable.' ||
                !messageToMod ||
                flag2 ||
                (shutdown && messageToMod.reactions.cache.size === 0)
            ) {
                client.edit(panel, null, [
                    {
                        color: client.data.embedColor,
                        title: 'Panel closed.'
                    }
                ]);

                client.collections.interactionsInProgress.delete(message.id);

                return clearInterval(updateInterval);
            } else {
                shutdown = false;
            }

            const reactionCreators = {};
            const reactionCreatorMembers = {};

            try {
                for (let item of messageToMod.reactions.cache.values()) {
                    const author = item.users.cache.first() ?? '### Unavailable';

                    if (author === '### Unavailable') {
                        missingUsers.push(item.users);
                    }

                    if (!reactionCreators[author.id]) {
                        reactionCreators[author.id] = [];
                    }

                    if (!reactionCreatorMembers[author.id]) {
                        reactionCreatorMembers[author.id] = author;
                    }

                    reactionCreators[author.id].push(item);
                }
            } catch {
                return client.qEmbed(
                    'Something went wrong!\nMessage might be too old!\nChannelId and MessageId might be swapped!',
                    interaction ?? message
                );
            }

            i = 0;
            let description = '';
            for (const key of Object.keys(reactionCreators)) {
                const user = reactionCreatorMembers[key];
                description += `${user === '### Unavailable' ? '### Unavailable' : `\n${user}`}${
                    user.username ? ` ${user.username}` : ''
                }${user.id ? ` \`${user.id}\`` : ''}\n`;
                description += `${reactionCreators[key]
                    .map((r) => {
                        return `- **\`${++i}\`.**  ${
                            !r.emoji.id
                                ? r.emoji.name
                                : `<${r.emoji.animated ? 'a' : ''}:${r.emoji.name}:${r.emoji.id}>`
                        } **${
                            r.emoji.id ? r.emoji.name : reversedEmojiList[r.emoji.name]
                        }** \`${r.emoji.id ?? 'Default emoji'}\` {**${r.count}**}`;
                    })
                    .join('\n')}\n`;
            }

            const embed = [
                {
                    color: client.data.embedColor,
                    title: 'Reaction panel [Click here to jump to original]',
                    url: messageToMod.url,
                    description: `${
                        description.length === 0
                            ? '\n# All reactions have been removed.\n# Should there not be any more within 1 minute this panel will shut down.'
                            : description
                    }`,

                    thumbnail: {
                        url: `https://www.youtube.com/results?search_query=${message.author.id}_${messageToMod.id}_${messageToMod.channel.id}`
                    },

                    footer: client.data.footer
                }
            ];

            if (description.length === 0) {
                setTimeout(() => {
                    shutdown = true;
                }, 60 * 1000);
            }

            if (descriptionOld !== description) {
                try {
                    await client.edit(panel, null, embed, null, buttonPanel);
                } catch {}
                descriptionOld = description;
            }

            timeout--;
        }, 5 * 1000);
    }
};
