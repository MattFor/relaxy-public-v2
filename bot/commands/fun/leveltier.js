'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import {
    displayed,
    levelRules,
    LEVEL_ACTIONS,
    MAX_LEVELS,
    MAX_RULE_LEVEL,
    MAX_RULES_PER_LEVEL,
    MIN_RULE_LEVEL
} from '../../../src/Client/Modules/Progression/LevelRewards.js';

const MAX_MONEY = 1_000_000;

const ACTION_ALIASES = {
    role: 'role+',
    '+role': 'role+',
    addrole: 'role+',
    giverole: 'role+',
    'role-': 'role-',
    '-role': 'role-',
    removerole: 'role-',
    takerole: 'role-',
    cash: 'money',
    coins: 'money',
    currency: 'money',
    pay: 'money',
    cmd: 'command',
    perm: 'command',
    perms: 'command',
    permission: 'command',
    grant: 'command'
};

const actionKey = (input) => {
    const raw = String(input ?? '')
        .trim()
        .toLowerCase();

    return LEVEL_ACTIONS[raw] ? raw : (ACTION_ALIASES[raw] ?? null);
};

const levelKey = (input) => {
    const number = Number(String(input ?? '').trim());

    return Number.isInteger(number) && number >= MIN_RULE_LEVEL && number <= MAX_RULE_LEVEL ? number : null;
};

