'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export const CASE_TYPES = {
    ban: {
        label: 'Ban',
        emoji: '🔨'
    },
    tempban: {
        label: 'Temporary ban',
        emoji: '⏳'
    },
    kick: {
        label: 'Kick',
        emoji: '👢'
    },
    mute: {
        label: 'Mute',
        emoji: '🤐'
    },
    timeout: {
        label: 'Timeout',
        emoji: '🔇'
    },
    untimeout: {
        label: 'Timeout lifted',
        emoji: '🔈'
    },
    'warn-ban': {
        label: 'Warning ban',
        emoji: '⚠️'
    },
    'censor-ban': {
        label: 'Censor ban',
        emoji: '🚫'
    }
};

const describe = (record) =>
    CASE_TYPES[record.ty] ?? {
        label: record.ty || 'Unknown',
        emoji: '📁'
    };
const OUTCOMES = {
    unban: {
        text: 'Unbanned',
        emoji: '🔓'
    },

    unmute: {
        text: 'Unmuted',
        emoji: '🗣️'
    },
    rejoin: {
        text: 'Rejoined the server',
        emoji: '↩️'
    }
};

export default {
    name: 'case',
    aliases: ['viewcase', 'modcase', 'cases'],
    usage: '=case <number|user|id|former name>',
    description:
        'Look up moderation history.\n\nGive a **case number** for the full record of one case - the number shown as `[Case: #N]` whenever Relaxy bans, kicks or times someone out, and whenever a moderator does it by hand.\n\nGive a **user** instead - a mention, an id, their name, or a nickname they have since dropped - for every case they are involved in, both the ones handed to them and the ones they handed out. Someone who has left the server can still be found by any name Relaxy ever saw them use.',

    slashDescription: 'Look up a moderation case, or everything a user was involved in.',

    slash: new Discord.SlashCommandBuilder().addStringOption((option) =>
        option
            .setName('target')
            .setDescription('A case number, or a user - id, name, or a former nickname.')
            .setRequired(true)
    ),

    args: true,

    defer: true,

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_MESSAGES', 'MODERATE_MEMBERS'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const total = guild.d?.ca ?? 0;

        if (/^\d+$/.test(args[0]) && args[0].length < 17) {
            return single(client, message, guild, Number(args[0]), total, interaction);
        }

        return history(client, message, args, guild, total, interaction);
    }
};
const single = async (client, message, guild, number, total, interaction) => {
    if (!Number.isInteger(number) || number < 1) {
        return client.qEmbed('Give a valid case number, e.g. `=case 12`.', interaction ?? message);
    }

    const record = await client.module.database.getCase(guild.id, number);

    if (!record) {
        return client.qEmbed(
            total > 0
                ? `There is no case **#${number}** on this server. Cases run from **#1** to **#${total}**.`
                : 'This server has no moderation cases yet.',
            interaction ?? message
        );
    }

    const [target, moderator] = await Promise.all([
        record.u ? client.getUser(record.u).catch(() => null) : null,
        record.md ? client.getUser(record.md).catch(() => null) : null
    ]);

    const type = describe(record);
    const when = record.at ? Math.floor(record.at / 1000) : null;

    const fields = [
        {
            name: 'Type',
            value: `${type.emoji} ${type.label}`,
            inline: true
        },
        {
            name: 'Target',
            value: target ? `${target} \`${client.utils.tag(target)}\`` : record.u ? `\`${record.u}\`` : '`Unknown`',
            inline: true
        },
        {
            name: 'Moderator',
            value: moderator
                ? `${moderator} \`${client.utils.tag(moderator)}\``
                : record.md
                  ? `\`${record.md}\``
                  : '`Unknown`',
            inline: true
        },
        {
            name: 'Reason',
            value: (record.rs && record.rs.length ? record.rs : 'No reason given.').slice(0, 1024)
        }
    ];

    if (record.ex && record.ex.length) {
        fields.push({
            name: 'Extra',
            value: record.ex.slice(0, 1024)
        });
    }

    if (when) {
        fields.push({
            name: 'When',
            value: `<t:${when}:F> (<t:${when}:R>)`
        });
    }

    const outcomes = Array.isArray(record.ou) ? record.ou : [];

    if (outcomes.length) {
        fields.push({
            name: 'Since then',
            value: outcomes
                .slice()
                .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
                .map((entry) => {
                    const label = OUTCOMES[entry.t] ?? {
                        text: entry.t,
                        emoji: '•'
                    };
                    const at = entry.at ? ` <t:${Math.floor(entry.at / 1000)}:R>` : '';
                    const by = entry.md ? ` by <@${entry.md}>` : '';

                    return `${label.emoji} ${label.text}${at}${by}`;
                })
                .join('\n')
                .slice(0, 1024)
        });
    }

    return client.send(interaction ? 1 : message.channel, null, [
        {
            color: client.data.embedColor,
            author: {
                name: `Case #${record.n}`,
                icon_url: client.utils.guildIcon(message.guild)
            },
            thumbnail: {
                url: target
                    ? target.displayAvatarURL({
                          dynamic: true,
                          size: 1024
                      })
                    : client.utils.guildIcon(message.guild)
            },
            fields,
            footer: client.data.footer,
            timestamp: new Date().toISOString()
        }
    ]);
};

