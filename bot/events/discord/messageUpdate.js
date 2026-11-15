'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const describe = (client, message) =>
    (
        client.utils.describeMessage(message, {
            limit: 1000,
            media: false
        }) ?? 'Unavailable.'
    ).replace(/`/g, "'");

export default {
    async run(client, oldMessage, newMessage) {
        if (
            !newMessage.guild ||
            oldMessage?.pinned !== newMessage?.pinned ||
            oldMessage?.content === newMessage?.content ||
            !oldMessage ||
            !newMessage ||
            newMessage.system ||
            client.isOwner(newMessage.author.id)
        ) {
            return;
        }

        const guild = await client.module.database.Guild(newMessage.guild.id);

        if (await client.core.Censor(newMessage, guild)) {
            return client.delete(newMessage);
        }

        if (
            !guild.ml.ev?.messageUpdate?.on ||
            (guild.hb.on &&
                newMessage.author.id === client.user.id &&
                newMessage?.embeds?.[0]?.footer?.text.includes('ID:') &&
                guild.ml.ls)
        ) {
            return;
        }

        let channel = null;

        try {
            channel = await client.channels.fetch(guild.ml.ev.messageUpdate.channel);
        } catch {
            return client.save(guild.id, {
                alter: 'ml.ev.messageUpdate.on',
                value: false
            });
        }

        const embed = new client.class.modlog({
            event: 'Message edited',
            thumbnail: newMessage.author.avatarURL({
                dynamic: true,
                extension: 'png'
            }),
            image:
                newMessage.attachments.size > 0 && oldMessage.attachments.size === 0
                    ? { url: newMessage.attachments.first().url }
                    : null,
            fields: [
                {
                    name: 'Original Message:',
                    value: `\`\`\`\n${describe(client, oldMessage)}\n\`\`\``.slice(0, 1024)
                },
                {
                    name: 'Updated Message:',
                    value: `\`\`\`fix\n${describe(client, newMessage)}\n\`\`\``.slice(0, 1024)
                },
                {
                    name: 'Author:',
                    value: `${newMessage.author ? newMessage.author : 'Unavailable.'} - **${
                        newMessage.author ? client.utils.tag(newMessage.author) : 'unavailable'
                    }** - \`${
                        newMessage.author
                            ? newMessage.author.id
                                ? newMessage.author.id
                                : 'unavailable'
                            : 'unavailable'
                    }\``
                },
                {
                    name: 'Channel:',
                    value: `${oldMessage ? oldMessage.channel : newMessage.channel}`
                },
                {
                    name: 'Message ID:',
                    value: `\`${oldMessage ? oldMessage.id : newMessage.id}\``,
                    inline: true
                },
                oldMessage.attachments.size !== newMessage.attachments.size
                    ? {
                          name: 'Old attachments:',
                          value: `${
                              oldMessage.attachments.map((attachment) => {
                                  return `Name: ${attachment.name}\n[Link](${attachment.url})\nSize: ${attachment.size / 1000000}mb\nContent type: ${attachment.contentType}`;
                              }) ?? 'None.'
                          }`.slice(0, 1024)
                      }
                    : null,
                oldMessage.attachments.size !== newMessage.attachments.size
                    ? {
                          name: 'New attachments:',
                          value: `${
                              newMessage.attachments.map((attachment) => {
                                  return `Name: ${attachment.name}\n[Link](${attachment.url})\nSize: ${attachment.size / 1000000}mb\nContent type: ${attachment.contentType}`;
                              }) ?? 'None.'
                          }`.slice(0, 1024)
                      }
                    : null,
                oldMessage.stickers.size !== newMessage.stickers.size
                    ? {
                          name: 'Old stickers:',
                          value: `${
                              oldMessage.stickers.map((sticker) => {
                                  return `Name: ${sticker.name}\n[Link](${sticker.url})`;
                              }) ?? ' None.'
                          }`.slice(0, 1024)
                      }
                    : null,
                oldMessage.stickers.size !== newMessage.stickers.size
                    ? {
                          name: 'New stickers:',
                          value: `${
                              newMessage.stickers.map((sticker) => {
                                  return `Name: ${sticker.name}\n[Link](${sticker.url})`;
                              }) ?? 'None.'
                          }`.slice(0, 1024)
                      }
                    : null
            ],
            author: {
                name: `Message author: ${newMessage.author.username}`,
                iconURL: newMessage.author.displayAvatarURL({
                    dynamic: true,
                    size: 4096
                })
            },
            description: `[Click here to jump to the message](${newMessage.url})`
        });

        if (!client.data.modlogs?.[newMessage.guild.id]) {
            client.data.modlogs[newMessage.guild.id] = [];
        }

        client.pushModlog(newMessage.guild.id, 'messageUpdate', embed, null);
    }
};
