'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const SNOWFLAKE = /^\d{15,25}$/;

const resolveTargets = async (client, message, args) =>
{
    const ids = new Set();

    for (const id of message.mentions.users.keys())
    {
        ids.add(id);
    }

    for (const id of message.mentions.roles.keys())
    {
        ids.add(id);
    }

    for (const raw of args)
    {
        const id = raw.replace(/[<@!&>]/g, '');

        if (!SNOWFLAKE.test(id) || ids.has(id))
        {
            continue;
        }

        if (message.guild.roles.cache.has(id) || await message.guild.members.fetch(id).then(() => true).catch(() => false))
        {
            ids.add(id);
        }
    }

    return [...ids];
};

const render = (guild, id) => guild.roles.cache.has(id)
    ? `<@&${id}>`
    : `<@${id}>`;

export default {
    name:        'custompermissions',
    aliases:     [
        'custompermission',
        'cmdperms',
        'grant'
    ],
    usage:       '=custompermissions <command> <grant|revoke|list|reset> [@user/@role …]',
    description: 'Let specific users or roles run a command they don\'t have the normal permissions for.\n**=custompermissions ban grant @Trainee** - let the Trainee role use `=ban`\n**=custompermissions ban revoke @Trainee** - take it away\n**=custompermissions ban list** - who is granted `=ban`\n**=custompermissions ban reset** - clear every grant on `=ban`\n**=custompermissions list** - every command with grants\nA grant only lifts the *user* permission check - Relaxy still needs its own permissions, and disabled/nsfw/cooldown limits still apply.',

    permissionsUser: [
        'SEND_MESSAGES',
        'MANAGE_GUILD'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    async run(client, message, args, guild, interaction)
    {
        const grants = guild.cmd.gr ?? {};

        if (!args.length || args[0].toLowerCase() === 'list')
        {
            const entries = Object.entries(grants).filter(([, ids]) => Array.isArray(ids) && ids.length);

            if (!entries.length)
            {
                return client.qEmbed('No command has custom grants yet. Try `=custompermissions <command> grant @user`.', interaction ?? message);
            }

            return client.send(interaction
                ? 1
                : message.channel, null, [
                {
                    color:       client.data.embedColor,
                    author:      {
                        name:     'Custom command grants',
                        icon_url: client.utils.guildIcon(message.guild)
                    },
                    description: entries
                                     .map(([name, ids]) => `**${guild.px[0]}${name}** - ${ids.map(id => render(message.guild, id)).join(', ')}`)
                                     .join('\n')
                                     .slice(0, 4000),
                    footer:      client.data.footer
                }
            ]);
        }

        const commandName = args[0].toLowerCase();
        const command = client.collections.commands.get(commandName) || client.collections.aliases.get(commandName);

        if (!command)
        {
            return client.qEmbed(`There's no command called \`${commandName}\`. See them all in \`${guild.px[0]}help\`.`, interaction ?? message);
        }

        if (command.owner)
        {
            return client.qEmbed('Owner-only commands can\'t be granted.', interaction ?? message);
        }

        const action = (args[1] ?? 'list').toLowerCase();
        const current = Array.isArray(grants[command.name])
            ? [...grants[command.name]]
            : [];

        if (action === 'list')
        {
            return client.qEmbed(current.length
                ? `Granted **${guild.px[0]}${command.name}**: ${current.map(id => render(message.guild, id)).join(', ')}`
                : `Nobody is granted **${guild.px[0]}${command.name}** - only members with its normal permissions can use it.`, interaction ?? message);
        }

        if ([
            'reset',
            'clear'
        ].includes(action))
        {
            if (!current.length)
            {
                return client.qEmbed(`**${guild.px[0]}${command.name}** had no grants to clear.`, interaction ?? message);
            }

            guild.cmd.gr[command.name] = [];
            client.save(guild.id, {
                alter: `cmd.gr.${command.name}`,
                value: []
            });

            return client.qEmbed(`Cleared all grants on **${guild.px[0]}${command.name}**.`, interaction ?? message);
        }

        if (![
            'grant',
            'revoke',
            'add',
            'remove'
        ].includes(action))
        {
            return client.qEmbed('Second word must be `grant`, `revoke`, `list` or `reset`.', interaction ?? message);
        }

        const targets = await resolveTargets(client, message, args.slice(2));

        if (!targets.length)
        {
            return client.qEmbed('Mention at least one user or role (or paste their ID).', interaction ?? message);
        }

        const granting = [
            'grant',
            'add'
        ].includes(action);
        const set = new Set(current);
        const changed = [];

        for (const id of targets)
        {
            if (granting && !set.has(id))
            {
                set.add(id);
                changed.push(id);
            }
            else if (!granting && set.has(id))
            {
                set.delete(id);
                changed.push(id);
            }
        }

        if (!changed.length)
        {
            return client.qEmbed(granting
                ? 'They were already granted that command.'
                : 'None of them were granted that command.', interaction ?? message);
        }

        const next = [...set];
        guild.cmd.gr[command.name] = next;
        client.save(guild.id, {
            alter: `cmd.gr.${command.name}`,
            value: next
        });

        return client.send(interaction
            ? 1
            : message.channel, null, [
            {
                color:       client.data.embedColor,
                author:      {
                    name:     'Custom command grants',
                    icon_url: client.utils.guildIcon(message.guild)
                },
                description: `${granting
                    ? 'Granted'
                    : 'Revoked'} **${guild.px[0]}${command.name}** ${granting
                    ? 'to'
                    : 'from'} ${changed.map(id => render(message.guild, id)).join(', ')}.\n\n` + (next.length
                    ? `Now granted: ${next.map(id => render(message.guild, id)).join(', ')}`
                    : `Nobody is granted **${guild.px[0]}${command.name}** anymore.`),
                footer:      client.data.footer
            }
        ]);
    }
};
