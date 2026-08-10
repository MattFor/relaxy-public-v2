'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const provenance = role =>
{
    const tags = role.tags ?? {};

    if (tags.premiumSubscriberRole)
    {
        return 'Managed by Discord - this is the server\'s **Nitro booster** role.';
    }

    if (tags.botId)
    {
        return `Managed by Discord - this is <@${tags.botId}>'s **bot role** and cannot be assigned by hand.`;
    }

    if (tags.integrationId)
    {
        return 'Managed by Discord - this role belongs to an **integration** and cannot be assigned by hand.';
    }

    if (tags.subscriptionListingId)
    {
        return 'Managed by Discord - this role backs a **server subscription**.';
    }

    if (role.managed)
    {
        return 'Managed by Discord - this role cannot be assigned by hand.';
    }

    return null;
};

const yesNo = value => (value
    ? '```fix\nYES\n```'
    : '```diff\n- NO\n```');

export default {
    name:        'roleinfo',
    aliases:     ['role'],
    usage:       '=roleinfo <role>',
    description: 'Get general information about a role.',

    slash:    new Discord.SlashCommandBuilder().addRoleOption(option => option.setName('role').setDescription('Role which information you want to get.').setRequired(true)),
    args:     true,
    cooldown: 5,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],
    suggestedPermissionsBot: ['ATTACH_FILES'],

    async run(client, message, args, guild, interaction)
    {
        const role = client.utils.role(message, args, 0);

        if (!role)
        {
            return client.qEmbed('No role like that found!', interaction ?? message);
        }

        const administrator = role.permissions.has(Discord.PermissionFlagsBits.Administrator);

        const permissions = Object.keys(Discord.PermissionFlagsBits)
                                  .filter(key => role.permissions.has(Discord.PermissionFlagsBits[key]))
                                  .map(key => `\`${client.utils.firstLetterUp(key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}\``);

        const permissionsText = administrator
            ? '`Administrator` - **this role has every permission**'
            : client.utils.capList(permissions, ', ', 'None.');

        const managed = provenance(role);

        const me = message.guild.members.me;
        const actionable = me?.permissions?.has(Discord.PermissionFlagsBits.ManageRoles) && me.roles.highest.comparePositionTo(role) > 0;

        const fields = [
            {
                name:   '**Role id:**',
                value:  `\`${role.id}\``,
                inline: true
            },
            {
                name:   '**Role:**',
                value:  `${role}`,
                inline: true
            },
            {
                name:   '**Members with it:**',
                value:  `\`${role.members.size}\``,
                inline: true
            },
            {
                name:   '**Hex colour:**',
                value:  `\`${role.hexColor.toUpperCase()}\`${role.color === 0
                    ? ' *(no colour)*'
                    : ''}`,
                inline: true
            },
            {
                name:   '**Position:**',
                value:  `\`${role.position}\` *(of ${message.guild.roles.cache.size - 1})*`,
                inline: true
            },
            {
                name:   '**Displayed separately:**',
                value:  role.hoist
                            ? '`Yes`'
                            : '`No`',
                inline: true
            },
            {
                name:  '**Can the role be mentioned:**',
                value: yesNo(role.mentionable)
            },
            {
                name:  '**Can Relaxy assign it:**',
                value: `${yesNo(actionable)}${actionable
                    ? ''
                    : role.managed
                        ? '*Discord manages this role - nobody can assign it.*'
                        : '*Relaxy needs `Manage Roles` and a role placed above this one.*'}`
            },
            {
                name:  '**Created at:**',
                value: `${client.utils.formatDate(role.createdAt)} - <t:${Math.floor(role.createdTimestamp / 1000)}:R>`
            },
            {
                name:  administrator
                           ? '**Permissions:**'
                           : `**Permissions [${permissions.length}]:**`,
                value: permissionsText
            }
        ];

        if (managed)
        {
            fields.push({
                name:  '**Origin:**',
                value: managed
            });
        }

        const embed = new Discord.EmbedBuilder()
            .setTitle(`Role information for ${role.name}`)
            .setColor(role.color || client.data.embedColor)
            .setFooter(client.data.footer)
            .setTimestamp()
            .addFields(fields);

        const icon = role.iconURL({
            dynamic: true,
            size:    4096
        });

        embed.setThumbnail(icon ?? client.utils.guildIcon(message.guild));

        if (role.unicodeEmoji)
        {
            embed.setDescription(`Role emoji: ${role.unicodeEmoji}`);
        }

        return client.send(interaction
            ? 1
            : message.channel, null, [embed]);
    }
};
