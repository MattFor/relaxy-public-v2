'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';
import { bump } from '../../../src/Client/Modules/Progression/DailyStats.js';

import {
    appealDossier,
    describeGuild,
    isBannedIn,
    openAppealThread
} from '../../../src/Client/Modules/Guilds/GuildLink.js';
import { BLACKLIST_ACTION_REASON } from '../../../src/Config/Settings.js';

import { displayed as levelDisplayed } from '../../../src/Client/Modules/Progression/LevelRewards.js';

import { CASE_TYPES } from '../../commands/moderation/case.js';

import { appealThreadDossier } from '../../commands/moderation/dossier.js';

const opening = new Set();

const appealThreadOnJoin = async (client, member, guild) => {
    if (member.user.bot) {
        return;
    }

    if (!guild.ap?.h?.length) {
        return;
    }

    if (!guild.ap?.tr?.length) {
        if (client.flags.logs.debug) {
            client.log(
                'DEBUG',
                `[Appeal] ${member.id} joined ${member.guild.id}, which hosts ${guild.ap.h.length} guest(s) but has no thread roles set (ap.tr empty) - shared channel mode.`
            );
        }

        return;
    }

    const lock = `${member.guild.id}:${member.id}`;

    if (opening.has(lock)) {
        client.log(
            'WARN',
            `[Appeal] A thread is already being opened for ${member.id} in ${member.guild.id} - this join was a duplicate and was ignored.`
        );

        return;
    }

    opening.add(lock);

    try {
        await appealThreadFor(client, member, guild);
    } finally {
        opening.delete(lock);
    }
};

const appealThreadFor = async (client, member, guild) => {
    client.log(
        'DATA',
        `[Appeal] ${member.id} joined host ${member.guild.id}; checking ${guild.ap.h.length} guest server(s) for a ban to appeal.`
    );

    let banned = 0;

    for (const guestId of guild.ap.h) {
        if (!(await isBannedIn(client, guestId, member.id))) {
            if (client.flags.logs.debug) {
                client.log('DEBUG', `[Appeal] ${member.id} is not banned in guest ${guestId}.`);
            }

            continue;
        }

        banned++;

        await client.module.database.reloadGuild(guestId).catch(() => null);

        const guestDoc = await client.module.database.Guild(guestId).catch(() => null);

        const channelId = guestDoc?.ap?.c;

        if (!channelId || guestDoc.ap.p !== member.guild.id) {
            client.log(
                'WARN',
                `Appeal thread skipped: guest ${guestId} lists ${member.guild.id} as a host but has ${
                    guestDoc?.ap?.c ? `ap.p = ${guestDoc.ap.p}` : 'no appeal channel set'
                }. Run \`=appealchannel\` in ${member.guild.id}.`
            );

            continue;
        }

        const guest = await describeGuild(client, guestId);

        const ban = await client.utils.banCase(guestId, member.id);

        const dossier = await appealDossier(client, guestId, member.id, CASE_TYPES).catch((error) => {
            client.log(
                'WARN',
                `Could not assemble the appeal dossier for ${member.id} in ${guestId}: ${error?.message ?? error}`
            );

            return [];
        });

        const page = await appealThreadDossier(
            client,
            guestId,
            {
                id: member.id,
                username: member.user.username
            },
            guest ?? {}
        ).catch((error) => {
            client.log(
                'WARN',
                `Could not render the full appeal dossier for ${member.id} in ${guestId}: ${error?.message ?? error}`
            );

            return null;
        });

        const hostMember = await client.module.database.Member(member.id, member.guild.id).catch(() => null);
        const recorded = hostMember?.ap ?? {};

        const slug = String(guest?.name ?? guestId)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40);
        const legacyName = `appeal-${member.user.username}`.slice(0, 100);
        const threadName = (slug ? `${legacyName}-${slug}` : legacyName).slice(0, 100);

        const thread = await openAppealThread(client, member.guild.id, channelId, {
            threadName,
            legacyName,
            claimed: Object.entries(recorded)
                .filter(([id]) => id !== guestId)
                .map(([, threadId]) => threadId),
            userId: member.id,
            roleIds: guild.ap.tr,
            guestName: guest?.name ?? 'the linked server',
            caseNumber: ban?.n ?? null,
            banReason: (ban?.rs || '').replaceAll('\n', ' ').slice(0, 200) || null,

            bannedBy: ban?.md || null,
            bannedAt: ban?.at ?? null,
            dossier,
            dossierEmbeds: page?.embeds ?? [],
            dossierComponents: page?.components ?? [],
            existingThreadId: recorded[guestId] || null
        });

        if (!thread) {
            client.log(
                'ERROR',
                `[Appeal] No cluster could reach guild ${member.guild.id} / channel ${channelId} to open a thread for ${member.id}.`
            );
        } else if (thread.error) {
            client.log(
                'ERROR',
                `[Appeal] Could not open a thread in [${member.guild.name}] (${member.guild.id}) channel ${channelId} for ${member.id}: ${thread.error}`
            );
        } else {
            client.log(
                'DATA',
                `[Appeal] ${
                    thread.reused ? 'Reused' : 'Opened'
                } thread #${thread.name} (${thread.id}) in ${member.guild.id} for ${member.id}, appealing their ban in ${guestId}.`
            );

            if (hostMember && recorded[guestId] !== thread.id) {
                client.saveMember(member.guild.id, member.id, {
                    alter: 'ap',
                    value: {
                        ...recorded,
                        [guestId]: thread.id
                    }
                });
            }

            for (const warning of thread.warnings ?? []) {
                client.log('WARN', `[Appeal] Thread ${thread.id} in ${member.guild.id}: ${warning}`);
            }
        }
    }

    if (banned === 0) {
        client.log(
            'DATA',
            `[Appeal] ${member.id} is not banned in any of the ${guild.ap.h.length} guest server(s) ${member.guild.id} hosts - ordinary join, no thread.`
        );

        if (guild.ml.ev?.guildMemberAdd?.on) {
            client.pushModlog(
                member.guild.id,
                'guildMemberAdd',
                new client.class.modlog({
                    event: 'No appeal',
                    description: `${member} is not banned in any linked server.`
                }),
                null
            );
        }
    }
};

