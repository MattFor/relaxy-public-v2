'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import {
    PROPOSAL_TTL,
    canOpenPrivateThreads,
    canReadBans,
    createChannelOn,
    describeChannel,
    describeGuild,
    inviteTo,
    pairHandshake,
    readProposal,
    clearProposal,
    refreshGuild,
    unpair
} from '../../../src/Client/Modules/Guilds/GuildLink.js';

const OFF = [
    'off',
    'no',
    'none',
    'remove',
    'delete',
    'unlink'
];

const STATUS = [
    'status',
    'show',
    'info'
];

const CANCEL = [
    'cancel',
    'abort',
    'stop'
];

const THREAD = [
    'thread',
    'threads',
    'private'
];
const slug = name => (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'server').slice(0, 80);

const MAX_THREAD_ROLES = 10;
const listOf = items => items.length > 1
    ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
    : items[0] ?? '';

const threadLine = (guild, warning) => (guild.ap.tr?.length
    ? `Every appellant gets a **private thread**, with ${listOf(guild.ap.tr.map(id => `<@&${id}>`))} added to it.${warning}`
    : 'Every appellant shares one channel. `=appealchannel thread <role>, <role>` gives each of them a private one instead.').slice(0, 1024);

const parseRoles = (message, args) =>
{
    const raw = args.join(' ').trim();
    const onlyIds = /^(?:\s*(?:<@&\d{17,20}>|\d{17,20}))+$/.test(raw);

    const pieces = (raw.includes(',')
        ? raw.split(',')
        : onlyIds
            ? raw.match(/\d{17,20}/g)
            : [raw])
        .map(piece => piece.trim())
        .filter(Boolean);

    const roles = new Map();
    const unknown = [];

    let everyone = false;

    for (const piece of pieces)
    {
        const id = piece.match(/\d{17,20}/)?.[0];
        const name = piece.replace(/^@/, '').toLowerCase();
        const role = (id
            ? message.guild.roles.cache.get(id)
            : null) ?? message.guild.roles.cache.find(entry => entry.name.toLowerCase() === name) ?? message.guild.roles.cache.find(entry => entry.name.toLowerCase().includes(name)) ?? null;

        if (!role)
        {
            unknown.push(piece);

            continue;
        }
        if (role.id === message.guild.roles.everyone.id)
        {
            everyone = true;

            continue;
        }

        roles.set(role.id, role);
    }

    return {
        roles: [...roles.values()],
        unknown,
        everyone
    };
};

