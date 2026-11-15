'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import {
    PROPOSAL_TTL,
    addSyncedRole,
    attachSyncedRole,
    clearProposal,
    describeGuild,
    joinSyncHandshake,
    leaveSync,
    readProposal,
    removeSyncedRole,
    syncMembers
} from '../../../src/Client/Modules/Guilds/GuildLink.js';

const OFF = ['off', 'no', 'none', 'leave', 'unlink'];

const DROP = ['remove', 'unsync', 'delete'];

const ADD = ['add', 'create', 'new'];

const ATTACH = ['attach', 'link', 'use'];

const STATUS = ['status', 'show', 'info'];

const CANCEL = ['cancel', 'abort', 'stop'];

const MAX_ROLES = 25;

export default {
    name: 'syncrole',
    aliases: ['syncroles', 'rolesync'],
    usage: '=syncrole [role name [server ids]|attach [name] <role>|remove <role>|status]',
    description:
        'Share roles across **any number** of servers. Give someone a shared role in one of them and Relaxy gives it to them in all the others; take it away and it goes everywhere. Whichever server it was changed in last is the one everybody follows - there is no main server.\n\n**Linking servers** is `=syncservers` - run it on its own here, then again in the other server. (`=syncrole` on its own still does it, but linking is a decision about servers, not roles.) Letting those servers moderate here is a separate switch: `=syncservers moderation on`.\n\n**Sharing a role.** `=syncrole <a name>` shares it across **every** linked server. Any server that **already has a role by that name keeps it** - Relaxy adopts it rather than making a second, so everybody already holding it is in the shared role straight away - and it is created only where there is none. To share it with only some of them, name them: `=syncrole Modder <modding server id>`.\n\n**Roles that are called different things.** `=syncrole attach <a role here>` starts a shared role from one this server already has; run `=syncrole attach <that name> <their role>` in each of the others to bring theirs in. Only **who holds it** is shared, so `Trusted` here can be `Editor` on the wiki and still be one group - each server keeps its own name, colour and permissions.\n\n`=syncrole remove <role>` stops sharing one, `=syncrole status` shows the group, `=syncservers cancel` drops a half-finished link, and `=syncservers leave` leaves the pool.\n\nSee `=syncservers` for what else the linked servers share.',
    slashDescription: 'Share roles across any number of linked servers.',

    slash: new Discord.SlashCommandBuilder().addStringOption((option) =>
        option
            .setName('target')
            .setDescription('A role name to share, or "attach <role>", "remove <role>" or "status".')
            .setRequired(false)
    ),

    cooldown: 20,

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_GUILD', 'MANAGE_ROLES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'MANAGE_ROLES'],

    async run(client, message, args, guild, interaction) {
        const reply = (content) => client.qEmbed(content, interaction ?? message);
        const first = args[0]?.toLowerCase();

        if (!first) {
            return link(client, message, guild, reply);
        }

        if (STATUS.includes(first)) {
            return statusPicker(client, message, guild, interaction);
        }

        if (CANCEL.includes(first)) {
            const proposal = await readProposal(client, message.author.id, 'sr');

            if (!proposal) {
                return reply('You have no role sync waiting to be confirmed.');
            }

            await clearProposal(client, message.author.id);

            const from = await describeGuild(client, proposal.guild);

            return reply(`Dropped the role sync you started${from ? ` in **${from.name}**` : ''}.`);
        }

        if (ATTACH.includes(first)) {
            return attach(client, message, guild, args.slice(1), reply);
        }

        if (OFF.includes(first)) {
            if (!guild.sr.on) {
                return reply('This server does not share roles with any other.');
            }

            const remaining = await leaveSync(client, guild);
            const others = await Promise.all(remaining.map((id) => describeGuild(client, id)));

            return reply(
                `This server has left the pool${
                    others.length
                        ? ` - **${others.map((other, i) => other?.name ?? remaining[i]).join('**, **')}** still share their roles with each other`
                        : ''
                }.\nNobody loses a role: they simply stop mirroring.`
            );
        }

        if (DROP.includes(first)) {
            return drop(client, guild, args.slice(1), reply);
        }

        const rest = ADD.includes(first) ? args.slice(1) : args;
        const id = rest[0]?.match(/^\D*(\d{17,20})\D*$/)?.[1];
        if (id && !ADD.includes(first)) {
            const other = id === guild.id ? null : await describeGuild(client, id);

            if (other) {
                return reply(
                    `Server ids are not used any more. Run \`=syncrole\` here, then run \`=syncrole\` in **${other.name}** - being able to run it in both is what proves you help run both.`
                );
            }

            const shared = (guild.sr.r ?? []).find((role) => Object.values(role.m ?? {}).includes(id));

            if (shared) {
                const where = await servers(client, shared, guild.id);

                return reply(
                    `**${shared.n}** is shared across **${Object.keys(shared.m).length}** servers:\n${where}\nStop sharing it with \`=syncrole remove ${id}\`.`
                );
            }
        }

        return create(client, guild, rest, reply);
    }
};

