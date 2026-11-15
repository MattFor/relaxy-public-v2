'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const privacyLevels = {
    [Discord.GuildScheduledEventPrivacyLevel.GuildOnly]: 'Guild only'
};

const entityTypes = {
    [Discord.GuildScheduledEventEntityType.StageInstance]: 'Stage Instance',
    [Discord.GuildScheduledEventEntityType.Voice]: 'Voice Channel',
    [Discord.GuildScheduledEventEntityType.External]: 'External'
};

export default {
    async run(client, scheduledEvent) {
        if (!scheduledEvent.guild) {
            return;
        }

        const guild = await client.module.database.Guild(scheduledEvent.guild.id);

        if (!guild.ml.ev?.guildScheduledEventCreate?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.guildScheduledEventCreate.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.guildScheduledEventCreate.on',
                value: false
            });
        }

        const creator = scheduledEvent.creatorId
            ? await client.users.fetch(scheduledEvent.creatorId).catch(() => null)
            : null;

        return client.pushModlog(
            scheduledEvent.guild.id,
            'guildScheduledEventCreate',
            new client.class.modlog({
                color: 'good',
                event: 'Scheduled event created',
                thumbnail:
                    scheduledEvent.coverImageURL({ size: 4096 }) ??
                    scheduledEvent.guild.iconURL({
                        dynamic: true,
                        size: 4096
                    }),
                fields: [
                    {
                        name: 'Event name:',
                        value: `**${scheduledEvent.name}**`,
                        inline: true
                    },
                    {
                        name: 'Event ID:',
                        value: `\`${scheduledEvent.id}\``,
                        inline: true
                    },
                    {
                        name: 'Type:',
                        value: `${entityTypes[scheduledEvent.entityType] ?? scheduledEvent.entityType}`,
                        inline: true
                    },
                    {
                        name: 'Privacy:',
                        value: `${privacyLevels[scheduledEvent.privacyLevel] ?? scheduledEvent.privacyLevel}`,
                        inline: true
                    },
                    {
                        name: 'Starts at:',
                        value: `\`${client.utils.formatDate(scheduledEvent.scheduledStartAt)}\``,
                        inline: true
                    },
                    scheduledEvent.scheduledEndAt
                        ? {
                              name: 'Ends at:',
                              value: `\`${client.utils.formatDate(scheduledEvent.scheduledEndAt)}\``,
                              inline: true
                          }
                        : null,
                    scheduledEvent.channel
                        ? {
                              name: 'Channel:',
                              value: `${scheduledEvent.channel} - \`${scheduledEvent.channelId}\``
                          }
                        : scheduledEvent.entityMetadata?.location
                          ? {
                                name: 'Location:',
                                value: scheduledEvent.entityMetadata.location
                            }
                          : null,
                    scheduledEvent.description
                        ? {
                              name: 'Description:',
                              value: scheduledEvent.description.slice(0, 1024)
                          }
                        : null,
                    creator
                        ? {
                              name: 'Created by:',
                              value: `${creator} - ${creator.username} - **\`${creator.id}\`**`
                          }
                        : null
                ]
            }),
            null
        );
    }
};
