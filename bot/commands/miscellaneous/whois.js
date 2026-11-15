'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const KEY_PERMISSIONS = [
    'Administrator',
    'ManageGuild',
    'ManageRoles',
    'ManageChannels',
    'ManageMessages',
    'ManageWebhooks',
    'ManageNicknames',
    'ManageEmojisAndStickers',
    'ManageThreads',
    'ManageEvents',
    'BanMembers',
    'KickMembers',
    'ModerateMembers',
    'MentionEveryone',
    'ViewAuditLog'
];
const BADGES = {
    Staff: 'Discord Staff',
    Partner: 'Partnered Server Owner',
    Hypesquad: 'HypeSquad Events',
    HypeSquadOnlineHouse1: 'HypeSquad Bravery',
    HypeSquadOnlineHouse2: 'HypeSquad Brilliance',
    HypeSquadOnlineHouse3: 'HypeSquad Balance',
    BugHunterLevel1: 'Bug Hunter',
    BugHunterLevel2: 'Bug Hunter (Gold)',
    PremiumEarlySupporter: 'Early Supporter',
    VerifiedDeveloper: 'Early Verified Bot Developer',
    CertifiedModerator: 'Moderator Programmes Alumni',
    ActiveDeveloper: 'Active Developer',
    VerifiedBot: 'Verified Bot'
};
const since = (date) => (date ? `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>` : 'Unknown');
const on = (date) => (date ? `<t:${Math.floor(new Date(date).getTime() / 1000)}:D>` : 'Unknown');