const link = async (client, message, guild, reply) => {
    const result = await joinSyncHandshake(client, guild, message.author.id);

    switch (result.status) {
        case 'self':
            return reply(
                'You already started a link **here**.\n\nGo to the other server and run `=syncservers` there, or run `=syncservers cancel` to drop it.'
            );

        case 'unknown-guild':
            return reply(
                'The server you started this in is not one Relaxy can see any more. The request has been dropped.'
            );

        case 'already':
            return reply(
                `**${result.target.name}** already shares roles with this server. Add one with \`=syncrole <name>\`.`
            );

        case 'busy-both':
            return reply(
                'Both servers are already in pools of their own, and Relaxy will not merge them - that would mean deciding for everyone which of two roles of the same name they now hold.\n\nRun `=syncservers leave` in whichever pool should give way, then link again.'
            );

        case 'proposed':
            return reply(
                [
                    'Link started **here**.',
                    '',
                    'Now go to the other server and run `=syncservers` there. It has to be **you**, with the same permissions there - being able to run it in both servers is what proves you help run both.',
                    '',
                    '-# `=syncservers` is the command for this - `=syncrole` links them too, but linking is a decision about servers, not roles.',
                    '',
                    `Expires in **${client.imports.time(PROPOSAL_TTL)}** - or \`=syncservers cancel\` to drop it.`
                ].join('\n')
            );

        case 'accepted':
            break;

        default:
            return reply('Could not set that up.');
    }

    const others = await Promise.all(
        result.members.filter((id) => id !== guild.id).map((id) => describeGuild(client, id))
    );

    return reply(
        [
            `This server now shares roles with **${others.map((entry, i) => entry?.name ?? result.members[i]).join('**, **')}**.`,
            `**${result.members.length}** servers in the group.`,
            result.created.length
                ? `\nRelaxy created the group's existing roles in the server that just joined: **${[...new Set(result.created)].join('**, **')}**.`
                : '',
            result.failed.length
                ? `\n**Could not create:** ${result.failed.map((entry) => `**${entry.name}** (${entry.error})`).join(', ')}. Check Relaxy has \`Manage Roles\` there and that its own role sits above the ones it hands out.`
                : '',
            '\nGive a shared role to someone in **any** of these servers and Relaxy gives it to them in the rest. Add one with `=syncrole <name>`.'
        ]
            .filter(Boolean)
            .join('\n')
    );
};

const attach = async (client, message, guild, args, reply) => {
    if (syncMembers(guild).length < 2) {
        return reply(
            'Link this server with another one first: run `=syncservers` here, then `=syncservers` over there.'
        );
    }

    const roleArg = args.at(-1);
    const groupName = args.length > 1 ? args.slice(0, -1).join(' ').trim() : null;

    if (!roleArg) {
        const groups = (guild.sr.r ?? []).map((role) => role.n);

        return reply(
            `Usage: \`=syncrole attach <a role here>\`, or \`=syncrole attach <shared role name> <a role here>\` to file it under a different name.\n\n${
                groups.length
                    ? `Shared roles: **${groups.join('**, **')}**.`
                    : 'This group shares no roles yet - `=syncrole attach <a role here>` starts one from a role you already have.'
            }`
        );
    }

    const role = client.utils.role(message, [roleArg], 0);

    if (!role) {
        return reply(`**${roleArg}** is not a role in this server.`);
    }

    if (role.managed) {
        return reply(`**${role.name}** is managed by another service, so Relaxy cannot hand it out.`);
    }

    if (role.position >= message.guild.members.me.roles.highest.position) {
        return reply(`**${role.name}** sits above Relaxy's highest role, so Relaxy cannot grant or take it.`);
    }

    const result = await attachSyncedRole(client, guild, groupName ?? role.name, role.id, true);

    switch (result.status) {
        case 'taken':
            return reply(
                `This server already carries **${result.role.n}** as <@&${result.role.m[guild.id]}>.\nStop sharing it here first: \`=syncrole remove ${result.role.m[guild.id]}\`.`
            );

        case 'in-use':
            return reply(
                `**${role.name}** is already this server's side of **${result.role.n}**. One role cannot serve two shared groups - granting it could not mean one without meaning the other.`
            );

        case 'created':
            return reply(
                [
                    `**${role.name}** is now the shared role **${result.role.n}**, and this server is the only one in it so far.`,
                    '',
                    `Nothing mirrors yet - a shared role needs a second server. In each of the others, run \`=syncrole attach ${result.role.n} <their role>\` to bring their own role in, whatever it happens to be called there.`,
                    '',
                    'Only **who holds it** is shared. Every server keeps its own name, colour and permissions - `Trusted` here can be `Editor` on the wiki and still be one group.'
                ].join('\n')
            );

        case 'ok':
            break;

        default:
            return reply('Could not attach that role.');
    }

    const where = await servers(client, result.role, guild.id);

    return reply(
        [
            `**${role.name}** is now this server's side of the shared role **${result.role.n}**.`,
            '',
            'Only **who holds it** is shared - its name, colour and permissions stay exactly as they are here, and every other server keeps its own.',
            '',
            `**${result.role.n}** now covers **${Object.keys(result.role.m).length}** servers:`,
            where
        ].join('\n')
    );
};