export default {
    name:             'appealchannel',
    aliases:          [
        'appeals',
        'banappeal'
    ],
    usage:            '=appealchannel [channel id [server id]|thread <role[, role…]|off>|status|cancel|off]',
    description:      'Set up the channel your banned members appeal in.\n\nA banned member cannot post in the server that banned them, so the appeal channel lives in **another server** - one you also help run. Run `=appealchannel` on its own here, then run it again over there. The same person has to run both, so servers only ever link where you hold the permissions on **both** sides - no ids to paste.\n\n**This is one-way.** Members banned in the server you started in will appeal in the server you finished in. To let that server\'s bans be appealed here too, run the whole thing again starting from over there.\n\nFrom then on every ban DM ends with an invite to it (after your `=ban message`, if you have set one), quoting the case number.\n\n**`=appealchannel thread <role>[, <role>…]`** *(in the hosting server)* - give each appellant their own **private thread** instead of one shared channel, with those roles added to it. Name as many as answer appeals here, separated by **commas** (role names have spaces in them), or just mention them. They are added automatically when the appellant arrives; nobody else can see it. Each run replaces the whole list, and `thread off` goes back to one channel.\n\nRun it with a channel id to point appeals at a channel that already exists, `status` to see the setup, `cancel` to drop a half-finished link, or `off` to unlink.',
    slashDescription: 'Set up the channel your banned members appeal in.',

    slash: new Discord.SlashCommandBuilder()
               .addStringOption(option => option.setName('target').setDescription('Nothing to link servers, or a channel id, "thread <role, role…>", "status", "cancel" or "off".').setRequired(false)),

    cooldown: 20,

    permissionsUser: [
        'SEND_MESSAGES',
        'MANAGE_GUILD',
        'BAN_MEMBERS'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'MANAGE_CHANNELS',
        'CREATE_INSTANT_INVITE'
    ],

    async run(client, message, args, guild, interaction)
    {
        const reply = content => client.qEmbed(content, interaction ?? message);

        const words = args.length === 1 && typeof args[0] === 'string'
            ? args[0].trim().split(/\s+/).filter(Boolean)
            : args;

        const target = words[0]?.toLowerCase();

        if (!target)
        {
            return link(client, message, guild, reply);
        }

        if (THREAD.includes(target))
        {
            return thread(client, message, guild, words.slice(1), reply);
        }

        const keyword = words.map(word => word.toLowerCase()).find(word => STATUS.includes(word) || CANCEL.includes(word) || OFF.includes(word));

        if (STATUS.includes(keyword))
        {
            return statusPicker(client, message, guild, interaction);
        }

        if (CANCEL.includes(keyword))
        {
            const proposal = await readProposal(client, message.author.id, 'ap');

            if (!proposal)
            {
                return reply('You have no appeal link waiting to be confirmed.');
            }

            await clearProposal(client, message.author.id);

            const from = await describeGuild(client, proposal.guild);

            return reply(`Dropped the appeal link you started${from
                ? ` in **${from.name}**`
                : ''}.`);
        }

        if (OFF.includes(keyword))
        {
            if (!guild.ap.on && !guild.ap.h?.length)
            {
                return reply('This server has no appeal channel set up.');
            }

            const guests = await Promise.all((guild.ap.h ?? []).map(id => describeGuild(client, id)));
            const partnerId = await unpair(client, guild, { c: '' });
            const partner = partnerId
                ? await describeGuild(client, partnerId)
                : null;

            return reply([
                'Appeals are off.',
                partner
                    ? `**${partner.name}** no longer hosts this server's appeals.`
                    : '',
                guests.length
                    ? `**${guests.map((guest, i) => guest?.name ?? guild.ap.h[i]).join('**, **')}** no longer appeal here.`
                    : '',
                !partner && !guests.length
                    ? 'The link is gone.'
                    : '',
                'The channels themselves were left alone - delete them yourself if you want them gone.'
            ].filter(Boolean).join('\n'));
        }
        const ids = words.join(' ').match(/\d{17,20}/g) ?? [];

        if (!ids.length)
        {
            return reply('Run `=appealchannel` on its own to link two servers, or give a channel id to point appeals at an existing channel. `status`, `cancel` and `off` also work - see `=help appealchannel`.');
        }
        const partnerGuild = ids[0] === guild.id
            ? null
            : await describeGuild(client, ids[0]);

        if (partnerGuild)
        {
            return reply(`Server ids are not used any more. Run \`=appealchannel\` here, then run \`=appealchannel\` in **${partnerGuild.name}** - being able to run it in both is what proves you help run both.`);
        }

        return point(client, message, guild, ids[0], ids[1] ?? null, reply);
    }
};

const link = async (client, message, guild, reply) =>
{
    const result = await pairHandshake(client, guild, message.author.id);

    switch (result.status)
    {
        case 'self':
            return reply('You already started an appeal link **here**.\n\nGo to the other server - the one that should host the appeals - and run `=appealchannel` there. Or run `=appealchannel cancel` to drop it.');

        case 'busy-here':
            return reply('Members banned here already appeal somewhere. Run `=appealchannel off` first if you want to move them.');

        case 'unknown-guild':
            return reply('The server you started this in is not one Relaxy can see any more. The request has been dropped.');

        case 'already':
            return reply(`Members banned in **${result.partner.name}** already appeal here.`);

        case 'busy-there':
            return reply(`**${result.partner.name}** started appealing somewhere else in the meantime. Run \`=appealchannel off\` there first.`);

        case 'proposed':
            return reply([
                'Appeal link started **here**.',
                '',
                `Now go to the server that should **host** the appeals and run \`=appealchannel\` there. It has to be **you** who runs it, and you need the same permissions there - being able to run it in both servers is what proves you help run both.`,
                '',
                `This sets up **one direction only**: members banned *here* will appeal *there*. To let that server's bans be appealed here too, run the whole thing again starting from over there.`,
                '',
                `Expires in **${client.imports.time(PROPOSAL_TTL)}** - or \`=appealchannel cancel\` to drop it.`
            ].join('\n'));

        case 'accepted':
            break;

        default:
            return reply('Could not set that up.');
    }
    const theirs = await ensureChannel(client, result.partnerDoc, result.partner.name, guild.id);

    const invite = theirs.id
        ? await inviteTo(client, guild.id, theirs.id)
        : null;

    return reply([
        `**${result.partner.name}**'s ban appeals now come **here**.`,
        '',
        theirs.id
            ? `Members banned in **${result.partner.name}** appeal in **<#${theirs.id}>**.${invite
                ? `\n${invite}`
                : ''}`
            : `Relaxy could not create their appeal channel here (${theirs.error}). Give it \`Manage Channels\`, or run \`=appealchannel <channel id>\` in **${result.partner.name}** to use a channel that already exists.`,
        '',
        `This is **one-way**: it does nothing for members banned *here*. To have this server's own bans appealed in **${result.partner.name}**, run \`=appealchannel\` here and then again over there.`,
        '',
        `Every ban DM in **${result.partner.name}** from now on ends with an invite to it.`
    ].join('\n'));
};

