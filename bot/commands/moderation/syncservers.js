'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import {
    PROPOSAL_TTL,
    clearProposal,
    describeGuild,
    joinSyncHandshake,
    leaveSync,
    linkedGuilds,
    readProposal,
    refreshGuild,
    syncMembers
} from '../../../src/Client/Modules/Guilds/GuildLink.js';

const ON = [
    'on',
    'yes',
    'enable',
    'allow',
    'true'
];

const OFF = [
    'off',
    'no',
    'disable',
    'deny',
    'false'
];
const MODERATION = [
    'moderation',
    'moderate',
    'mod',
    'mods'
];

const STATUS = [
    'status',
    'show',
    'info',
    'list'
];

const LEAVE = [
    'leave',
    'unlink',
    'off',
    'remove',
    'delete'
];

const CANCEL = [
    'cancel',
    'abort',
    'stop'
];

export default {
    name:             'syncservers',
    aliases:          [
        'syncserver',
        'linkedservers',
        'links'
    ],
    usage:            '=syncservers [moderation on|off|status|leave|cancel]',
    description:      '**Link this server with another one.** Run `=syncservers` on its own here, then run it again in the other server. The same person has to run both, so servers only ever link where you hold the permissions on **both** sides - no ids to paste. Repeat with a third server, a fourth, and so on; they all end up in one **pool** that shares roles with each other.\n\n**`=syncservers moderation on`** additionally lets the servers in that pool moderate **here**: a `=ban`, `=kick`, `=mute`, `=unban` or `=unmute` run with `sync` in any of them is carried out in this server too, with its own case and modlog entry. It is **off** by default and is set per server - linking servers means you share roles, which is not the same as agreeing that their moderators may act here. `=syncservers moderation off` takes it away.\n\n`=syncservers status` shows every link and what each one permits, `=syncservers cancel` drops a half-finished link, and `=syncservers leave` leaves the pool.\n\nShare the roles themselves with `=syncrole`. Ban appeals are a separate, one-way link (`=appealchannel`) and are never covered by moderation sync.',
    slashDescription: 'Link this server with another, and choose whether they may moderate here.',

    slash: new Discord.SlashCommandBuilder()
               .addStringOption(option => option.setName('target').setDescription('Nothing to link servers, or "moderation on/off", "status", "leave" or "cancel".').setRequired(false)),

    defer:    true,
    cooldown: 10,

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
        const reply = content => client.qEmbed(content, interaction ?? message);

        const words = args.length === 1 && typeof args[0] === 'string'
            ? args[0].trim().split(/\s+/).filter(Boolean)
            : args;

        const first = words[0]?.toLowerCase();

        if (!first)
        {
            return link(client, message, guild, reply);
        }

        if (STATUS.includes(first))
        {
            return client.send(interaction
                ? 1
                : message.channel, null, [await overview(client, message, guild)]);
        }

        if (CANCEL.includes(first))
        {
            const proposal = await readProposal(client, message.author.id, 'sr');

            if (!proposal)
            {
                return reply('You have no server link waiting to be confirmed.');
            }

            await clearProposal(client, message.author.id);

            const from = await describeGuild(client, proposal.guild);

            return reply(`Dropped the link you started${from
                ? ` in **${from.name}**`
                : ''}.`);
        }

        if (MODERATION.includes(first))
        {
            const wanted = words[1]?.toLowerCase();
            const pool = syncMembers(guild).filter(id => id !== guild.id);

            if (!wanted || (!ON.includes(wanted) && !OFF.includes(wanted)))
            {
                return reply([
                    guild.sr?.ma
                        ? '🔓 Linked servers **can** moderate here.'
                        : '🔒 Linked servers **cannot** moderate here.',
                    '',
                    'Change it with `=syncservers moderation on` or `=syncservers moderation off`.'
                ].join('\n'));
            }

            const turnOn = ON.includes(wanted);

            if (!pool.length)
            {
                return reply('This server is linked to no other, so there is nobody for synced moderation to come from.\n\nLink one first: run `=syncservers` here, then `=syncservers` over there.');
            }

            if (Boolean(guild.sr?.ma) === turnOn)
            {
                return reply(turnOn
                    ? 'Linked servers can already moderate here.'
                    : 'Linked servers already cannot moderate here.');
            }

            return moderation(client, guild, pool, turnOn, reply);
        }

        if (LEAVE.includes(first))
        {
            if (!guild.sr?.on)
            {
                return reply('This server is not linked to any other.');
            }

            const remaining = await leaveSync(client, guild);
            const others = await Promise.all(remaining.map(id => describeGuild(client, id)));

            return reply([
                `This server has left the pool${others.length
                    ? ` - **${others.map((other, i) => other?.name ?? remaining[i]).join('**, **')}** are still linked to each other`
                    : ''}.`,
                '',
                'Nobody loses a role: the shared ones simply stop mirroring. Synced moderation stops reaching here immediately.'
            ].join('\n'));
        }

        return reply('Run `=syncservers` on its own to link this server with another.\n\n`moderation on` / `moderation off`, `status`, `cancel` and `leave` also work - see `=help syncservers`.');
    }
};