const create = async (client, guild, args, reply) => {
    const members = syncMembers(guild);

    if (members.length < 2) {
        return reply(
            'Link this server with another one first: run `=syncservers` here, then `=syncservers` over there.'
        );
    }

    const ids = [];

    while (args.length > 1 && /^\d{17,20}$/.test(args.at(-1))) {
        ids.unshift(args.pop());
    }

    const name = args.join(' ').trim();

    if (!name) {
        return reply('Name the role you want shared, e.g. `=syncrole Trusted`.');
    }

    if (name.length > 100) {
        return reply('That name is too long for a Discord role (100 characters maximum).');
    }

    const unknown = ids.filter((id) => !members.includes(id));

    if (unknown.length) {
        return reply(
            `This server does not share roles with ${unknown.map((id) => `\`${id}\``).join(', ')}. Link with it first: run \`=syncservers\` here, then \`=syncservers\` over there.`
        );
    }

    const targets = ids.length ? [...new Set([guild.id, ...ids])] : members;

    const roles = guild.sr.r ?? [];

    if (roles.length >= MAX_ROLES) {
        return reply(
            `These servers already share ${MAX_ROLES} roles, which is the limit. Remove one first: \`=syncrole remove <role>\`.`
        );
    }

    if (roles.some((role) => role.n.toLowerCase() === name.toLowerCase())) {
        return reply(`**${name}** is already shared between these servers.`);
    }

    const result = await addSyncedRole(client, guild, name, targets);

    if (result.status !== 'ok') {
        return reply(
            `Could not set the role up in **${result.guild}** (${result.error}), so nothing was changed anywhere - a role that exists in only some of the servers it covers would silently fail to sync.\n\nGive Relaxy \`Manage Roles\` there, and make sure its own role sits above the ones it has to hand out.`
        );
    }

    const where = await servers(client, result.role, guild.id);

    return reply(
        [
            `**${name}** is now shared across **${targets.length}** server${targets.length === 1 ? '' : 's'}:`,
            where,
            '',
            result.adopted?.length
                ? `**${result.adopted.length}** of them already had a role called **${name}** - Relaxy adopted ${
                      result.adopted.length === 1 ? 'it' : 'them'
                  } instead of making a second, so **everyone already holding ${
                      result.adopted.length === 1 ? 'it' : 'one'
                  } is now in the shared role**.`
                : '',
            result.created?.length
                ? `Relaxy created it in **${result.created.length}** server${
                      result.created.length === 1 ? '' : 's'
                  } that had none.`
                : '',
            '',
            targets.length === members.length
                ? 'Give it to someone in any of them and Relaxy gives it to them in the rest. A server that joins later gets it too.'
                : `Give it to someone in any of them and Relaxy gives it to them in the rest. The other linked servers are **not** covered by this role.`
        ]
            .filter(Boolean)
            .join('\n')
    );
};
const drop = async (client, guild, args, reply) => {
    if (!guild.sr.on) {
        return reply('This server does not share roles with any other.');
    }

    const query = args.join(' ').trim();

    if (!query) {
        return reply('Say which role to stop sharing, e.g. `=syncrole remove Trusted`.');
    }

    const id = query.match(/\d{17,20}/)?.[0];

    const role = (guild.sr.r ?? []).find(
        (item) => (id && Object.values(item.m ?? {}).includes(id)) || item.n.toLowerCase() === query.toLowerCase()
    );

    if (!role) {
        return reply(`**${query}** is not a shared role here. \`=syncrole\` lists the ones that are.`);
    }

    await removeSyncedRole(client, guild, role);

    return reply(
        `**${role.n}** is no longer shared. The role still exists in all ${Object.keys(role.m).length} servers and everyone keeps it - it just stops mirroring. Delete it yourself if you want it gone.`
    );
};

