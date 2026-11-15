'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, stageInstance) {
        if (!stageInstance.guild) {
            return;
        }

        const guild = await client.module.database.Guild(stageInstance.guild.id);

        if (!guild.ml.ev?.stageInstanceDelete?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.stageInstanceDelete.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.stageInstanceDelete.on',
                value: false
            });
        }

        const channel = stageInstance.channel ?? client.channels.cache.get(stageInstance.channelId);

        return client.pushModlog(
            stageInstance.guild.id,
            'stageInstanceDelete',
            new client.class.modlog({
                color: 'bad',
                event: 'Stage ended',
                thumbnail: stageInstance.guild.iconURL({
                    dynamic: true,
                    size: 4096
                }),
                fields: [
                    {
                        name: 'Topic:',
                        value: stageInstance.topic
                    },
                    {
                        name: 'Stage channel:',
                        value: channel
                            ? `${channel} - \`${stageInstance.channelId}\``
                            : `\`${stageInstance.channelId}\``
                    }
                ]
            }),
            null
        );
    }
};