const findStringInArray = (array, keyword) => {
    for (let i = 0; i < array.length; i++) {
        if (array[i].includes(keyword)) {
            return true;
        }
    }

    return false;
};

const findStringInArrayV2 = (array, keyword) => {
    for (let i = 0; i < array.length; i++) {
        if (array[i].startsWith(keyword)) {
            return true;
        }
    }

    return false;
};

export default {
    async run(client, member) {
        client.log(`${client.utils.tag(member.user)} has joined [${member.guild.name}]`);

        if (client.utils.blacklisted(member.id) > 1) {
            if (member.bannable) {
                await member
                    .ban({ reason: BLACKLIST_ACTION_REASON })
                    .catch((error) =>
                        client.log(
                            'WARN',
                            `[Blacklist] Could not ban blacklisted user ${member.id} on join to [${member.guild.name}] (${member.guild.id}): ${error?.message ?? error}`
                        )
                    );
            } else {
                client.log(
                    'WARN',
                    `[Blacklist] Blacklisted user ${member.id} joined [${member.guild.name}] (${member.guild.id}) but is not bannable (missing Ban Members or a higher role).`
                );
            }

            return;
        }

        if (!member.user.bot) {
            bump(member.guild.id, 'j');
        }

        const guild = await client.module.database.Guild(member.guild.id);

        const memberDocument = await client.module.database.Member(member.id, member.guild.id);

        if (memberDocument?.lm > 0) {
            await client.module.database.setMemberMarks(member.guild.id, [member.id], 0);
            await client.garbageCollector.invalidateMembers(member.guild.id, [member.id]);
        }

        const profile = await client.module.database.User(member.id);

        if (profile?.lm > 0) {
            await client.garbageCollector.setProfileMark(member.id, 0);
        }

        await client.utils.recordMemberNames(member).catch(client.swallow('guildMemberAdd: recordMemberNames'));

        await client.core
            .autoRole(member, guild)
            .catch((error) =>
                client.log(
                    'ERROR',
                    `guildMemberAdd: autoRole failed in [${member.guild.name}] (${member.guild.id}):`,
                    error
                )
            );

        if (client.module?.levelRewards && Object.keys(guild.tr?.l ?? {}).length) {
            await client.module.levelRewards
                .reconcile({
                    guild: member.guild,
                    guildDoc: guild,
                    member,
                    to: levelDisplayed(memberDocument?.lvl)
                })
                .catch((error) =>
                    client.log(
                        'ERROR',
                        `guildMemberAdd: level rewards failed for ${member.id} in [${member.guild.name}] (${member.guild.id}):`,
                        error
                    )
                );
        }

        try {
            if (guild.d.mut.id !== '' && (await client.module.database.isMuted(guild.id, member.user.id))) {
                await member.roles.set(
                    [
                        guild.d.mut.id,
                        member.roles.cache.find((role) => role?.tags?.premiumSubscriberRole) ?? null,
                        member.roles.cache.find((role) => role?.tags?.botId) ?? null
                    ].filter((i) => i !== null)
                );
            }
        } catch (error) {
            client.log(
                'ERROR',
                `guildMemberAdd: could not re-apply the mute role to ${member.id} in [${member.guild.name}]:`,
                error
            );
        }

        if (await client.core.raidCheck(member, guild)) {
            return;
        }

        await client.module.database
            .addCaseOutcome(guild.id, member.id, {
                type: 'rejoin',
                types: ['kick', 'ban', 'tempban', 'warn-ban']
            })
            .catch(client.swallow('guildMemberAdd: addCaseOutcome'));

        await appealThreadOnJoin(client, member, guild).catch((error) =>
            client.log(
                'ERROR',
                `guildMemberAdd: the appeal-thread check threw for ${member.id} in [${member.guild.name}] (${member.guild.id}):`,
                error
            )
        );

        const invalidName =
            guild.cn.rn && (await client.utils.censorCheck([member.nickname ?? member.user.username], guild));
        const renamedNickname = `Renamed${Math.floor(Math.random() * 100000000000)}`;

        if (invalidName) {
            await member.setNickname(
                renamedNickname,
                `Censoring pool word detected in the ${member.nickname ? 'nickname' : 'username'}!`
            );
        }

        if (guild.ml.ev?.guildMemberAdd?.on) {
            let permissions = [];

            for (const key of Object.entries(Discord.PermissionFlagsBits)) {
                if (member.permissions.has(Discord.PermissionFlagsBits[key[0]])) {
                    permissions.push(client.utils.firstLetterUp(key[0].toLowerCase()));
                }
            }

            if (permissions.length === Object.keys(Discord.PermissionFlagsBits).length) {
                permissions = ['Has every permission [Administrator]'];
            }

            if (permissions.length === 0) {
                permissions.push('No Key Permissions Found');
            }

            if (!client.channels.cache.get(guild.ml.ev.guildMemberAdd.channel)) {
                client.save(guild.id, {
                    alter: 'ml.ev.guildMemberAdd.on',
                    value: false
                });
            } else {
                client.pushModlog(
                    member.guild.id,
                    'guildMemberAdd',
                    new client.class.modlog({
                        color: 'good',
                        event: 'User joined!',
                        thumbnail: member.displayAvatarURL({
                            dynamic: true,
                            size: 4096
                        }),
                        fields: [
                            {
                                name: 'User:',
                                value: `${member}\n${client.utils.tag(member.user)}\n**\`${member.user.id}\`**`
                            },
                            {
                                name: 'Permissions:',
                                value: `\`${permissions.length !== 0 ? permissions.join(`\`, \``) : 'None.'}\``
                            }
                        ],
                        description: `Joined discord: \`${client.utils.formatDate(member.user.createdAt)}\`\nAccount exists for: \`${client.imports.time(Date.now() - member.user.createdTimestamp)}\`${
                            guild.cn.on
                                ? guild.cn.rn
                                    ? invalidName
                                        ? `\nUser renamed due to infringement of censor pool words:\nYes! The user is now named **\`${renamedNickname}\`!**`
                                        : `\nUser renamed due to infringement of censor pool words: **No!**`
                                    : ''
                                : ''
                        }`
                    }),
                    null
                );
            }
        }

        client.core.LockdownJoin(member, guild);

        if (guild.dg?.on) {
            let user = await client.module.database.User(member.user.id);
            let welcomerMessage = guild.dg.j.split('[SPLIT_FLAG]');

            if (welcomerMessage[0] === 'NULL(0)') {
                welcomerMessage[0] = '';
            }

            if (welcomerMessage[1] === 'NULL(0)') {
                welcomerMessage[1] = null;
            }

            if (welcomerMessage[1]) {
                welcomerMessage[1] = await client.parseJSON(welcomerMessage[1]);
                try {
                    welcomerMessage[1] = await client.fixerParseJSON(
                        (await client.stringifyJSON(welcomerMessage[1])).replaceAll(
                            'botver',
                            client.config.keys.version
                        )
                    );
                } catch {}
            }

            if (!user.dm && (welcomerMessage[0] || welcomerMessage[1])) {
                client.send(member.user, welcomerMessage[0], [welcomerMessage[1]]);
            }
        }

        if (guild.wc?.on) {
            if (!client.channels.cache.get(guild.wc.j.c)) {
                client.save(guild.id, {
                    alter: 'wc.j.c',
                    value: ''
                });
            }

            let welcomeCard = null;
            let welcomeAttachment = null;

            let welcomeEncode = guild.wc.j.m.split('[SPLIT_FLAG]');

            if (welcomeEncode[0] === 'NULL(0)') {
                welcomeEncode[0] = '';
            }

            if (welcomeEncode[1]) {
                try {
                    welcomeEncode[1] = welcomeEncode[1].replaceAll('botver', client.config.keys.version);
                } catch {}

                try {
                    welcomeEncode[1] = welcomeEncode[1].replaceAll('|U|', member).replaceAll("'U'", member);
                } catch {}

                try {
                    welcomeEncode[1] = welcomeEncode[1]
                        .replaceAll('|G|', member.guild.name)
                        .replaceAll("'G'", member.guild.name);
                } catch {}

                try {
                    welcomeEncode[1] = await client.fixerParseJSON(welcomeEncode[1]);
                } catch {}

                if ((await client.stringifyJSON(welcomeEncode[1])).includes('timestamp')) {
                    welcomeEncode[1].timestamp = new Date();
                }
            }

            if ([2, 3, 7, 9, 10, 11, 13].includes(Number(guild.wc.t))) {
                welcomeCard = new client.cards.Welcomer()
                    .setColor('#FF69B4')
                    .setGuildName(member.guild.name)
                    .setMemberCount(member.guild.memberCount)
                    .setUsername(client.utils.norm(member.user.username))

                    .setAvatar(
                        member.displayAvatarURL({
                            extension: 'png',
                            size: 4096
                        })
                    );

                welcomeCard.colorTitle = '#FF69B4';
                welcomeCard.textTitle = guild.wc.j.t;
                welcomeCard.textMessage = guild.wc.j.b;

                await welcomeCard.build().then((data) => {
                    if (welcomeEncode[1]) {
                        welcomeAttachment = data;
                    } else {
                        welcomeAttachment = new Discord.AttachmentBuilder(data, { name: 'welcome.png' });
                    }
                });

                if (welcomeEncode[1]) {
                    welcomeEncode[1].files = [
                        {
                            attachment: welcomeAttachment,
                            name: 'welcome.png'
                        }
                    ];

                    welcomeEncode[1].image = { url: 'attachment://welcome.png' };
                }
            }

            if ([1, 3, 7, 8, 10, 11, 12].includes(Number(guild.wc.t))) {
                if (welcomeEncode[0]) {
                    welcomeEncode[0] = welcomeEncode[0].replace('|U|', member).replace('|G|', member.guild.name);
                }
            } else {
                welcomeEncode[0] = null;
            }

            if (!client.isOwner(member.user.id)) {
                return client.data.joinMessages?.[guild.id]?.push([
                    'welcome',
                    [
                        welcomeEncode[0],
                        welcomeEncode[1] ? [welcomeEncode[1]] : null,
                        welcomeAttachment ? [welcomeAttachment] : null
                    ]
                ]);
            }
        }
    }
};
