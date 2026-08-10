'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'lvl',
    aliases:     ['level'],
    usage:       '=lvl [user]',
    description: 'Gives a level / rank card of you or another user.\nWorks only if =leveling is on.',

    slash: new Discord.SlashCommandBuilder()
               .addUserOption(option => option.setName('user').setDescription('Whose level to show. Defaults to you.').setRequired(false)),

    cooldown: 4,

    defer: true,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          [
        'SEND_MESSAGES',
        'ATTACH_FILES'
    ],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        const guildMembers = await client.module.database.findMembers(message.guild.id);

        if (!guild.lv.on)
        {
            return client.qEmbed('Leveling is disabled on this server!', interaction ?? message);
        }

        let User = (await client.utils.member(message, args, 0))?.user;

        if (!User)
        {
            return Promise.all([
                client.module.database.Member(message.author.id, message.guild.id),
                client.module.database.User(message.author.id)
            ]).then(async ([member, user]) =>
            {

                const nxtLvl = client.utils.nextLevel(member.lvl);
                let result = client.module.profiles._calculateGuildRank(guildMembers, member);

                const rank = new client.cards.Rank()
                    .setAvatar(message.member.displayAvatarURL({
                        extension: 'png',
                        size:      4096
                    }))
                    .setCurrentXP(member.xp)
                    .setRequiredXP(nxtLvl)
                    .setLevel(member.lvl + 1)
                    .setLevelColor('#FF69B4')
                    .setRank(result, result, true)
                    .setRankColor('#FF69B4')

                    .setProgressBar('#FF69B4', 'COLOR')
                    .setDisplayName(client.utils.norm(message.member.displayName))
                    .setUsername(client.utils.norm(message.member.user.username))
                    .setDiscriminator(client.utils.tag(message.member.user).match(/#\d{1,4}/g)?.[0].replace('#', ''));

                let getBg = client.module.profiles.decodeProfileBackgroundStringArray(user.inv);
                if (getBg !== -1)
                {
                    rank.setBackground('IMAGE', client.cdn.background(getBg[0][0][0]));
                }

                let getStatusColor = client.module.profiles.decodeProfileStatusColorStringArray(user.inv);
                if (getStatusColor !== -1)
                {
                    rank.setCustomStatusColor(getStatusColor[0][0][0]);
                }

                return rank.build()
                           .then(async data =>
                           {
                               return client.send(interaction
                                   ? 1
                                   : message.channel, null, null, [new Discord.AttachmentBuilder(data, { name: 'level.png' })]);
                           });
            });
        }

        if (User.bot)
        {
            return client.qEmbed('Bots have leveling disabled!', interaction ?? message);
        }

        return Promise.all([
            client.module.database.User(User.id),
            client.module.database.Member(User.id, message.guild.id)
        ]).then(async ([user, member]) =>
        {

            if (user.lo)
            {
                return client.qEmbed('Cannot display this user\'s level!', interaction ?? message);
            }

            const nxtLvl = client.utils.nextLevel(member.lvl);
            let result = client.module.profiles._calculateGuildRank(guildMembers, member);

            const rank = new client.cards.Rank()
                .setAvatar(User.displayAvatarURL({
                    extension: 'png',
                    size:      4096
                }))
                .setCurrentXP(member.xp)
                .setRequiredXP(nxtLvl)
                .setLevel(member.lvl + 1)
                .setLevelColor('#FF69B4')
                .setRank(result, result, true)
                .setRankColor('#FF69B4')

                .setProgressBar('#FF69B4', 'COLOR')
                .setDisplayName(client.utils.norm(User.displayName ?? User.username))
                .setUsername(client.utils.norm(User.username))
                .setDiscriminator(client.utils.tag(User).match(/#\d{1,4}/g)?.[0].replace('#', ''));

            let getBg = client.module.profiles.decodeProfileBackgroundStringArray(user.inv);
            if (getBg !== -1)
            {
                rank.setBackground('IMAGE', client.cdn.background(getBg[0][0][0]));
            }

            let getStatusColor = client.module.profiles.decodeProfileStatusColorStringArray(user.inv);
            if (getStatusColor !== -1)
            {
                rank.setCustomStatusColor(getStatusColor[0][0][0]);
            }

            return rank.build()
                       .then(async data =>
                       {
                           return client.send(interaction
                               ? 1
                               : message.channel, null, null, [new Discord.AttachmentBuilder(data, { name: 'level.png' })]);
                       });
        });
    }
};
