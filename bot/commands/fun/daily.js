'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = 48 * 60 * 60 * 1000;
const STREAK_CAP = 7;

const BASE_REWARD = 250;
const PER_STREAK = 50;

export default {
    name: 'daily',
    aliases: ['dailyreward', 'claim'],
    usage: '=daily',
    description:
        'Claim your daily reward. Come back within 48 hours to keep your streak going - ' +
        `each day in a row is worth more, up to ${STREAK_CAP} days.`,
    slashDescription: 'Claim your daily money reward.',

    slash: new Discord.SlashCommandBuilder(),

    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const profile = await client.module.database.User(message.author.id);
        const now = Date.now();
        const since = now - (profile.dc ?? 0);

        if (profile.dc && since < DAY_MS) {
            return client.qEmbed(
                `You've already claimed today! Come back in **${client.imports.time(DAY_MS - since)}**.`,
                interaction ?? message
            );
        }

        const continued = profile.dc && since <= GRACE_MS;
        const streak = continued ? (profile.ds ?? 0) + 1 : 1;

        const bonus = Math.min(streak, STREAK_CAP) * PER_STREAK;
        const money = BASE_REWARD + bonus + Math.floor(Math.random() * 101);
        const xp = 20 + Math.min(streak, STREAK_CAP) * 5;

        client.saveProfile(
            message.author.id,
            {
                alter: 'm',
                value: (profile.m ?? 0) + money
            },
            {
                alter: 'xp',
                value: (profile.xp ?? 0) + xp
            },
            {
                alter: 'dc',
                value: now
            },
            {
                alter: 'ds',
                value: streak
            }
        );

        if (guild.lv?.on) {
            const member = await client.module.database.Member(message.author.id, message.guild.id).catch(() => null);

            if (member) {
                client.saveMember(message.guild.id, message.author.id, {
                    alter: 'xp',
                    value: (member.xp ?? 0) + xp
                });
            }
        }

        const streakLine =
            streak > 1
                ? `\n🔥 **${streak}-day streak!**${streak >= STREAK_CAP ? ' (max bonus)' : ` (+${bonus} streak bonus)`}`
                : continued
                  ? ''
                  : '\nStreak started - come back tomorrow to build it up!';

        return client.qEmbed(
            `You claimed your daily **\`${money} money\`** and **\`${xp} xp\`**!${streakLine}`,
            interaction ?? message
        );
    }
};