const link = async (client, message, guild, reply) =>
{
    const result = await joinSyncHandshake(client, guild, message.author.id);

    switch (result.status)
    {
        case 'self':
            return reply('You already started a link **here**.\n\nGo to the other server and run `=syncservers` there, or run `=syncservers cancel` to drop it.');

        case 'unknown-guild':
            return reply('The server you started this in is not one Relaxy can see any more. The request has been dropped.');

        case 'already':
            return reply(`**${result.target.name}** is already linked to this server. Share a role with \`=syncrole <name>\`, or allow its moderators to act here with \`=syncservers moderation on\`.`);

        case 'busy-both':
            return reply('Both servers are already in pools of their own, and Relaxy will not merge them - that would mean deciding for everyone which of two roles of the same name they now hold.\n\nRun `=syncservers leave` in whichever pool should give way, then link again.');

        case 'proposed':
            return reply([
                'Link started **here**.',
                '',
                'Now go to the other server and run `=syncservers` there. It has to be **you**, with the same permissions there - being able to run it in both servers is what proves you help run both.',
                '',
                `Expires in **${client.imports.time(PROPOSAL_TTL)}** - or \`=syncservers cancel\` to drop it.`
            ].join('\n'));

        case 'accepted':
            break;

        default:
            return reply('Could not set that up.');
    }

    const others = await Promise.all(result.members.filter(id => id !== guild.id).map(id => describeGuild(client, id)));

    return reply([
        `This server is now linked with **${others.map((entry, i) => entry?.name ?? result.members[i]).join('**, **')}**.`,
        `**${result.members.length}** servers in the pool.`,
        result.created?.length
            ? `\nRelaxy set up the pool's existing shared roles in the server that just joined: **${[...new Set(result.created)].join('**, **')}**.`
            : '',
        result.failed?.length
            ? `\n**Could not create:** ${result.failed.map(entry => `**${entry.name}** (${entry.error})`).join(', ')}. Check Relaxy has \`Manage Roles\` there and that its own role sits above the ones it hands out.`
            : '',
        '',
        '**What this does on its own:** shared roles mirror between these servers. Add one with `=syncrole <name>`.',
        '**What it does not do:** their moderators cannot act here until this server runs `=syncservers moderation on` - and that is per server, so each of them decides for itself.'
    ].filter(Boolean).join('\n'));
};
const moderation = async (client, guild, pool, turnOn, reply) =>
{
    await client.save(guild.id, {
        alter: 'sr.ma',
        value: turnOn
    });

    await refreshGuild(client, guild.id);

    const names = await Promise.all(pool.map(async id => (await describeGuild(client, id))?.name ?? id));

    return reply(turnOn
        ? [
            `**${names.join('**, **')}** can now moderate in this server.`,
            '',
            'A `=ban`, `=kick`, `=mute`, `=unban` or `=unmute` run there with `sync` is carried out here too, and is recorded here as its own case with its own modlog entry, under the name of whoever ran it.',
            '',
            'This is **one-way** and is yours alone: it says nothing about whether this server may moderate in theirs. Each of them decides that with `=syncservers moderation on` of its own.',
            '',
            '`=syncservers moderation off` takes it away.'
        ].join('\n')
        : `**${names.join('**, **')}** can no longer moderate in this server. Anything they already did here stays - the cases are this server's record now.`);
};
const overview = async (client, message, guild) =>
{
    const links = linkedGuilds(guild);
    const fields = [];

    const named = await Promise.all(links.map(async link =>
    {
        const described = await describeGuild(client, link.id).catch(() => null);

        const doc = await client.module.database.Guild(link.id).catch(() => null);

        return {
            ...link,
            name:    described?.name ?? link.id,
            gone:    !described,
            accepts: Boolean(doc?.sr?.ma)
        };
    }));

    const pool = named.filter(entry => entry.relation === 'pool');
    const appeals = named.filter(entry => entry.relation !== 'pool');

    fields.push({
        name:  `Linked servers [${pool.length}]`,
        value: pool.length
                   ? pool.map(entry => `**-** **${entry.name}**${entry.gone
                ? ' *(Relaxy is no longer in it)*'
                : ''} - ${entry.accepts
                ? '🔓 accepts moderation from here'
                : '🔒 does not accept moderation from here'}`).join('\n').slice(0, 1024)
                   : '*None.* Run `=syncservers` here, then `=syncservers` in the other server - the same person has to run both, which is what proves you help run both.'
    });

    if (appeals.length)
    {
        fields.push({
            name:  `Ban appeals [${appeals.length}]`,
            value: appeals.map(entry => entry.relation === 'host'
                ? `**-** **${entry.name}** hosts this server's appeals 📤`
                : `**-** **${entry.name}**'s banned members appeal here 📥`).join('\n').slice(0, 1024)
        });
    }

    fields.push({
        name:  'Moderation from linked servers',
        value: guild.sr?.ma
                   ? `🔓 **Allowed.** A \`sync\` ban, kick, mute, unban or unmute in ${pool.length
                ? `**${pool.map(entry => entry.name).join('**, **')}**`
                : 'a linked server'} is carried out here too, and recorded as this server's own case.\n\n\`=syncservers moderation off\` takes it away.`
                   : '🔒 **Not allowed.** Nothing another server does reaches this one.\n\n`=syncservers moderation on` allows it. It is off by default because linking servers means you share **roles** - it does not mean their moderators may act here, and that is a decision only this server can make.'
    }, {
        name:  'Moderating them from here',
        value: pool.length
                   ? [
                'Add `sync` to `=ban`, `=kick`, `=mute`, `=unban` or `=unmute` - or use the `s`-prefixed twins - `=sban`, `=skick`, `=smute`, `=sunban`, `=sunmute`.',
                '',
                'It reaches only the servers above that have turned it on for themselves, and the reply names every one it did **not** reach and why.'
            ].join('\n')
                   : '*Nothing to moderate - this server is linked to nobody.*'
    });

    return {
        color:       client.data.embedColor,
        author:      {
            name:     'Linked servers',
            icon_url: client.utils.guildIcon(message.guild)
        },
        description: [
                         'Two servers are linked by one person running the same command in **both** of them. Holding the permission on each side is the whole proof - there is nothing else to configure, and nothing can be linked one-sidedly.',
                         '',
                         'A role pool is a **mesh**: everyone in it shares with everyone else. An appeal link is **one-way**.'
                     ].join('\n'),
        fields,
        footer:      client.data.footer,
        timestamp:   new Date().toISOString()
    };
};