const thread = async (client, message, guild, args, reply) =>
{
    if (!guild.ap?.h?.length)
    {
        return reply('This server does not host anyone\'s ban appeals, so there is nothing to open threads in.\n\nRun `=appealchannel` in the server whose bans should be appealable, then run it again here.');
    }

    const current = guild.ap.tr ?? [];
    const wanted = args[0]?.toLowerCase();

    if (!wanted)
    {
        return reply(current.length
            ? `Appeals open a **private thread** each, and ${listOf(current.map(id => `<@&${id}>`))} ${current.length > 1
                ? 'are'
                : 'is'} added to every one.\n\nName a new list to change it - \`=appealchannel thread <role>, <role>\` - or \`=appealchannel thread off\` to turn it off.`
            : 'Appeals all share one channel.\n\nRun `=appealchannel thread <a staff role>` to give each appellant a private thread instead, with that role added to it. Name several - `=appealchannel thread Moderators, Admins` - to add more than one.');
    }

    if (OFF.includes(wanted))
    {
        await client.save(guild.id, {
            alter: 'ap.tr',
            value: []
        });
        await refreshGuild(client, guild.id);

        return reply('Appeals now share one channel again. Threads that already exist are left alone.');
    }

    const {
        roles,
        unknown,
        everyone
    } = parseRoles(message, args);

    if (unknown.length)
    {
        return reply([
            `${unknown.length > 1
                ? 'These are not roles'
                : 'That is not a role'} in this server: **${unknown.join('**, **')}**.`,
            '',
            'Nothing was changed. Roles are separated by **commas** (names have spaces in them), or you can just mention them: `=appealchannel thread Moderators, Senior Staff`.'
        ].join('\n'));
    }

    if (everyone)
    {
        return reply('`@everyone` would put every member in every appeal thread, which is the opposite of a private one. Nothing was changed.');
    }

    if (!roles.length)
    {
        return reply('Name at least one staff role to add to the appeal threads, or `=appealchannel thread off` to go back to one shared channel.');
    }

    if (roles.length > MAX_THREAD_ROLES)
    {
        return reply(`That is **${roles.length}** roles, and an appeal thread can name **${MAX_THREAD_ROLES}**. Every one of them is pinged in the thread's opening message, which is the first thing the appellant reads.`);
    }

    await client.save(guild.id, {
        alter: 'ap.tr',
        value: roles.map(role => role.id)
    });
    await refreshGuild(client, guild.id);

    const broken = [];

    for (const guestId of guild.ap.h)
    {
        const guestDoc = await client.module.database.Guild(guestId).catch(() => null);
        const guest = await describeGuild(client, guestId);
        const name = guest?.name ?? guestId;

        if (!guestDoc?.ap?.c)
        {
            broken.push(`**-** **${name}** has no appeal channel yet - \`=appealchannel <channel id> ${guestId}\`.`);

            continue;
        }

        const check = await canOpenPrivateThreads(client, guild.id, guestDoc.ap.c);

        if (!check)
        {
            broken.push(`**-** **${name}**'s appeal channel (\`${guestDoc.ap.c}\`) cannot be seen from any cluster.`);
        }
        else if (!check.ok)
        {
            broken.push(check.reason === 'notText'
                ? `**-** <#${guestDoc.ap.c}> (**${name}**) is not a normal text channel, and only those have private threads.`
                : `**-** <#${guestDoc.ap.c}> (**${name}**) - I am missing \`${check.missing.join('`, `')}\` there.`);
        }
    }

    return reply([
        `Ban appeals now open a **private thread** each, and ${listOf(roles.map(entry => `**${entry.name}**`))} ${roles.length > 1
            ? 'are'
            : 'is'} added to every one.`,
        '',
        `The appellant is added automatically when they join. Only they and ${roles.length > 1
            ? 'those roles'
            : 'that role'} can see their thread.`,
        ...broken.length
            ? [
                '',
                '**⚠ It will not work yet:**',
                ...broken,
                '',
                'Fix the above and it starts working immediately - the setting is saved either way. `=appealchannel status` re-checks.'
            ]
            : []
    ].join('\n'));
};

