'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const statusLabels = {
    [Discord.GuildScheduledEventStatus.Scheduled]: 'Scheduled',
    [Discord.GuildScheduledEventStatus.Active]: 'Active',
    [Discord.GuildScheduledEventStatus.Completed]: 'Completed',
    [Discord.GuildScheduledEventStatus.Canceled]: 'Canceled'
};

export default {
    async run(client, oldEvent, newEvent) {
        if (!newEvent.guild) {
            return;
        }

        const guild = await client.module.database.Guild(newEvent.guild.id);

        if (!guild.ml.ev?.guildScheduledEventUpdate?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.guildScheduledEventUpdate.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.guildScheduledEventUpdate.on',
                value: false
            });
        }

        const fields = [
            oldEvent.name !== newEvent.name
                ? {
                      name: 'Name changed:',
                      value: `\`${oldEvent.name}\` → \`${newEvent.name}\``
                  }
                : null,
            oldEvent.description !== newEvent.description
                ? {
                      name: 'Description changed:',
                      value: `Old: ${oldEvent.description || 'None'}\nNew: ${newEvent.description || 'None'}`.slice(
                          0,
                          1024
                      )
                  }
                : null,
            oldEvent.status !== newEvent.status
                ? {
                      name: 'Status changed:',
                      value: `\`${statusLabels[oldEvent.status] ?? oldEvent.status}\` → \`${statusLabels[newEvent.status] ?? newEvent.status}\``
                  }
                : null,
            oldEvent.scheduledStartAt?.getTime() !== newEvent.scheduledStartAt?.getTime()
                ? {
                      name: 'Start time changed:',
                      value: `\`${client.utils.formatDate(oldEvent.scheduledStartAt)}\` → \`${client.utils.formatDate(newEvent.scheduledStartAt)}\``
                  }
                : null,
            oldEvent.scheduledEndAt?.getTime() !== newEvent.scheduledEndAt?.getTime()
                ? {
                      name: 'End time changed:',
                      value: `\`${
                          oldEvent.scheduledEndAt ? client.utils.formatDate(oldEvent.scheduledEndAt) : 'None'
                      }\` → \`${newEvent.scheduledEndAt ? client.utils.formatDate(newEvent.scheduledEndAt) : 'None'}\``
                  }
                : null,
            oldEvent.channelId !== newEvent.channelId
                ? {
                      name: 'Channel changed:',
                      value: `${oldEvent.channel ?? '`None`'} → ${newEvent.channel ?? '`None`'}`
                  }
                : null,
            oldEvent.entityMetadata?.location !== newEvent.entityMetadata?.location
                ? {
                      name: 'Location changed:',
                      value: `\`${oldEvent.entityMetadata?.location || 'None'}\` → \`${newEvent.entityMetadata?.location || 'None'}\``
                  }
                : null,
            oldEvent.coverImageHash !== newEvent.coverImageHash
                ? {
                      name: 'Cover image changed:',
                      value: newEvent.coverImageURL({ size: 4096 })
                          ? `[New cover image](${newEvent.coverImageURL({ size: 4096 })})`
                          : 'Cover image removed.'
                  }
                : null
        ].filter((f) => f !== null);

        if (fields.length === 0) {
            return;
        }

        return client.pushModlog(
            newEvent.guild.id,
            'guildScheduledEventUpdate',
            new client.class.modlog({
                event: 'Scheduled event updated',
                thumbnail:
                    newEvent.coverImageURL({ size: 4096 }) ??
                    newEvent.guild.iconURL({
                        dynamic: true,
                        size: 4096
                    }),
                fields,
                description: `**${newEvent.name}** \`${newEvent.id}\``
            }),
            null
        );
    }
};
