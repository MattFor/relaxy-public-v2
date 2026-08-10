'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../Relaxy.js';
import {
    messageType,
    SUPPORT_REQUESTS_CHANNEL_ID
}              from '../../../../Core/DataTable.js';

export default class RequestManager
{

    constructor(client)
    {
        this.client = client;
        this.channel = null;
        this.requestList = [];

        setInterval(async () =>
        {
            const request = this.requestList.shift();

            if (request)
            {
                this.Process(request);
            }
        }, 10 * 1000);
    }

    async Process(request)
    {
        if (!request)
        {
            return;
        }

        if (!this.channel)
        {
            this.channel = this.client.channels.cache.get(SUPPORT_REQUESTS_CHANNEL_ID);
        }

        let RequestEmbed = new Discord.EmbedBuilder()
            .setColor(this.client.data.embedColor)
            .setThumbnail(`https://www.youtube.com/results?search_query=${request.author.id}`)
            .setAuthor({
                name:    `${this.client.utils.tag(request.author)} | Request #${request.index}`,
                iconURL: request.author.displayAvatarURL
            })
            .setTimestamp(request.time)
            .setFooter({ text: `Shard #${request.clusterId} - ${request.guild}` });

        let description = '';

        if (request.attachment !== '0')
        {
            RequestEmbed.setImage(request.attachment.url);
        }

        if (request.content.length > 0)
        {
            description += `\n${request.content}`;
        }

        RequestEmbed.setDescription(description);

        const m = await this.client.send(this.channel, null, [RequestEmbed]);
        await this.client.react(m, '✅', '❌');

        m.createReactionCollector({
            filter: (reaction, user) => (this.client.isOwner(user.id) && (reaction.emoji.name === '✅' || reaction.emoji.name === '❌'))
        }).on('collect', async reaction =>
        {

            let flag = false;

            await reaction.message.reactions.removeAll().catch(this.client.swallow('Requests: removeAll'));

            switch (reaction.emoji.name)
            {
                case '❌':
                {
                    return this.client.users.cache.get(this.client.config.keys.owner).send('Reason for denial?').then(async m =>
                    {
                        return m.channel.awaitMessages({
                            filter: m => !m.author.bot,
                            max:    1,
                            time:   300000
                        }).then(c =>
                        {
                            flag = true;

                            reaction.message.edit('```diff\n- DENIED\n```');

                            return this.client.cluster.send({
                                _type:   messageType.CLIENT_RESPONSE,
                                variant: 'rr_processed',
                                data:    {
                                    accepted:   false,
                                    authorId:   request.author.id,
                                    clusterId:  request.clusterId,
                                    reason:     c.first().content,
                                    attachment: c.first().attachments.first()
                                                    ? c.first().attachments.first()
                                                    : null,
                                    index:      request.index
                                }
                            });
                        }).catch(() =>
                        {
                            if (flag)
                            {
                                return;
                            }

                            reaction.message.edit('```diff\n- DENIED\n```');

                            return this.client.cluster.send({
                                _type:   messageType.CLIENT_RESPONSE,
                                variant: 'rr_processed',
                                data:    {
                                    accepted:  false,
                                    authorId:  request.author.id,
                                    clusterId: request.clusterId,
                                    reason:    'Your request has been denied, MattFor hasn\'t provided any response, this is an automated message.',
                                    index:     request.index
                                }
                            });
                        });
                    });
                }

                case '✅':
                {
                    return this.client.users.cache.get(this.client.config.keys.owner).send('Reason for accepting?').then(async (m) =>
                    {
                        return m.channel.awaitMessages({
                            filter: m => !m.author.bot,
                            max:    1,
                            time:   300000
                        }).then(c =>
                        {
                            flag = true;

                            reaction.message.edit('```fix\nACCEPTED!\n```');

                            return this.client.cluster.send({
                                _type:   messageType.CLIENT_RESPONSE,
                                variant: 'rr_processed',
                                data:    {
                                    accepted:   true,
                                    authorId:   request.author.id,
                                    clusterId:  request.clusterId,
                                    reason:     c.first().content,
                                    attachment: c.first().attachments.first()
                                                    ? c.first().attachments.first()
                                                    : null,
                                    index:      request.index
                                }
                            });
                        }).catch(() =>
                        {
                            if (flag)
                            {
                                return;
                            }

                            reaction.message.edit('```fix\nACCEPTED!\n```');

                            return this.client.cluster.send({
                                _type:   messageType.CLIENT_RESPONSE,
                                variant: 'rr_processed',
                                data:    {
                                    accepted:  true,
                                    authorId:  request.author.id,
                                    clusterId: request.clusterId,
                                    reason:    'Your request has been accepted! MattFor hasn\'t provided any response, this is an automated message.',
                                    index:     request.index
                                }
                            });
                        });
                    });
                }
            }
        });
    }

    Receive(request)
    {
        this.requestList.push(request);
    }
}