const strayLevelKey = (input, ladder) => {
    const number = Number(String(input ?? '').trim());

    return Number.isInteger(number) && Object.prototype.hasOwnProperty.call(ladder, String(number)) ? number : null;
};
const describe = (guild, prefix, rule) => {
    const spec = LEVEL_ACTIONS[rule.a] ?? {
        label: rule.a,
        emoji: '❔'
    };

    const target = spec.needsRole
        ? ` **${guild.roles.cache.get(rule.r)?.name ?? `deleted role ${rule.r}`}**`
        : spec.needsAmount
          ? ` **${Number(rule.m ?? 0).toLocaleString()}** money`
          : spec.needsCommand
            ? ` \`${prefix}${rule.c}\``
            : '';

    return `${spec.emoji} ${spec.label}${target}`;
};
const overview = (client, message, guild, prefix, ladder) => {
    const byLevel = new Map();

    for (const entry of levelRules({ tr: { l: ladder } })) {
        if (!byLevel.has(entry.level)) {
            byLevel.set(entry.level, []);
        }

        byLevel.get(entry.level).push(entry.rule);
    }

    const lines = [...byLevel.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(
            ([level, rules]) =>
                `**Level ${level}** - ${rules.map((rule) => describe(message.guild, prefix, rule)).join(' · ')}`
        );

    let description = lines.length
        ? `What levelling up earns here. Every rule at or below a member's level applies - the ladder is a state, not a one-off.\n\n${lines.join('\n')}`
        : `Nothing yet - levelling up here only moves the number.\n\n**Add a reward:** \`${prefix}leveltier add <level> <reward> [role | amount | command]\`\nRewards: \`role+\`, \`role-\`, \`money\`, \`command\`.\n\n**For example**\n\`${prefix}leveltier add 5 role+ Regular\`\n\`${prefix}leveltier add 25 role+ Veteran\`\n\`${prefix}leveltier add 25 role- Regular\` - a badge ladder, one role at a time.\n\`${prefix}leveltier add 10 money 500\`\n\`${prefix}leveltier add 30 command purge\``;
    if (description.length > 3900) {
        const kept = [];
        let size = 0;

        for (const line of lines) {
            if (size + line.length > 3600) {
                break;
            }

            kept.push(line);
            size += line.length + 1;
        }

        description = `${kept.join('\n')}\n\n-# …and ${lines.length - kept.length} more level(s).`;
    }

    return {
        color: client.data.embedColor,
        author: {
            name: `Level rewards - ${message.guild.name}`,
            icon_url: client.utils.guildIcon(message.guild)
        },
        description,
        fields: guild.lv?.on
            ? []
            : [
                  {
                      name: '⚠️ Levelling is off',
                      value: `Nobody gains levels here, so none of this can fire. Turn it on with \`${prefix}leveling\`.`
                  }
              ],
        footer: client.data.footer,
        timestamp: new Date()
    };
};

export default {
    name: 'leveltier',
    aliases: ['leveltiers', 'levelrole', 'levelroles', 'levelrewards', 'levelreward', 'levelladder'],
    usage: '=leveltier [add <level> <reward> [role|amount|command] | remove <level> [reward] | clear | sync [user|restart]]',
    description:
        "Decide what reaching a level actually **gives** people here.\n\n`=leveling` only turns levelling on and announces it. This is the rest: on **level n**, hand over a role, take one away, pay money, or grant a Relaxy command.\n\n**Adding a reward**\n`=leveltier add <level> <reward> [role | amount | command]`\n**-** `level` is the level members *see* - the one on their `=lvl` card - from **2** upwards.\n**-** `reward` is `role+`, `role-`, `money` or `command`.\n**-** `role+` / `role-` take the role, `money` takes an amount, `command` takes a command name.\n\n**Examples**\n`=leveltier add 5 role+ Regular`\n`=leveltier add 25 role+ Veteran`\n`=leveltier add 25 role- Regular` - a badge ladder, one role at a time.\n`=leveltier add 10 money 500`\n`=leveltier add 30 command purge` - lets them run `=purge` without the permission.\n\n**Removing** `=leveltier remove <level> [reward]`, or `=leveltier clear` for all of them.\n\n**`=leveltier sync [user]`** hands out everything people have already earned - after setting the ladder up on a server that has been levelling for a while, or after changing it. A big server is done a page at a time; running it again continues from where the last run stopped, and `=leveltier sync restart` begins from the top instead.\n\nEvery rule at or below someone's level applies, so a member who jumps two levels at once gets both. Roles are kept in step automatically: they come back when a member rejoins, and re-apply on each level-up. **Money is paid once**, on the level-up that crosses the rule, and never again.",

    slashDescription: 'Set what levelling up gives here - a role, money or a command, per level.',

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
                },
                {
                    name: 'sync',
                    value: 'sync'
                },
                {
                    name: 'sync (start over)',
                    value: 'sync-restart'
                }
            )
        )
        .addIntegerOption((option) =>
            option
                .setName('level')
                .setDescription('The level members see on their =lvl card.')
                .setMinValue(MIN_RULE_LEVEL)
                .setMaxValue(MAX_RULE_LEVEL)
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('reward')
                .setDescription('role+, role-, money or command.')
                .setRequired(false)
                .addChoices(
                    ...Object.entries(LEVEL_ACTIONS).map(([value, spec]) => ({
                        name: spec.label,
                        value
                    }))
                )
        )
        .addRoleOption((option) =>
            option.setName('role').setDescription('For role+ / role-: the role to give or take.').setRequired(false)
        )
        .addIntegerOption((option) =>
            option
                .setName('amount')
                .setDescription('For money: how much to pay.')
                .setMinValue(1)
                .setMaxValue(MAX_MONEY)
                .setRequired(false)
        )
        .addStringOption((option) =>
            option.setName('command').setDescription('For command: the Relaxy command to grant.').setRequired(false)
        )
        .addUserOption((option) =>
            option.setName('member').setDescription('For sync: settle just this member.').setRequired(false)
        ),

    cooldown: 5,

    defer: true,

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_GUILD'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],
    suggestedPermissionsBot: ['MANAGE_ROLES'],

    async run(client, message, args, guild, interaction) {
        const slash = interaction?.isChatInputCommand?.() === true;
        const prefix = guild.px?.[0] ?? '=';

        const mode = (slash ? interaction.options.getString('action') : args[0])?.toLowerCase() ?? 'show';

        const ladder = JSON.parse(JSON.stringify(guild.tr?.l ?? {}));

        if (mode === 'show' || !mode) {
            return client.send(interaction ? 1 : message.channel, null, [
                overview(client, message, guild, prefix, ladder)
            ]);
        }

        if (mode === 'sync' || mode === 'sync-restart' || mode === 'apply' || mode === 'refresh') {
            const restart =
                mode === 'sync-restart' ||
                ['restart', 'again', 'all'].includes((slash ? '' : (args[1] ?? '')).toLowerCase());

            if (!Object.keys(ladder).length) {
                return client.qEmbed(
                    `There are no level rewards to hand out. Add one with \`${prefix}leveltier add <level> <reward> …\`.`,
                    interaction ?? message
                );
            }
            if (!client.module?.levelRewards) {
                return client.qEmbed(
                    'Level rewards are not available on this shard right now - try again in a moment.',
                    interaction ?? message
                );
            }

            const target = slash
                ? interaction.options.getUser('member')
                : restart
                  ? null
                  : (await client.utils.member(message, args, 1))?.user;

            if (target) {
                const member = await message.guild.members.fetch(target.id).catch(() => null);

                if (!member) {
                    return client.qEmbed('They are not in this server.', interaction ?? message);
                }

                const document = await client.module.database.Member(target.id, message.guild.id);

                const outcome = await client.module.levelRewards.reconcile({
                    guild: message.guild,
                    guildDoc: guild,
                    member,
                    to: displayed(document?.lvl)
                });

                const changes = [
                    outcome.added.length ? `**gave** ${outcome.added.join(', ')}` : null,
                    outcome.removed.length ? `**took** ${outcome.removed.join(', ')}` : null,
                    outcome.granted.length
                        ? `**granted** ${outcome.granted.map((name) => `\`${prefix}${name}\``).join(', ')}`
                        : null
                ].filter(Boolean);

                return client.qEmbed(
                    `_ ${client.utils.tag(target)} is **level ${displayed(document?.lvl)}**.\n${
                        changes.length
                            ? `Settled up: ${changes.join(', ')}.`
                            : 'Nothing to settle - they already have everything their level earns.'
                    }${outcome.errors.length ? `\n\n⚠️ ${outcome.errors.join('\n⚠️ ')}` : ''}`,
                    interaction ?? message
                );
            }

            const roster = await message.guild.members.fetch().catch(() => null);

            const summary = await client.module.levelRewards.syncGuild({
                guild: message.guild,
                guildDoc: guild,
                roster,
                restart
            });

            return client.send(interaction ? 1 : message.channel, null, [
                {
                    color: client.data.embedColor,
                    author: {
                        name: `Level rewards synced - ${message.guild.name}`,
                        icon_url: client.utils.guildIcon(message.guild)
                    },
                    description: summary.scanned
                        ? `Checked **${summary.scanned}** member(s) who are high enough level to have earned something.${
                              summary.resumed ? '\n-# Continued from where the last run stopped.' : ''
                          }`
                        : summary.resumed
                          ? 'Everybody past the last run has already been settled - the ladder is now up to date across the whole server.'
                          : 'Nobody here is high enough level for any of the rules yet.',
                    fields: [
                        {
                            name: 'Changed',
                            value: `**${summary.changed}** member(s)`,
                            inline: true
                        },
                        {
                            name: 'Roles',
                            value: `**+${summary.added}** / **-${summary.removed}**`,
                            inline: true
                        },
                        {
                            name: 'Commands granted',
                            value: `**${summary.granted}**`,
                            inline: true
                        },

                        ...(levelRules({ tr: { l: ladder } }).some((entry) => entry.rule.a === 'money')
                            ? [
                                  {
                                      name: 'Money',
                                      value: 'Not paid by a sync - only on the level-up that crosses the rule.'
                                  }
                              ]
                            : []),
                        ...(summary.failed
                            ? [
                                  {
                                      name: '⚠️ Could not finish',
                                      value: `**${summary.failed}** member(s) - usually a reward role sitting above Relaxy's own role.`
                                  }
                              ]
                            : []),

                        ...(summary.capped
                            ? [
                                  {
                                      name: 'Capped',
                                      value: `Stopped at the per-run limit with **${summary.remaining}** member(s) still to check. Run \`${prefix}leveltier sync\` again and it picks up from here.`
                                  }
                              ]
                            : [])
                    ],
                    footer: client.data.footer,
                    timestamp: new Date()
                }
            ]);
        }

        if (mode === 'clear') {
            if (!Object.keys(ladder).length) {
                return client.qEmbed(
                    'There is nothing to clear - this server hands out nothing for levelling up.',
                    interaction ?? message
                );
            }

            await client.save(guild.id, {
                alter: 'tr.l',
                value: {}
            });

            return client.qEmbed(
                '_ **Cleared every level reward.** Levelling up here now only moves the number.\n\nRoles already handed out are left alone - take them off by hand if you want them gone.',
                interaction ?? message
            );
        }

        const removing = ['remove', 'delete', 'rm'].includes(mode);

        if (!removing && mode !== 'add' && mode !== 'set') {
            return client.qEmbed(
                `\`${mode}\` is not something this does. Try \`show\`, \`add\`, \`remove\`, \`clear\` or \`sync\`.`,
                interaction ?? message
            );
        }

        const raw = slash ? interaction.options.getInteger('level') : args[1];

        const level = levelKey(raw) ?? (removing ? strayLevelKey(raw, ladder) : null);

        if (level === null) {
            return client.qEmbed(
                `Give the level, from **${MIN_RULE_LEVEL}** to **${MAX_RULE_LEVEL}** - the one members see on their \`${prefix}lvl\` card.\n\nLevel 1 is where everybody starts, so a reward there would fire for the whole server at once. That is what \`${prefix}autorole\` is for.`,
                interaction ?? message
            );
        }

        if (removing) {
            const existing = ladder[level] ?? [];

            if (!existing.length) {
                return client.qEmbed(`Nothing is handed out at **level ${level}**.`, interaction ?? message);
            }

            const asked = slash ? interaction.options.getString('reward') : args[2];

            const only = actionKey(asked);

            if (asked && !only) {
                return client.qEmbed(
                    `\`${asked}\` is not a reward. Pick one of \`${Object.keys(LEVEL_ACTIONS).join('`, `')}\`, or give no reward at all to clear **level ${level}** entirely.`,
                    interaction ?? message
                );
            }

            const kept = only ? existing.filter((rule) => rule.a !== only) : [];

            if (kept.length === existing.length) {
                return client.qEmbed(
                    `There is no **${LEVEL_ACTIONS[only].label.toLowerCase()}** reward at **level ${level}**.`,
                    interaction ?? message
                );
            }

            const removed = existing.filter((rule) => !kept.includes(rule));

            if (kept.length) {
                ladder[level] = kept;
            } else {
                delete ladder[level];
            }

            await client.save(guild.id, {
                alter: 'tr.l',
                value: ladder
            });

            return client.qEmbed(
                `_ Removed from **level ${level}**: ${removed.map((rule) => describe(message.guild, prefix, rule)).join(', ')}.\n\nAnybody who already has it keeps it.`,
                interaction ?? message
            );
        }

        const action = actionKey(slash ? interaction.options.getString('reward') : args[2]);

        const spec = LEVEL_ACTIONS[action];

        if (!spec) {
            return client.qEmbed(
                `\`${
                    (slash ? interaction.options.getString('reward') : args[2]) ?? 'nothing'
                }\` is not a reward. Pick one of \`${Object.keys(LEVEL_ACTIONS).join('`, `')}\`.`,
                interaction ?? message
            );
        }

        const rule = { a: action };

        if (spec.needsRole) {
            const role = slash ? interaction.options.getRole('role') : await client.utils.role(message, args, 3);

            if (!role) {
                return client.qEmbed(
                    `\`${spec.label}\` needs a role - name it, mention it, or give its id.`,
                    interaction ?? message
                );
            }

            if (role.id === message.guild.id) {
                return client.qEmbed(
                    '`@everyone` is not a role anyone can be given or stripped of.',
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

        if (spec.needsAmount) {
            const amount = Math.floor(Number(slash ? interaction.options.getInteger('amount') : args[3]));

            if (!Number.isFinite(amount) || amount < 1 || amount > MAX_MONEY) {
                return client.qEmbed(
                    `\`${spec.label}\` needs an amount - a number from **1** to **${MAX_MONEY.toLocaleString()}**.`,
                    interaction ?? message
                );
            }

            rule.m = amount;
        }

        if (spec.needsCommand) {
            const wanted = String((slash ? interaction.options.getString('command') : args[3]) ?? '')
                .toLowerCase()
                .replace(/^[=/]/, '');

            const command = client.collections.commands.get(wanted) || client.collections.aliases.get(wanted);

            if (!command) {
                return client.qEmbed(
                    `There's no command called \`${wanted || 'nothing'}\`. See them all in \`${prefix}help\`.`,
                    interaction ?? message
                );
            }

            if (command.owner) {
                return client.qEmbed("Owner-only commands can't be granted.", interaction ?? message);
            }

            if (/^\d+$/.test(command.name)) {
                return client.qEmbed(`\`${command.name}\` cannot be granted this way.`, interaction ?? message);
            }

            rule.c = command.name;
        }

        const bucket = (ladder[level] ?? []).filter(
            (entry) =>
                !(
                    entry.a === action &&
                    (spec.needsRole ? entry.r === rule.r : spec.needsCommand ? entry.c === rule.c : true)
                )
        );

        if (spec.needsRole) {
            const opposite = action === 'role+' ? 'role-' : 'role+';

            if (bucket.some((entry) => entry.a === opposite && entry.r === rule.r)) {
                return client.qEmbed(
                    `**Level ${level}** already ${
                        action === 'role+' ? 'takes' : 'gives'
                    } **${message.guild.roles.cache.get(rule.r)?.name ?? rule.r}**, so this would tell Relaxy to give and take the same role at the same level - and only one of them could ever win.\n\nRemove that one first (\`${prefix}leveltier remove ${level} ${opposite}\`), or put the two at different levels, which is how a badge ladder is written.`,
                    interaction ?? message
                );
            }
        }

        const replaced = (ladder[level] ?? []).length !== bucket.length;

        if (!replaced && bucket.length >= MAX_RULES_PER_LEVEL) {
            return client.qEmbed(
                `Level ${level} already hands out **${MAX_RULES_PER_LEVEL}** things, which is the most that stays readable. Remove one first.`,
                interaction ?? message
            );
        }

        if (!ladder[level] && Object.keys(ladder).length >= MAX_LEVELS) {
            return client.qEmbed(
                `This ladder already has **${MAX_LEVELS}** levels on it, which is the most it stays readable at. Remove one first.`,
                interaction ?? message
            );
        }

        bucket.push(rule);
        ladder[level] = bucket;

        await client.save(guild.id, {
            alter: 'tr.l',
            value: ladder
        });

        return client.send(interaction ? 1 : message.channel, null, [
            {
                color: client.data.embedColor,
                title: replaced ? 'Reward replaced' : 'Reward added',
                description: `**Level ${level}**\n${describe(message.guild, prefix, rule)}`,
                fields: [
                    {
                        name: 'When it happens',
                        value: spec.state
                            ? `On the level-up that reaches **level ${level}** - and it is kept in step afterwards, so it comes back if they rejoin.`
                            : `On the level-up that takes them **to level ${level}**, once. A member who jumps straight past it from below is still paid; one who is already there is not.`
                    },

                    ...(spec.state
                        ? [
                              {
                                  name: 'People already past it',
                                  value: `They do not have it yet - nothing fires backwards. \`${prefix}leveltier sync\` hands out everything everyone has already earned.`
                              }
                          ]
                        : []),
                    ...(guild.lv?.on
                        ? []
                        : [
                              {
                                  name: '⚠️ Levelling is off',
                                  value: `Nobody gains levels here, so this cannot fire yet. Turn it on with \`${prefix}leveling\`.`
                              }
                          ])
                ],
                footer: client.data.footer,
                timestamp: new Date()
            }
        ]);
    }
};
