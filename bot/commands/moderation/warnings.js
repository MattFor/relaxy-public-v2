'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const createButtonRow = () =>
{
    const editWarning = new Discord.ButtonBuilder()
        .setCustomId('warnings_edit')
        .setLabel('Edit')
        .setStyle(Discord.ButtonStyle.Success);

    const deleteOneWarnings = new Discord.ButtonBuilder()
        .setCustomId('warnings_delete-one')
        .setLabel('Delete')
        .setStyle(Discord.ButtonStyle.Danger);

    const deleteAllWarnings = new Discord.ButtonBuilder()
        .setCustomId('warnings_delete-all')
        .setLabel('Delete All Warnings')
        .setStyle(Discord.ButtonStyle.Danger);

    return new Discord.ActionRowBuilder().addComponents(editWarning, deleteOneWarnings, deleteAllWarnings);
};

const generateModal = warning =>
{
    let changed = false;
    if (!warning.edits)
    {
        warning.edits = [];
        changed = true;
    }

    const modal = new Discord.ModalBuilder()
        .setCustomId('warnings_edit-modal')
        .setTitle(`Warning edit #${warning.edits.length + 1}`);

    const warningDescription = new Discord.TextInputBuilder()
        .setCustomId('warnings_edit-modal-description')
        .setLabel('REASON')
        .setStyle(Discord.TextInputStyle.Paragraph)
        .setPlaceholder(warning.reason.slice(0, 258))
        .setMaxLength(258)
        .setRequired(false);

    const warningTierInput = new Discord.TextInputBuilder()
        .setCustomId('warnings_edit-modal-tier')
        .setLabel('TIER')
        .setStyle(Discord.TextInputStyle.Short)
        .setPlaceholder(warning.tier.toString())
        .setMaxLength(2)
        .setRequired(false);

    const firstActionRow = new Discord.ActionRowBuilder().addComponents(warningDescription);
    const secondActionRow = new Discord.ActionRowBuilder().addComponents(warningTierInput);

    return [
        modal.addComponents(firstActionRow, secondActionRow),
        changed,
        warning
    ];
};

