'use strict';

import Discord            from 'discord.js';
import Relaxy             from '../../../src/Client/Relaxy.js';
import { creditReaction } from '../../../src/Client/Modules/Progression/ReactionActivity.js';
import {
    messageType,
    SUPPORT_GUILD_ID,
    SUPPORT_REQUESTS_CHANNEL_ID
}                         from '../../../src/Core/DataTable.js';

export default {
    async run(client, reaction, user)
    {
        if (!reaction.message.guild || (reaction.message.channel.id !== SUPPORT_REQUESTS_CHANNEL_ID && (reaction.message.channel.type === client.imports.discord.ChannelType.DM || reaction.message.channel.type === client.imports.discord.ChannelType.GroupDM)))
        {
            return;
        }

        if (client.utils.blacklisted(user.id) > 0)
        {
            reaction.users.remove(user.id).catch(client.swallow('messageReactionAdd: blacklist silence'));

            return;
        }

        if (client.isOwner(user.id) && reaction.message.channel.id === SUPPORT_REQUESTS_CHANNEL_ID)
        {
            reaction.message = await client.guilds.cache.get(SUPPORT_GUILD_ID)
                                           ?.channels.cache.get(SUPPORT_REQUESTS_CHANNEL_ID)
                                           ?.messages.fetch(reaction.message.id);

            if (!reaction.message)
            {
                return;
            }

            if (new Date(reaction.message.embeds[0].data.timestamp).getTime() > client.data.startTime)
            {
                return;
            }

            let footerText = reaction.message.embeds[0].data.footer.text.split('-');

            let guildName = footerText[1].slice(1, footerText[1].length);

            let member = reaction.message.embeds[0].data.author.name.split('|')[0];

            member = member.slice(0, -1);

            let clusterId = Number(client.utils.nums(footerText[0]));

            const userData = (await client.cluster.broadcastEval(async (c, a) =>
            {
                const user = await c.users.fetch(a.u_id).catch(() => null);

                if (!user)
                {
                    return null;
                }

                return [
                    user,
                    await c.getMember(c.guilds.cache.find(g => g.name.includes(a.g_name)), user.id)
                ];
            }, {
                cluster: clusterId,
                context: {
                    u_id:   reaction.message.embeds[0].data.thumbnail.url.split('=')[1],
                    g_name: guildName
                }
            }).catch(() => []))
                .find(entry => Array.isArray(entry) && entry[0]);

            if (!userData)
            {
                return client.delete(reaction.message);
            }

            member = userData[1];
            let user = userData[0];

            const request = {
                time:       reaction.message.createdAt.getMilliseconds(),
                index:      Number(reaction.message.embeds[0].data.author.name.split('|')[1].split('#')[1]),
                clusterId:  clusterId,
                attachment: reaction.message.embeds[0].data.image
                                ? reaction.message.embeds[0].data.image
                        ? reaction.message.embeds[0].data.image
                        : reaction.message.attachments.size > 0
                            ? reaction.message.attachments.first()
                            : null
                                : null,
                content:    reaction.message.embeds[0].data.description,
                author:     user,
                member:     member,
                guild:      guildName,
                valid:      true
            };

            let flag = false;

            reaction.message.reactions.removeAll().catch(client.swallow('messageReactionAdd: removeAll'));

            switch (reaction.emoji.name)
            {
                case '❌':
                {
                    let channel = await (await client.getUser(client.config.keys.owner)).createDM();

                    return channel.send('Reason for denial?').then(async m =>
                    {
                        return m.channel.awaitMessages({
                            filter: m => !m.author.bot,
                            max:    1,
                            time:   300000
                        }).then(c =>
                        {
                            flag = true;

                            client.edit(reaction.message, '```diff\n- DENIED\n```', [reaction.message.embeds[0].data]);

                            const caughtMessage = c.first();

                            return client.cluster.send({
                                _type:   messageType.CLIENT_RESPONSE,
                                variant: 'rr_processed',
                                data:    {
                                    accepted:   false,
                                    authorId:   request.author.id,
                                    clusterId:  request.clusterId,
                                    reason:     caughtMessage.content,
                                    attachment: caughtMessage.attachments.size > 0
                                                    ? caughtMessage.attachments.first()
                                                    : null,
                                    index:      request.index,
                                    url:        reaction.message.url
                                }
                            });
                        }).catch(() =>
                        {
                            if (flag)
                            {
                                return;
                            }

                            client.edit(reaction.message, '```diff\n- DENIED\n```', [reaction.message.embeds[0].data]);

                            return client.cluster.send({
                                _type:   messageType.CLIENT_RESPONSE,
                                variant: 'rr_processed',
                                data:    {
                                    accepted:  false,
                                    authorId:  request.author.id,
                                    clusterId: request.clusterId,
                                    reason:    'Your request has been denied, MattFor hasn\'t provided any response, this is an automated message.',
                                    index:     request.index,
                                    url:       reaction.message.url
                                }
                            });
                        });
                    });
                }

                case '✅':
                {
                    let channel = await (await client.getUser(client.config.keys.owner)).createDM();

                    return channel.send('Reason for accepting?').then(async (m) =>
                    {
                        return m.channel.awaitMessages({
                            filter: m => !m.author.bot,
                            max:    1,
                            time:   300000
                        }).then(c =>
                        {
                            flag = true;

                            client.edit(reaction.message, '```fix\nACCEPTED!\n```', [reaction.message.embeds[0].data]);

                            const caughtMessage = c.first();

                            return client.cluster.send({
                                _type:   messageType.CLIENT_RESPONSE,
                                variant: 'rr_processed',
                                data:    {
                                    accepted:   true,
                                    authorId:   request.author.id,
                                    clusterId:  request.clusterId,
                                    reason:     caughtMessage.content,
                                    attachment: caughtMessage.attachments.size > 0
                                                    ? caughtMessage.attachments.first()
                                                    : null,
                                    index:      request.index,
                                    url:        reaction.message.url
                                }
                            });
                        }).catch(() =>
                        {
                            if (flag)
                            {
                                return;
                            }

                            client.edit(reaction.message, '```fix\nACCEPTED!\n```', [reaction.message.embeds[0].data]);

                            return client.cluster.send({
                                _type:   messageType.CLIENT_RESPONSE,
                                variant: 'rr_processed',
                                data:    {
                                    accepted:  true,
                                    authorId:  request.author.id,
                                    clusterId: request.clusterId,
                                    reason:    'Your request has been accepted! MattFor hasn\'t provided any response, this is an automated message.',
                                    index:     request.index,
                                    url:       reaction.message.url
                                }
                            });
                        });
                    });
                }
            }
        }

        const guild = await client.module.database.Guild(reaction.message.guild.id);

        creditReaction(client, reaction, user).catch(client.swallow('messageReactionAdd: activity'));

        if (guild.fo.on && reaction.message.channel.parent && guild.fo.cs.includes(reaction.message.channel.parent.id))
        {
            return client.core.ForumPost(reaction, user);
        }

        client.core.ReactionAdd(reaction, user, guild);
        client.core.HeartBoard(reaction, user, 'messageReactionAdd', guild);
    }
};
