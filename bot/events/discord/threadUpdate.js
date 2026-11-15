'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, oldThread, newThread) {
        const guild = await client.module.database.Guild(newThread.guild.id);

        if (guild.ml.ev?.threadUpdate?.on && !guild.ml.ls) {
            let channel = await client.channels
                .fetch(guild.ml.ev.threadUpdate.channel)
                .catch(client.swallow('threadUpdate: fetch'));

            if (!channel) {
                return;
            }

            let tagFlag = false;
            if (oldThread.appliedTags.length !== newThread.appliedTags.length) {
                tagFlag = true;
            }

            if (!tagFlag) {
                for (let i = 0; i < oldThread.appliedTags.length; i++) {
                    if (oldThread.appliedTags[i] !== newThread.appliedTags[i]) {
                        tagFlag = true;
                        break;
                    }
                }
            }

            const originalPoster =
                (await newThread.fetchOwner().catch(client.swallow('threadUpdate: fetchOwner'))) ?? null;

            const auditUser = await client.utils
                .auditLog(newThread.guild, 'ThreadUpdate', {
                    rawAuthor: true,
                    target: newThread,
                    changes: true
                })
                .catch(() => null);

            let embed = new client.class.modlog({
                event: 'Thread updated',
                thumbnail: newThread.guild.iconURL({
                    dynamic: true,
                    size: 4096
                }),
                fields: [
                    oldThread.autoArchiveDuration !== newThread.autoArchiveDuration
                        ? {
                              name: 'Archive duration change:',
                              value: `**\`${oldThread.autoArchiveDuration}\`** -> **\`${newThread.autoArchiveDuration}\`**`
                          }
                        : null,
                    oldThread.name !== newThread.name
                        ? {
                              name: 'Name change:',
                              value: `**${oldThread.name}** -> **${newThread.name}**`
                          }
                        : null,
                    tagFlag
                        ? {
                              name: 'Old tags:',
                              value: `${
                                  oldThread.appliedTags
                                      .map((tag) => {
                                          return newThread.parent.availableTags.find((t) => t.id === tag)?.name;
                                      })
                                      .join(', ') ?? 'None'
                              }.`
                          }
                        : null,
                    tagFlag
                        ? {
                              name: 'New tags:',
                              value: `${
                                  newThread.appliedTags
                                      .map((tag) => {
                                          return newThread.parent.availableTags.find((t) => t.id === tag)?.name;
                                      })
                                      .join(', ') ?? 'None'
                              }.`
                          }
                        : null,
                    oldThread.rateLimitPerUser !== newThread.rateLimitPerUser
                        ? {
                              name: 'Slowmode change:',
                              value: `**\`${oldThread.rateLimitPerUser}\`** -> **\`${newThread.rateLimitPerUser}\`**`
                          }
                        : null,
                    auditUser
                        ? {
                              name: 'Changed by:',
                              value: `${auditUser} - ${client.utils.tag(auditUser)} - **\`${auditUser.id}\`**`
                          }
                        : null
                ],
                description: `Channel: **${newThread} - \`${newThread.id}\`**\nCreated by: ${originalPoster ?? 'None.'}`
            });

            if (embed.fields.length > 0) {
                return client.pushModlog(newThread.guild.id, 'threadUpdate', embed, auditUser);
            }
        }
    }
};
