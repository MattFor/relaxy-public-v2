'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, messages, channel) {
        const guild = await client.module.database.Guild(channel.guild.id);

        if (!guild.ml.ev?.messageDeleteBulk?.on) {
            return;
        }

        let Channel = await client.channels
            .fetch(guild.ml.ev.messageDeleteBulk.channel)
            .catch(client.swallow('messageDeleteBulk: fetch'));

        if (!Channel) {
            return;
        }

        let auditUser = await client.utils.auditLog(channel.guild, 'MessageDeleteBulk');

        if (!client.data.serverCache[guild.id]) {
            client.data.serverCache[guild.id] = {};
        }

        if (!auditUser) {
            try {
                let id =
                    Object.keys(client.data.serverCache?.[guild.id]).find((key) => key.startsWith('bulk_')) ?? null;

                if (id) {
                    id = id.replace('bulk_', '');
                    auditUser = await client.getUser(id);
                }
            } catch (e) {
                client.log('ERROR', e, client.data.serverCache?.[guild.id]);
            }
        }

        if (client.isOwner(auditUser)) {
            return;
        }

        const logged = Array.from(messages.values())
            .reverse()
            .filter((msg) => !client.isOwner(msg?.author?.id));

        let deletedMessagesFile = '';
        logged.forEach((msg) => {
            deletedMessagesFile += `\nFrom ${msg?.author?.username ?? 'Unavailable'} in ${msg?.channel?.name ?? 'Unavailable'} in ${msg?.guild?.name} at ${msg?.createdAt?.toISOString()} - ${msg?.author?.id ?? 'Unavailable'} - ${msg?.id ?? 'Unavailable'}:\n\n${
                client.utils.describeMessage(msg, {
                    limit: 0,
                    media: false
                }) ?? 'None.'
            }`;

            if (msg.attachments.size > 0) {
                msg.attachments.forEach((attachment) => {
                    deletedMessagesFile += `\n\nAttachment ${attachment.name}\n${attachment.url}\nSize: ${attachment.size / 100000}mb`;
                });
            }

            if (msg.stickers.size > 0) {
                msg.stickers.forEach((sticker) => {
                    deletedMessagesFile += `\n\nSticker ${sticker.name}\n${sticker.url}`;
                });
            }

            if (msg.embeds.length > 0) {
                msg.embeds.forEach((embed) => {
                    deletedMessagesFile += `\nEmbeds:\n\n${client.imports.beautify(embed, null, 2, 80)}\n`;
                });
            }
        });

        const attachment = deletedMessagesFile.trim()
            ? [
                  new Discord.AttachmentBuilder(Buffer.from(deletedMessagesFile, 'utf-8'), {
                      name: `${channel.guild.name}_deleted_messages.txt`
                  })
              ]
            : null;

        return client.pushModlog(
            channel.guild.id,
            'messageDeleteBulk',
            new client.class.modlog({
                color: 'bad',
                event: 'Mass message deletion',
                description: `Deleted **\`${messages.size}\`** messages!`,
                fields: [
                    {
                        name: 'Channel:',
                        value: `${channel}`,
                        inline: true
                    },
                    auditUser
                        ? {
                              name: 'Deleted by:',
                              value: `${auditUser} - ${client.utils.tag(auditUser)} - **\`${auditUser.id}\`**`
                          }
                        : null
                ]
            }),
            auditUser,
            attachment
        );
    }
};
