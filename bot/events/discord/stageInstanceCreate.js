'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const privacyLevels = {
    [Discord.StageInstancePrivacyLevel.Public]:    'Public',
    [Discord.StageInstancePrivacyLevel.GuildOnly]: 'Guild only'
};

export default {
    async run(client, stageInstance)
    {
        if (!stageInstance.guild)
        {
            return;
        }

        const guild = await client.module.database.Guild(stageInstance.guild.id);

        if (!guild.ml.ev?.stageInstanceCreate?.on)
        {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.stageInstanceCreate.channel))
        {
            return client.save(guild.id, {
                alter: 'ml.ev.stageInstanceCreate.on',
                value: false
            });
        }

        const channel = stageInstance.channel ?? client.channels.cache.get(stageInstance.channelId);

        return client.pushModlog(stageInstance.guild.id, 'stageInstanceCreate', new client.class.modlog({
            color:     'good',
            event:     'Stage started',
            thumbnail: stageInstance.guild.iconURL({
                dynamic: true,
                size:    4096
            }),
            fields:    [
                {
                    name:  'Topic:',
                    value: stageInstance.topic
                },
                {
                    name:  'Stage channel:',
                    value: channel
                               ? `${channel} - \`${stageInstance.channelId}\``
                               : `\`${stageInstance.channelId}\``
                },
                {
                    name:   'Privacy level:',
                    value:  privacyLevels[stageInstance.privacyLevel] ?? `${stageInstance.privacyLevel}`,
                    inline: true
                },
                stageInstance.guildScheduledEventId
                    ? {
                        name:   'Linked event ID:',
                        value:  `\`${stageInstance.guildScheduledEventId}\``,
                        inline: true
                    }
                    : null
            ]
        }), null);
    }
};
