'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const entityTypes = {
    [Discord.GuildScheduledEventEntityType.StageInstance]: 'Stage Instance',
    [Discord.GuildScheduledEventEntityType.Voice]: 'Voice Channel',
    [Discord.GuildScheduledEventEntityType.External]: 'External'
};

const statusLabels = {
    [Discord.GuildScheduledEventStatus.Scheduled]: 'Scheduled',
    [Discord.GuildScheduledEventStatus.Active]: 'Active',
    [Discord.GuildScheduledEventStatus.Completed]: 'Completed',
    [Discord.GuildScheduledEventStatus.Canceled]: 'Canceled'
};

export default {
    async run(client, scheduledEvent) {
        if (!scheduledEvent.guild) {
            return;
        }

        const guild = await client.module.database.Guild(scheduledEvent.guild.id);

        if (!guild.ml.ev?.guildScheduledEventDelete?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.guildScheduledEventDelete.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.guildScheduledEventDelete.on',
                value: false
            });
        }

        return client.pushModlog(
            scheduledEvent.guild.id,
            'guildScheduledEventDelete',
            new client.class.modlog({
                color: 'bad',
                event: 'Scheduled event deleted',
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
                        name: 'Status at deletion:',
                        value: `${statusLabels[scheduledEvent.status] ?? scheduledEvent.status}`,
                        inline: true
                    },
                    {
                        name: 'Was scheduled for:',
                        value: `\`${client.utils.formatDate(scheduledEvent.scheduledStartAt)}\``,
                        inline: true
                    },
                    scheduledEvent.userCount != null
                        ? {
                              name: 'Interested users:',
                              value: `\`${scheduledEvent.userCount}\``,
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
                        : null
                ]
            }),
            null
        );
    }
};
