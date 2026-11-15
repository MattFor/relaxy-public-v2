'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'forum',
    usage: '=forum <#channel> [roles] [emoji] [option]',
    description:
        'Creates a configurable forum channel where members with a role will either allow or reject posts.\n**Roles** - optional argument to instantly set the roles that will be able to manage posts (without relaxy setting one up himself)\n**Emoji** - the emoji that will be used when creating posts.\nTo check the settings of an already existing forum channel, simply type =forum #channel.\nTo go more in depth, type f.e =forum #channel response/match.\nThings to configure:\n\n```fix\nmatch\n```Type =forum #channel match `(keywords/sentences with spaces replaced by -)`\nThis will make it so that any post with the requested phrase/words will automatically be rejected.\n\n```fix\nsensitive\n```Type =forum #channel sensitive #channel2\nPosts made on the original channel will be instantly deleted and piped onto the second channel.\n\n```fix\nhide\n```Simply will hide the channel for everyone without sufficient permissions when Relaxy is unavailable (useful when paired with the sensitive option)\n\n```fix\nresponse\n```Type =forum #channel response [Match keyword] sentence to reply with, remember that |U| will be replaced with the user, |T| with the thread name and |G| with the guild.\nThere are 3 options you cannot delete, 2 of which are set to default: len, reject, accept.\n\n```fix\nlength\n```Type =forum #channel length number / -number\nIf the number is negative, it will delete posts under the desired length, otherwise it will delete posts over the desired length.\n\nTo turn off Relaxy functionality in a forum channel type =forum #channel off.\timeout - seconds\n`attachment_exception` - do not take length into account when attachment is present.\n`raw_search` - crude search algorithm will be used in place of advanced one.\n`original_message_deleted` - delete thread if original message is gone\n`attachment_length / body_length / title_length` - if number is negative then check for less than, if positive, check over.\n`spam` - delete posts considered spam by Relaxy!',

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_THREADS', 'MANAGE_CHANNELS'],
    permissionsBot: [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES',
        'ADD_REACTIONS',
        'MANAGE_MESSAGES',
        'MANAGE_THREADS',
        'MANAGE_CHANNELS',
        'MANAGE_ROLES'
    ],

    async run(client, message, args, guild, interaction) {
        const existingChannel = await client.utils.channel(message, args, 0, { cut: true });

        if (guild.fo.on && existingChannel && guild.fo.cs.includes(existingChannel.id)) {
            const forumChannel = await client.module.database.findForumChannel(existingChannel.id, guild.id);

            if (!forumChannel || forumChannel.length === 0) {
                return client.qEmbed('Channel is not a Relaxy forum!', interaction ?? message);
            }

            let lookupTable = [];

            let responseText = '';
            let responseValues = Object.entries(forumChannel.rp);

            for (const item of responseValues) {
                lookupTable.push(item[1].length > 0 ? item[1] : 'None.');
            }

            lookupTable = [...new Set(lookupTable)];

            let responseObject = {};

            for (let i = 0; i < responseValues.length; i++) {
                let text = responseValues[i][1].length > 0 ? lookupTable.indexOf(responseValues[i][1]).toString() : '0';
                if (responseObject[text] && responseObject[text].includes(responseValues[i][0])) {
                    continue;
                }

                responseObject[text] = [responseValues[i][0]];

                for (let j = 0; j < responseValues.length; j++) {
                    if (
                        responseValues[i][1] === responseValues[j][1] &&
                        !responseObject[text].includes(responseValues[j][0])
                    ) {
                        responseObject[text].push(responseValues[j][0]);
                    }
                }
            }

            let formattedResponses = Object.entries(responseObject);
            for (let i = 0; i < formattedResponses.length; i++) {
                let text = formattedResponses[i][1]
                    .map((s) => {
                        return s;
                    })
                    .join(', ');

                responseText += `${i + 1}. **${text}:**\n${lookupTable[Number(formattedResponses[i][0])]}\n`;
            }

            if (args.length === 0) {
                let moderators = await client.utils.makeList(
                    forumChannel.rl,
                    message.guild.roles.cache,
                    0,
                    'Everyone.'
                );

                let embed = {
                    color: client.data.embedColor,
                    title: `Settings for #${existingChannel.name}`,
                    description: `ID: \`${forumChannel.id}\`\nEmoji: ${forumChannel.em}\nApproved tag ID: \`${forumChannel.tg.a}\`\nPending tag ID: \`${forumChannel.tg.p}\`\nHides when Relaxy is off: ${
                        forumChannel.st.hd ? 'Yes.' : 'No.'
                    }\nPrompt moderator to write a rejection response: ${
                        forumChannel.st.pr ? 'Yes.' : 'No.'
                    }\nAutomatic post deletion timeout: ${
                        forumChannel.st.to !== 0 ? `Yes - \`${client.imports.time(forumChannel.st.to)}\`` : 'None.'
                    }\n`,
                    fields: [
                        {
                            name: 'Moderators:',
                            value: moderators
                        },
                        {
                            name: 'Checks:',
                            value: `Title length check: **${
                                forumChannel.ck.tl === 0
                                    ? 'Off'
                                    : `\`${forumChannel.ck.tl > 0 ? 'Above ' : forumChannel.ck.tl < 0 ? 'Below ' : ''}${
                                          forumChannel.ck.tl < 0 ? -forumChannel.ck.tl : forumChannel.ck.tl
                                      }\``
                            }**\nPost content length check: **${
                                forumChannel.ck.bl === 0
                                    ? 'Off'
                                    : `\`${forumChannel.ck.bl > 0 ? 'Above ' : forumChannel.ck.bl < 0 ? 'Below ' : ''}${
                                          forumChannel.ck.bl < 0 ? -forumChannel.ck.bl : forumChannel.ck.bl
                                      }\``
                            }**\nAttachment count check: **${
                                forumChannel.ck.ac === 0
                                    ? 'Off'
                                    : `\`${forumChannel.ck.ac > 0 ? 'Above ' : forumChannel.ck.ac < 0 ? 'Below ' : ''}${
                                          forumChannel.ck.ac < 0 ? -forumChannel.ck.ac : forumChannel.ck.ac
                                      }\``
                            }**\nDirect dumb matching: **${
                                forumChannel.ck.rw ? 'On' : 'Off'
                            }**\nDelete post if original message is deleted: **${
                                forumChannel.ck.og ? 'On' : 'Off'
                            }**\nDo not measure title/body size if there"s an attachment: **${
                                forumChannel.st.ap ? 'On' : 'Off'
                            }**\nCheck for words in the **${guild.px[0]}censor pool: ${
                                forumChannel.ck.cn ? 'On' : 'Off'
                            }**`
                        },
                        {
                            name: 'Automatic deletions:',
                            value: `${
                                forumChannel.ck.mt
                                    .map((m) => {
                                        return m.replaceAll('-', ' ');
                                    })
                                    .join(', ') || 'None'
                            }.`.slice(0, 2048)
                        },
                        {
                            name: 'Responses:',
                            value: responseText.slice(0, 1024)
                        }
                    ]
                };

                return client.send(message.channel, null, [embed]);
            }

            const option1 = args.shift()?.toLowerCase();
            const option2 = args.shift()?.toLowerCase();

            switch (option1) {
                case 'timeout': {
                    if (!option2) {
                        client.saveForum(existingChannel.id, guild.id, {
                            alter: 'st.to',
                            value: 0
                        });
                        return client.qEmbed('Automatic deletion timeout removed.', interaction ?? message);
                    }

                    let nums = client.utils.nums(option2);

                    if (!nums) {
                        return client.qEmbed('No numbers provided!', interaction ?? message);
                    }

                    nums = parseInt(nums);

                    if (nums < 0 || nums > 24 * 60 * 60 * 1000) {
                        return client.qEmbed(
                            `Minimum length is 1, maximum is 24 hours (type in ms)!`,
                            interaction ?? message
                        );
                    }

                    client.saveForum(existingChannel.id, guild.id, {
                        alter: 'st.to',
                        value: parseInt(nums)
                    });
                    return client.qEmbed(`Automatic deletion set to ${nums}.`, interaction ?? message);
                }

                case 'attachment_exception': {
                    client.saveForum(existingChannel.id, guild.id, {
                        alter: 'st.ap',
                        value: !forumChannel.st.ap
                    });
                    return client.qEmbed(
                        `Do not count length requirements if an attachment is present ${
                            forumChannel.st.ap ? 'ON' : 'OFF'
                        }!`,
                        interaction ?? message
                    );
                }

                case 'raw_search': {
                    client.saveForum(existingChannel.id, guild.id, {
                        alter: 'ck.rw',
                        value: !forumChannel.ck.rw
                    });
                    return client.qEmbed(
                        `Direct search for string regardless of spacing turned ${forumChannel.ck.rw ? 'ON' : 'OFF'}!`,
                        interaction ?? message
                    );
                }

                case 'original_message_deleted': {
                    client.saveForum(existingChannel.id, guild.id, {
                        alter: 'ck.og',
                        value: !forumChannel.ck.og
                    });
                    return client.qEmbed(
                        `Threads will now be deleted if the original message is gone: ${
                            forumChannel.ck.og ? 'ON' : 'OFF'
                        }!`,
                        interaction ?? message
                    );
                }

                case 'censor': {
                    if (!guild.cn.on) {
                        return client.qEmbed('Censoring not on!', interaction ?? message);
                    }
                    if (guild.cn.li.length === 0) {
                        return client.qEmbed('Censor pool size is 0!', interaction ?? message);
                    }

                    client.saveForum(existingChannel.id, guild.id, {
                        alter: 'ck.cn',
                        value: !forumChannel.ck.cn
                    });
                    return client.qEmbed(
                        `Will censor things using the ${guild.px[0]}censor pool ${forumChannel.ck.cn ? 'ON' : 'OFF'}!`,
                        interaction ?? message
                    );
                }

                case 'spam': {
                    client.saveForum(existingChannel.id, guild.id, {
                        alter: 'ck.sp',
                        value: !forumChannel.ck.sp
                    });
                    return client.qEmbed(
                        `Removing spam posts turned ${forumChannel.ck.cn ? 'ON' : 'OFF'}!`,
                        interaction ?? message
                    );
                }

                case 'attachment_length': {
                    if (!option2) {
                        client.saveForum(existingChannel.id, guild.id, {
                            alter: 'ck.ac',
                            value: 0
                        });
                        return client.qEmbed('Content length requirement turned off.', interaction ?? message);
                    }

                    let nums = client.utils.nums(option2);

                    if (!nums) {
                        return client.qEmbed('No numbers provided!', interaction ?? message);
                    }

                    nums = parseInt(nums);

                    if (option2.includes('-')) {
                        nums = -nums;
                    }

                    if (nums < 0 ? nums > -1 || nums < -10 : nums < 1 || nums > 10) {
                        return client.qEmbed(
                            `Minimum length is ${option2.includes('-') ? '-' : ''}1, maximum is ${
                                option2.includes('-') ? '-' : ''
                            }10!`,
                            interaction ?? message
                        );
                    }

                    client.saveForum(existingChannel.id, guild.id, {
                        alter: 'ck.ac',
                        value: parseInt(nums)
                    });
                    return client.qEmbed(`Attachment length requirement set to ${nums}.`, interaction ?? message);
                }

                case 'body_length': {
                    if (!option2) {
                        client.saveForum(existingChannel.id, guild.id, {
                            alter: 'ck.bl',
                            value: 0
                        });
                        return client.qEmbed('Content length requirement turned off.', interaction ?? message);
                    }

                    let nums = client.utils.nums(option2);

                    if (!nums) {
                        return client.qEmbed('No numbers provided!', interaction ?? message);
                    }

                    nums = parseInt(nums);

                    if (option2.includes('-')) {
                        nums = -nums;
                    }

                    if (nums < 0 ? nums > -1 || nums < -3995 : nums < 1 || nums > 3995) {
                        return client.qEmbed(
                            `Minimum length is ${option2.includes('-') ? '-' : ''}1, maximum is ${
                                option2.includes('-') ? '-' : ''
                            }3500!`,
                            interaction ?? message
                        );
                    }

                    client.saveForum(existingChannel.id, guild.id, {
                        alter: 'ck.bl',
                        value: parseInt(nums)
                    });
                    return client.qEmbed(`Content length requirement set to ${nums}.`, interaction ?? message);
                }

                case 'title_length': {
                    if (!option2) {
                        client.saveForum(existingChannel.id, guild.id, {
                            alter: 'ck.tl',
                            value: 0
                        });
                        return client.qEmbed('Title length requirement turned off.', interaction ?? message);
                    }

                    let nums = client.utils.nums(option2);

                    if (!nums) {
                        return client.qEmbed('No numbers provided!', interaction ?? message);
                    }

                    nums = parseInt(nums);

                    if (option2.includes('-')) {
                        nums = -nums;
                    }

                    if (nums < 0 ? nums > -1 || nums < -2048 : nums < 1 || nums > 2048) {
                        return client.qEmbed(
                            `Minimum length is ${option2.includes('-') ? '-' : ''}1, maximum is ${
                                option2.includes('-') ? '-' : ''
                            }2048!`,
                            interaction ?? message
                        );
                    }

                    client.saveForum(existingChannel.id, guild.id, {
                        alter: 'ck.tl',
                        value: parseInt(nums)
                    });
                    return client.qEmbed(`Title length requirement set to ${nums}.`, interaction ?? message);
                }

                case 'response': {
                    let embed = {
                        color: client.data.embedColor,
                        title: 'Responses:',
                        fields: []
                    };

                    if (!option2) {
                        embed.description = '';

                        let lookupTable = [];

                        let responseText = '';
                        let responseValues = Object.entries(forumChannel.rp);

                        for (const item of responseValues) {
                            lookupTable.push(item[1].length > 0 ? item[1] : 'None.');
                        }

                        lookupTable = [...new Set(lookupTable)];

                        let responseObject = {};

                        for (let i = 0; i < responseValues.length; i++) {
                            let text =
                                responseValues[i][1].length > 0
                                    ? lookupTable.indexOf(responseValues[i][1]).toString()
                                    : '0';
                            if (responseObject[text] && responseObject[text].includes(responseValues[i][0])) {
                                continue;
                            }

                            responseObject[text] = [responseValues[i][0]];

                            for (let j = 0; j < responseValues.length; j++) {
                                if (
                                    responseValues[i][1] === responseValues[j][1] &&
                                    !responseObject[text].includes(responseValues[j][0])
                                ) {
                                    responseObject[text].push(responseValues[j][0]);
                                }
                            }
                        }

                        let formattedResponses = Object.entries(responseObject);
                        for (let i = 0; i < formattedResponses.length; i++) {
                            let text = formattedResponses[i][1]
                                .map((s) => {
                                    return s;
                                })
                                .join(', ');

                            responseText += `${i + 1}. **${text}:**:\n${lookupTable[Number(formattedResponses[i][0])]}\n`;
                        }

                        embed = client.utils.createDescription(responseText, embed, 5000);
                        embed.fields.push({
                            name: 'Note:',
                            value: 'Remember that anything with - will be replaced with a space.'
                        });

                        return client.send(message.channel, null, [embed]);
                    }

                    const match = args.shift().replaceAll('-', ' ');

                    if (
                        !forumChannel.ck.mt.includes(match) &&
                        !['titleLength', 'accept', 'reject', 'bodyLength', 'attachmentCount', 'censored'].includes(
                            match
                        )
                    ) {
                        return client.qEmbed(
                            `Did not find match case:\n${client.utils.firstLetterUp(match)}`,
                            interaction ?? message
                        );
                    }

                    if (!args[3]) {
                        client.saveForum(existingChannel.id, guild.id, {
                            alter: `rp.${match}`,
                            value: ''
                        });
                        return client.qEmbed(`Response for ${match} has been removed!`, interaction ?? message);
                    }

                    embed.description = '';
                    args = args.join(' ');
                    embed.fields = [
                        {
                            name: 'Old:',
                            value: forumChannel.rp[match].length > 1 ? forumChannel.rp[match] : 'None.'
                        },
                        {
                            name: 'New:',
                            value: args
                        }
                    ];

                    client.saveForum(existingChannel.id, guild.id, {
                        alter: `rp.${match}`,
                        value: args
                    });

                    embed.description = embed.description.slice(0, 2048);

                    embed.fields.push({
                        name: 'Note:',
                        value: 'Remember that anything with - will be replaced with a space.'
                    });

                    return client.send(message.channel, null, [embed]);
                }

                case 'match': {
                    let embed = {
                        color: client.data.embedColor,
                        title: 'Automatic deletions:',
                        fields: []
                    };

                    if (!option2) {
                        return client.send(message.channel, null, [
                            client.utils.createDescription(
                                `${forumChannel.ck.mt
                                    .map((m) => {
                                        return m.replaceAll('-', ' ');
                                    })
                                    .join(', ')}.`,
                                embed
                            )
                        ]);
                    }

                    let added = [];
                    let removed = [];
                    let censored = forumChannel.ck.mt;
                    let responses = forumChannel.rp;

                    for (let i = 0; i < args.length; i++) {
                        const matchWord = args[i].replaceAll('-', ' ').toLowerCase();

                        if (censored.includes(matchWord)) {
                            censored.splice(censored.indexOf(matchWord), 1);
                            removed.push(matchWord);

                            if (
                                ![
                                    'titleLength',
                                    'accept',
                                    'reject',
                                    'bodyLength',
                                    'attachmentCount',
                                    'censored'
                                ].includes(args[i])
                            ) {
                                delete responses[matchWord];
                            }

                            continue;
                        }

                        censored.push(matchWord);
                        added.push(matchWord);

                        responses[matchWord] = '';
                    }

                    let limit = 5000;

                    if (added.length > 0) {
                        limit -= 1024;
                        embed.fields.push({
                            name: 'Added:',
                            value: `${added
                                .map((a) => {
                                    return a;
                                })
                                .join(', ')}.`.slice(0, 1024)
                        });
                    }

                    if (removed.length > 0) {
                        limit -= 1024;
                        embed.fields.push({
                            name: 'Removed:',
                            value: `${removed
                                .map((r) => {
                                    return r;
                                })
                                .join(', ')}.`.slice(0, 1024)
                        });
                    }

                    embed = client.utils.createDescription(
                        `${censored
                            .map((m) => {
                                return m;
                            })
                            .join(', ')}.`,
                        embed,
                        limit,
                        false
                    );

                    embed.fields.push({
                        name: 'Note:',
                        value: 'Remember that anything with - will be replaced with a space.'
                    });

                    client.saveForum(
                        existingChannel.id,
                        guild.id,
                        {
                            alter: `rp`,
                            value: responses
                        },
                        {
                            alter: `ck.mt`,
                            value: censored
                        }
                    );

                    return client.send(message.channel, null, [embed]);
                }

                case 'sensitive': {
                    if (forumChannel.st.sn.on && !option2) {
                        client.saveForum(existingChannel.id, guild.id, {
                            alter: 'st.sn.on',
                            value: false
                        });
                        return client.qEmbed('Sensitive channel setting has been turned off.', interaction ?? message);
                    }

                    if (!option2) {
                        return client.qEmbed(
                            'Sensitive channel to send information to not provided!',
                            interaction ?? message
                        );
                    }

                    let sensitiveChannel = await client.utils.channel(message, args, 2);

                    if (forumChannel.st.sn.on) {
                        client.saveForum(existingChannel.id, guild.id, {
                            alter: 'st.sn.c',
                            value: sensitiveChannel.id
                        });
                        return client.qEmbed(
                            `Sensitive channel changed to ${sensitiveChannel.name}.`,
                            interaction ?? message
                        );
                    }

                    if (!sensitiveChannel) {
                        return client.qEmbed('Channel does not exist!', interaction ?? message);
                    }

                    client.saveForum(
                        existingChannel.id,
                        guild.id,
                        {
                            alter: 'st.sn.on',
                            value: true
                        },
                        {
                            alter: 'st.sn.c',
                            value: sensitiveChannel.id
                        }
                    );

                    return client.qEmbed(
                        `Settings saved, sending messages to ${sensitiveChannel.name}`,
                        interaction ?? message
                    );
                }

                case 'hide': {
                    client.saveForum(existingChannel.id, guild.id, {
                        alter: 'st.hd',
                        value: !forumChannel.st.hd
                    });
                    return client.qEmbed(
                        forumChannel.st.hd
                            ? `Will not show ${existingChannel.name} when Relaxy is offline.`
                            : `Will still show ${existingChannel.name} when Relaxy is offline.`,
                        interaction ?? message
                    );
                }

                case 'off': {
                    await client.module.database.deleteForumChannel(forumChannel.id, guild.id);
                    client.save(guild.id, {
                        alter: 'fo.cs',
                        value: guild.fo.cs.filter((id) => id !== existingChannel.id)
                    });
                    return client.qEmbed('Relaxy channel deleted from the database.', interaction ?? message);
                }

                default: {
                    if (option1) {
                        args.unshift(option1);
                    }

                    if (option2) {
                        args.unshift(option2);
                    }

                    let emoji = '';
                    let modified = false;
                    let roles = forumChannel.rl;

                    for (let i = 0; i < args.length; i++) {
                        let role = client.utils.role(message, args, i);
                        let e = client.utils.isValidEmoji(args[i])?.[0];
                        let user = (await client.utils.member(message, args, i))?.user;

                        if (e && !emoji) {
                            emoji = args[i];
                            continue;
                        }

                        if (role && roles.includes(role.id)) {
                            roles.splice(roles.indexOf(role.id), 1);
                            modified = true;
                            continue;
                        } else if (role && !roles.includes(role.id)) {
                            roles.push(role.id);
                            modified = true;
                            continue;
                        }

                        if (user && roles.includes(user.id)) {
                            roles.splice(roles.indexOf(user.id), 1);
                            modified = true;
                        } else if (user && !roles.includes(user.id)) {
                            roles.push(user.id);
                            modified = true;
                        }
                    }

                    if (emoji.length > 0) {
                        forumChannel.em = option1;

                        if (!(emoji === '❌' || emoji === ':x:')) {
                            client.saveForum(existingChannel.id, guild.id, {
                                alter: 'em',
                                value: forumChannel.em
                            });
                            client.qEmbed(`Emoji changed to ${forumChannel.em}.`, interaction ?? message);
                        } else {
                            client.qEmbed('Cannot change emoji to ❌!', interaction ?? message);
                        }
                    }

                    if (modified) {
                        client.saveForum(existingChannel.id, guild.id, {
                            alter: 'rl',
                            value: roles
                        });
                        client.qEmbed('Roles changed.', interaction ?? message);
                    }
                }
            }

            let moderators = await client.utils.makeList(forumChannel.rl, message.guild.roles.cache, 0, 'Everyone.');

            let embed = {
                color: client.data.embedColor,
                title: `Settings for #${existingChannel.name}`,
                description: `ID: \`${forumChannel.id}\`\nEmoji: ${forumChannel.em}\nApproved tag ID: \`${forumChannel.tg.a}\`\nPending tag ID: \`${forumChannel.tg.p}\`\nHides when Relaxy is off: ${
                    forumChannel.st.hd ? 'Yes.' : 'No.'
                }\nPrompt moderator to write a rejection response: ${
                    forumChannel.st.pr ? 'Yes.' : 'No.'
                }\nAutomatic post deletion timeout: ${
                    forumChannel.st.to !== 0 ? `Yes - \`${client.imports.time(forumChannel.st.to)}\`` : 'None.'
                }\n`,
                fields: [
                    {
                        name: 'Moderators:',
                        value: moderators
                    },
                    {
                        name: 'Checks:',
                        value: `Title length check: **${
                            forumChannel.ck.tl === 0
                                ? 'Off'
                                : `\`${forumChannel.ck.tl > 0 ? 'Above ' : forumChannel.ck.tl < 0 ? 'Below ' : ''}${
                                      forumChannel.ck.tl < 0 ? -forumChannel.ck.tl : forumChannel.ck.tl
                                  }\``
                        }**\nPost content length check: **${
                            forumChannel.ck.bl === 0
                                ? 'Off'
                                : `\`${forumChannel.ck.bl > 0 ? 'Above ' : forumChannel.ck.bl < 0 ? 'Below ' : ''}${
                                      forumChannel.ck.bl < 0 ? -forumChannel.ck.bl : forumChannel.ck.bl
                                  }\``
                        }**\nAttachment count check: **${
                            forumChannel.ck.ac === 0
                                ? 'Off'
                                : `\`${forumChannel.ck.ac > 0 ? 'Above ' : forumChannel.ck.ac < 0 ? 'Below ' : ''}${
                                      forumChannel.ck.ac < 0 ? -forumChannel.ck.ac : forumChannel.ck.ac
                                  }\``
                        }**\nDirect non-smart matching: **${forumChannel.ck.rw ? 'On' : 'Off'}**\nVariable case: **${
                            forumChannel.ck.variable_case ? 'On' : 'Off'
                        }**\nDelete post if original message is deleted: **${
                            forumChannel.ck.og ? 'On' : 'Off'
                        }**\nDo not measure title/body size if there"s an attachment: **${
                            forumChannel.st.ap ? 'On' : 'Off'
                        }**\nCheck for words in the **${guild.px[0]}censor pool: ${
                            forumChannel.ck.cn ? 'On' : 'Off'
                        }**\nCheck for spam: **${forumChannel.ck.sp ? 'On' : 'Off'}**`
                    },
                    {
                        name: 'Automatic deletions:',
                        value: `${
                            forumChannel.ck.mt
                                .map((m) => {
                                    return m.replaceAll('-', ' ');
                                })
                                .join(', ') || 'None'
                        }.`.slice(0, 2048)
                    },
                    {
                        name: 'Responses:',
                        value: responseText.slice(0, 1024)
                    }
                ]
            };

            return client.send(message.channel, null, [embed]);
        }

        const forumChannel = existingChannel
            ? await client.module.database.findForumChannel(existingChannel.id, guild.id)
            : null;
        const channelReady =
            existingChannel && existingChannel.type === Discord.ChannelType.GuildForum && !forumChannel;

        let emoji = '';
        let roles = [];

        for (let i = 0; i < args.length; i++) {
            let role = client.utils.role(message, args, i);
            let e = client.utils.isValidEmoji(args[i])?.[0];
            let user = (await client.utils.member(message, args, i))?.user;

            if (e && !emoji) {
                emoji = args[i];
                continue;
            }

            if (role && !roles.includes(role.id)) {
                roles.push(role.id);
                continue;
            }

            if (user && !roles.includes(user.id)) {
                roles.push(user.id);
                continue;
            }
        }

        let roleMissing = true;
        let fcs = await client.module.database.findForumChannels(guild.id);

        for (let i = 0; i < fcs.length; i++) {
            if (fcs[i].roles.length > 0) {
                roleMissing = false;
                break;
            }
        }

        const moderatorRole = message.guild.roles.cache.find(
            (r) => r.name === 'Relaxy forum moderator' || r.name === 'Forum moderator'
        );

        if (moderatorRole) {
            roles.push(moderatorRole.id);
        } else if (args.length == 0 && roleMissing) {
            let createdFlag = false;

            const forumRole = await message.guild.roles.create().catch(() => (createdFlag = true));

            if (createdFlag) {
                return client.qEmbed(
                    'Something went wrong while creating the forum moderator role!',
                    interaction ?? message
                );
            }

            Promise.all([
                forumRole.setName('Relaxy forum moderator'),
                forumRole.setColor('#da00ff'),
                forumRole.setMentionable(false),
                forumRole.setHoist(false)
            ]);

            roles.push(forumRole.id);

            client.qEmbed('Successfully created the forum moderator role!', interaction ?? message);
        }

        if (!emoji) {
            emoji = '✅';
            client.qEmbed('No emoji found, setting default.', interaction ?? message);
        } else if (emoji === '❌' || emoji === ':x:') {
            emoji = '✅';
            client.qEmbed('Cannot change emoji to ❌!', interaction ?? message);
        }

        if (channelReady) {
            await existingChannel.setAvailableTags([
                {
                    name: 'Pending approval',
                    moderated: true,
                    emoji: '🗃️'
                },
                {
                    name: 'Approved',
                    moderated: true,
                    emoji: '✅'
                }
            ]);
            await client.module.database.ForumChannel(
                existingChannel.id,
                guild.id,
                emoji,
                roles,
                existingChannel.availableTags.find((t) => t.name === 'Pending approval').id,
                existingChannel.availableTags.find((t) => t.name === 'Approved').id
            );
        } else {
            const channel = await message.guild.channels.create({
                name: 'forum',
                type: Discord.ChannelType.GuildForum
            });

            channel.setTopic('Only members with a special role can approve a post on this channel.');

            let channels = guild.fo.cs;

            channels.push(channel.id);

            client.save(guild.id, {
                alter: 'fo',
                value: {
                    on: true,
                    cs: channels
                }
            });

            await channel.setDefaultReactionEmoji('✅');
            await channel.setAvailableTags([
                {
                    name: 'Pending approval',
                    moderated: true,
                    emoji: '🗃️'
                },
                {
                    name: 'Approved',
                    moderated: true,
                    emoji: '✅'
                }
            ]);

            await client.module.database.ForumChannel(
                channel.id,
                guild.id,
                emoji,
                roles,
                channel.availableTags.find((t) => t.name === 'Pending approval').id,
                channel.availableTags.find((t) => t.name === 'Approved').id
            );
        }

        return client.qEmbed('Forum channel successfully created.', interaction ?? message);
    }
};