export default {
    name:        'warnings',
    aliases:     ['warns'],
    usage:       '=warnings [user]',
    description: 'List members who have warnings, or mention a user to show their warnings in particular.\nThe numbers mean, in order: warning count, critical warning count (contributes to autoban), and threat level (the highest warning tier ever received).\nA warning issued several times over with `=warning <user> <reason> NX` is recorded as that many separate warnings, so it appears here once per copy.',

    permissionsUser: [
        'SEND_MESSAGES',
        'MODERATE_MEMBERS'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'MANAGE_MESSAGES',

        'ADD_REACTIONS'
    ],

    async run(client, message, args, guild, interaction)
    {
        if (interaction)
        {
            const data = message.embeds[0].data.image.url.split('=')[1].split('_');
            const interactionUserId = data[0];

            if (!interactionUserId || interaction.member.user.id !== interactionUserId)
            {
                return 0b01100101_01110010_01110010_01101111_01110010;
            }

            const interactionId = interaction.customId.split('_')[1];
            let warns = await client.module.database.warningsOf(guild.id, data[1]);

            if (interactionId.startsWith('edit-modal'))
            {
                let editCount = 0;
                const warning = warns[data[2] - 1];
                const fields = interaction.fields.fields.filter(f => f.value !== '');

                for (const [key, value] of Array.from(fields.entries()))
                {
                    switch (key)
                    {
                        case 'warnings_edit-modal-description':
                            warning.reason = value.value.replace(/\bdate\b/i, client.utils.formatDate(new Date())).replace(/\blog\b/i, client.utils.formatDate(new Date()));
                            editCount++;
                            break;

                        case 'warnings_edit-modal-tier':
                        {
                            const number = parseInt(value.value);

                            if (isNaN(number) || number < 0 || number > 30)
                            {
                                return interaction.reply(client.utils.interactionReplySpecial('Warning must be a number between 0 and 30!', interaction, true, { color: 16711680 }));
                            }

                            warning.tier = number;
                            editCount++;

                            break;
                        }
                    }
                }

                if (editCount !== 0)
                {
                    if (!warning.edits)
                    {
                        warning.edits = [];
                    }

                    warning.edits.push(`${interaction.member.user.id}_${Date.now()}_${editCount}`);

                    await client.module.database.setWarnings(guild.id, data[1], warns);
                }

            }
            else if (interactionId.startsWith('list'))
            {

                const id = interaction.values[0].split('-')[2];

                data[2] = id;
            }
            else
            {

                switch (interactionId)
                {
                    case 'edit':
                    {
                        if (data[2] === 'NONE')
                        {
                            return interaction.reply(client.utils.interactionReplySpecial(warns.length === 0
                                ? 'There are no available warnings!'
                                : 'Please select a warning from the list!', interaction, true, { color: 16711680 }));
                        }

                        const modal = generateModal(warns[data[2] - 1]);

                        if (modal[1])
                        {
                            await client.module.database.setWarnings(guild.id, data[1], warns);
                        }

                        return await interaction.showModal(modal[0]);
                    }

                    case 'delete-one':
                    {
                        if (!interaction.member.permissions.has(Discord.PermissionFlagsBits.ModerateMembers))
                        {
                            return interaction.reply(client.utils.interactionReplySpecial('Only a person who can moderate members is able to remove warnings!', interaction, true, { color: 16711680 }));
                        }

                        if (data[2] === 'NONE')
                        {
                            return interaction.reply(client.utils.interactionReplySpecial(warns.length === 0
                                ? 'There are no available warnings!'
                                : 'Please select a warning from the list!', interaction, true, { color: 16711680 }));
                        }

                        warns.splice(data[2] - 1, 1);
                        await client.module.database.setWarnings(guild.id, data[1], warns);

                        data[2] = 'NONE';

                        break;
                    }

                    case 'delete-all':
                    {
                        warns = [];
                        await client.module.database.clearWarnings(guild.id, data[1]);

                        break;
                    }
                }
            }

            const member = await client.getMember(message.guild, data[1]);

            const maxThreat = await client.module.database.guildMaxWarningTier(guild.id);

            const missingTag = 'Unavailable';

            let threat = 0;
            for (const warn of warns)
            {
                if (warn.tier >= Math.ceil(maxThreat / 2) || (warn.author === client.user.id && warn.tier !== -1))
                {
                    threat++;
                }
            }

            let maxUserThreat = 0;
            for (const warn of warns)
            {
                if (warn.tier > maxUserThreat)
                {
                    maxUserThreat = warn.tier;
                }
            }

            let description = `###  ${member ?? missingTag} ${client.utils.tag(member) ?? ''} \`(${warns.length})\`  \`[${threat}/${guild.cn.ab}]\` \`{${maxUserThreat}/${maxThreat}}\`\n`;

            for (let i = 0; i < warns.length; i++)
            {
                if (args.length > 0)
                {
                    let flag = true;
                    for (const arg of args)
                    {
                        if (warns[i].reason.includes(arg))
                        {
                            flag = false;
                        }
                    }

                    if (flag)
                    {
                        continue;
                    }
                }

                description += `${i + 1}. ${warns[i].reason} \`[${warns[i].tier}/${maxThreat}]\` ${!warns[i].author || warns[i].author === 'Unavailable'
                    ? 'Legacy warning [No author]'
                    : `<@!${warns[i].author}>`}\n`;
            }

            let fields = [];
            let desc_copy = description.slice(0, 2048);

            if (description.length > 2048)
            {
                description = description.slice(2048, description.length - 1);
                let i = 0;
                while (true)
                {
                    if (i * 1024 > description.length || fields.length > 20)
                    {
                        break;
                    }

                    fields.push({
                        name:  `Continuation ${i + 1}:`,
                        value: description.slice(i * 1024, (i + 1) * 1024)
                    });

                    i++;
                }
            }

            let i = 0;
            const warningListSelect = [];
            warns.forEach(w =>
            {
                warningListSelect.push({
                    label:       `Warning #${++i} (${w.tier}/${maxThreat})`,
                    description: w.reason.slice(0, 100),
                    value:       `warnings_select-warning-${i}`
                });
            });

            if (warningListSelect.length === 0)
            {
                warningListSelect.push({
                    label:       `There are no warnings available.`,
                    description: 'All warnings are either deleted or not present.',
                    value:       `warnings_select-warning-NONE`
                });
            }

            const warningListMenu = new Discord.StringSelectMenuBuilder()
                .setCustomId('warnings_list')
                .setPlaceholder('Select a warning')
                .addOptions(warningListSelect);
            const warningListSelectMenuRow = new Discord.ActionRowBuilder().addComponents(warningListMenu);
            const noWarnings = warns.length === 0;

            return void client.update(interaction,
                null,
                [
                    {
                        color:     client.data.embedColor,
                        thumbnail: member
                                       ? {
                                url: member.user.displayAvatarURL({
                                    extension: 'png',
                                    size:      4096
                                })
                            }
                                       : null,

                        image: noWarnings
                                   ? null
                                   : {
                                url: `https://www.youtube.com/results?search_query=${data[0]}_${data[1]}_${data[2]}`
                            },

                        title:       `Warnings for ${member?.user?.username ?? missingTag}${noWarnings
                            ? ''
                            : ` | Selected: ${data[2] === 'NONE'
                                ? 'None'
                                : `#${data[2]}`}`}`,
                        description: noWarnings
                                         ? `## There are no warnings for ${member ?? missingTag}!`
                                         : desc_copy,
                        footer:      client.data.footer,
                        fields:      fields.length !== 0
                                         ? fields
                                         : null
                    }
                ],
                null,
                null,
                noWarnings
                    ? null
                    : [
                        warningListSelectMenuRow,
                        createButtonRow()
                    ]);
        }

        const allWarns = await client.module.database.allWarnings(guild.id);
        const warnsByUser = new Map(allWarns.map(e => [
            e.u,
            e.w
        ]));
        const warnLength = allWarns.length;

        if (warnLength === 0)
        {
            return client.qEmbed(`There's no warnings in ${message.guild.name}!`, interaction ?? message);
        }
        else if (warnLength > 100 && !args[0])
        {
            return client.qEmbed(`${message.guild.name} has too many warnings!\nYou can only search through them manually by a specific ID / username!`, interaction ?? message);
        }

        let member = await client.utils.member(message, args, 0, { cut: true }) ?? null;
        member = member?.size === 0
            ? null
            : member;

        const maxThreat = await client.module.database.guildMaxWarningTier(guild.id);

        let missingTag = 'Unavailable';
        const userId = args.join(' ').match(/[0-9]+/g)?.[0] ?? null;
        if (member || userId)
        {
            let description = '';

            let toRemove = userId
                ? 1
                : member.user.username.split(' ').length;

            for (let i = 0; i < toRemove; i++)
            {
                args.shift();
            }

            const key = userId ?? member.user.id;
            const userWarns = warnsByUser.get(key);

            if (userWarns === undefined)
            {
                return client.send(message.channel, null, [
                    {
                        color: client.data.embedColor,
                        title: 'This user has no warnings.'
                    }
                ]);
            }

            let _f = !args.length === 0;
            if (args.length > 0)
            {
                let combined_warns = userWarns.map(w =>
                {
                    return w.reason;
                }).join(' ');

                for (const arg of args)
                {
                    if (combined_warns.includes(arg))
                    {
                        _f = false;
                    }
                }
            }

            if (!_f)
            {
                let threat = 0;
                for (const warn of userWarns)
                {
                    if (warn.tier >= Math.ceil(maxThreat / 2) || (warn.author === client.user.id && warn.tier !== -1))
                    {
                        threat++;
                    }
                }

                let maxUserThreat = 0;
                for (const warn of userWarns)
                {
                    if (warn.tier > maxUserThreat)
                    {
                        maxUserThreat = warn.tier;
                    }
                }

                description += `###  ${member ?? missingTag} ${client.utils.tag(member) ?? ''} \`(${userWarns.length})\`  \`[${threat}/${guild.cn.ab}]\` \`{${maxUserThreat}/${maxThreat}}\`\n`;

                for (let i = 0; i < userWarns.length; i++)
                {
                    if (args.length > 0)
                    {
                        let flag = true;

                        for (const arg of args)
                        {
                            if (userWarns[i].reason.includes(arg))
                            {
                                flag = false;
                            }
                        }

                        if (flag)
                        {
                            continue;
                        }
                    }

                    description += `${i + 1}. ${userWarns[i].reason} \`[${userWarns[i].tier}/${maxThreat}]\` ${!userWarns[i].author || userWarns[i].author === 'Unavailable'
                        ? 'Legacy warning [No author]'
                        : `<@!${userWarns[i].author}>`}\n`;
                }
            }

            let fields = [];
            let desc_copy = description.slice(0, 2048);

            if (description.length > 2048)
            {
                description = description.slice(2048, description.length - 1);
                let i = 0;
                while (true)
                {
                    if (i * 1024 > description.length || fields.length > 20)
                    {
                        break;
                    }

                    fields.push({
                        name:  `Continuation ${i + 1}:`,
                        value: description.slice(i * 1024, (i + 1) * 1024)
                    });

                    i++;
                }
            }

            let i = 0;
            const warningListSelect = [];
            userWarns.forEach(w =>
            {
                warningListSelect.push({
                    label:       `Warning #${++i}  (${w.tier}/${maxThreat})`,
                    description: w.reason.slice(0, 100),
                    value:       `warnings_select-warning-${i}`
                });
            });

            if (warningListSelect.length === 0)
            {
                warningListSelect.push({
                    label:       `There are no warnings available.`,
                    description: 'All warnings are either deleted or not present.',
                    value:       `warnings_select-warning-NONE`
                });
            }

            const warningListMenu = new Discord.StringSelectMenuBuilder()
                .setCustomId('warnings_list')
                .setPlaceholder('Select a warning')
                .addOptions(warningListSelect);
            const warningListSelectMenuRow = new Discord.ActionRowBuilder().addComponents(warningListMenu);
            const noWarnings = userWarns.length === 0;

            return client.send(message.channel,
                null,
                [
                    {
                        color: client.data.embedColor,

                        image: noWarnings
                                   ? null
                                   : {
                                url: `https://www.youtube.com/results?search_query=${message.author.id}_${key}_NONE`
                            },

                        title: `Warnings for ${member?.user?.username ?? missingTag}`,
                        description: noWarnings
                                   ? `## There are no warnings for ${member ?? missingTag}!`
                                   : desc_copy,
                        thumbnail: member
                                   ? {
                                url: member.user.displayAvatarURL({
                                    extension: 'png',
                                    size:      4096
                                })
                            }
                                   : null,
                        footer: client.data.footer,
                        fields: fields.length !== 0
                                   ? fields
                                   : null
                    }
                ],
                null,
                null,
                noWarnings
                    ? null
                    : [
                        warningListSelectMenuRow,
                        createButtonRow()
                    ]);
        }

        let description = '';
        let users = allWarns.map(e => e.u);
        const userList = await message.guild.members.fetch({ user: users });

        let j = 0;
        for (const key of users)
        {
            let user = userList.get(key);

            if (!user)
            {
                continue;
            }

            const userWarns = warnsByUser.get(key);

            let _f = true;
            if (args.length > 0)
            {
                let combined_warns = userWarns.map(w =>
                {
                    return w.reason;
                }).join(' ');

                for (const arg of args)
                {
                    if (combined_warns.includes(arg))
                    {
                        _f = false;
                    }
                }
            }
            else
            {
                _f = false;
            }

            if (_f)
            {
                continue;
            }

            let threat = 0;
            for (const warn of userWarns)
            {
                if (warn.tier >= Math.ceil(maxThreat / 2) || (warn.author === client.user.id && warn.tier !== -1))
                {
                    threat++;
                }
            }

            let maxUserThreat = 0;
            for (const warn of userWarns)
            {
                if (warn.tier > maxUserThreat)
                {
                    maxUserThreat = warn.tier;
                }
            }

            description += `${++j}. ${user} ${client.utils.tag(user) ?? ''}  \`(${userWarns.length})\`  \`[${threat}/${guild.cn.ab}]\` \`{${maxUserThreat}/${maxThreat}}\`\n`;
            for (let i = 0; i < userWarns.length; i++)
            {
                description += ` - ${userWarns[i].reason} \`[${userWarns[i].tier}/${maxThreat}]\` ${!userWarns[i].author || userWarns[i].author === 'Unavailable'
                    ? 'Legacy warning [No author]'
                    : `<@!${userWarns[i].author}>`}\n`;
            }
        }

        if (description.length <= 5800)
        {
            let fields = [];
            let desc_copy = description.slice(0, 2048);

            if (description.length > 2048)
            {
                description = description.slice(2048, description.length - 1);
                let i = 0;

                while (true)
                {
                    if (i * 1024 > description.length || fields.length > 4)
                    {
                        break;
                    }

                    fields.push({
                        name:  `Continuation ${i + 1}:`,
                        value: description.slice(i * 1024, (i + 1) * 1024)
                    });

                    i++;
                }
            }

            return client.send(message.channel, null, [
                {
                    color:       client.data.embedColor,
                    title:       `Warnings for ${message.guild.name}`,
                    description: desc_copy.length < 2
                                     ? `There are no warnings ${args.length !== 0
                            ? 'containing the specified words!'
                            : 'on this server!'}`
                                     : desc_copy,
                    footer:      client.data.footer,
                    fields:      fields.length !== 0
                                     ? fields
                                     : null
                }
            ]);
        }

        let fields = [];
        let full_description = description;
        let desc_copy = description.slice(0, 2048);

        if (description.length > 2048)
        {
            description = description.slice(2048, 5800);
            let i = 1;

            while (true)
            {
                let overcut = i * 1024 > 5800
                    ? 5800 - (i - 1) * 1024 < 1024 && 5800 - (i - 1) * 1024 > 0
                        ? 5800 - (i - 1) * 1024
                        : null
                    : null;

                if ((i + 1) * 1024 > 5800)
                {
                    break;
                }

                fields.push({
                    name:  `Continuation ${i + 1}:`,
                    value: description.slice((i - 1) * (overcut !== null
                        ? overcut
                        : 1024),
                        i * (overcut !== null
                            ? overcut
                            : 1024))
                });

                i++;
            }
        }

        let page = 1;
        let max_pages = Math.ceil(full_description.length / 5800);

        return client.send(message.channel, null, [
            {
                color:       client.data.embedColor,
                title:       `Warnings for ${message.guild.name}`,
                description: desc_copy.length < 2
                                 ? 'There are no warnings on this server!'
                                 : desc_copy,
                footer:      client.data.footer,
                fields:      fields.length !== 0
                                 ? fields.filter(f => f.value !== '')
                                 : null
            }
        ]).then(async m =>
        {
            await client.react(m, '◀️', '▶️');

            const collector = m.createReactionCollector({
                filter: (reaction, user) => user.id === message.author.id && !user.bot && [
                    '◀️',
                    '▶️'
                ].includes(reaction.emoji.name)
            }).on('collect', async (reaction, user) =>
            {
                m.reactions.cache.get(reaction.emoji.name).users.remove(user.id);

                fields = [];

                switch (reaction.emoji.name)
                {
                    case '◀️':
                        if (page === 1)
                        {
                            return;
                        }

                        page--;
                        break;

                    case '▶️':
                        if (page === max_pages)
                        {
                            return;
                        }

                        page++;
                        break;
                }

                let temp_description = full_description.slice((page - 1) * 5800, page * 5800);
                let tempDescriptionCut = temp_description.slice(0, 2048);

                let i = 1;
                while (true)
                {
                    temp_description = temp_description.slice(2048, 5800);
                    let overcut = i * 1024 > 5800
                        ? 5800 - (i - 1) * 1024 < 1024 && 5800 - (i - 1) * 1024 > 0
                            ? 5800 - (i - 1) * 1024
                            : null
                        : null;

                    if ((i + 1) * 1024 + 2048 > 5800)
                    {
                        break;
                    }

                    fields.push({
                        name:  `Continuation ${i + 1}:`,
                        value: temp_description.slice((i - 1) * (overcut !== null
                            ? overcut
                            : 1024),
                            i * (overcut !== null
                                ? overcut
                                : 1024))
                    });

                    i++;
                }

                return client.edit(m, null, [
                    {
                        color:       client.data.embedColor,
                        title:       `Warnings for ${message.guild.name}`,
                        description: tempDescriptionCut,
                        footer:      client.data.footer,
                        fields:      fields.length !== 0
                                         ? fields.filter(f => f.value !== '')
                                         : null
                    }
                ]);
            });

            setTimeout(async () =>
            {
                m.reactions.removeAll().catch(client.swallow('warnings: removeAll'));
                collector.stop();
            }, 120 * 1000);
        });
    }
};