const point = async (client, message, guild, channelId, guestId, reply) =>
{

    if (guild.ap.on && guild.ap.p)
    {
        const inPartner = await describeChannel(client, guild.ap.p, channelId);

        if (inPartner)
        {
            await client.save(guild.id, {
                alter: 'ap.c',
                value: channelId
            });
            await refreshGuild(client, guild.id);

            const invite = await inviteTo(client, guild.ap.p, channelId);

            return reply(`Members banned **here** now appeal in **#${inPartner.name}** over in **${inPartner.guild}**.${invite
                ? `\n${invite}`
                : ''}`);
        }
    }

    const here = await describeChannel(client, guild.id, channelId);

    if (!here)
    {
        return reply(guild.ap.on && guild.ap.p
            ? 'That channel is in neither this server nor the one hosting its appeals.'
            : 'That channel is not in this server.\n\nIf you meant to link two servers, run `=appealchannel` here and then again over there - it takes no ids.');
    }

    const guests = guild.ap.h ?? [];

    if (!guests.length)
    {
        return reply('No server appeals here, so there is nothing to point at that channel.\n\nRun `=appealchannel` in the server whose bans should be appealable, then run it again here.');
    }

    if (guestId && !guests.includes(guestId))
    {
        return reply('That server does not appeal here.');
    }

    if (!guestId && guests.length > 1)
    {
        const named = await Promise.all(guests.map(async id => `**-** **${(await describeGuild(client, id))?.name ?? id}** \`${id}\``));

        return reply(`**${guests.length}** servers appeal here, so say which one that channel is for:\n${named.join('\n')}\n\n\`=appealchannel ${channelId} <that server's id>\``);
    }

    const owner = guestId ?? guests[0];

    await client.save(owner, {
        alter: 'ap.c',
        value: channelId
    });

    await refreshGuild(client, owner);

    const guest = await describeGuild(client, owner);

    return reply(`Members banned in **${guest?.name ?? 'the linked server'}** now appeal in **<#${channelId}>** here.`);
};
const ensureChannel = async (client, guildDoc, guildName, hostId) =>
{
    if (guildDoc.ap?.c)
    {
        const existing = await describeChannel(client, hostId, guildDoc.ap.c);

        if (existing)
        {
            return {
                id:   existing.id,
                name: existing.name
            };
        }
    }

    const created = await createChannelOn(client, hostId, {
        name:   `appeals-${slug(guildName)}`,
        topic:  `Ban appeals for ${guildName}. Banned members are sent an invite here.`,
        reason: `Ban appeal channel for ${guildName}`
    });

    if (!created?.id)
    {
        return {
            id:    null,
            error: created?.error ?? 'Relaxy is not in that server'
        };
    }

    const ownerId = guildDoc.id ?? guildDoc.g;

    await client.save(ownerId, {
        alter: 'ap.c',
        value: created.id
    });

    await refreshGuild(client, ownerId);

    return created;
};

