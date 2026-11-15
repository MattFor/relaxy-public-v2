'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';
import { defaultWordBlacklist } from '../../../src/Core/DataTable.js';

import {
    KIND_LABELS,
    GLOBAL_SCOPE,
    patternError,
    resolveServerInput
} from '../../../src/Client/Modules/Moderation/CensorExceptions.js';

const FEATURE_INFO = {
    scams: {
        icon: '🛡️',
        title: 'All common Discord scams',
        blurb: 'Fake Nitro, Steam and giveaway links, crypto and casino spam, "free gift" pages - caught by domain and by wording, not by one fixed list. **Posted screenshots are read too**, so a scam with no text in the message still gets caught.'
    },
    links: {
        icon: '🔗',
        title: 'All internet links',
        blurb: 'Every URL, whoever posts it. Let individual sites through with an exception below.'
    },
    invites: {
        icon: '📨',
        title: 'All Discord invites',
        blurb: 'Every invite link, however it is written. Allow your own servers with a `Server` exception.'
    },
    spam: {
        icon: '🗯️',
        title: 'Spam text',
        blurb: 'Messages Relaxy reads as spam on their own - repeat walls, mention floods, gibberish.'
    },
    spammessages: {
        icon: '♻️',
        title: 'Repeated messages',
        blurb: 'The same message posted over and over in a short window.'
    }
};

const FEATURES = Object.keys(FEATURE_INFO);

const SCAM_INFO_URL = 'https://discord.com/safety';

const POOL_BUDGET = 1500;

const PAGE_SIZE = 24;
const NONE = -2;
const GLOBAL = -1;

const SEP = '~';

const KIND_ORDER = ['ex', 'rx', 'gd', 'us', 'rl'];

const KIND_HELP = {
    ex: {
        blurb: 'Plain text - no regex needed.',
        label: 'Text that lets it through',
        placeholder: 'github.com'
    },
    rx: {
        blurb: 'A pattern, for when plain text is not enough.',
        label: 'Regex pattern',
        placeholder: 'youtube\\.com|youtu\\.be'
    },
    gd: {
        blurb: 'Allow invites to one server, whatever the code.',
        label: 'Server ID, or any invite to that server',
        placeholder: 'discord.gg/abc   or   123456789012345678'
    },
    us: {
        blurb: 'This member does not trigger this rule.',
        label: 'Member ID or @mention',
        placeholder: '@someone'
    },
    rl: {
        blurb: 'Anyone with this role does not trigger this rule.',
        label: 'Role ID or @mention',
        placeholder: '@Trusted'
    }
};
const idOf = (raw) => {
    const id = String(raw ?? '')
        .trim()
        .replace(/^<@[!&]?/, '')
        .replace(/>$/, '');

    return /^\d{16,20}$/.test(id) ? id : null;
};
const scopeOf = (guild, index) => (index === GLOBAL ? GLOBAL_SCOPE : guild.cn.li[index]);

const exceptionsOf = (guild) => (Array.isArray(guild.cn.ex) ? guild.cn.ex : []);
const describe = (exception) => {
    switch (exception.t) {
        case 'us':
            return `<@${exception.v}>`;

        case 'rl':
            return `<@&${exception.v}>`;

        case 'gd':
            return `server \`${exception.v}\``;

        case 'rx':
            return `\`/${exception.v}/i\``;

        default:
            return `\`${exception.v}\``;
    }
};

const protections = (entries) => {
    const on = FEATURES.filter((feature) => entries.includes(feature));

    if (!on.length) {
        return `### No protection rules on\nOnly the word list below is censored. Turn a rule on with \`=censor scams\`, \`=censor links\`, \`=censor invites\`, \`=censor spam\` or \`=censor spammessages\`.\n-# New to this? [What Discord scams look like](${SCAM_INFO_URL})`;
    }

    const lines = on.map((feature) => {
        const info = FEATURE_INFO[feature];

        return `${info.icon} **${info.title}**\n-# ${info.blurb}`;
    });

    if (on.includes('scams')) {
        lines.push(
            `-# Read more: [what Discord scams look like](${SCAM_INFO_URL}) · test anything with \`=censortest\` (words **and** images).`
        );
    }

    return `### Protecting this server\n${lines.join('\n')}`;
};

