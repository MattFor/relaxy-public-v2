'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, message) {
        const guild = await client.module.database.Guild(message?.guild?.id);
        if (!guild || guild.lockeddown || !message || !message.author) {
            return;
        }

        if (message.author.id === client.user.id && client.utils.modlogChannels(guild).includes(message.channel.id)) {
            return;
        }

        if (!guild.ml.ev?.messageDelete?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.messageDelete.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.messageDelete.on',
                value: false
            });
        }

        if (!client.data.modlogs?.[message.guild.id]) {
            client.data.modlogs[message.guild.id] = [];
        }

        let sticker = message.stickers.first();
        let attachment = message.attachments.first();

        let image = null;
        let files = null;

        const path = `./storage/cache/users/${message.author.id}/${message.id}`;

        if (await client.pathExists(path)) {
            const gif = attachment?.contentType?.includes('gif') ? 'gif' : 'png';

            image = { url: `attachment://${message.id}.${gif}` };

            files = [
                {
                    attachment: path,
                    name: `${message.id}.${gif}`
                }
            ];

            setTimeout(async () => {
                if (await client.pathExists(path)) {
                    client.unlink(path);
                }
            }, 10 * 1000);
        }

        let messages = null;
        let previousMessage = null;

        try {
            messages = await message.channel.messages.fetch({
                before: message.id,
                limit: 1
            });
            previousMessage = messages.first();
        } catch {}

        const auditEntry = await client.utils
            .auditLog(message.guild, 'MessageDelete', {
                target: message.author
            })
            .catch(() => null);

        let executor = null;

        if (auditEntry?.extra?.channel?.id === message.channel.id) {
            executor = await message.guild.members.fetch(auditEntry.executorId).catch(() => message.member);
        }

        let embed =
            message.embeds.length > 0 && !message.stickers.size > 0 && !message.attachments.size > 0
                ? new client.class.modlog({
                      color: 'bad',
                      event: 'Message deleted',
                      thumbnail: message?.member?.displayAvatarURL({
                          dynamic: true,
                          size: 4096
                      }),
                      fields: [
                          {
                              name: 'Channel:',
                              value: `${message?.channel ?? 'Unavailable.'} ${message?.channel?.name ?? 'Unavailable.'} \`${message?.channel?.id ?? 'Unavailable.'}\``,
                              inline: true
                          },
                          {
                              name: 'User',
                              value: `${message.member ?? 'Unavailable'} ${client.utils.tag(message.author)} **\`${message.author.id}\`**`,
                              inline: true
                          },
                          {
                              name: 'Created at:',
                              value: `\`${client.utils.formatDate(message.createdAt)}\` \`${client.imports.time(Math.abs(Date.now() - message.createdTimestamp))}\` ago.`
                          },
                          executor
                              ? {
                                    name: 'Deleted by:',
                                    value: `${executor} ${executor.user.username} **\`${executor.id}\`**`,
                                    inline: true
                                }
                              : null,
                          message.attachments.size > 0
                              ? {
                                    name: 'Attachment was present:',
                                    value: `Name: ${attachment.name}\n[Link](${attachment.url})\nSize: ${attachment.size / 1000000}mb\nContent type: ${attachment.contentType}`
                                }
                              : null,
                          message.stickers.size > 0
                              ? {
                                    name: 'Sticker was present:',
                                    value: `Name: ${sticker.name}\n[Link](${sticker.url})`
                                }
                              : null,
                          previousMessage
                              ? {
                                    name: 'Surrounding message',
                                    value: `[Click here to jump to a surrounding message.](${previousMessage.url})`
                                }
                              : null
                      ],
                      url: message.embeds[0].data.url ?? null,
                      description: client.utils.describeMessage(message, {
                          limit: 2048,
                          media: false
                      }),
                      footer: {
                          text: 'Event emitted',
                          iconURL: client.config.text.links.relaxyImage
                      },
                      image: image ?? null,
                      author: {
                          name: `Message author: ${message?.member?.nickname ?? message?.author?.username ?? 'Unavailable.'}`,
                          iconURL: message?.member?.displayAvatarURL({
                              dynamic: true,
                              size: 4096
                          })
                      }
                  })
                : new client.class.modlog({
                      color: 'bad',
                      event: 'Message deleted',
                      thumbnail: message?.member?.displayAvatarURL({
                          dynamic: true,
                          size: 4096
                      }),
                      description: client.utils.describeMessage(message, {
                          limit: 2048,
                          media: false
                      }),
                      fields: [
                          {
                              name: 'Channel:',
                              value: `${message?.channel ?? 'Unavailable.'} ${message?.channel?.name ?? 'Unavailable.'} \`${message?.channel?.id ?? 'Unavailable.'}\``.slice(
                                  0,
                                  1024
                              ),
                              inline: true
                          },
                          {
                              name: 'User:',
                              value: `${message.member ?? 'Unavailable'} ${client.utils.tag(message.author)} **\`${message.author.id}\`**`,
                              inline: true
                          },
                          {
                              name: 'Created at:',
                              value: `\`${client.utils.formatDate(message.createdAt)}\` \`${client.imports.time(Math.abs(Date.now() - message.createdTimestamp))}\` ago.`
                          },
                          executor
                              ? {
                                    name: 'Deleted by:',
                                    value: `${executor} ${executor.user.username} **\`${executor.id}\`**`,
                                    inline: true
                                }
                              : null,
                          message.attachments.size > 0
                              ? {
                                    name: 'Attachment was present:',
                                    value: `${
                                        message.attachments
                                            .map((a) => {
                                                return `Name: ${a.name}\n[Link](${a.url})\nSize: ${a.size / 1000000}mb\nContent type: ${a.contentType}`;
                                            })
                                            .join('\n\n') ?? ' None'
                                    }.`.slice(0, 1024)
                                }
                              : null,
                          message.stickers.size > 0
                              ? {
                                    name: 'Sticker was present:',
                                    value: `${
                                        message.stickers
                                            .map((s) => {
                                                return `Name: ${s.name}\n[Link](${s.url})`;
                                            })
                                            .join('\n\n') ?? 'None'
                                    }.`.slice(0, 1024)
                                }
                              : null,
                          previousMessage
                              ? {
                                    name: 'Surrounding message',
                                    value: `[Click here to jump to a surrounding message.](${previousMessage.url})`
                                }
                              : null
                      ],
                      image: image ?? null,
                      author: {
                          name: `Message author: ${message?.member?.nickname ?? message?.author?.username ?? 'Unavailable.'}`,
                          iconURL: message?.member?.displayAvatarURL({
                              dynamic: true,
                              size: 4096
                          })
                      }
                  });

        if (embed.fields.length !== 0 && !client.isOwner(message.author.id)) {
            return client.pushModlog(message.guild.id, 'messageDelete', embed, executor, files);
        }
    }
};