const statusPicker = async (client, message, guild, interaction) =>
{
    const overview = await status(client, message, guild);

    const choices = [];

    if (guild.ap.on && guild.ap.p)
    {
        const partner = await describeGuild(client, guild.ap.p);

        choices.push({
            value:       `host:${guild.ap.p}`,
            label:       partner?.name ?? guild.ap.p,
            description: 'Hosts this server\'s appeals',
            emoji:       '📤'
        });
    }

    for (const guestId of guild.ap.h ?? [])
    {
        const guest = await describeGuild(client, guestId);

        choices.push({
            value:       `guest:${guestId}`,
            label:       guest?.name ?? guestId,
            description: 'Appeals here',
            emoji:       '📥'
        });
    }

    if (choices.length < 2)
    {
        return client.send(interaction
            ? 1
            : message.channel, null, [overview]);
    }

    return new client.class.picker(client).run({
        message,
        interaction,
        id:          'appealui',
        placeholder: 'Select a link to see it on its own…',
        choices,
        empty:       overview,
        render:      async value =>
                     {
                         const [side, guildId] = value.split(':');

                         return { embeds: [await linkDetail(client, message, guild, side, guildId)] };
                     }
    });
};

const linkDetail = async (client, message, guild, side, guildId) =>
{
    const other = await describeGuild(client, guildId);
    const name = other?.name ?? guildId;

    const fields = [];

    if (side === 'host')
    {

        const channel = guild.ap.c
            ? await describeChannel(client, guildId, guild.ap.c)
            : null;

        fields.push({
            name:  'Members banned here appeal in',
            value: channel
                       ? `**#${channel.name}** \`${channel.id}\`, over in **${name}**`
                       : '*No channel yet* - `=appealchannel <channel id>`'
        }, {
            name:  'Direction',
            value: `**This server → ${name}**\nIt does nothing for members banned in **${name}**.`
        });
    }
    else
    {
        const guestDoc = await client.module.database.Guild(guildId);
        const channel = guestDoc.ap?.c
            ? await describeChannel(client, guild.id, guestDoc.ap.c)
            : null;

        fields.push({
            name:  `Members banned in ${name} appeal in`,
            value: channel
                       ? `<#${channel.id}>`
                       : '*No channel set* - `=appealchannel <channel id>`'
        }, {
            name:  'Direction',
            value: `**${name} → this server**\nIt does nothing for members banned here.`
        });

        const warning = await threadWarning(client, guild, [
            {
                id:         guildId,
                name,
                channel,
                hasChannel: Boolean(guestDoc.ap?.c),
                pointsHere: guestDoc.ap?.p === guild.id,
                bans:       await canReadBans(client, guildId)
            }
        ]);

        fields.push({
            name:  'Appeal threads',
            value: threadLine(guild, warning)
        });
    }

    fields.push({
        name:  'Unlink',
        value: '`=appealchannel off` drops **every** link on this server - there is no per-link unlink.'
    });

    return {
        color:       client.data.embedColor,
        author:      {
            name:     `Ban appeals - ${name}`,
            icon_url: other?.icon ?? client.utils.guildIcon(message.guild)
        },
        description: `\`${guildId}\``,
        fields,
        footer:      client.data.footer,
        timestamp:   new Date().toISOString()
    };
};

const threadWarning = async (client, guild, hosted) =>
{
    const lines = [];

    for (const guest of hosted)
    {

        if (guest.bans && !guest.bans.ok)
        {
            lines.push(`**-** I cannot read **${guest.name}**'s ban list${guest.bans.reason
                ? ` (${guest.bans.reason})`
                : ' - I need `Ban Members` there'}, so I cannot recognise their banned members when they arrive.`);
        }

        if (!guest.hasChannel)
        {
            lines.push(`**-** **${guest.name}** has no appeal channel set. Run \`=appealchannel <channel id> ${guest.id}\` here.`);
        }
        else if (!guest.pointsHere)
        {
            lines.push(`**-** **${guest.name}** is listed as appealing here, but their own link points somewhere else. Re-run the handshake, or \`=appealchannel off\` there.`);
        }
        else if (!guest.channel)
        {
            lines.push(`**-** **${guest.name}**'s appeal channel no longer exists here. Set a new one with \`=appealchannel <channel id> ${guest.id}\`.`);
        }
    }

    const checks = await Promise.all(hosted
        .filter(guest => guest.channel && guest.hasChannel && guest.pointsHere)
        .map(async guest => ({
            guest,
            check: await canOpenPrivateThreads(client, guild.id, guest.channel.id)
        })));
    for (const {
        guest,
        check
    } of checks.filter(({ check }) => check && !check.ok))
    {
        lines.push(check.reason === 'notText'
            ? `**-** <#${guest.channel.id}> (**${guest.name}**) is not a normal text channel, and only those have private threads.`
            : `**-** <#${guest.channel.id}> (**${guest.name}**) - Relaxy is missing \`${check.missing.join('`, `')}\``);
    }

    if (!lines.length)
    {
        return '';
    }

    return `\n\n**⚠ This is not working right now.**\n${lines.join('\n')}\n\nFix the above, or \`=appealchannel thread off\` to stop pretending.`;
};