const pool = (entries, budget) => {
    if (!entries.length) {
        return 'None.';
    }

    const parts = entries.map((entry) => (FEATURES.includes(entry) ? `**\`${entry}\`**` : entry));

    let text = '';
    let shown = 0;

    for (const part of parts) {
        const next = shown ? `${text}, ${part}` : part;
        if (next.length > budget - 24) {
            break;
        }

        text = next;
        shown++;
    }

    if (shown === parts.length) {
        return `${text}.`;
    }

    return `${text}${shown ? ', ' : ''}*+${parts.length - shown} more*`;
};

const body = (entries) =>
    `${protections(entries)}\n\n**Censored entries - ${entries.length}**\n${pool(entries, POOL_BUDGET)}`.slice(0, 4096);

const panel = (client, guild, page, index) => {
    const entries = guild.cn.li;
    const exceptions = exceptionsOf(guild);
    const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));

    page = Math.min(Math.max(page, 0), pages - 1);
    if (index >= entries.length) {
        index = NONE;
    }

    const countFor = (scope) => exceptions.filter((exception) => exception.s === scope).length;

    const embed = {
        color: client.data.embedColor,
        title: 'Censoring',
        description: body(entries),
        fields: [],
        footer: client.data.footer
    };

    if (index !== NONE) {
        const scope = scopeOf(guild, index);
        const mine = exceptions.filter((exception) => exception.s === scope);

        const grouped = KIND_ORDER.map((kind) => {
            const of = mine.filter((exception) => exception.t === kind);

            return of.length === 0
                ? null
                : `**${KIND_LABELS[kind]}**\n${of.map((exception) => `- ${describe(exception)}`).join('\n')}`;
        })
            .filter(Boolean)
            .join('\n');

        embed.fields.push({
            name:
                scope === GLOBAL_SCOPE
                    ? `Exceptions - all rules (${mine.length})`
                    : `Exceptions for "${scope}" (${mine.length})`,
            value: (grouped || 'None yet. Add one below.').slice(0, 1024)
        });
    }

    const options = [
        {
            label: 'All rules (global)',
            value: String(GLOBAL),
            description: `Applies to every rule at once - ${countFor(GLOBAL_SCOPE)} exception(s)`,
            default: index === GLOBAL
        }
    ];

    for (let i = page * PAGE_SIZE; i < Math.min((page + 1) * PAGE_SIZE, entries.length); i++) {
        const count = countFor(entries[i]);

        options.push({
            label: entries[i].slice(0, 100),
            value: String(i),
            description: `${FEATURES.includes(entries[i]) ? 'Feature' : 'Word'} - ${count} exception(s)`.slice(0, 100),
            default: index === i
        });
    }

    const picker = new Discord.StringSelectMenuBuilder()
        .setCustomId(`censor_pick${SEP}${page}`)
        .setPlaceholder(pages > 1 ? `Pick an entry to manage (page ${page + 1}/${pages})` : 'Pick an entry to manage')
        .addOptions(options);

    const adder = new Discord.StringSelectMenuBuilder()
        .setCustomId(`censor_kind${SEP}${page}${SEP}${index}`)
        .setPlaceholder(index === NONE ? 'Add an exception (pick an entry first)' : 'Add an exception...')
        .setDisabled(index === NONE)
        .addOptions(
            KIND_ORDER.map((kind) => ({
                label: KIND_LABELS[kind],
                value: kind,
                description: KIND_HELP[kind].blurb.slice(0, 100)
            }))
        );

    const buttons = [];

    if (pages > 1) {
        buttons.push(
            new Discord.ButtonBuilder()
                .setCustomId(`censor_prev${SEP}${page}${SEP}${index}`)
                .setLabel('◀')
                .setStyle(Discord.ButtonStyle.Secondary)
                .setDisabled(page === 0),

            new Discord.ButtonBuilder()
                .setCustomId(`censor_next${SEP}${page}${SEP}${index}`)
                .setLabel('▶')
                .setStyle(Discord.ButtonStyle.Secondary)
                .setDisabled(page >= pages - 1)
        );
    }

    buttons.push(
        new Discord.ButtonBuilder()
            .setCustomId(`censor_clear${SEP}${page}${SEP}${index}`)
            .setLabel('Clear these')
            .setStyle(Discord.ButtonStyle.Danger)
            .setDisabled(index === NONE || countFor(scopeOf(guild, index)) === 0),

        new Discord.ButtonBuilder()
            .setCustomId(`censor_clearall${SEP}${page}${SEP}${index}`)
            .setLabel('Clear ALL exceptions')
            .setStyle(Discord.ButtonStyle.Danger)
            .setDisabled(exceptions.length === 0)
    );

    return {
        embeds: [embed],
        components: [
            new Discord.ActionRowBuilder().addComponents(picker),
            new Discord.ActionRowBuilder().addComponents(adder),
            new Discord.ActionRowBuilder().addComponents(buttons)
        ]
    };
};