const history = async (client, message, args, guild, total, interaction) => {
    if (total === 0) {
        return client.qEmbed('This server has no moderation cases yet.', interaction ?? message);
    }

    const member = await client.utils.member(message, args, 0);
    let user = member?.user ?? null;

    if (!user) {
        const resolved = await client.utils.resolveTargetFromArgs(message.guild.id, args);

        if (resolved?.ambiguous?.length) {
            return client.qEmbed(
                `**\`${resolved.matched}\`** has been used by ${resolved.ambiguous.length} different people here. Search by id instead:\n${resolved.ambiguous.map((hit) => `• \`${hit.id}\``).join('\n')}`,
                interaction ?? message
            );
        }

        if (resolved?.id) {
            user = await client.getUser(resolved.id).catch(() => null);

            if (!user) {
                user = {
                    id: resolved.id,
                    username: resolved.matched ?? resolved.id
                };
            }
        }
    }

    if (!user) {
        return client.qEmbed(
            `Nobody here is known by **\`${args.join(' ')}\`**, now or in the past. Try their id.`,
            interaction ?? message
        );
    }

    const records = await client.module.database.casesInvolving(guild.id, user.id);

    if (!records.length) {
        return client.qEmbed(`**${client.utils.tag(user)}** has no cases on this server.`, interaction ?? message);
    }

    const against = records.filter((record) => record.u === user.id);
    const issued = records.filter((record) => record.md === user.id && record.u !== user.id);

    const format = (record) => {
        const type = describe(record);
        const when = record.at ? `<t:${Math.floor(record.at / 1000)}:R>` : 'at an unknown time';

        return `**#${record.n}** ${type.emoji} **${type.label}** - ${when}\n${client.utils.inlineText(record.rs, { limit: 90 })}`;
    };

    const section = (list, empty) =>
        list.length
            ? list.slice(0, 8).map(format).join('\n').slice(0, 1024) +
              (list.length > 8 ? `\n*…and ${list.length - 8} older.*` : '')
            : empty;

    const avatar =
        typeof user.displayAvatarURL === 'function'
            ? user.displayAvatarURL({
                  dynamic: true,
                  size: 1024
              })
            : client.utils.guildIcon(message.guild);

    return client.send(interaction ? 1 : message.channel, null, [
        {
            color: client.data.embedColor,
            author: {
                name: `Moderation history - ${client.utils.tag(user) ?? user.username}`,
                icon_url: client.utils.guildIcon(message.guild)
            },
            description: `${user.id ? `<@${user.id}> ` : ''}**\`${user.id}\`**\n**${records.length}** case${
                records.length === 1 ? '' : 's'
            } on this server. Use \`=case <number>\` for the full record of one.`,
            thumbnail: { url: avatar },
            fields: [
                {
                    name: `Against them [${against.length}]`,
                    value: section(against, '*Nothing.*')
                },
                {
                    name: `Handed out by them [${issued.length}]`,
                    value: section(issued, '*Nothing.*')
                }
            ],
            footer: client.data.footer,
            timestamp: new Date().toISOString()
        }
    ]);
};
