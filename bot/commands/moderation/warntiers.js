'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { ANY_TIER, MAX_MUTE_MS, TIER_ACTIONS } from '../../../src/Client/Modules/Moderation/Moderation.js';

const MAX_RULES_PER_TIER = 10;

const duration = (input) => {
    const match =
        /^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?)?$/i.exec(
            String(input ?? '').trim()
        );

    if (!match) {
        return null;
    }

    const amount = Number(match[1]);
    const unit = (match[2] ?? 'm').toLowerCase();

    const scale = unit.startsWith('s')
        ? 1000
        : unit.startsWith('h')
          ? 3600000
          : unit.startsWith('d')
            ? 86400000
            : unit.startsWith('w')
              ? 604800000
              : 60000;

    return Math.round(amount * scale);
};

const resolveRuleRole = async (client, message, args, index) => {
    if (!Array.isArray(args) || args.length <= index) {
        return null;
    }

    if (/\d{16,22}/.test(String(args[index]))) {
        const byRef = await client.utils.role(message, args.slice(0, index + 1), index);

        if (byRef) {
            return {
                role: byRef,
                tokens: 1
            };
        }
    }

    for (let take = args.length - index; take >= 1; take--) {
        const found = await client.utils.role(message, args.slice(0, index + take), index);

        if (found) {
            return {
                role: found,

                tokens: take
            };
        }
    }

    return null;
};
const tierKey = (input) => {
    const raw = String(input ?? '')
        .trim()
        .toLowerCase();

    if (raw === ANY_TIER || raw === 'all' || raw === '*') {
        return ANY_TIER;
    }

    const number = Number(raw);

    return Number.isInteger(number) && number >= 0 && number <= 30 ? String(number) : null;
};
const describe = (client, guild, rule) => {
    const spec = TIER_ACTIONS[rule.a] ?? {
        label: rule.a,
        emoji: '❔'
    };

    const extra =
        rule.a === 'mute'
            ? ` for **${rule.d > 0 ? client.imports.time(rule.d) : 'ever'}**`
            : spec.needsRole
              ? ` **${guild.roles.cache.get(rule.r)?.name ?? `deleted role ${rule.r}`}**`
              : '';

    return `**${rule.n}** → ${spec.emoji} ${spec.label}${extra}${
        rule.rs ? `\n-# Reason: ${client.utils.inlineText(rule.rs, { limit: 100 })}` : ''
    }`;
};
const overview = (client, message, ladder) => {
    const keys = Object.keys(ladder).sort((a, b) => (a === ANY_TIER ? -1 : b === ANY_TIER ? 1 : Number(a) - Number(b)));

    const fields = keys
        .filter((key) => Array.isArray(ladder[key]) && ladder[key].length)
        .map((key) => ({
            name: key === ANY_TIER ? 'Any warning' : `Tier ${key} warnings`,
            value: [...ladder[key]]
                .sort((a, b) => a.n - b.n)
                .map((rule) => describe(client, message.guild, rule))
                .join('\n')
                .slice(0, 1024)
        }));

    return {
        color: client.data.embedColor,
        author: {
            name: `Warning ladder - ${message.guild.name}`,
            icon_url: client.utils.guildIcon(message.guild)
        },
        description: fields.length
            ? 'What a warning earns here, and at which count. A rule fires on the warning that **crosses** its number, once - not on every warning after it.\n\nOnly the most severe rule crossed by one warning is carried out.'
            : 'No rules yet - a warning here only counts towards `=autoban`.\n\n**Add one:** `=warntiers add <tier|any> <count> <action> [duration|role]`\nActions: `mute`, `kick`, `ban`, `role+`, `role-`.\n\n**For example**\n`=warntiers add any 3 mute 1h` - three warnings of any tier, muted for an hour.\n`=warntiers add any 5 kick`\n`=warntiers add 10 1 ban` - a single tier-10 warning is a ban.\n`=warntiers add any 2 role+ Watched`',
        fields,
        footer: client.data.footer,
        timestamp: new Date()
    };
};

export default {
    name: 'warntiers',
    aliases: ['warntier', 'warningtier', 'warningtiers', 'warnactions', 'warnladder', 'tieractions'],
    usage: '=warntiers [add <tier|any> <count> <action> [duration|role] [reason] | remove <tier|any> <count> | clear]',
    description:
        'Decide what a warning actually **does** here, per tier.\n\n`=autoban` sets one number for the whole server - warnings before a ban. This is the rest of the ladder: on the **nth** warning of a given **tier**, mute / kick / ban them, or add / remove a role.\n\n**Adding a rule**\n`=warntiers add <tier|any> <count> <action> [duration|role] [reason]`\n**-** `tier` is `0`-`30`, or **any** to count every warning whatever its tier.\n**-** `action` is `mute`, `kick`, `ban`, `role+` or `role-`.\n**-** a mute takes a duration (`30m`, `1h`, `2d`; a bare number is minutes; omit it for permanent).\n**-** `role+` / `role-` take the role.\n\n**Examples**\n`=warntiers add any 3 mute 1h`\n`=warntiers add any 5 kick`\n`=warntiers add 10 1 ban` - one tier-10 warning is enough.\n`=warntiers add any 2 role+ Watched`\n\n**Removing** `=warntiers remove <tier|any> <count>`, or `=warntiers clear` for all of them.\n\nA rule fires on the warning that **crosses** its count and not again, and only the most severe rule crossed by any one warning is carried out - somebody who trips the mute rule and the ban rule at once is banned, not both. It applies to every warning, including the ones Relaxy issues itself for censored words.',
    slashDescription: 'Set what a warning does here - mute, kick, ban or a role, per tier and count.',

    slash: new Discord.SlashCommandBuilder()
        .addStringOption((option) =>
            option.setName('action').setDescription('What to do with the ladder.').setRequired(false).addChoices(
                {
                    name: 'show',
                    value: 'show'
                },
                {
                    name: 'add',
                    value: 'add'
                },
                {
                    name: 'remove',
                    value: 'remove'
                },
                {
                    name: 'clear',
                    value: 'clear'
                }
            )
        )
        .addStringOption((option) =>
            option.setName('tier').setDescription('Warning tier 0-30, or "any" for all warnings.').setRequired(false)
        )
        .addIntegerOption((option) =>
            option
                .setName('count')
                .setDescription('Fire on this many warnings of that tier.')
                .setMinValue(1)
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('punishment')
                .setDescription('mute, kick, ban, role+ or role-.')
                .setRequired(false)
                .addChoices(
                    ...Object.entries(TIER_ACTIONS).map(([value, spec]) => ({
                        name: spec.label,
                        value
                    }))
                )
        )
        .addStringOption((option) =>
            option.setName('duration').setDescription('For a mute: 30m, 1h, 2d. Omit for permanent.').setRequired(false)
        )
        .addRoleOption((option) =>
            option.setName('role').setDescription('For role+ / role-: the role to add or remove.').setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason recorded on the case. Defaults to naming the rule.')
                .setRequired(false)
        ),

    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_GUILD'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],
    suggestedPermissionsBot: ['BAN_MEMBERS', 'KICK_MEMBERS', 'MANAGE_ROLES'],

    async run(client, message, args, guild, interaction) {
        const slash = interaction?.isChatInputCommand?.() === true;

        const mode = (slash ? interaction.options.getString('action') : args[0])?.toLowerCase() ?? 'show';

        const ladder = JSON.parse(JSON.stringify(guild.tr?.w ?? {}));

        if (mode === 'show' || !mode) {
            return client.send(interaction ? 1 : message.channel, null, [overview(client, message, ladder)]);
        }

        if (mode === 'clear') {
            if (!Object.keys(ladder).length) {
                return client.qEmbed(
                    'There is nothing to clear - this server has no warning rules.',
                    interaction ?? message
                );
            }

            await client.save(guild.id, {
                alter: 'tr.w',
                value: {}
            });

            return client.qEmbed(
                'Cleared every warning rule. Warnings now only count towards `=autoban`.',
                interaction ?? message
            );
        }

        const key = tierKey(slash ? interaction.options.getString('tier') : args[1]);

        if (!key) {
            return client.qEmbed(
                'Give a tier: a number from **0** to **30**, or **any** to count every warning.',
                interaction ?? message
            );
        }

        const count = Math.floor(Number(slash ? interaction.options.getInteger('count') : args[2]));

        if (!Number.isFinite(count) || count < 1 || count > 1000) {
            return client.qEmbed(
                'Give the warning count the rule fires on - a number from **1** upwards.',
                interaction ?? message
            );
        }

        if (mode === 'remove' || mode === 'delete' || mode === 'rm') {
            const existing = ladder[key] ?? [];
            const kept = existing.filter((rule) => Number(rule.n) !== count);

            if (kept.length === existing.length) {
                return client.qEmbed(
                    `There is no rule at **${count}** for ${key === ANY_TIER ? 'any warning' : `tier ${key}`}.`,
                    interaction ?? message
                );
            }

            if (kept.length) {
                ladder[key] = kept;
            } else {
                delete ladder[key];
            }

            await client.save(guild.id, {
                alter: 'tr.w',
                value: ladder
            });

            return client.qEmbed(
                `Removed the rule at **${count}** ${key === ANY_TIER ? 'warning(s)' : `tier ${key} warning(s)`}.`,
                interaction ?? message
            );
        }

        if (mode !== 'add' && mode !== 'set') {
            return client.qEmbed(
                `\`${mode}\` is not something this does. Try \`show\`, \`add\`, \`remove\` or \`clear\`.`,
                interaction ?? message
            );
        }

        const action = (slash ? interaction.options.getString('punishment') : args[3])?.toLowerCase();

        const spec = TIER_ACTIONS[action];

        if (!spec) {
            return client.qEmbed(
                `\`${action ?? 'nothing'}\` is not an action. Pick one of \`${Object.keys(TIER_ACTIONS).join('`, `')}\`.`,
                interaction ?? message
            );
        }

        const rule = {
            n: count,
            a: action
        };

        let consumed = 0;

        if (spec.takesDuration) {
            const raw = slash ? interaction.options.getString('duration') : args[4];

            const ms = raw ? duration(raw) : null;

            if (raw && ms === null && slash) {
                return client.qEmbed(
                    `\`${raw}\` is not a duration. Use something like \`30m\`, \`1h\` or \`2d\` - a bare number is read as minutes.`,
                    interaction ?? message
                );
            }

            if (ms !== null && ms > MAX_MUTE_MS) {
                return client.qEmbed(
                    `The longest mute Relaxy can apply is **10 years**, so a rule set to \`${raw}\` could never be carried out. Pick something shorter, or leave the duration off entirely for a permanent mute.`,
                    interaction ?? message
                );
            }

            rule.d = ms ?? 0;
            consumed = ms === null ? 0 : 1;
        }

        if (spec.needsRole) {
            const resolved = slash ? null : await resolveRuleRole(client, message, args, 4);

            const role = slash ? interaction.options.getRole('role') : (resolved?.role ?? null);

            consumed = slash ? 0 : (resolved?.tokens ?? 1);

            if (!role) {
                return client.qEmbed(
                    `\`${spec.label}\` needs a role - name it, mention it, or give its id.`,
                    interaction ?? message
                );
            }

            if (role.position >= message.guild.members.me.roles.highest.position) {
                return client.qEmbed(
                    `**${role.name}** is above Relaxy's own role, so Relaxy could never ${
                        action === 'role+' ? 'give' : 'take'
                    } it. Move Relaxy's role higher, or pick another.`,
                    interaction ?? message
                );
            }

            if (role.managed) {
                return client.qEmbed(
                    `**${role.name}** is managed by an integration, so nobody can add or remove it by hand.`,
                    interaction ?? message
                );
            }

            rule.r = role.id;
        }

        const reason = (
            (slash ? interaction.options.getString('reason') : args.slice(4 + consumed).join(' ')) ?? ''
        ).trim();

        if (reason) {
            const safe = await client.redact(reason, guild, message);

            rule.rs = safe.slice(0, 258);
        }

        const bucket = (ladder[key] ?? []).filter((entry) => Number(entry.n) !== count);

        if (bucket.length >= MAX_RULES_PER_TIER) {
            return client.qEmbed(
                `That tier already has **${MAX_RULES_PER_TIER}** rules, which is the most a ladder stays readable at. Remove one first.`,
                interaction ?? message
            );
        }

        const replaced = (ladder[key] ?? []).length !== bucket.length;

        bucket.push(rule);
        bucket.sort((a, b) => a.n - b.n);
        ladder[key] = bucket;

        await client.save(guild.id, {
            alter: 'tr.w',
            value: ladder
        });

        return client.send(interaction ? 1 : message.channel, null, [
            {
                color: client.data.embedColor,
                title: replaced ? 'Rule replaced' : 'Rule added',
                description: `${
                    key === ANY_TIER ? 'Any warning' : `Tier ${key} warnings`
                }\n${describe(client, message.guild, rule)}`,
                fields: [
                    {
                        name: 'When it fires',
                        value: `On the warning that takes them **to ${count}**, and not again. If another rule is crossed by the same warning, only the more severe one is carried out.`
                    }
                ],
                footer: client.data.footer,
                timestamp: new Date()
            }
        ]);
    }
};