export default {
    name: 'censor',
    usage: '=censor [words|clear|off]',
    description:
        "Censor every message that includes any of the words mentioned, unlocks =autoname and =autoban.\nType first argument as 'clear' to remove all censored words, 'off' to turn censoring off and type nothing to open the censor panel.\nP.S typing '+default' after already having it on without the default pool will add it. Similarly, typing -default will remove the default list.\nIf you add 'links' then ALL links will be censored.\nIf you add `scams` all common Discord scam links will be censored - and **posted screenshots are read too**, so a scam with no text in the message is still caught.\nIf you add 'invites' all discord invites will be censored.\nAdd 'spam' to censor messages Relaxy! considers spam.\nAdd 'spammessages' to censor similar messages that are spammed in a short period of time.\n\nThe panel opened by a bare =censor lists every censored entry. Pick one to see and manage its **exceptions** - the reasons NOT to censor something it would otherwise catch (censor every link except YouTube, every invite except the ones to your own servers, and so on).\n\nIf an argument is in italics (starts and ends with a \*) then all `-` (dashes) will be checked as if they were spaces.",

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_GUILD'],
    permissionsBot: ['SEND_MESSAGES', 'MANAGE_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        if (interaction?.customId?.startsWith('censor_')) {
            if (!interaction.memberPermissions?.has(Discord.PermissionFlagsBits.ManageGuild)) {
                return 0b01100101_01110010_01110010_01101111_01110010;
            }

            const [action, rawPage, rawIndex, kind] = interaction.customId.slice('censor_'.length).split(SEP);

            let page = Number(rawPage) || 0;
            let index = Number.isInteger(Number(rawIndex)) ? Number(rawIndex) : NONE;

            const exceptions = exceptionsOf(guild);

            const refuse = (text) =>
                interaction.reply({
                    embeds: [
                        {
                            color: 16711680,
                            description: text
                        }
                    ],
                    flags: Discord.MessageFlags.Ephemeral
                });

            const commit = (value) => {
                guild.cn.ex = value;

                client.save(guild.id, {
                    alter: 'cn.ex',
                    value
                });
            };

            switch (action) {
                case 'pick': {
                    index = Number(interaction.values[0]);
                    break;
                }

                case 'prev': {
                    page--;
                    break;
                }

                case 'next': {
                    page++;
                    break;
                }

                case 'clear': {
                    if (index === NONE) {
                        break;
                    }

                    const scope = scopeOf(guild, index);
                    commit(exceptions.filter((exception) => exception.s !== scope));
                    break;
                }

                case 'clearall': {
                    commit([]);
                    break;
                }

                case 'kind': {
                    if (index === NONE) {
                        return void refuse('Pick an entry first.');
                    }

                    const help = KIND_HELP[interaction.values[0]];

                    return void (await interaction.showModal(
                        new Discord.ModalBuilder()
                            .setCustomId(`censor_modal${SEP}${page}${SEP}${index}${SEP}${interaction.values[0]}`)
                            .setTitle(`Except: ${KIND_LABELS[interaction.values[0]]}`.slice(0, 45))
                            .addComponents(
                                new Discord.ActionRowBuilder().addComponents(
                                    new Discord.TextInputBuilder()
                                        .setCustomId('value')
                                        .setLabel(help.label.slice(0, 45))
                                        .setPlaceholder(help.placeholder.slice(0, 100))
                                        .setStyle(Discord.TextInputStyle.Short)
                                        .setRequired(true)
                                        .setMaxLength(200)
                                )
                            )
                    ));
                }

                case 'modal': {
                    const raw = interaction.fields.getTextInputValue('value').trim();
                    const scope = scopeOf(guild, index);

                    let value = raw;

                    if (kind === 'rx') {
                        const error = patternError(raw);

                        if (error) {
                            return void refuse(error);
                        }
                    }

                    if (kind === 'us' || kind === 'rl') {
                        value = idOf(raw);

                        if (!value) {
                            return void refuse(
                                `\`${raw}\` is not a ${kind === 'us' ? 'member' : 'role'} - give an ID or a mention.`
                            );
                        }
                    }

                    if (kind === 'gd') {
                        value = await resolveServerInput(client, raw);

                        if (!value) {
                            return void refuse(
                                `Could not work out which server \`${raw}\` points at. Give a server ID, or an invite that still works.`
                            );
                        }
                    }

                    const already = exceptions.some(
                        (exception) => exception.s === scope && exception.t === kind && exception.v === value
                    );

                    if (already) {
                        return void refuse('That exception is already there.');
                    }

                    commit([
                        ...exceptions,
                        {
                            s: scope,
                            t: kind,
                            v: value
                        }
                    ]);

                    break;
                }
            }

            const view = panel(client, guild, page, index);

            return void client.update(interaction, null, view.embeds, null, null, view.components);
        }

        let censored = guild.cn.li;

        const added = [];
        const removed = [];

        const embed = {
            color: client.data.embedColor,
            title: 'Censoring',
            fields: [],
            footer: client.data.footer
        };

        if (guild.cn?.on) {
            if (args[0]) {
                switch (args[0].toLowerCase()) {
                    case 'clear': {
                        client.save(guild.id, {
                            alter: 'cn.li',
                            value: []
                        });

                        if (censored.length > 0) {
                            embed.fields.push({
                                name: `Removed - ${censored.length}:`,
                                value: pool(censored, 1024)
                            });
                        }

                        embed.description = body([]);

                        return client.send(message.channel, null, [embed]);
                    }

                    case '+default': {
                        client.qEmbed('Adding default censoring pool.', interaction ?? message);

                        censored = censored.concat(defaultWordBlacklist);
                        censored = [...new Set(censored)];

                        embed.fields = null;
                        embed.description = body(censored);

                        client.save(guild.id, {
                            alter: 'cn.li',
                            value: censored
                        });
                        return client.send(message.channel, null, [embed]);
                    }

                    case '-default': {
                        client.qEmbed('Removing default censoring pool.', interaction ?? message);

                        censored = censored.filter((i) => !defaultWordBlacklist.includes(i));

                        embed.fields = null;
                        embed.description = body(censored);

                        client.save(guild.id, {
                            alter: 'cn.li',
                            value: censored
                        });
                        return client.send(message.channel, null, [embed]);
                    }

                    case 'off': {
                        client.save(guild.id, {
                            alter: 'cn.on',
                            value: false
                        });
                        return client.qEmbed('Censoring has been turned off.', interaction ?? message);
                    }
                }
            }

            if (args.length === 0) {
                const view = panel(client, guild, 0, NONE);

                return client.send(message.channel, null, view.embeds, null, null, view.components);
            }

            for (let i = 0; i < args.length; i++) {
                if (args.includes('censor')) {
                    continue;
                }

                if (censored.includes(args[i])) {
                    removed.push(args[i]);
                    censored.splice(censored.indexOf(args[i]), 1);
                    continue;
                }

                added.push(args[i]);
                censored.push(args[i]);
            }

            client.save(guild.id, {
                alter: 'cn.li',
                value: censored
            });

            if (removed.length > 0) {
                const survivors = exceptionsOf(guild).filter((exception) => !removed.includes(exception.s));

                if (survivors.length !== exceptionsOf(guild).length) {
                    guild.cn.ex = survivors;

                    client.save(guild.id, {
                        alter: 'cn.ex',
                        value: survivors
                    });
                }
            }

            if (added.length > 0) {
                embed.fields.push({
                    name: `Added - ${added.length}:`,
                    value: pool(added, 1024)
                });
            }

            if (removed.length > 0) {
                embed.fields.push({
                    name: `Removed - ${removed.length}:`,
                    value: pool(removed, 1024)
                });
            }

            embed.description = body(censored);

            return client.send(message.channel, null, [embed]);
        }

        if (!args[0] && censored.length > 0) {
            client.qEmbed('Censoring re-enabled, using old censor pool.', interaction ?? message);
            return client.save(guild.id, {
                alter: 'cn.on',
                value: true
            });
        }

        if (!args[0]) {
            client.qEmbed('No words to censor specified, using default pool!', interaction ?? message);
            return client.save(
                guild.id,
                {
                    alter: 'cn.li',
                    value: defaultWordBlacklist
                },
                {
                    alter: 'cn.on',
                    value: true
                }
            );
        }

        client.save(
            guild.id,
            {
                alter: 'cn.li',
                value: args
            },
            {
                alter: 'cn.on',
                value: true
            }
        );
        return client.qEmbed(`Added censoring to ${message.guild.name}!`, interaction ?? message);
    }
};
