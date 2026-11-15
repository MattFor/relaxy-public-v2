'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const privacyLevels = {
    [Discord.StageInstancePrivacyLevel.Public]: 'Public',
    [Discord.StageInstancePrivacyLevel.GuildOnly]: 'Guild only'
};

export default {
    async run(client, oldInstance, newInstance) {
        if (!newInstance.guild) {
            return;
        }

        const guild = await client.module.database.Guild(newInstance.guild.id);

        if (!guild.ml.ev?.stageInstanceUpdate?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.stageInstanceUpdate.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.stageInstanceUpdate.on',
                value: false
            });
        }

        const fields = [
            oldInstance.topic !== newInstance.topic
                ? {
                      name: 'Topic changed:',
                      value: `Old: **${oldInstance.topic}**\nNew: **${newInstance.topic}**`
                  }
                : null,
            oldInstance.privacyLevel !== newInstance.privacyLevel
                ? {
                      name: 'Privacy level changed:',
                      value: `\`${privacyLevels[oldInstance.privacyLevel] ?? oldInstance.privacyLevel}\` → \`${privacyLevels[newInstance.privacyLevel] ?? newInstance.privacyLevel}\``
                  }
                : null
        ].filter((f) => f !== null);

        if (fields.length === 0) {
            return;
        }

        const channel = newInstance.channel ?? client.channels.cache.get(newInstance.channelId);

        fields.unshift({
            name: 'Stage channel:',
            value: channel ? `${channel} - \`${newInstance.channelId}\`` : `\`${newInstance.channelId}\``
        });

        return client.pushModlog(
            newInstance.guild.id,
            'stageInstanceUpdate',
            new client.class.modlog({
                event: 'Stage updated',
                thumbnail: newInstance.guild.iconURL({
                    dynamic: true,
                    size: 4096
                }),
                fields
            }),
            null
        );
    }
};