const statusPicker = async (client, message, guild, interaction) => {
    const overview = await status(client, message, guild);
    const roles = guild.sr?.r ?? [];
    if (syncMembers(guild).length < 2 || roles.length < 2) {
        return client.send(interaction ? 1 : message.channel, null, [overview]);
    }

    return new client.class.picker(client).run({
        message,
        interaction,
        id: 'syncroleui',
        placeholder: 'Select a shared role to see it on its own…',
        empty: overview,

        choices: roles.map((role, i) => ({
            value: String(i),
            label: role.n,
            description: role.a ? 'Covers every linked server' : `Covers ${Object.keys(role.m ?? {}).length} servers`,
            emoji: role.m?.[guild.id] ? '🔗' : '➖'
        })),

        render: async (value) => ({ embeds: [await roleDetail(client, message, guild, roles[Number(value)])] })
    });
};
const roleDetail = async (client, message, guild, role) => {
    const covers = Object.keys(role.m ?? {});
    const mine = role.m?.[guild.id];

    const fields = [
        {
            name: 'Here',
            value: mine
                ? `<@&${mine}> \`${mine}\``
                : '*This server does not carry this role* - `=syncrole attach ' + role.n + ' <a role here>`'
        },
        {
            name: `Covers [${covers.length}]`,
            value: (await servers(client, role, guild.id)).slice(0, 1024)
        },
        {
            name: 'Scope',
            value: role.a
                ? 'Created to cover **every** linked server - a server that joins later picks it up automatically.'
                : 'Deliberately scoped to the servers above. A server that joins later is **not** added to it.'
        },
        {
            name: 'Stop sharing',
            value: `\`=syncrole remove ${role.n}\`\nThe role stays in all ${covers.length} servers and everyone keeps it - it just stops mirroring.`
        }
    ];

    return {
        color: client.data.embedColor,
        author: {
            name: `Shared role - ${role.n}`,
            icon_url: client.utils.guildIcon(message.guild)
        },
        fields,
        footer: client.data.footer,
        timestamp: new Date().toISOString()
    };
};
const servers = async (client, role, hereId) => {
    const entries = await Promise.all(
        Object.entries(role.m ?? {}).map(async ([guildId, roleId]) => {
            const guild = await describeGuild(client, guildId);

            return guildId === hereId
                ? `**-** <@&${roleId}> *(here)*`
                : `**-** **${guild?.name ?? guildId}** **\`${roleId}\`**`;
        })
    );

    return entries.join('\n');
};
const status = async (client, message, guild) => {
    const fields = [];
    const members = syncMembers(guild);

    if (members.length > 1) {
        const others = await Promise.all(guild.sr.gs.map((id) => describeGuild(client, id)));
        const roles = guild.sr.r ?? [];

        const names = new Map(others.map((other, i) => [guild.sr.gs[i], other?.name ?? guild.sr.gs[i]]));

        names.set(guild.id, 'here');

        fields.push(
            {
                name: `Linked with [${others.length}]`,
                value: others
                    .map((other, i) =>
                        other
                            ? `**${other.name}** \`${other.id}\``
                            : `\`${guild.sr.gs[i]}\` *(Relaxy is no longer in it)*`
                    )
                    .join('\n')
                    .slice(0, 1024)
            },
            {
                name: `Shared roles [${roles.length}]`,
                value: roles.length
                    ? roles
                          .map((role) => {
                              const covers = Object.keys(role.m ?? {});
                              const mine = role.m?.[guild.id];

                              return `${mine ? `<@&${mine}>` : `**${role.n}**`} - ${
                                  role.a ? 'every linked server' : covers.map((id) => names.get(id) ?? id).join(', ')
                              } *(${covers.length})*`;
                          })
                          .join('\n')
                          .slice(0, 1024)
                    : '*None yet - `=syncrole <name>` creates one in every linked server at once.*'
            }
        );
    } else {
        fields.push({
            name: 'Not set up',
            value: 'This server shares roles with nobody.\n\nRun `=syncrole` here, then run it again in the other server. The same person has to run both, which is what proves you hold the permissions in each - no ids to paste.\n\nRepeat it with a third server, a fourth, and so on - they all end up sharing the same roles.'
        });
    }

    const proposal = await readProposal(client, message.author.id, 'sr');

    if (proposal) {
        const from = await describeGuild(client, proposal.guild);

        fields.push({
            name: 'Waiting on you',
            value: `You started a role sync in **${from?.name ?? proposal.guild}**${
                proposal.guild === guild.id ? ' *(here)*' : ''
            }.\n\nRun \`=syncrole\` in the other server to finish it${
                proposal.guild === guild.id ? '' : ' - running it **here** links this one'
            }. Expires <t:${Math.floor((proposal.at + PROPOSAL_TTL) / 1000)}:R>, or \`=syncrole cancel\` drops it.`
        });
    }

    return {
        color: client.data.embedColor,
        author: {
            name: 'Shared roles',
            icon_url: client.utils.guildIcon(message.guild)
        },
        fields,
        footer: client.data.footer,
        timestamp: new Date().toISOString()
    };
};