export default {
    name: 'whois',
    aliases: ['lookup', 'userinfo'],
    usage: '=whois [user]',
    description: 'Get general information about a user, or yourself if no argument is provided.',

    slash: new Discord.SlashCommandBuilder().addUserOption((option) =>
        option.setName('user').setDescription('User whose information you want.').setRequired(false)
    ),
    cooldown: 5,

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],
    async run(client, message, args, guild, interaction) {
        const member = args.length === 0 ? message.member : await client.utils.member(message, args, 0);

        if (!member) {
            return client.qEmbed("Cannot find the member you're searching for!", interaction ?? message);
        }

        const databaseMember = await client.module.database.Member(member.user.id, message.guild.id);

        const user = await member.user.fetch().catch(() => member.user);

        let permissions = [];

        for (const key of Object.keys(Discord.PermissionFlagsBits)) {
            if (member.permissions.has(Discord.PermissionFlagsBits[key])) {
                permissions.push(key);
            }
        }

        const administrator = member.permissions.has(Discord.PermissionFlagsBits.Administrator);
        const keyPermissions = permissions.filter((permission) => KEY_PERMISSIONS.includes(permission));

        const permissionsText = administrator
            ? '`Administrator` - **has every permission**'
            : client.utils.capList(
                  (keyPermissions.length ? keyPermissions : permissions).map(
                      (permission) =>
                          `\`${client.utils.firstLetterUp(permission.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}\``
                  ),
                  ', ',
                  'No key permissions.'
              );

        const badges = (user.flags?.toArray() ?? []).filter((flag) => BADGES[flag]).map((flag) => BADGES[flag]);

        const acknowledgements = [];

        if (client.isOwner(member.user.id)) {
            acknowledgements.push('```diff\n- MAKER OF RELAXY -\n```');
        }

        if (member.user.id === message.guild.ownerId) {
            acknowledgements.push('```fix\nServer Owner\n```');
        }

        if (member.user.id === client.user.id) {
            acknowledgements.push('```diff\n- RELAXY -\n```');
        }

        if (member.user.bot) {
            acknowledgements.push('**BOT**');
        }

        if (member.premiumSince) {
            acknowledgements.push(
                `**Boosting this server since ${on(member.premiumSince)}** (${since(member.premiumSince)})`
            );
        }

        if (member.communicationDisabledUntilTimestamp > Date.now()) {
            acknowledgements.push(`**TIMED OUT** - expires ${since(member.communicationDisabledUntilTimestamp)}`);
        }

        if (badges.length) {
            acknowledgements.push(`**Badges:** ${badges.join(', ')}`);
        }

        const roles = [...member.roles.cache.values()]
            .filter((role) => role.id !== message.guild.id)
            .sort((a, b) => b.position - a.position);

        const rolesText = client.utils.capList(
            roles.map((role) => `<@&${role.id}>`),
            ' **|** ',
            'No roles.'
        );

        const identity = [
            `**${member}** - **${client.utils.tag(member.user)}** - \`${member.user.id}\``,
            `Nickname: ${member.nickname ?? 'Same as normal username. / Unavailable.'}`,
            '',
            `**Joined this server:** ${on(member.joinedAt)} (${since(member.joinedAt)})`,
            `**Joined Discord:** ${on(member.user.createdAt)} (${since(member.user.createdAt)})`,
            '',
            `**Messages sent:** \`${databaseMember.msg}\``,
            `**Relaxy! commands used:** \`${databaseMember.cmd}\``,
            `**Level:** \`${databaseMember.lvl}\` (\`${databaseMember.xp}\` xp)`,

            `**Voice time:** \`${databaseMember.vc ? client.imports.time(databaseMember.vc) : 'None tracked'}\``,
            `**Reactions:** \`${databaseMember.rx}\` given, \`${databaseMember.rr}\` received`,
            `**Highest role:** ${member.roles.highest?.id === message.guild.id ? '`None`' : member.roles.highest}`,
            `**Display colour:** \`${member.displayHexColor}\``
        ].join('\n');

        const KINDS = {
            u: 'Username',
            d: 'Display name',
            n: 'Nickname'
        };

        const lacking = client.permissions(message, { permissionsBot: ['MANAGE_MESSGES'] }, {}, { report: false });

        const history =
            client.utils.isAllowedUser(guild, message) === 1 ||
            administrator ||
            !lacking.user ||
            client.isOwner(message.author.id)
                ? [...(databaseMember.nh ?? [])]
                      .filter((entry) => entry?.n)

                      .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
                      .slice(0, 15)
                      .map(
                          (entry) =>
                              `\`${String(entry.n).replaceAll('`', "'")}\` - ${KINDS[entry.k] ?? 'Name'} · <t:${Math.floor((entry.t ?? 0) / 1000)}:R>`
                      )
                : [];

        const nameHistoryField = history.length
            ? [
                  {
                      name: `Known names [${history.length}]`,
                      value: client.utils.capList(history, '\n', 'None recorded.')
                  }
              ]
            : [];

        const fallBack = !client.permissions(
            message,
            {
                permissionsBot: ['EMBED_LINKS']
            },
            { textChannel: message.channel },
            {
                report: false,
                botOnly: true
            }
        );

        if (fallBack) {
            return client.send(
                interaction ? 1 : message.channel,
                `# ${client.utils.tag(member.user)}\n${identity}\n\n## Roles [${roles.length}]\n${rolesText}\n\n## Permissions:\n${permissionsText}${
                    acknowledgements.length ? `\n\n## Additional information:\n${acknowledgements.join('\n')}` : ''
                }`.slice(0, 2040)
            );
        }

        const embed = new Discord.EmbedBuilder()
            .setDescription(identity)
            .setAuthor({
                name: client.utils.tag(member.user),
                iconURL: member.displayAvatarURL({
                    dynamic: true,
                    size: 4096
                })
            })
            .setColor(member.displayColor || client.data.embedColor)
            .setFooter(client.data.footer)
            .setThumbnail(
                member.displayAvatarURL({
                    dynamic: true,
                    size: 4096
                })
            )
            .setTimestamp()
            .addFields([
                {
                    name: `Roles [${roles.length}]`,
                    value: rolesText
                },
                {
                    name: administrator ? 'Permissions:' : 'Key permissions:',
                    value: permissionsText
                },
                ...(acknowledgements.length
                    ? [
                          {
                              name: 'Additional information:',
                              value: client.utils.capList(acknowledgements, '\n', 'None.')
                          }
                      ]
                    : []),
                ...nameHistoryField
            ]);

        const banner = user.bannerURL?.({
            dynamic: true,
            size: 4096
        });

        if (banner) {
            embed.setImage(banner);
        }

        return client.send(interaction ? 1 : message.channel, null, [embed]);
    }
};
