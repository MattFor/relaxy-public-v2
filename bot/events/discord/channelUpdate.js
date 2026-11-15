'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, oldChannel, newChannel) {
        client.module.database.Guild(newChannel ? newChannel.guild.id : oldChannel.guild.id).then(async (guild) => {
            if (guild.ml.ev?.channelUpdate?.on) {
                if (!client.channels.cache.get(guild.ml.ev.channelUpdate.channel)) {
                    client.save(guild.id, {
                        alter: 'ml.ev.channelUpdate.on',
                        value: false
                    });
                }

                if (
                    oldChannel.type === Discord.ChannelType.PublicThread ||
                    oldChannel.type === Discord.ChannelType.PrivateThread ||
                    oldChannel.type === Discord.ChannelType.AnnouncementThread
                ) {
                    return;
                }

                let rawLatestAudit = (
                    await client.utils.auditSnapshot(newChannel.guild).catch(() => null)
                )?.entries?.first() ?? {
                    type: 0
                };

                let updateType = 0;
                let auditFetch = await client.utils
                    .auditLog(newChannel.guild, 'ChannelUpdate', { target: newChannel })
                    .catch(() => null);

                if (!auditFetch || rawLatestAudit?.action !== auditFetch?.action) {
                    updateType = 1;
                    auditFetch = await client.utils
                        .auditLog(newChannel.guild, 'ChannelOverwriteCreate', { target: newChannel })
                        .catch(() => null);
                }

                if (!auditFetch || rawLatestAudit?.action !== auditFetch?.action) {
                    updateType = 2;
                    auditFetch = await client.utils
                        .auditLog(newChannel.guild, 'ChannelOverwriteUpdate', { target: newChannel })
                        .catch(() => null);
                }

                if (!auditFetch || rawLatestAudit?.action !== auditFetch?.action) {
                    updateType = 3;
                    auditFetch = await client.utils
                        .auditLog(newChannel.guild, 'ChannelOverwriteDelete', { target: newChannel })
                        .catch(() => null);
                }

                const audit = auditFetch ?? null;
                const auditUser = auditFetch?.executor ?? null;

                let oldPermissions = null;
                try {
                    oldPermissions = `\`${Object.entries(
                        new Discord.PermissionsBitField(BigInt(audit.changes[0].old)).serialize()
                    )
                        .filter((e) => e[1])
                        .map((e) => {
                            return e[0];
                        })
                        .join('`, `')}\`.`.slice(0, 1024);

                    if (oldPermissions.length < 4) {
                        oldPermissions = '`None.`';
                    }
                } catch {
                    oldPermissions = null;
                }

                let newPermissions = null;
                try {
                    newPermissions = `\`${Object.entries(
                        new Discord.PermissionsBitField(BigInt(audit.changes[0].new)).serialize()
                    )
                        .filter((e) => e[1])
                        .map((e) => {
                            return e[0];
                        })
                        .join('`, `')}\`.`.slice(0, 1024);

                    if (newPermissions.length < 4) {
                        newPermissions = '`None.`';
                    }
                } catch {
                    newPermissions = null;
                }

                let embed = new client.class.modlog({
                    event: 'Channel updated',
                    thumbnail:
                        newChannel.guild.iconURL({
                            dynamic: true,
                            size: 4096
                        }) ?? null,
                    fields: [
                        !guild.ml.ls
                            ? (!audit?.executor?.bot ?? true) && oldChannel.rawPosition !== newChannel.rawPosition
                                ? {
                                      name: 'Position change:',
                                      value: `**\`${oldChannel.rawPosition}\`** -> **\`${newChannel.rawPosition}\`**`
                                  }
                                : null
                            : null,
                        !guild.ml.ls
                            ? (!audit?.executor?.bot ?? true) && oldChannel.name !== newChannel.name
                                ? {
                                      name: 'Name change:',
                                      value: `**\`${oldChannel.name}\`** -> **\`${newChannel.name}\`**.`
                                  }
                                : null
                            : null,
                        oldChannel?.parentId !== newChannel?.parentId
                            ? {
                                  name: 'Category change:',
                                  value: `**${oldChannel.parent ?? 'None.'}** -> **${newChannel.parent ?? 'None.'}**`
                              }
                            : null,
                        oldChannel?.rateLimitPerUser !== newChannel?.rateLimitPerUser
                            ? {
                                  name: 'Slowmode change:',
                                  value: `**\`${oldChannel.rateLimitPerUser ?? 'None.'}\`** -> **\`${newChannel.rateLimitPerUser ?? 'None.'}\`**.`
                              }
                            : null,
                        oldChannel.topic !== newChannel.topic
                            ? {
                                  name: 'Old description:',
                                  value: oldChannel.topic ? oldChannel.topic.slice(0, 1024) : 'No description present.'
                              }
                            : null,
                        oldChannel.topic !== newChannel.topic
                            ? {
                                  name: 'New description:',
                                  value: newChannel.topic ? newChannel.topic.slice(0, 1024) : 'No description present.'
                              }
                            : null,
                        updateType > 0 && oldPermissions && newPermissions
                            ? {
                                  name: 'Permissions change:',
                                  value: `Permissions for ${audit.extra} have been ${
                                      [null, 'created', 'updated', 'deleted'][updateType]
                                  }.`
                              }
                            : null,
                        oldPermissions && updateType === 2
                            ? {
                                  name: 'Old Permissions:',
                                  value: oldPermissions
                              }
                            : null,
                        newPermissions && updateType === 2
                            ? {
                                  name: 'New Permissions:',
                                  value: newPermissions
                              }
                            : null,

                        (oldChannel.type === Discord.ChannelType.GuildVoice ||
                            oldChannel.type === Discord.ChannelType.GuildStageVoice) &&
                        oldChannel.userLimit !== newChannel.userLimit
                            ? {
                                  name: 'User limit change:',
                                  value: `**\`${oldChannel.userLimit ?? 'None.'}\`** -> **\`${newChannel.userLimit ?? 'None.'}\`**.`
                              }
                            : null,
                        (oldChannel.type === Discord.ChannelType.GuildVoice ||
                            oldChannel.type === Discord.ChannelType.GuildStageVoice) &&
                        oldChannel.bitrate !== newChannel.bitrate
                            ? {
                                  name: 'Bitrate change:',
                                  value: `**\`${oldChannel.bitrate}\`** -> **\`${newChannel.bitrate}\`**`
                              }
                            : null,

                        oldChannel.type === Discord.ChannelType.GuildForum &&
                        oldChannel.defaultThreadRateLimitPerUser !== newChannel.defaultThreadRateLimitPerUser
                            ? {
                                  name: 'Default thread slowmode change:',
                                  value: `**\`${oldChannel.defaultThreadRateLimitPerUser ?? 'None.'}\`** -> **\`${newChannel.defaultThreadRateLimitPerUser ?? 'None.'}\`**`
                              }
                            : null,
                        oldChannel.type === Discord.ChannelType.GuildForum &&
                        oldChannel?.defaultReactionEmoji?.name !== newChannel?.defaultReactionEmoji?.name
                            ? {
                                  name: 'Default reaction emoji change:',
                                  value: `**\`${oldChannel?.defaultReactionEmoji?.name ?? 'None.'}\`** -> **\`${newChannel?.defaultReactionEmoji?.name ?? 'None.'}\`**`
                              }
                            : null,
                        oldChannel.type === Discord.ChannelType.GuildForum &&
                        oldChannel.defaultSortOrder !== newChannel.defaultSortOrder
                            ? {
                                  name: 'Sort order change:',
                                  value: `**\`${
                                      ['Latest activity', 'Creation date'][oldChannel.defaultSortOrder] ?? 'None.'
                                  }\`** -> **\`${
                                      ['Latest activity', 'Creation date'][newChannel.defaultSortOrder] ?? 'None.'
                                  }\`**`
                              }
                            : null,
                        oldChannel.type === Discord.ChannelType.GuildForum &&
                        oldChannel.defaultForumLayout !== newChannel.defaultForumLayout
                            ? {
                                  name: 'Layout change:',
                                  value: `**\`${
                                      ['None.', 'List view', 'Gallery view'][oldChannel.defaultForumLayout] ?? 'None.'
                                  }\`** -> **\`${
                                      ['None.', 'List view', 'Gallery view'][newChannel.defaultForumLayout] ?? 'None.'
                                  }\`**`
                              }
                            : null,
                        oldChannel.type === Discord.ChannelType.GuildForum &&
                        oldChannel.defaultAutoArchiveDuration !== newChannel.defaultAutoArchiveDuration
                            ? {
                                  name: 'Automatic archive time change:',
                                  value: `**\`${oldChannel.defaultAutoArchiveDuration ?? 'None.'}\`** -> **\`${newChannel.defaultAutoArchiveDuration ?? 'None.'}\`**`
                              }
                            : null
                    ],
                    description: `Channel: **${newChannel} - \`${newChannel.id}\`**`
                });

                if (embed.fields.length !== 0) {
                    if (auditUser) {
                        embed.fields.push({
                            name: 'Changed by:',
                            value: `${auditUser} - ${client.utils.tag(auditUser)} - **\`${auditUser.id}\`**`
                        });
                    }

                    return client.pushModlog(newChannel.guild.id, 'channelUpdate', embed, auditUser);
                }
            }
        });
    }
};