const status = async (client, message, guild) =>
{
    const fields = [];

    if (guild.ap.on && guild.ap.p)
    {
        const partner = await describeGuild(client, guild.ap.p);
        const mine = guild.ap.c
            ? await describeChannel(client, guild.ap.p, guild.ap.c)
            : null;

        fields.push({
            name:  'Members banned here appeal in',
            value: `${mine
                ? `**#${mine.name}**`
                : '*No channel yet - `=appealchannel <channel id>`*'} over in **${partner?.name ?? guild.ap.p}**${partner
                ? ` \`${partner.id}\``
                : ' *(Relaxy is no longer in it)*'}`
        });
    }
    else
    {
        fields.push({
            name:  'Members banned here have nowhere to appeal',
            value: 'A banned member cannot post in the server that banned them, so appeals are hosted by **another server** you help run.\n\nRun `=appealchannel` here, then run it again over there. The same person has to run both, which is what proves you help run both - no ids to paste.'
        });
    }

    if (guild.ap.h?.length)
    {
        const hosted = await Promise.all(guild.ap.h.map(async guestId =>
        {
            const guest = await describeGuild(client, guestId);
            const guestDoc = await client.module.database.Guild(guestId);
            const channel = guestDoc.ap?.c
                ? await describeChannel(client, guild.id, guestDoc.ap.c)
                : null;

            return {
                id:         guestId,
                name:       guest?.name ?? guestId,
                channel,
                hasChannel: Boolean(guestDoc.ap?.c),
                pointsHere: guestDoc.ap?.p === guild.id,
                bans:       await canReadBans(client, guestId)
            };
        }));

        fields.push({
            name:  `Appeals hosted here [${guild.ap.h.length}]`,
            value: hosted.map(guest => `**-** **${guest.name}** - ${guest.channel
                ? `<#${guest.channel.id}>`
                : '*no channel set*'}`).join('\n').slice(0, 1024)
        }, {
            name:  'Appeal threads',
            value: threadLine(guild, await threadWarning(client, guild, hosted))
        });
    }

    const proposal = await readProposal(client, message.author.id, 'ap');

    if (proposal)
    {
        const from = await describeGuild(client, proposal.guild);

        fields.push({
            name:  'Waiting on you',
            value: `You started an appeal link in **${from?.name ?? proposal.guild}**${proposal.guild === guild.id
                ? ' *(here)*'
                : ''}, so members banned there are the ones who will appeal.\n\nRun \`=appealchannel\` in the server that should **host** those appeals to finish it${proposal.guild === guild.id
                ? ''
                : ' - running it **here** hosts them here'}. Expires <t:${Math.floor((proposal.at + PROPOSAL_TTL) / 1000)}:R>, or \`=appealchannel cancel\` drops it.`
        });
    }

    fields.push({
        name:  'Ban message',
        value: guild.bnm?.on && guild.bnm.dt
                   ? 'Set - the appeal invite is sent right after it. (`=ban message`)'
                   : 'None. The appeal invite is sent on its own. (`=ban message`)'
    });

    return {
        color:     client.data.embedColor,
        author:    {
            name:     'Ban appeals',
            icon_url: client.utils.guildIcon(message.guild)
        },
        fields,
        footer:    client.data.footer,
        timestamp: new Date().toISOString()
    };
};
