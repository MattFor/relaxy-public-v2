'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, channel) {
        if (!channel.guild) {
            return;
        }

        const guild = await client.module.database.Guild(channel.guild.id);

        if (!guild.ml.ev?.webhooksUpdate?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.webhooksUpdate.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.webhooksUpdate.on',
                value: false
            });
        }

        let webhooks = null;
        try {
            webhooks = await channel.fetchWebhooks();
        } catch {}

        return client.pushModlog(
            channel.guild.id,
            'webhooksUpdate',
            new client.class.modlog({
                event: 'Webhook updated',
                thumbnail: channel.guild.iconURL({
                    dynamic: true,
                    size: 4096
                }),
                fields: [
                    {
                        name: 'Channel:',
                        value: `${channel} - **${channel.name}** - \`${channel.id}\``
                    },
                    webhooks
                        ? {
                              name: `Current webhooks [${webhooks.size}]:`,
                              value:
                                  webhooks.size > 0
                                      ? webhooks
                                            .map((w) => `**${w.name}** \`${w.id}\` ${w.owner ? `(by ${w.owner})` : ''}`)
                                            .join('\n')
                                            .slice(0, 1024)
                                      : 'No webhooks remaining.'
                          }
                        : null
                ]
            }),
            null
        );
    }
};
